const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const uuidv4 = () => crypto.randomUUID();
const { queryOne, run } = require('../db');
const { verifyPassKey, generateToken } = require('../config/security');
const { authenticate } = require('../middleware/auth');
const { logAudit } = require('../middleware/auditLog');

/**
 * POST /api/auth/login
 * Private authentication requiring valid username and access pass key.
 * No public sign up.
 */
router.post('/login', async (req, res) => {
  try {
    const { username, passKey } = req.body;

    if (!username || !passKey) {
      return res.status(400).json({
        success: false,
        error: 'Username and access pass key are required.'
      });
    }

    const cleanInput = username.trim().toLowerCase();
    let user = queryOne(
      'SELECT * FROM users WHERE LOWER(username) = ? OR LOWER(email) = ?',
      [cleanInput, cleanInput]
    );

    // Friendly alias matching for administrator
    if (!user && ['admin', 'sakib', 'sakib1922', 'admin12345pass'].includes(cleanInput)) {
      user = queryOne("SELECT * FROM users WHERE role = 'ADMIN' LIMIT 1");
    }
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Invalid credentials. Access denied.'
      });
    }

    // Check if account is disabled or deleted
    if (user.status === 'DISABLED') {
      return res.status(403).json({
        success: false,
        error: 'Account has been disabled by an administrator. Please contact support.'
      });
    }
    if (user.status === 'DELETED') {
      return res.status(403).json({
        success: false,
        error: 'Account has been deleted. Access revoked.'
      });
    }

    // Verify pass key hash
    const isValid = await verifyPassKey(passKey, user.pass_key_hash);
    if (!isValid) {
      return res.status(401).json({
        success: false,
        error: 'Invalid credentials. Access denied.'
      });
    }

    // Create session
    const sessionId = `SESS-${uuidv4()}`;
    const token = generateToken({
      userId: user.id,
      username: user.username,
      role: user.role,
      jti: uuidv4()
    });

    const now = new Date();
    const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';

    run(
      `INSERT INTO sessions (id, user_id, token, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?)`,
      [sessionId, user.id, token, expiresAt, now.toISOString()]
    );

    // Update user last login
    run('UPDATE users SET last_login_at = ?, last_login_ip = ? WHERE id = ?', [now.toISOString(), ip, user.id]);

    logAudit(user.id, 'USER_LOGIN', 'users', user.id, 'User logged in successfully', req);

    // Set HTTP-only cookie
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000
    });

    return res.json({
      success: true,
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        balance: user.balance,
        status: user.status,
        isProtectedAdmin: Boolean(user.is_protected_admin),
        createdAt: user.created_at,
        lastLoginAt: now.toISOString()
      }
    });

  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ success: false, error: 'Internal server error during login.' });
  }
});

/**
 * GET /api/auth/me
 * Return currently authenticated user profile with connected SMM panel API balance
 */
router.get('/me', authenticate, (req, res) => {
  const activeCred = queryOne(
    `SELECT c.reported_balance, p.name as provider_name, c.connection_status
     FROM user_api_credentials c
     JOIN api_providers p ON c.provider_id = p.id
     WHERE c.user_id = ? AND c.connection_status = 'CONNECTED'
     ORDER BY c.id DESC LIMIT 1`,
    [req.user.id]
  );

  return res.json({
    success: true,
    user: {
      id: req.user.id,
      username: req.user.username,
      email: req.user.email,
      role: req.user.role,
      status: req.user.status,
      isProtectedAdmin: Boolean(req.user.is_protected_admin),
      createdAt: req.user.created_at,
      lastLoginAt: req.user.last_login_at,
      hasConnectedApi: Boolean(activeCred),
      apiBalance: activeCred ? activeCred.reported_balance : 0.00,
      apiProviderName: activeCred ? activeCred.provider_name : null
    }
  });
});

/**
 * POST /api/auth/logout
 * Revoke active session
 */
router.post('/logout', authenticate, (req, res) => {
  if (req.sessionId) {
    run('DELETE FROM sessions WHERE id = ?', [req.sessionId]);
  }
  res.clearCookie('token');
  logAudit(req.user.id, 'USER_LOGOUT', 'users', req.user.id, 'User logged out', req);
  return res.json({ success: true, message: 'Logged out successfully.' });
});

module.exports = router;

