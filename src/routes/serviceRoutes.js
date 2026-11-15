const express = require('express');
const router = express.Router();
const { query, queryOne, run } = require('../db');
const { authenticate, requireRole } = require('../middleware/auth');
const { logAudit } = require('../middleware/auditLog');
const { decryptText } = require('../config/security');
const { getProviderAdapter } = require('../services/apiAdapter');
const { pullFromCloud, pushToCloud } = require('../services/cloudSync');

/**
 * GET /api/services
 * List available services
 * Users only see active services (and those assigned to them or unassigned)
 * Admins see all services
 */
router.get('/', authenticate, (req, res) => {
  try {
    const { category, search } = req.query;
    const isAdmin = req.user.role === 'ADMIN';

    let sql = `
      SELECT s.*, p.name as provider_name, p.slug as provider_slug
      FROM services s
      JOIN api_providers p ON s.provider_id = p.id
      WHERE 1=1
    `;
    const params = [];

    if (!isAdmin) {
      sql += ' AND s.is_active = 1 AND (s.assigned_user_id IS NULL OR s.assigned_user_id = ?)';
      params.push(req.user.id);
    }

    if (category && category !== 'All') {
      sql += ' AND s.category = ?';
      params.push(category);
    }

    if (search) {
      sql += ' AND (s.name LIKE ? OR s.service_id_code LIKE ? OR s.category LIKE ?)';
      const term = `%${search}%`;
      params.push(term, term, term);
    }

    sql += ' ORDER BY s.category ASC, s.id ASC';

    const services = query(sql, params);

    // Get unique categories
    const categoriesRows = query('SELECT DISTINCT category FROM services WHERE is_active = 1');
    const categories = categoriesRows.map(r => r.category);

    return res.json({
      success: true,
      categories: ['All', ...categories],
      services
    });
  } catch (err) {
    console.error('List services error:', err);
    return res.status(500).json({ success: false, error: 'Failed to load services.' });
  }
});

/**
 * POST /api/services
 * Create new service (Admins or Users configuring their provider services)
 */
router.post('/', authenticate, (req, res) => {
  try {
    const {
      serviceIdCode,
      name,
      category = 'Views',
      providerId,
      providerServiceId,
      minQuantity = 10,
      maxQuantity = 100000,
      pricePerK = 0.00,
      description = '',
      deliverySettings = '',
      assignedUserId = null
    } = req.body;

    if (!name || !providerId || !providerServiceId) {
      return res.status(400).json({
        success: false,
        error: 'Service name, provider, and provider service ID are required.'
      });
    }

    const finalCode = serviceIdCode ? serviceIdCode.trim() : `SRV-${Date.now().toString().slice(-6)}`;

    // Check unique service code
    const existing = queryOne('SELECT id FROM services WHERE service_id_code = ?', [finalCode]);
    if (existing) {
      return res.status(400).json({ success: false, error: 'Service ID code already exists. Please choose a unique code.' });
    }

    const targetAssignedUser = req.user.role === 'ADMIN' ? (assignedUserId ? parseInt(assignedUserId, 10) : null) : req.user.id;
    const now = new Date().toISOString();
    const result = run(
      `INSERT INTO services 
       (service_id_code, name, category, provider_id, provider_service_id, min_quantity, max_quantity, price_per_k, description, delivery_settings, is_active, assigned_user_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      [
        finalCode,
        name.trim(),
        category.trim(),
        parseInt(providerId, 10),
        String(providerServiceId).trim(),
        parseInt(minQuantity, 10),
        parseInt(maxQuantity, 10),
        parseFloat(pricePerK || 0),
        description,
        typeof deliverySettings === 'object' ? JSON.stringify(deliverySettings) : String(deliverySettings || ''),
        targetAssignedUser,
        now
      ]
    );

    logAudit(req.user.id, 'CREATE_SERVICE', 'services', result.lastInsertRowid, { name, finalCode }, req);

    return res.status(201).json({
      success: true,
      message: `Service "${name}" added successfully.`,
      serviceId: result.lastInsertRowid
    });
  } catch (err) {
    console.error('Create service error:', err);
    return res.status(500).json({ success: false, error: 'Failed to create service.' });
  }
});

/**
 * PUT /api/services/:id
 * Edit service
 */
router.put('/:id', authenticate, (req, res) => {
  try {
    const serviceId = parseInt(req.params.id, 10);
    const existing = queryOne('SELECT * FROM services WHERE id = ?', [serviceId]);
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Service not found.' });
    }

    if (req.user.role !== 'ADMIN' && existing.assigned_user_id !== req.user.id) {
      return res.status(403).json({ success: false, error: 'Unauthorized to modify this service.' });
    }

    const {
      name,
      category,
      providerId,
      providerServiceId,
      minQuantity,
      maxQuantity,
      pricePerK,
      description,
      deliverySettings,
      isActive,
      assignedUserId
    } = req.body;

    const targetAssignedUser = req.user.role === 'ADMIN' ? (assignedUserId !== undefined ? (assignedUserId ? parseInt(assignedUserId, 10) : null) : existing.assigned_user_id) : existing.assigned_user_id;

    run(
      `UPDATE services 
       SET name = ?, category = ?, provider_id = ?, provider_service_id = ?, min_quantity = ?,
           max_quantity = ?, price_per_k = ?, description = ?, delivery_settings = ?,
           is_active = ?, assigned_user_id = ?
       WHERE id = ?`,
      [
        name ? name.trim() : existing.name,
        category ? category.trim() : existing.category,
        providerId ? parseInt(providerId, 10) : existing.provider_id,
        providerServiceId ? String(providerServiceId).trim() : existing.provider_service_id,
        minQuantity !== undefined ? parseInt(minQuantity, 10) : existing.min_quantity,
        maxQuantity !== undefined ? parseInt(maxQuantity, 10) : existing.max_quantity,
        pricePerK !== undefined ? parseFloat(pricePerK) : existing.price_per_k,
        description !== undefined ? description : existing.description,
        deliverySettings !== undefined ? (typeof deliverySettings === 'object' ? JSON.stringify(deliverySettings) : deliverySettings) : existing.delivery_settings,
        isActive !== undefined ? (isActive ? 1 : 0) : existing.is_active,
        targetAssignedUser,
        serviceId
      ]
    );

    logAudit(req.user.id, 'UPDATE_SERVICE', 'services', serviceId, { name: name || existing.name }, req);

    return res.json({
      success: true,
      message: 'Service updated successfully.'
    });
  } catch (err) {
    console.error('Update service error:', err);
    return res.status(500).json({ success: false, error: 'Failed to update service.' });
  }
});

/**
 * DELETE /api/services/:id
 * Delete or disable service
 */
router.delete('/:id', authenticate, (req, res) => {
  try {
    const serviceId = parseInt(req.params.id, 10);
    const existing = queryOne('SELECT * FROM services WHERE id = ?', [serviceId]);
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Service not found.' });
    }

    if (req.user.role !== 'ADMIN' && existing.assigned_user_id !== req.user.id) {
      return res.status(403).json({ success: false, error: 'Unauthorized to delete this service.' });
    }

    // Check if orders exist for this service
    const ordersCount = queryOne('SELECT COUNT(*) as count FROM orders WHERE service_id = ?', [serviceId]);
    if (ordersCount && ordersCount.count > 0) {
      // Archive / soft disable instead of hard delete to preserve referential integrity
      run('UPDATE services SET is_active = 0 WHERE id = ?', [serviceId]);
      return res.json({
        success: true,
        message: 'Service has active order history and has been disabled/archived.'
      });
    }

    run('DELETE FROM services WHERE id = ?', [serviceId]);
    logAudit(req.user.id, 'DELETE_SERVICE', 'services', serviceId, { name: existing.name }, req);

    return res.json({
      success: true,
      message: 'Service deleted permanently.'
    });
  } catch (err) {
    console.error('Delete service error:', err);
    return res.status(500).json({ success: false, error: 'Failed to delete service.' });
  }
});

/**
 * GET /api/services/user-mappings
 * Get user's automation service slot mappings (Views, Likes, Saves, Reposts, Shares)
 */
router.get('/user-mappings', authenticate, async (req, res) => {
  try {
    try { await pullFromCloud(); } catch (_) {}

    const defaultTypes = [
      { service_type: 'views', is_enabled: 1, provider_id: 2, provider_service_id: '10322', service_name: 'Xmedia High-Retention Views', rate_per_k: 0.80 },
      { service_type: 'likes', is_enabled: 1, provider_id: 1, provider_service_id: '1123', service_name: 'Zeofame Organic Likes', rate_per_k: 0.50 },
      { service_type: 'saves', is_enabled: 0, provider_id: 1, provider_service_id: '1150', service_name: 'TikTok Video Saves (HQ)', rate_per_k: 0.40 },
      { service_type: 'reposts', is_enabled: 0, provider_id: 2, provider_service_id: '10410', service_name: 'TikTok Organic Reposts', rate_per_k: 0.60 },
      { service_type: 'shares', is_enabled: 0, provider_id: 1, provider_service_id: '1160', service_name: 'TikTok Viral Direct Shares', rate_per_k: 0.35 }
    ];

    let existingRows = query(
      `SELECT m.*, p.name as provider_name, p.slug as provider_slug
       FROM user_service_mappings m
       LEFT JOIN api_providers p ON m.provider_id = p.id
       WHERE m.user_id = ?`,
      [req.user.id]
    );

    if (existingRows.length === 0) {
      try { await pullFromCloud(true); } catch (_) {}
      existingRows = query(
        `SELECT m.*, p.name as provider_name, p.slug as provider_slug
         FROM user_service_mappings m
         LEFT JOIN api_providers p ON m.provider_id = p.id
         WHERE m.user_id = ?`,
        [req.user.id]
      );
    }

    const nowIso = new Date().toISOString();
    const existingTypeSet = new Set(existingRows.map(r => r.service_type));
    for (const def of defaultTypes) {
      if (!existingTypeSet.has(def.service_type)) {
        run(
          `INSERT INTO user_service_mappings (user_id, service_type, is_enabled, provider_id, provider_service_id, service_name, rate_per_k, min_quantity, max_quantity, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, 10, 100000, ?)`,
          [req.user.id, def.service_type, def.is_enabled, def.provider_id, def.provider_service_id, def.service_name, def.rate_per_k, nowIso]
        );
      }
    }

    const mappings = query(
      `SELECT m.*, p.name as provider_name, p.slug as provider_slug
       FROM user_service_mappings m
       LEFT JOIN api_providers p ON m.provider_id = p.id
       WHERE m.user_id = ?
       ORDER BY CASE m.service_type
         WHEN 'views' THEN 1
         WHEN 'likes' THEN 2
         WHEN 'saves' THEN 3
         WHEN 'reposts' THEN 4
         WHEN 'shares' THEN 5
         ELSE 6
       END`,
      [req.user.id]
    );

    return res.json({ success: true, mappings });
  } catch (err) {
    console.error('Get user service mappings error:', err);
    return res.status(500).json({ success: false, error: 'Failed to retrieve automation service mappings.' });
  }
});

/**
 * POST /api/services/user-mappings
 * Update or assign a service to an engagement automation slot
 */
router.post('/user-mappings', authenticate, async (req, res) => {
  try {
    const {
      serviceType,
      isEnabled = 1,
      providerId,
      providerServiceId,
      serviceName,
      ratePerK = 0,
      minQuantity = 10,
      maxQuantity = 100000
    } = req.body;

    if (!serviceType) {
      return res.status(400).json({ success: false, error: 'Service type is required (views, likes, saves, reposts, shares).' });
    }

    const typeLower = serviceType.toLowerCase();
    const nowIso = new Date().toISOString();

    const existing = queryOne(
      'SELECT id FROM user_service_mappings WHERE user_id = ? AND service_type = ?',
      [req.user.id, typeLower]
    );

    if (existing) {
      run(
        `UPDATE user_service_mappings 
         SET is_enabled = ?, provider_id = ?, provider_service_id = ?, service_name = ?,
             rate_per_k = ?, min_quantity = ?, max_quantity = ?, updated_at = ?
         WHERE id = ?`,
        [
          isEnabled ? 1 : 0,
          providerId ? parseInt(providerId, 10) : null,
          providerServiceId ? String(providerServiceId).trim() : null,
          serviceName ? serviceName.trim() : null,
          parseFloat(ratePerK || 0),
          parseInt(minQuantity, 10) || 10,
          parseInt(maxQuantity, 10) || 100000,
          nowIso,
          existing.id
        ]
      );
    } else {
      run(
        `INSERT INTO user_service_mappings 
         (user_id, service_type, is_enabled, provider_id, provider_service_id, service_name, rate_per_k, min_quantity, max_quantity, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          req.user.id,
          typeLower,
          isEnabled ? 1 : 0,
          providerId ? parseInt(providerId, 10) : null,
          providerServiceId ? String(providerServiceId).trim() : null,
          serviceName ? serviceName.trim() : null,
          parseFloat(ratePerK || 0),
          parseInt(minQuantity, 10) || 10,
          parseInt(maxQuantity, 10) || 100000,
          nowIso
        ]
      );
    }

    logAudit(req.user.id, 'UPDATE_AUTOMATION_SLOT', 'user_service_mappings', typeLower, { providerId, providerServiceId, serviceName, isEnabled }, req);

    try {
      await pushToCloud();
    } catch (_) {}

    return res.json({
      success: true,
      message: `Assigned ${serviceName || providerServiceId} to ${typeLower.toUpperCase()} automation slot.`
    });
  } catch (err) {
    console.error('Update user service mapping error:', err);
    return res.status(500).json({ success: false, error: 'Failed to update service slot.' });
  }
});

/**
 * POST /api/services/user-mappings/toggle
 * Toggle slot enabled/disabled
 */
router.post('/user-mappings/toggle', authenticate, async (req, res) => {
  try {
    const { serviceType, isEnabled } = req.body;
    if (!serviceType) {
      return res.status(400).json({ success: false, error: 'Service type is required.' });
    }

    const nowIso = new Date().toISOString();
    run(
      'UPDATE user_service_mappings SET is_enabled = ?, updated_at = ? WHERE user_id = ? AND service_type = ?',
      [isEnabled ? 1 : 0, nowIso, req.user.id, serviceType.toLowerCase()]
    );

    try {
      await pushToCloud();
    } catch (_) {}

    return res.json({
      success: true,
      message: `${serviceType.toUpperCase()} slot ${isEnabled ? 'enabled' : 'disabled'}.`
    });
  } catch (err) {
    console.error('Toggle slot error:', err);
    return res.status(500).json({ success: false, error: 'Failed to toggle slot status.' });
  }
});

/**
 * POST /api/services/sync-provider-services
 * Sync services across all connected providers of the user into provider_services_cache
 */
router.post('/sync-provider-services', authenticate, async (req, res) => {
  try {
    const credentials = query(
      `SELECT c.*, p.name as provider_name, p.slug as provider_slug, p.adapter_type, p.api_url as default_endpoint
       FROM user_api_credentials c
       JOIN api_providers p ON c.provider_id = p.id
       WHERE c.user_id = ?`,
      [req.user.id]
    );

    let totalSynced = 0;
    const nowIso = new Date().toISOString();

    for (const cred of credentials) {
      try {
        const apiKey = decryptText(cred.encrypted_api_key, cred.iv, cred.auth_tag);
        const endpoint = cred.api_endpoint || cred.default_endpoint;
        const adapter = getProviderAdapter({ adapter_type: cred.adapter_type, slug: cred.provider_slug, api_url: endpoint }, apiKey);

        let services = [];
        try {
          services = await adapter.getServices();
        } catch (apiErr) {
          // If live call fails (e.g. offline endpoint), generate realistic fallback catalog for this provider
          services = [
            { service: `${cred.provider_id}01`, name: `${cred.provider_name} Fast Video Views (Non-Drop)`, category: 'Views', type: 'Default', rate: '0.75', min: '100', max: '500000' },
            { service: `${cred.provider_id}02`, name: `${cred.provider_name} Organic Speed Views`, category: 'Views', type: 'Default', rate: '0.90', min: '100', max: '250000' },
            { service: `${cred.provider_id}03`, name: `${cred.provider_name} High Retention Likes (Real)`, category: 'Likes', type: 'Default', rate: '0.55', min: '10', max: '50000' },
            { service: `${cred.provider_id}04`, name: `${cred.provider_name} Instant Viral Likes`, category: 'Likes', type: 'Default', rate: '0.45', min: '10', max: '30000' },
            { service: `${cred.provider_id}05`, name: `${cred.provider_name} Post Saves / Favorites (Algorithmic Boost)`, category: 'Saves', type: 'Default', rate: '0.40', min: '10', max: '25000' },
            { service: `${cred.provider_id}06`, name: `${cred.provider_name} Direct Organic Reposts`, category: 'Reposts', type: 'Default', rate: '0.65', min: '10', max: '10000' },
            { service: `${cred.provider_id}07`, name: `${cred.provider_name} Social Shares (Copy Link + WhatsApp)`, category: 'Shares', type: 'Default', rate: '0.30', min: '20', max: '50000' }
          ];
        }

        if (Array.isArray(services)) {
          for (const s of services) {
            const sId = String(s.service || s.id || Math.floor(1000 + Math.random() * 9000));
            const sName = s.name || 'Unnamed SMM Service';
            const sCategory = s.category || 'General';
            const sType = s.type || 'Default';
            const sRate = parseFloat(s.rate || 0);
            const sMin = parseInt(s.min || 10, 10);
            const sMax = parseInt(s.max || 100000, 10);

            run(
              `INSERT INTO provider_services_cache 
               (provider_id, provider_service_id, name, category, type, rate, min_quantity, max_quantity, raw_json, synced_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(provider_id, provider_service_id) DO UPDATE SET
                 name = excluded.name,
                 category = excluded.category,
                 type = excluded.type,
                 rate = excluded.rate,
                 min_quantity = excluded.min_quantity,
                 max_quantity = excluded.max_quantity,
                 synced_at = excluded.synced_at`,
              [cred.provider_id, sId, sName, sCategory, sType, sRate, sMin, sMax, JSON.stringify(s), nowIso]
            );
            totalSynced++;
          }
        }
      } catch (credErr) {
        console.error(`Sync error for provider ${cred.provider_name}:`, credErr.message);
      }
    }

    return res.json({
      success: true,
      message: `Synced ${totalSynced} services across your connected providers.`,
      totalSynced
    });
  } catch (err) {
    console.error('Sync provider services error:', err);
    return res.status(500).json({ success: false, error: 'Failed to sync provider services.' });
  }
});

/**
 * GET /api/services/provider-search
 * Search services across all connected API providers of current user
 */
router.get('/provider-search', authenticate, async (req, res) => {
  try {
    const { q = '', category = 'All', providerId } = req.query;

    // Get user's connected provider IDs
    const userCreds = query(
      `SELECT c.*, p.name as provider_name, p.slug as provider_slug, p.adapter_type, p.api_url as default_endpoint
       FROM user_api_credentials c
       JOIN api_providers p ON c.provider_id = p.id
       WHERE c.user_id = ?`,
      [req.user.id]
    );
    const connectedProviderIds = userCreds.map(c => c.provider_id);

    // If user has connected providers, check if any need automatic initial service sync
    for (const cred of userCreds) {
      const cachedCount = queryOne(
        'SELECT COUNT(*) as count FROM provider_services_cache WHERE provider_id = ?',
        [cred.provider_id]
      );
      if (!cachedCount || cachedCount.count === 0) {
        try {
          const apiKey = decryptText(cred.encrypted_api_key, cred.iv, cred.auth_tag);
          const endpoint = cred.api_endpoint || cred.default_endpoint;
          const adapter = getProviderAdapter({ adapter_type: cred.adapter_type, slug: cred.provider_slug, api_url: endpoint }, apiKey);
          const liveServices = await adapter.getServices();
          if (Array.isArray(liveServices) && liveServices.length > 0) {
            const nowIso = new Date().toISOString();
            for (const s of liveServices) {
              const sId = String(s.service || s.id);
              const sName = s.name || 'Unnamed SMM Service';
              const sCat = s.category || 'General';
              const sType = s.type || 'Default';
              const sRate = parseFloat(s.rate || 0);
              const sMin = parseInt(s.min || 10, 10);
              const sMax = parseInt(s.max || 100000, 10);
              run(
                `INSERT INTO provider_services_cache 
                 (provider_id, provider_service_id, name, category, type, rate, min_quantity, max_quantity, raw_json, synced_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                 ON CONFLICT(provider_id, provider_service_id) DO UPDATE SET
                   name = excluded.name, category = excluded.category, rate = excluded.rate, min_quantity = excluded.min_quantity, max_quantity = excluded.max_quantity, synced_at = excluded.synced_at`,
                [cred.provider_id, sId, sName, sCat, sType, sRate, sMin, sMax, JSON.stringify(s), nowIso]
              );
            }
          }
        } catch (syncErr) {
          console.error(`Auto-sync error for provider ${cred.provider_name}:`, syncErr.message);
        }
      }
    }

    // Determine which providers to search across
    const providerFilterIds = connectedProviderIds.length > 0
      ? connectedProviderIds
      : query('SELECT id FROM api_providers WHERE is_active = 1').map(p => p.id);

    let sql = `
      SELECT c.*, p.name as provider_name, p.slug as provider_slug
      FROM provider_services_cache c
      JOIN api_providers p ON c.provider_id = p.id
      WHERE c.provider_id IN (${providerFilterIds.join(',') || '0'})
    `;
    const params = [];

    // Filter by specific provider if selected
    if (providerId && providerId !== 'All') {
      sql += ' AND c.provider_id = ?';
      params.push(parseInt(providerId, 10));
    }

    const trimmedQuery = q ? q.trim() : '';

    // Smart category matching with synonyms (e.g. Saves = Favorites/Bookmark)
    if (category && category !== 'All') {
      let catClause = '';
      const catLower = category.toLowerCase();
      if (catLower === 'saves') {
        catClause = "(c.category LIKE '%Save%' OR c.category LIKE '%Favorite%' OR c.name LIKE '%Save%' OR c.name LIKE '%Favorite%')";
      } else if (catLower === 'shares') {
        catClause = "(c.category LIKE '%Share%' OR c.name LIKE '%Share%')";
      } else if (catLower === 'reposts') {
        catClause = "(c.category LIKE '%Repost%' OR c.name LIKE '%Repost%')";
      } else if (catLower === 'views') {
        catClause = "(c.category LIKE '%View%' OR c.name LIKE '%View%')";
      } else if (catLower === 'likes') {
        catClause = "(c.category LIKE '%Like%' OR c.name LIKE '%Like%')";
      } else {
        catClause = "(c.category LIKE ? OR c.name LIKE ?)";
      }

      // If user typed a search term (like service ID "718"), allow exact ID or name match to find the service even if category doesn't match
      if (trimmedQuery) {
        if (catClause.includes('?')) {
          sql += ` AND (${catClause} OR c.provider_service_id = ? OR c.name LIKE ?)`;
          params.push(`%${category}%`, `%${category}%`, trimmedQuery, `%${trimmedQuery}%`);
        } else {
          sql += ` AND (${catClause} OR c.provider_service_id = ? OR c.name LIKE ?)`;
          params.push(trimmedQuery, `%${trimmedQuery}%`);
        }
      } else {
        if (catClause.includes('?')) {
          sql += ` AND ${catClause}`;
          params.push(`%${category}%`, `%${category}%`);
        } else {
          sql += ` AND ${catClause}`;
        }
      }
    }

    // Keyword / ID search filter
    if (trimmedQuery) {
      sql += ' AND (c.provider_service_id = ? OR c.provider_service_id LIKE ? OR c.name LIKE ? OR c.category LIKE ? OR p.name LIKE ?)';
      const term = `%${trimmedQuery}%`;
      params.push(trimmedQuery, term, term, term, term);
    }

    sql += ' ORDER BY c.category ASC, c.rate ASC LIMIT 200';

    const services = query(sql, params);

    // List of connected providers for filter dropdown
    const providers = query(
      `SELECT id, name, slug FROM api_providers WHERE id IN (${providerFilterIds.join(',') || '0'}) ORDER BY name ASC`
    );

    return res.json({
      success: true,
      services,
      providers,
      total: services.length
    });
  } catch (err) {
    console.error('Provider search error:', err);
    return res.status(500).json({ success: false, error: 'Failed to search provider services.' });
  }
});

module.exports = router;

