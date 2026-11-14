const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const uuidv4 = () => crypto.randomUUID();
const { query, queryOne, run, transaction } = require('../db');
const { authenticate, requireRole } = require('../middleware/auth');
const { logAudit } = require('../middleware/auditLog');
const { hashPassKey } = require('../config/security');

// Guard all routes in this router with ADMIN role
router.use(authenticate, requireRole('ADMIN'));

/**
 * GET /api/admin/users
 * List all users with search, role filter, status filter, and pagination
 */
router.get('/', (req, res) => {
  try {
    const { search, role, status, page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);

    let sql = `
      SELECT u.id, u.username, u.email, u.role, u.balance, u.status, u.is_protected_admin,
             u.created_at, u.last_login_at, u.last_login_ip,
             (SELECT COUNT(*) FROM orders WHERE user_id = u.id) AS total_orders,
             (SELECT COUNT(*) FROM user_api_credentials WHERE user_id = u.id AND connection_status = 'CONNECTED') AS connected_apis
      FROM users u
      WHERE 1=1
    `;
    const params = [];

    if (search) {
      sql += ' AND (u.username LIKE ? OR u.email LIKE ? OR CAST(u.id AS TEXT) = ?)';
      const term = `%${search}%`;
      params.push(term, term, search);
    }

    if (role) {
      sql += ' AND u.role = ?';
      params.push(role);
    }

    if (status) {
      sql += ' AND u.status = ?';
      params.push(status);
    }

    sql += ' ORDER BY u.id ASC LIMIT ? OFFSET ?';
    params.push(parseInt(limit, 10), offset);

    const users = query(sql, params);

    // Total count query
    const countSql = 'SELECT COUNT(*) as total FROM users WHERE 1=1' +
      (search ? ' AND (username LIKE ? OR email LIKE ? OR CAST(id AS TEXT) = ?)' : '') +
      (role ? ' AND role = ?' : '') +
      (status ? ' AND status = ?' : '');
    const countParams = [];
    if (search) { countParams.push(`%${search}%`, `%${search}%`, search); }
    if (role) { countParams.push(role); }
    if (status) { countParams.push(status); }

    const countRow = queryOne(countSql, countParams);

    return res.json({
      success: true,
      users,
      pagination: {
        total: countRow ? countRow.total : users.length,
        page: parseInt(page, 10),
        limit: parseInt(limit, 10)
      }
    });
  } catch (err) {
    console.error('Admin list users error:', err);
    return res.status(500).json({ success: false, error: 'Failed to retrieve users.' });
  }
});

/**
 * GET /api/admin/users/:id
 * Individual user profile with detailed balance, order history, and API configurations
 */
router.get('/:id', (req, res) => {
  try {
    const userId = parseInt(req.params.id, 10);
    const user = queryOne(
      `SELECT id, username, email, role, balance, status, is_protected_admin, created_at, last_login_at, last_login_ip
       FROM users WHERE id = ?`,
      [userId]
    );

    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found.' });
    }

    // Fetch user's orders
    const orders = query(
      `SELECT o.*, s.name as service_name, p.name as provider_name
       FROM orders o
       LEFT JOIN services s ON o.service_id = s.id
       LEFT JOIN api_providers p ON o.provider_id = p.id
       WHERE o.user_id = ?
       ORDER BY o.created_at DESC LIMIT 20`,
      [userId]
    );

    // Fetch user's API credentials
    const credentials = query(
      `SELECT c.id, c.provider_id, p.name as provider_name, p.slug, c.masked_key, c.api_endpoint,
              c.connection_status, c.last_checked_at, c.last_error, c.reported_balance
       FROM user_api_credentials c
       JOIN api_providers p ON c.provider_id = p.id
       WHERE c.user_id = ?`,
      [userId]
    );

    // Fetch user's recent transactions
    const transactions = query(
      `SELECT * FROM transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT 10`,
      [userId]
    );

    return res.json({
      success: true,
      user,
      orders,
      credentials,
      transactions
    });
  } catch (err) {
    console.error('Admin get user error:', err);
    return res.status(500).json({ success: false, error: 'Failed to load user profile.' });
  }
});

/**
 * POST /api/admin/users
 * Create a new user or administrator account
 */
router.post('/', async (req, res) => {
  try {
    const { username, email, passKey, role = 'USER', initialBalance = 0 } = req.body;

    if (!username || !email || !passKey) {
      return res.status(400).json({
        success: false,
        error: 'Username, email, and access pass key are required.'
      });
    }

    if (!['ADMIN', 'USER'].includes(role)) {
      return res.status(400).json({ success: false, error: 'Invalid role specified.' });
    }

    const existingUser = queryOne('SELECT id FROM users WHERE username = ? OR email = ?', [username.trim(), email.trim()]);
    if (existingUser) {
      return res.status(400).json({ success: false, error: 'Username or email already in use.' });
    }

    const passKeyHash = await hashPassKey(passKey);
    const now = new Date().toISOString();
    const balance = parseFloat(initialBalance) || 0.00;

    const result = run(
      `INSERT INTO users (username, email, pass_key_hash, role, balance, status, is_protected_admin, created_at)
       VALUES (?, ?, ?, ?, ?, 'ACTIVE', ?, ?)`,
      [username.trim(), email.trim(), passKeyHash, role, balance, role === 'ADMIN' ? 1 : 0, now]
    );

    logAudit(req.user.id, 'CREATE_USER', 'users', result.lastInsertRowid, { username, email, role, balance }, req);

    return res.status(201).json({
      success: true,
      message: `Account for ${username} created successfully.`,
      userId: result.lastInsertRowid
    });
  } catch (err) {
    console.error('Admin create user error:', err);
    return res.status(500).json({ success: false, error: 'Failed to create user account.' });
  }
});

/**
 * PUT /api/admin/users/:id/status
 * Enable or disable user account
 * SECTION 3 CRITICAL: An ADMIN cannot be disabled by another ADMIN!
 */
router.put('/:id/status', (req, res) => {
  try {
    const targetUserId = parseInt(req.params.id, 10);
    const { status } = req.body;

    if (!['ACTIVE', 'DISABLED'].includes(status)) {
      return res.status(400).json({ success: false, error: 'Invalid status. Must be ACTIVE or DISABLED.' });
    }

    const targetUser = queryOne('SELECT * FROM users WHERE id = ?', [targetUserId]);
    if (!targetUser) {
      return res.status(404).json({ success: false, error: 'Target user not found.' });
    }

    // SECTION 3 & 4 ADMIN PROTECTION:
    // An ADMIN cannot be disabled by another ADMIN!
    if (targetUser.role === 'ADMIN' && status === 'DISABLED') {
      return res.status(403).json({
        success: false,
        error: 'CRITICAL SECURITY VIOLATION: An administrator account cannot be disabled by another administrator.'
      });
    }

    if (targetUser.is_protected_admin && status === 'DISABLED') {
      return res.status(403).json({
        success: false,
        error: 'CRITICAL SECURITY VIOLATION: This is a protected administrator account and cannot be disabled.'
      });
    }

    // Update status
    run('UPDATE users SET status = ? WHERE id = ?', [status, targetUserId]);

    // When ADMIN disables a USER: Immediately revoke active sessions!
    if (status === 'DISABLED') {
      run('DELETE FROM sessions WHERE user_id = ?', [targetUserId]);
      console.log(`[Admin Action] User ${targetUserId} disabled. All active sessions revoked immediately.`);
    }

    logAudit(req.user.id, status === 'DISABLED' ? 'DISABLE_USER' : 'ENABLE_USER', 'users', targetUserId, { targetUsername: targetUser.username, newStatus: status }, req);

    return res.json({
      success: true,
      message: `User ${targetUser.username} has been ${status === 'DISABLED' ? 'disabled and sessions revoked' : 'enabled'}.`
    });
  } catch (err) {
    console.error('Admin change status error:', err);
    return res.status(500).json({ success: false, error: 'Failed to update user status.' });
  }
});

/**
 * PUT /api/admin/users/:id/role
 * Change user role
 * SECTION 3 CRITICAL: An ADMIN cannot be downgraded to USER by another ADMIN!
 */
router.put('/:id/role', (req, res) => {
  try {
    const targetUserId = parseInt(req.params.id, 10);
    const { role } = req.body;

    if (!['ADMIN', 'USER'].includes(role)) {
      return res.status(400).json({ success: false, error: 'Invalid role.' });
    }

    const targetUser = queryOne('SELECT * FROM users WHERE id = ?', [targetUserId]);
    if (!targetUser) {
      return res.status(404).json({ success: false, error: 'Target user not found.' });
    }

    // SECTION 3 ADMIN PROTECTION:
    // An ADMIN cannot be downgraded to USER by another ADMIN!
    if (targetUser.role === 'ADMIN' && role === 'USER') {
      return res.status(403).json({
        success: false,
        error: 'CRITICAL SECURITY VIOLATION: An administrator cannot be downgraded to USER by another administrator.'
      });
    }

    run('UPDATE users SET role = ?, is_protected_admin = ? WHERE id = ?', [role, role === 'ADMIN' ? 1 : 0, targetUserId]);

    logAudit(req.user.id, 'CHANGE_USER_ROLE', 'users', targetUserId, { targetUsername: targetUser.username, newRole: role }, req);

    return res.json({
      success: true,
      message: `Role for ${targetUser.username} updated to ${role}.`
    });
  } catch (err) {
    console.error('Admin change role error:', err);
    return res.status(500).json({ success: false, error: 'Failed to update user role.' });
  }
});

/**
 * DELETE /api/admin/users/:id
 * Delete a user account permanently (Soft delete / anonymize, preserve audit/financial records)
 * SECTION 3 CRITICAL:
 * - An ADMIN cannot be deleted by another ADMIN!
 * - Prevent accidental removal of the final active ADMIN account.
 */
router.delete('/:id', (req, res) => {
  try {
    const targetUserId = parseInt(req.params.id, 10);
    const targetUser = queryOne('SELECT * FROM users WHERE id = ?', [targetUserId]);

    if (!targetUser) {
      return res.status(404).json({ success: false, error: 'User not found.' });
    }

    // SECTION 3 ADMIN PROTECTION:
    // An ADMIN cannot be deleted by another ADMIN!
    if (targetUser.role === 'ADMIN') {
      return res.status(403).json({
        success: false,
        error: 'CRITICAL SECURITY VIOLATION: An administrator account cannot be deleted by another administrator.'
      });
    }

    if (targetUser.is_protected_admin) {
      return res.status(403).json({
        success: false,
        error: 'CRITICAL SECURITY VIOLATION: Protected administrator accounts can never be deleted.'
      });
    }

    // Check final active ADMIN protection
    const activeAdminCount = queryOne("SELECT COUNT(*) as count FROM users WHERE role = 'ADMIN' AND status = 'ACTIVE'");
    if (targetUser.role === 'ADMIN' && activeAdminCount && activeAdminCount.count <= 1) {
      return res.status(403).json({
        success: false,
        error: 'Action blocked: Cannot delete or remove the final active administrator account.'
      });
    }

    // Immediately revoke all sessions and access tokens
    run('DELETE FROM sessions WHERE user_id = ?', [targetUserId]);

    // Anonymize and mark DELETED to preserve order and financial audit history
    const anonymizedEmail = `deleted_${targetUserId}_${Date.now()}@anonymized.internal`;
    const anonymizedUsername = `deleted_user_${targetUserId}`;
    run(
      `UPDATE users 
       SET status = 'DELETED', username = ?, email = ?, pass_key_hash = 'DELETED_REVOKED'
       WHERE id = ?`,
      [anonymizedUsername, anonymizedEmail, targetUserId]
    );

    logAudit(req.user.id, 'DELETE_USER', 'users', targetUserId, { originalUsername: targetUser.username }, req);

    return res.json({
      success: true,
      message: `User account #${targetUserId} has been deleted and access revoked permanently.`
    });
  } catch (err) {
    console.error('Admin delete user error:', err);
    return res.status(500).json({ success: false, error: 'Failed to delete user account.' });
  }
});

/**
 * POST /api/admin/users/:id/balance
 * Safely adjust user balance with transaction and audit trail
 */
router.post('/:id/balance', (req, res) => {
  try {
    const targetUserId = parseInt(req.params.id, 10);
    const { amount, type = 'CREDIT', reason = 'Manual administrative adjustment' } = req.body;

    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({ success: false, error: 'Amount must be a positive number.' });
    }

    if (!['CREDIT', 'DEBIT'].includes(type)) {
      return res.status(400).json({ success: false, error: 'Type must be CREDIT or DEBIT.' });
    }

    const now = new Date().toISOString();
    let updatedUser = null;

    transaction((tx) => {
      const user = tx.queryOne('SELECT * FROM users WHERE id = ?', [targetUserId]);
      if (!user) {
        throw new Error('User not found.');
      }

      let newBalance = user.balance;
      if (type === 'CREDIT') {
        newBalance += parsedAmount;
      } else {
        if (user.balance < parsedAmount) {
          throw new Error(`Cannot debit $${parsedAmount.toFixed(2)}. Available balance is only $${user.balance.toFixed(2)}.`);
        }
        newBalance -= parsedAmount;
      }
      newBalance = parseFloat(newBalance.toFixed(4));

      tx.run('UPDATE users SET balance = ? WHERE id = ?', [newBalance, targetUserId]);

      const txId = `TX-ADJ-${uuidv4()}`;
      tx.run(
        `INSERT INTO transactions (id, user_id, amount, type, description, reference_id, balance_after, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [txId, targetUserId, parsedAmount, type, `Admin adjustment: ${reason}`, `ADM-${req.user.id}`, newBalance, now]
      );

      updatedUser = tx.queryOne('SELECT id, username, balance FROM users WHERE id = ?', [targetUserId]);
    });

    logAudit(req.user.id, 'ADJUST_USER_BALANCE', 'users', targetUserId, { amount: parsedAmount, type, reason, newBalance: updatedUser.balance }, req);

    return res.json({
      success: true,
      message: `Balance for ${updatedUser.username} successfully updated to $${updatedUser.balance.toFixed(2)}.`,
      user: updatedUser
    });
  } catch (err) {
    console.error('Admin adjust balance error:', err.message);
    return res.status(400).json({ success: false, error: err.message });
  }
});

module.exports = router;

