const { run } = require('../db');
const { redactSecrets } = require('../config/security');

/**
 * Log an administrative or critical security action
 */
function logAudit(userId, action, targetType, targetId, details, req = null) {
  try {
    const now = new Date().toISOString();
    const ip = req ? (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1') : 'system';
    const safeDetails = typeof details === 'object' ? JSON.stringify(redactSecrets(details)) : redactSecrets(String(details || ''));

    run(
      `INSERT INTO audit_logs (user_id, action, target_type, target_id, details, ip_address, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [userId || null, action, targetType || null, targetId ? String(targetId) : null, safeDetails, ip, now]
    );
  } catch (err) {
    console.error('Failed to write audit log:', err.message);
  }
}

module.exports = {
  logAudit
};

