const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const uuidv4 = () => crypto.randomUUID();
const { query, queryOne, run } = require('../db');
const { verifyPassKey, generateToken } = require('../config/security');
const { authenticate } = require('../middleware/auth');
const { logAudit } = require('../middleware/auditLog');
const { pullFromCloud } = require('../services/cloudSync');

/**
 * POST /api/auth/login
 * Private authentication requiring valid access pass key.
 * No public sign up.
 */
router.post('/login', async (req, res) => {
  try {
    const { passKey, accessPassKey, username } = req.body;
    const cleanKey = String(passKey || accessPassKey || '').trim();

    if (!cleanKey) {
      return res.status(400).json({
        success: false,
        error: 'Access Pass Key is required.'
      });
    }

    // Force pull from cloud state to ensure new keys created in another container are loaded
    await pullFromCloud(true);

    let user = null;

    // Direct match for admin passkey 1922 (or sakib1922)
    if (cleanKey === '1922' || cleanKey === 'sakib1922') {
      user = queryOne("SELECT * FROM users WHERE role = 'ADMIN' LIMIT 1");
    }

    // Direct match for client demo passkey
    if (!user && (cleanKey === 'user12345pass' || cleanKey === 'demo12345pass')) {
      user = queryOne("SELECT * FROM users WHERE role = 'USER' AND status = 'ACTIVE' LIMIT 1");
    }

    // If username was provided, check that specific user first
    if (!user && username && String(username).trim()) {
      const cleanInput = String(username).trim().toLowerCase();
      let candidate = queryOne(
        'SELECT * FROM users WHERE (LOWER(username) = ? OR LOWER(telegram_username) = ? OR LOWER(email) = ?) AND status = "ACTIVE"',
        [cleanInput, cleanInput, cleanInput]
      );
      if (!candidate && ['admin', 'sakib', 'sakib1922'].includes(cleanInput)) {
        candidate = queryOne("SELECT * FROM users WHERE role = 'ADMIN' LIMIT 1");
      }
      if (candidate && candidate.pass_key_hash) {
        const isValid = await verifyPassKey(cleanKey, candidate.pass_key_hash);
        if (isValid) {
          user = candidate;
        }
      }
    }

    // If still not resolved, verify pass key against all active users
    if (!user) {
      const allUsers = query("SELECT * FROM users WHERE status = 'ACTIVE'");
      for (const u of allUsers) {
        if (u.pass_key_hash) {
          let isValid = await verifyPassKey(cleanKey, u.pass_key_hash);
          if (!isValid) {
            // Mobile keyboard tolerance: check uppercase and lowercase variants
            isValid = (await verifyPassKey(cleanKey.toUpperCase(), u.pass_key_hash)) ||
                      (await verifyPassKey(cleanKey.toLowerCase(), u.pass_key_hash));
          }
          if (isValid) {
            user = u;
            break;
          }
        }
      }
    }

    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Invalid Access Pass Key. Access denied.'
      });
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
        telegram_username: user.telegram_username,
        email: user.email,
        role: user.role,
        balance: user.balance,
        status: user.status,
        expires_at: user.expires_at,
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
      telegram_username: req.user.telegram_username,
      email: req.user.email,
      role: req.user.role,
      status: req.user.status,
      expires_at: req.user.expires_at,
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

