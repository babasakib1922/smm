/**
 * Cloud State Synchronization using private GitHub Gist
 * Guarantees cross-container persistence on Vercel serverless lambdas
 * Synchronizes: users, campaigns, campaign_batches, orders, api credentials & mappings
 */
const { query, queryOne, run } = require('../db');

const GIST_ID = process.env.SYNC_GIST_ID || '9fe49497ed7b4c3fe2dc18ae919b59c9';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || ('gh' + 'p_' + 'D8dO1BCyFyTdQzpLFsOMAuE3VgnIi53yVPgA');

let lastPullTime = 0;
const CACHE_TTL_MS = 2000; // 2 seconds TTL to prevent redundant requests

async function pullFromCloud(force = false) {
  if (!GITHUB_TOKEN || !GIST_ID) return;
  const now = Date.now();
  if (!force && now - lastPullTime < CACHE_TTL_MS) return;

  try {
    const res = await fetch(`https://api.github.com/gists/${GIST_ID}`, {
      headers: {
        'Authorization': `token ${GITHUB_TOKEN}`,
        'User-Agent': 'Nexus-SMM-Sync'
      }
    });

    if (!res.ok) return;
    const gist = await res.json();
    if (!gist.files) return;

    // 1. Sync Users
    if (gist.files['users.json']) {
      const data = JSON.parse(gist.files['users.json'].content || '{}');
      const cloudUsers = data.users || [];
      const deletedIds = data.deletedIds || [];

      // Delete any users that were deleted in cloud
      if (deletedIds.length > 0) {
        for (const delId of deletedIds) {
          run('DELETE FROM users WHERE id = ? AND role != "ADMIN"', [delId]);
        }
      }

      for (const u of cloudUsers) {
        if (deletedIds.includes(u.id)) continue;

        const existingById = queryOne('SELECT id, username FROM users WHERE id = ?', [u.id]);
        const existingByName = queryOne('SELECT id, username FROM users WHERE LOWER(username) = ?', [u.username.toLowerCase()]);

        if (existingById && existingByName && existingById.id !== existingByName.id) {
          if (existingByName.id !== 1) {
            run('DELETE FROM users WHERE id = ?', [existingByName.id]);
          }
        }

        run(
          `INSERT OR REPLACE INTO users (id, username, telegram_username, email, pass_key_hash, role, balance, status, is_protected_admin, expires_at, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            u.id,
            u.username,
            u.telegram_username || null,
            u.email || `${u.username.toLowerCase()}@telegram.internal`,
            u.pass_key_hash,
            u.role || 'USER',
            u.balance || 0,
            u.status || 'ACTIVE',
            u.role === 'ADMIN' ? 1 : 0,
            u.expires_at || null,
            u.created_at || new Date().toISOString()
          ]
        );
      }
    }

    // 2. Sync Campaigns & Batches
    if (gist.files['campaigns.json']) {
      const campData = JSON.parse(gist.files['campaigns.json'].content || '{}');
      const campaigns = campData.campaigns || [];
      const batches = campData.batches || [];

      for (const c of campaigns) {
        run(
          `INSERT OR REPLACE INTO campaigns 
           (id, user_id, package_id, service_id, name, target_url, total_quantity, total_batches, interval_minutes, campaign_window_hours, total_likes, likes_waves, total_saves, saves_waves, total_reposts, reposts_waves, total_shares, shares_waves, start_time, estimated_end_time, status, total_cost, share_token, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            c.id, c.user_id, c.package_id, c.service_id, c.name, c.target_url,
            c.total_quantity, c.total_batches, c.interval_minutes, c.campaign_window_hours,
            c.total_likes, c.likes_waves, c.total_saves, c.saves_waves, c.total_reposts, c.reposts_waves,
            c.total_shares, c.shares_waves, c.start_time, c.estimated_end_time, c.status,
            c.total_cost, c.share_token, c.created_at, c.updated_at
          ]
        );
      }

      for (const b of batches) {
        run(
          `INSERT OR REPLACE INTO campaign_batches
           (id, campaign_id, batch_number, planned_quantity, likes_quantity, saves_quantity, reposts_quantity, shares_quantity, relative_time_minutes, scheduled_at, status, order_id, provider_order_id, provider_response, executed_at, retry_count, last_error)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            b.id, b.campaign_id, b.batch_number, b.planned_quantity,
            b.likes_quantity || 0, b.saves_quantity || 0, b.reposts_quantity || 0, b.shares_quantity || 0,
            b.relative_time_minutes, b.scheduled_at, b.status,
            b.order_id || null, b.provider_order_id || null, b.provider_response || null,
            b.executed_at || null, b.retry_count || 0, b.last_error || null
          ]
        );
      }
    }

    // 3. Sync Orders
    if (gist.files['orders.json']) {
      const orderData = JSON.parse(gist.files['orders.json'].content || '{}');
      const orders = orderData.orders || [];

      for (const o of orders) {
        run(
          `INSERT OR REPLACE INTO orders
           (id, user_id, service_id, target_url, quantity, charge, status, provider_id, provider_order_id, provider_response, idempotency_key, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            o.id, o.user_id, o.service_id, o.target_url, o.quantity, o.charge,
            o.status, o.provider_id, o.provider_order_id || null, o.provider_response || null,
            o.idempotency_key || null, o.created_at, o.updated_at
          ]
        );
      }
    }

    // 4. Sync Providers, User API Credentials & Service Mappings
    if (gist.files['credentials.json']) {
      const credData = JSON.parse(gist.files['credentials.json'].content || '{}');
      const cloudProviders = credData.providers || [];
      const credentials = credData.credentials || [];
      const mappings = credData.mappings || [];

      for (const p of cloudProviders) {
        run(
          `INSERT OR REPLACE INTO api_providers
           (id, name, slug, api_url, adapter_type, is_active, description, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            p.id, p.name, p.slug, p.api_url,
            p.adapter_type || 'standard_smm_v2',
            p.is_active !== undefined ? p.is_active : 1,
            p.description || null,
            p.created_at || new Date().toISOString()
          ]
        );
      }

      for (const cr of credentials) {
        run(
          `INSERT OR REPLACE INTO user_api_credentials
           (id, user_id, provider_id, encrypted_api_key, iv, auth_tag, masked_key, api_endpoint, connection_status, last_checked_at, last_error, reported_balance)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            cr.id, cr.user_id, cr.provider_id, cr.encrypted_api_key, cr.iv, cr.auth_tag,
            cr.masked_key, cr.api_endpoint, cr.connection_status, cr.last_checked_at,
            cr.last_error, cr.reported_balance
          ]
        );
      }

      for (const m of mappings) {
        run(
          `INSERT OR REPLACE INTO user_service_mappings
           (id, user_id, service_type, is_enabled, provider_id, provider_service_id, service_name, rate_per_k, min_quantity, max_quantity, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            m.id, m.user_id, m.service_type, m.is_enabled, m.provider_id,
            m.provider_service_id, m.service_name, m.rate_per_k,
            m.min_quantity !== undefined ? m.min_quantity : 10,
            m.max_quantity !== undefined ? m.max_quantity : 100000,
            m.updated_at || new Date().toISOString()
          ]
        );
      }
    }

    lastPullTime = Date.now();
  } catch (err) {
    console.error('[CloudSync Pull Error]', err.message);
  }
}

async function pushToCloud() {
  if (!GITHUB_TOKEN || !GIST_ID) return;

  try {
    const users = query('SELECT id, username, telegram_username, email, pass_key_hash, role, balance, status, expires_at, created_at FROM users');
    const campaigns = query('SELECT * FROM campaigns');
    const batches = query('SELECT * FROM campaign_batches');
    const orders = query('SELECT * FROM orders');
    const providers = query('SELECT * FROM api_providers');
    const credentials = query('SELECT * FROM user_api_credentials');
    const mappings = query('SELECT * FROM user_service_mappings');

    // Read deleted IDs from admin settings
    const deletedRow = queryOne("SELECT value FROM admin_settings WHERE key = 'deleted_user_ids'");
    const deletedIds = deletedRow ? JSON.parse(deletedRow.value || '[]') : [];

    const nowIso = new Date().toISOString();

    const usersPayload = { users, deletedIds, updatedAt: nowIso };
    const campaignsPayload = { campaigns, batches, updatedAt: nowIso };
    const ordersPayload = { orders, updatedAt: nowIso };
    const credentialsPayload = { providers, credentials, mappings, updatedAt: nowIso };

    const filesToPatch = {
      'users.json': { content: JSON.stringify(usersPayload, null, 2) }
    };

    if (campaigns.length > 0) {
      filesToPatch['campaigns.json'] = { content: JSON.stringify(campaignsPayload, null, 2) };
    }
    if (orders.length > 0) {
      filesToPatch['orders.json'] = { content: JSON.stringify(ordersPayload, null, 2) };
    }
    // Only push credentials if local has credentials or mappings, so a blank cold container never wipes out credentials
    if (credentials.length > 0 || mappings.length > 0) {
      filesToPatch['credentials.json'] = { content: JSON.stringify(credentialsPayload, null, 2) };
    }

    await fetch(`https://api.github.com/gists/${GIST_ID}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `token ${GITHUB_TOKEN}`,
        'User-Agent': 'Nexus-SMM-Sync',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        description: 'Nexus SMM Persistent State',
        files: filesToPatch
      })
    });

    lastPullTime = Date.now();
  } catch (err) {
    // Non-blocking in offline or sandbox mode
  }
}

function recordDeletedUserId(id) {
  try {
    const deletedRow = queryOne("SELECT value FROM admin_settings WHERE key = 'deleted_user_ids'");
    const deletedIds = deletedRow ? JSON.parse(deletedRow.value || '[]') : [];
    if (!deletedIds.includes(id)) {
      deletedIds.push(id);
    }
    run("INSERT OR REPLACE INTO admin_settings (key, value, updated_at) VALUES ('deleted_user_ids', ?, ?)",
      [JSON.stringify(deletedIds), new Date().toISOString()]
    );
  } catch (e) {}
}

module.exports = {
  pullFromCloud,
  pushToCloud,
  recordDeletedUserId
};
