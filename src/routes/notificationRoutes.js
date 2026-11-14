const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const {
  getUserNotifications,
  markAsRead,
  markAllAsRead
} = require('../services/notificationService');

/**
 * GET /api/notifications
 * List user notifications with unread count
 */
router.get('/', authenticate, (req, res) => {
  try {
    const data = getUserNotifications(req.user.id);
    return res.json({ success: true, ...data });
  } catch (err) {
    console.error('Get notifications error:', err);
    return res.status(500).json({ success: false, error: 'Failed to retrieve notifications.' });
  }
});

/**
 * POST /api/notifications/:id/read
 * Mark single notification as read
 */
router.post('/:id/read', authenticate, (req, res) => {
  try {
    markAsRead(req.params.id, req.user.id);
    return res.json({ success: true, message: 'Notification marked as read.' });
  } catch (err) {
    console.error('Mark notification read error:', err);
    return res.status(500).json({ success: false, error: 'Failed to mark notification.' });
  }
});

/**
 * POST /api/notifications/read-all
 * Mark all user notifications as read
 */
router.post('/read-all', authenticate, (req, res) => {
  try {
    markAllAsRead(req.user.id);
    return res.json({ success: true, message: 'All notifications marked as read.' });
  } catch (err) {
    console.error('Mark all read error:', err);
    return res.status(500).json({ success: false, error: 'Failed to mark notifications.' });
  }
});

module.exports = router;

