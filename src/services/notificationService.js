const crypto = require('crypto');
const uuidv4 = () => crypto.randomUUID();
const { query, queryOne, run } = require('../db');

/**
 * Send in-panel notification to a user or all admins
 */
function sendNotification({ userId, title, message, type = 'INFO' }) {
  try {
    const id = `NOTIF-${uuidv4()}`;
    const now = new Date().toISOString();
    run(
      `INSERT INTO notifications (id, user_id, title, message, type, is_read, created_at)
       VALUES (?, ?, ?, ?, ?, 0, ?)`,
      [id, userId, title, message, type, now]
    );
    return id;
  } catch (err) {
    console.error('Failed to send notification:', err.message);
    return null;
  }
}

/**
 * Notify all admins about a critical system/automation event
 */
function notifyAdmins({ title, message, type = 'WARNING' }) {
  try {
    const admins = query("SELECT id FROM users WHERE role = 'ADMIN' AND status = 'ACTIVE'");
    for (const admin of admins) {
      sendNotification({
        userId: admin.id,
        title,
        message,
        type
      });
    }
  } catch (err) {
    console.error('Failed to notify admins:', err.message);
  }
}

/**
 * Get user notifications with unread count
 */
function getUserNotifications(userId, limit = 50) {
  const notifications = query(
    'SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT ?',
    [userId, limit]
  );
  const unreadCountRow = queryOne(
    'SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = 0',
    [userId]
  );
  return {
    notifications,
    unreadCount: unreadCountRow ? unreadCountRow.count : 0
  };
}

/**
 * Mark notification as read
 */
function markAsRead(notificationId, userId) {
  return run(
    'UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?',
    [notificationId, userId]
  );
}

/**
 * Mark all notifications as read for a user
 */
function markAllAsRead(userId) {
  return run(
    'UPDATE notifications SET is_read = 1 WHERE user_id = ?',
    [userId]
  );
}

module.exports = {
  sendNotification,
  notifyAdmins,
  getUserNotifications,
  markAsRead,
  markAllAsRead
};

