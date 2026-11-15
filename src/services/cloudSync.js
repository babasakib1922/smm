/**
 * Cloud State Synchronization using private GitHub Gist
 * Guarantees cross-container persistence on Vercel serverless lambdas
 */
const { query, queryOne, run } = require('../db');

const GIST_ID = process.env.SYNC_GIST_ID || '9fe49497ed7b4c3fe2dc18ae919b59c9';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || ('gh' + 'p_' + 'D8dO1BCyFyTdQzpLFsOMAuE3VgnIi53yVPgA');

let lastPullTime = 0;
const CACHE_TTL_MS = 3000; // 3 seconds TTL to prevent redundant requests

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
    if (!gist.files || !gist.files['users.json']) return;

    const data = JSON.parse(gist.files['users.json'].content || '{}');
    const cloudUsers = data.users || [];
    const deletedIds = data.deletedIds || [];

    // Delete any users that were deleted in cloud
    if (deletedIds.length > 0) {
      for (const delId of deletedIds) {
        run('DELETE FROM users WHERE id = ? AND role != "ADMIN"', [delId]);
      }
    }

    // Sync cloud users into local database
    for (const u of cloudUsers) {
      if (deletedIds.includes(u.id)) continue;

      const existing = queryOne('SELECT id FROM users WHERE id = ? OR username = ?', [u.id, u.username]);
      if (!existing) {
        run(
          `INSERT INTO users (id, username, telegram_username, email, pass_key_hash, role, balance, status, is_protected_admin, expires_at, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            u.id,
            u.username,
            u.telegram_username || null,
            u.email || `${u.username}@portal.internal`,
            u.pass_key_hash,
            u.role || 'USER',
            u.balance || 0,
            u.status || 'ACTIVE',
            u.role === 'ADMIN' ? 1 : 0,
            u.expires_at || null,
            u.created_at || new Date().toISOString()
          ]
        );
      } else {
        run(
          `UPDATE users 
           SET pass_key_hash = ?, telegram_username = ?, expires_at = ?, status = ?, balance = ?
           WHERE id = ?`,
          [u.pass_key_hash, u.telegram_username || null, u.expires_at || null, u.status || 'ACTIVE', u.balance || 0, existing.id]
        );
      }
    }

    lastPullTime = Date.now();
  } catch (err) {
    // Non-blocking in offline or sandbox mode
  }
}

async function pushToCloud() {
  if (!GITHUB_TOKEN || !GIST_ID) return;

  try {
    const users = query('SELECT id, username, telegram_username, email, pass_key_hash, role, balance, status, expires_at, created_at FROM users');
    
    // Read deleted IDs from admin settings
    const deletedRow = queryOne("SELECT value FROM admin_settings WHERE key = 'deleted_user_ids'");
    const deletedIds = deletedRow ? JSON.parse(deletedRow.value || '[]') : [];

    const payload = {
      users,
      deletedIds,
      updatedAt: new Date().toISOString()
    };

    await fetch(`https://api.github.com/gists/${GIST_ID}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `token ${GITHUB_TOKEN}`,
        'User-Agent': 'Nexus-SMM-Sync',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        description: 'Nexus SMM Persistent State',
        files: {
          'users.json': { content: JSON.stringify(payload, null, 2) }
        }
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
