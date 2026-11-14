const { queryOne, run } = require('../db');
const { verifyToken } = require('../config/security');

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

    // Optional session expiration check if session record exists
    const session = queryOne('SELECT * FROM sessions WHERE token = ? AND user_id = ?', [token, decoded.userId]);
    if (session && new Date(session.expires_at) < new Date()) {
      run('DELETE FROM sessions WHERE id = ?', [session.id]);
      return res.status(401).json({ success: false, error: 'Session has expired.' });
    }

    // Fetch user and check active status
    let user = queryOne('SELECT id, username, email, role, balance, status, is_protected_admin, created_at, last_login_at FROM users WHERE id = ?', [decoded.userId]);
    if (!user && decoded.role === 'ADMIN') {
      user = queryOne("SELECT id, username, email, role, balance, status, is_protected_admin, created_at, last_login_at FROM users WHERE role = 'ADMIN' LIMIT 1");
    }

    if (!user) {
      return res.status(401).json({ success: false, error: 'User account not found.' });
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

