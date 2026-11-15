const { queryOne, run } = require('../db');
const { verifyToken } = require('../config/security');
const { pullFromCloud } = require('../services/cloudSync');

/**
 * Main authentication middleware
 * Validates session / token, checks user status, rejects disabled/deleted users immediately
 */
async function authenticate(req, res, next) {
  try {
    let token = null;

    // Check Authorization header
    const authHeader = req.headers['authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    } else if (req.cookies && req.cookies.token) {
      token = req.cookies.token;
    }

    if (!token) {
      return res.status(401).json({ success: false, error: 'Authentication required. No session pass key provided.' });
    }

    // Verify JWT
    const decoded = verifyToken(token);
    if (!decoded || !decoded.userId) {
      return res.status(401).json({ success: false, error: 'Session expired or invalid. Please log in with your access pass key.' });
    }

    // Check if user has been permanently deleted
    const deletedRow = queryOne("SELECT value FROM admin_settings WHERE key = 'deleted_user_ids'");
    const deletedIds = deletedRow ? JSON.parse(deletedRow.value || '[]') : [];
    if (deletedIds.includes(decoded.userId)) {
      return res.status(401).json({ success: false, error: 'User account has been deleted.' });
    }

    // Optional session expiration check if session record exists
    const session = queryOne('SELECT * FROM sessions WHERE token = ? AND user_id = ?', [token, decoded.userId]);
    if (session && new Date(session.expires_at) < new Date()) {
      run('DELETE FROM sessions WHERE id = ?', [session.id]);
      return res.status(401).json({ success: false, error: 'Session has expired.' });
    }

    // Fetch user and check active status
    let user = queryOne('SELECT id, username, telegram_username, email, role, balance, status, is_protected_admin, expires_at, created_at, last_login_at FROM users WHERE id = ?', [decoded.userId]);
    if (!user && decoded.username) {
      user = queryOne('SELECT id, username, telegram_username, email, role, balance, status, is_protected_admin, expires_at, created_at, last_login_at FROM users WHERE LOWER(username) = ?', [decoded.username.toLowerCase()]);
    }
    if (!user && decoded.role === 'ADMIN') {
      user = queryOne("SELECT id, username, telegram_username, email, role, balance, status, is_protected_admin, expires_at, created_at, last_login_at FROM users WHERE role = 'ADMIN' LIMIT 1");
    }

    // If not found in local container database, pull state from Cloud Gist
    if (!user) {
      try {
        await pullFromCloud(true);
      } catch (err) {
        // Non-blocking in offline / test environments
      }
      user = queryOne('SELECT id, username, telegram_username, email, role, balance, status, is_protected_admin, expires_at, created_at, last_login_at FROM users WHERE id = ?', [decoded.userId]);
      if (!user && decoded.username) {
        user = queryOne('SELECT id, username, telegram_username, email, role, balance, status, is_protected_admin, expires_at, created_at, last_login_at FROM users WHERE LOWER(username) = ?', [decoded.username.toLowerCase()]);
      }
      if (!user && decoded.role === 'ADMIN') {
        user = queryOne("SELECT id, username, telegram_username, email, role, balance, status, is_protected_admin, expires_at, created_at, last_login_at FROM users WHERE role = 'ADMIN' LIMIT 1");
      }
    }

    // If still not found, but JWT was signed by our JWT_SECRET and user is not in deletedIds:
    // Auto-provision user record so valid authenticated users are never locked out across Lambda containers
    if (!user && decoded.userId && decoded.username) {
      const now = new Date().toISOString();
      try {
        run(
          `INSERT OR IGNORE INTO users (id, username, telegram_username, email, pass_key_hash, role, balance, status, is_protected_admin, created_at)
           VALUES (?, ?, ?, ?, 'jwt_verified', ?, 0.00, 'ACTIVE', ?, ?)`,
          [
            decoded.userId,
            decoded.username,
            `@${decoded.username}`,
            `${decoded.username.toLowerCase()}@telegram.internal`,
            decoded.role || 'USER',
            decoded.role === 'ADMIN' ? 1 : 0,
            now
          ]
        );
        user = queryOne('SELECT id, username, telegram_username, email, role, balance, status, is_protected_admin, expires_at, created_at, last_login_at FROM users WHERE id = ? OR LOWER(username) = ?', [decoded.userId, decoded.username.toLowerCase()]);
      } catch (e) {
        console.warn('Auto provision from token error:', e);
      }
    }

    if (!user && decoded.userId) {
      user = {
        id: decoded.userId,
        username: decoded.username || 'user',
        telegram_username: decoded.username ? `@${decoded.username}` : null,
        email: decoded.username ? `${decoded.username.toLowerCase()}@telegram.internal` : null,
        role: decoded.role || 'USER',
        balance: 0.00,
        status: 'ACTIVE',
        is_protected_admin: decoded.role === 'ADMIN' ? 1 : 0,
        expires_at: null,
        created_at: new Date().toISOString(),
        last_login_at: new Date().toISOString()
      };
    }

    if (!user) {
      return res.status(401).json({ success: false, error: 'User account not found.' });
    }

    // Check expiration date
    if (user.expires_at) {
      const expDate = new Date(user.expires_at);
      if (!isNaN(expDate.getTime()) && expDate < new Date()) {
        return res.status(403).json({
          success: false,
          error: 'Your Access Pass Key has expired. Please contact administrator to renew.'
        });
      }
    }

    // Enforce immediate access revocation for disabled or deleted users
    if (user.status !== 'ACTIVE') {
      return res.status(403).json({
        success: false,
        error: `Account access revoked. Account status is ${user.status}.`
      });
    }

    req.user = user;
    req.sessionId = session ? session.id : (decoded.jti || `SESS-${user.id}`);
    next();
  } catch (err) {
    console.error('Auth middleware error:', err);
    return res.status(500).json({ success: false, error: 'Authentication error.' });
  }
}

/**
 * Role-based authorization guard
 */
function requireRole(allowedRoles) {
  const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Unauthorized.' });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ success: false, error: 'Access denied. Insufficient permissions.' });
    }
    next();
  };
}

module.exports = {
  authenticate,
  requireRole,
};

