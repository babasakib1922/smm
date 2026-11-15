const express = require('express');
const router = express.Router();
const { query, queryOne, run } = require('../db');
const { authenticate, requireRole } = require('../middleware/auth');
const { encryptText, decryptText, maskApiKey } = require('../config/security');
const { getProviderAdapter } = require('../services/apiAdapter');
const { logAudit } = require('../middleware/auditLog');
const { pullFromCloud, pushToCloud } = require('../services/cloudSync');

/**
 * GET /api/api-configs/balance
 * Returns the user's primary/active SMM panel balance directly from their connected provider
 */
router.get('/balance', authenticate, async (req, res) => {
  try {
    try { await pullFromCloud(); } catch (_) {}

    let cred = queryOne(
      `SELECT c.*, p.name as provider_name, p.slug, p.adapter_type, p.api_url as default_url
       FROM user_api_credentials c
       LEFT JOIN api_providers p ON c.provider_id = p.id
       WHERE c.user_id = ? AND c.connection_status = 'CONNECTED'
       ORDER BY c.id DESC LIMIT 1`,
      [req.user.id]
    );

    if (!cred) {
      try { await pullFromCloud(true); } catch (_) {}
      cred = queryOne(
        `SELECT c.*, p.name as provider_name, p.slug, p.adapter_type, p.api_url as default_url
         FROM user_api_credentials c
         LEFT JOIN api_providers p ON c.provider_id = p.id
         WHERE c.user_id = ? AND c.connection_status = 'CONNECTED'
         ORDER BY c.id DESC LIMIT 1`,
        [req.user.id]
      );
    }

    if (!cred) {
      return res.json({
        success: true,
        hasApi: false,
        balance: 0.00,
        providerName: null,
        message: 'No active SMM provider API connected.'
      });
    }

    const apiKey = decryptText(cred.encrypted_api_key, cred.iv, cred.auth_tag);
    const endpoint = cred.api_endpoint || cred.default_url;
    let liveBalance = cred.reported_balance || 0.00;

    // Refresh live balance from provider if API key exists
    if (apiKey) {
      try {
        const adapter = getProviderAdapter({ adapter_type: cred.adapter_type, slug: cred.slug, api_url: endpoint }, apiKey);
        const balRes = await adapter.checkBalance();
        liveBalance = balRes.balance;
        const now = new Date().toISOString();
        run(
          'UPDATE user_api_credentials SET reported_balance = ?, last_checked_at = ?, connection_status = "CONNECTED", last_error = NULL WHERE id = ?',
          [liveBalance, now, cred.id]
        );
      } catch (err) {
        // Fall back to last recorded reported_balance
      }
    }

    return res.json({
      success: true,
      hasApi: true,
      balance: liveBalance,
      currency: 'USD',
      providerName: cred.provider_name,
      maskedKey: cred.masked_key,
      lastCheckedAt: cred.last_checked_at
    });

  } catch (err) {
    console.error('Fetch active SMM balance error:', err);
    return res.status(500).json({ success: false, error: 'Failed to retrieve SMM balance.' });
  }
});

/**
 * GET /api/api-configs/providers
 * List available API providers
 */
router.get('/providers', authenticate, async (req, res) => {
  try {
    try { await pullFromCloud(); } catch (_) {}
    let providers = query(
      `SELECT id, name, slug, api_url, adapter_type, is_active, description, created_at
       FROM api_providers
       ORDER BY id ASC`
    );
    if (providers.length <= 3) {
      try { await pullFromCloud(true); } catch (_) {}
      providers = query(
        `SELECT id, name, slug, api_url, adapter_type, is_active, description, created_at
         FROM api_providers
         ORDER BY id ASC`
      );
    }
    return res.json({ success: true, providers });
  } catch (err) {
    console.error('List providers error:', err);
    return res.status(500).json({ success: false, error: 'Failed to load API providers.' });
  }
});

/**
 * GET /api/api-configs/user-credentials
 * List current user's connected API credentials (with masked keys)
 */
router.get('/user-credentials', authenticate, async (req, res) => {
  try {
    try { await pullFromCloud(); } catch (_) {}
    let credentials = query(
      `SELECT c.id, c.provider_id, p.name as provider_name, p.slug, p.api_url as default_endpoint,
              c.masked_key, c.api_endpoint, c.connection_status, c.last_checked_at,
              c.last_error, c.reported_balance
       FROM user_api_credentials c
       LEFT JOIN api_providers p ON c.provider_id = p.id
       WHERE c.user_id = ?
       ORDER BY c.id ASC`,
      [req.user.id]
    );

    if (credentials.length === 0) {
      try { await pullFromCloud(true); } catch (_) {}
      credentials = query(
        `SELECT c.id, c.provider_id, p.name as provider_name, p.slug, p.api_url as default_endpoint,
                c.masked_key, c.api_endpoint, c.connection_status, c.last_checked_at,
                c.last_error, c.reported_balance
         FROM user_api_credentials c
         LEFT JOIN api_providers p ON c.provider_id = p.id
         WHERE c.user_id = ?
         ORDER BY c.id ASC`,
        [req.user.id]
      );
    }

    return res.json({ success: true, credentials });
  } catch (err) {
    console.error('List user credentials error:', err);
    return res.status(500).json({ success: false, error: 'Failed to load API credentials.' });
  }
});

/**
 * POST /api/api-configs/user-credentials
 * Connect or update user's own API key for a provider
 * Encrypts API key with AES-256-GCM
 */
router.post('/user-credentials', authenticate, async (req, res) => {
  try {
    let { providerId, apiKey, apiEndpoint, customProviderName } = req.body;

    if (!apiKey) {
      return res.status(400).json({ success: false, error: 'API Key is required.' });
    }

    let provider = null;
    if (providerId === 'custom' || (!providerId && apiEndpoint)) {
      const nowIso = new Date().toISOString();
      const customName = customProviderName ? customProviderName.trim() : 'Custom SMM Panel';
      const customSlug = `custom-${Date.now().toString(36)}`;
      const newProv = run(
        `INSERT INTO api_providers (name, slug, api_url, adapter_type, is_active, description, created_at)
         VALUES (?, ?, ?, 'standard_smm_v2', 1, 'User Custom SMM Panel', ?)`,
        [customName, customSlug, apiEndpoint.trim(), nowIso]
      );
      provider = queryOne('SELECT * FROM api_providers WHERE id = ?', [newProv.lastInsertRowid]);
    } else {
      provider = queryOne('SELECT * FROM api_providers WHERE id = ?', [providerId]);
    }

    if (!provider) {
      return res.status(404).json({ success: false, error: 'Provider not found. Please select or add an SMM provider.' });
    }

    const { encrypted, iv, authTag } = encryptText(apiKey.trim());
    const masked = maskApiKey(apiKey.trim());
    const now = new Date().toISOString();
    const endpoint = apiEndpoint ? apiEndpoint.trim() : provider.api_url;

    // Test connection immediately to report valid balance/status
    let status = 'CONNECTED';
    let reportedBalance = 0.00;
    let lastError = null;

    try {
      const adapter = getProviderAdapter({ ...provider, api_url: endpoint }, apiKey.trim());
      const balRes = await adapter.checkBalance();
      reportedBalance = balRes.balance;
    } catch (testErr) {
      status = 'ERROR';
      lastError = testErr.message;
    }

    const existing = queryOne(
      'SELECT id FROM user_api_credentials WHERE user_id = ? AND provider_id = ?',
      [req.user.id, provider.id]
    );

    if (existing) {
      run(
        `UPDATE user_api_credentials 
         SET encrypted_api_key = ?, iv = ?, auth_tag = ?, masked_key = ?, api_endpoint = ?,
             connection_status = ?, last_checked_at = ?, last_error = ?, reported_balance = ?
         WHERE id = ?`,
        [encrypted, iv, authTag, masked, endpoint, status, now, lastError, reportedBalance, existing.id]
      );
    } else {
      run(
        `INSERT INTO user_api_credentials 
         (user_id, provider_id, encrypted_api_key, iv, auth_tag, masked_key, api_endpoint, connection_status, last_checked_at, last_error, reported_balance)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [req.user.id, provider.id, encrypted, iv, authTag, masked, endpoint, status, now, lastError, reportedBalance]
      );
    }

    logAudit(req.user.id, 'SAVE_API_CREDENTIAL', 'user_api_credentials', provider.id, { providerName: provider.name, status }, req);

    try {
      await pushToCloud();
    } catch (_) {}

    return res.json({
      success: true,
      message: `API credentials for ${provider.name} saved successfully. Status: ${status}`,
      connectionStatus: status,
      reportedBalance,
      lastError
    });

  } catch (err) {
    console.error('Save API credentials error:', err);
    return res.status(500).json({ success: false, error: 'Failed to save API credentials.' });
  }
});

/**
 * POST /api/api-configs/user-credentials/:id/test
 * Test existing connection
 */
router.post('/user-credentials/:id/test', authenticate, async (req, res) => {
  try {
    const credId = parseInt(req.params.id, 10);
    const cred = queryOne(
      `SELECT c.*, p.name as provider_name, p.slug, p.adapter_type, p.api_url as default_url
       FROM user_api_credentials c
       JOIN api_providers p ON c.provider_id = p.id
       WHERE c.id = ? AND c.user_id = ?`,
      [credId, req.user.id]
    );

    if (!cred) {
      return res.status(404).json({ success: false, error: 'Credential record not found.' });
    }

    const apiKey = decryptText(cred.encrypted_api_key, cred.iv, cred.auth_tag);
    const endpoint = cred.api_endpoint || cred.default_url;
    const now = new Date().toISOString();

    try {
      const adapter = getProviderAdapter({ adapter_type: cred.adapter_type, slug: cred.slug, api_url: endpoint }, apiKey);
      const balRes = await adapter.checkBalance();

      run(
        `UPDATE user_api_credentials 
         SET connection_status = 'CONNECTED', reported_balance = ?, last_checked_at = ?, last_error = NULL
         WHERE id = ?`,
        [balRes.balance, now, credId]
      );

      return res.json({
        success: true,
        status: 'CONNECTED',
        balance: balRes.balance,
        currency: balRes.currency,
        message: `Successfully connected to ${cred.provider_name}. Provider balance: $${balRes.balance.toFixed(2)}.`
      });

    } catch (testErr) {
      run(
        `UPDATE user_api_credentials 
         SET connection_status = 'ERROR', last_checked_at = ?, last_error = ?
         WHERE id = ?`,
        [now, testErr.message, credId]
      );

      return res.status(400).json({
        success: false,
        status: 'ERROR',
        error: `Connection test failed: ${testErr.message}`
      });
    }

  } catch (err) {
    console.error('Test credential error:', err);
    return res.status(500).json({ success: false, error: 'Failed to test credentials.' });
  }
});

/**
 * POST /api/api-configs/admin/providers (ADMIN only)
 * Add or edit system provider
 */
router.post('/admin/providers', authenticate, requireRole('ADMIN'), (req, res) => {
  try {
    const { name, slug, apiUrl, adapterType = 'standard_smm_v2', description = '' } = req.body;

    if (!name || !slug || !apiUrl) {
      return res.status(400).json({ success: false, error: 'Name, slug, and API URL are required.' });
    }

    const existing = queryOne('SELECT id FROM api_providers WHERE slug = ?', [slug.trim()]);
    if (existing) {
      return res.status(400).json({ success: false, error: 'Provider slug already exists.' });
    }

    const now = new Date().toISOString();
    const result = run(
      `INSERT INTO api_providers (name, slug, api_url, adapter_type, is_active, description, created_at)
       VALUES (?, ?, ?, ?, 1, ?, ?)`,
      [name.trim(), slug.trim(), apiUrl.trim(), adapterType, description, now]
    );

    logAudit(req.user.id, 'CREATE_PROVIDER', 'api_providers', result.lastInsertRowid, { name, slug }, req);

    return res.status(201).json({
      success: true,
      message: `API provider "${name}" created successfully.`,
      providerId: result.lastInsertRowid
    });
  } catch (err) {
    console.error('Create provider error:', err);
    return res.status(500).json({ success: false, error: 'Failed to create provider.' });
  }
});

/**
 * DELETE /api/api-configs/user-credentials/:id
 * Disconnect and remove saved API credentials
 */
router.delete('/user-credentials/:id', authenticate, (req, res) => {
  try {
    const credId = parseInt(req.params.id, 10);
    const cred = queryOne('SELECT * FROM user_api_credentials WHERE id = ? AND user_id = ?', [credId, req.user.id]);
    if (!cred) {
      return res.status(404).json({ success: false, error: 'API credential not found.' });
    }

    run('DELETE FROM user_api_credentials WHERE id = ?', [credId]);
    return res.json({ success: true, message: 'API credential disconnected and deleted.' });
  } catch (err) {
    console.error('Delete credential error:', err);
    return res.status(500).json({ success: false, error: 'Failed to delete credential.' });
  }
});

module.exports = router;

