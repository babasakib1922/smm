const express = require('express');
const router = express.Router();
const { query, queryOne, run } = require('../db');
const { authenticate, requireRole } = require('../middleware/auth');
const { logAudit } = require('../middleware/auditLog');

router.use(authenticate, requireRole('ADMIN'));

/**
 * GET /api/admin/settings
 * Get all system settings and configurable package definitions
 */
router.get('/', (req, res) => {
  try {
    const settings = query('SELECT * FROM admin_settings ORDER BY key ASC');
    const packages = query(
      `SELECT p.*, s.name as service_name 
       FROM packages p 
       LEFT JOIN services s ON p.service_id = s.id 
       ORDER BY p.id ASC`
    );

    return res.json({
      success: true,
      settings,
      packages
    });
  } catch (err) {
    console.error('Get settings error:', err);
    return res.status(500).json({ success: false, error: 'Failed to load settings.' });
  }
});

/**
 * PUT /api/admin/settings
 * Update system settings (key/value)
 */
router.put('/', (req, res) => {
  try {
    const { settings } = req.body; // array of { key, value }

    if (!Array.isArray(settings)) {
      return res.status(400).json({ success: false, error: 'Settings must be an array of key-value pairs.' });
    }

    const now = new Date().toISOString();
    for (const item of settings) {
      if (item.key) {
        run(
          `INSERT INTO admin_settings (key, value, updated_at) 
           VALUES (?, ?, ?) 
           ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
          [item.key, String(item.value), now]
        );
      }
    }

    logAudit(req.user.id, 'UPDATE_ADMIN_SETTINGS', 'admin_settings', 'all', { count: settings.length }, req);

    return res.json({
      success: true,
      message: 'System settings updated successfully.'
    });
  } catch (err) {
    console.error('Update settings error:', err);
    return res.status(500).json({ success: false, error: 'Failed to update settings.' });
  }
});

/**
 * PUT /api/admin/settings/packages/:id
 * Update package configuration (batch count, interval, campaign window, quantity, price)
 * SECTION 8 CRITICAL: Configure packages persistently without code changes
 */
router.put('/packages/:id', (req, res) => {
  try {
    const packageId = parseInt(req.params.id, 10);
    const existing = queryOne('SELECT * FROM packages WHERE id = ?', [packageId]);
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Package not found.' });
    }

    const {
      name,
      totalQuantity,
      totalBatches,
      intervalMinutes,
      campaignWindowHours,
      price,
      serviceId,
      isActive
    } = req.body;

    run(
      `UPDATE packages 
       SET name = ?, total_quantity = ?, total_batches = ?, interval_minutes = ?,
           campaign_window_hours = ?, price = ?, service_id = ?, is_active = ?
       WHERE id = ?`,
      [
        name ? name.trim() : existing.name,
        totalQuantity !== undefined ? parseInt(totalQuantity, 10) : existing.total_quantity,
        totalBatches !== undefined ? parseInt(totalBatches, 10) : existing.total_batches,
        intervalMinutes !== undefined ? parseInt(intervalMinutes, 10) : existing.interval_minutes,
        campaignWindowHours !== undefined ? parseInt(campaignWindowHours, 10) : existing.campaign_window_hours,
        price !== undefined ? parseFloat(price) : existing.price,
        serviceId !== undefined ? (serviceId ? parseInt(serviceId, 10) : null) : existing.service_id,
        isActive !== undefined ? (isActive ? 1 : 0) : existing.is_active,
        packageId
      ]
    );

    logAudit(req.user.id, 'UPDATE_PACKAGE_CONFIG', 'packages', packageId, { name: name || existing.name }, req);

    return res.json({
      success: true,
      message: `Package "${name || existing.name}" updated successfully.`
    });
  } catch (err) {
    console.error('Update package error:', err);
    return res.status(500).json({ success: false, error: 'Failed to update package configuration.' });
  }
});

/**
 * GET /api/admin/settings/audit-logs
 * List audit logs with pagination
 */
router.get('/audit-logs', (req, res) => {
  try {
    const { page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);

    const logs = query(
      `SELECT a.*, u.username as admin_username
       FROM audit_logs a
       LEFT JOIN users u ON a.user_id = u.id
       ORDER BY a.created_at DESC LIMIT ? OFFSET ?`,
      [parseInt(limit, 10), offset]
    );

    const countRow = queryOne('SELECT COUNT(*) as total FROM audit_logs');

    return res.json({
      success: true,
      logs,
      pagination: {
        total: countRow ? countRow.total : logs.length,
        page: parseInt(page, 10),
        limit: parseInt(limit, 10)
      }
    });
  } catch (err) {
    console.error('Get audit logs error:', err);
    return res.status(500).json({ success: false, error: 'Failed to retrieve audit logs.' });
  }
});

/**
 * GET /api/admin/settings/execution-logs
 * List worker execution logs for traceability
 */
router.get('/execution-logs', (req, res) => {
  try {
    const { page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);

    const logs = query(
      `SELECT e.*, c.name as campaign_name
       FROM execution_logs e
       LEFT JOIN campaigns c ON e.campaign_id = c.id
       ORDER BY e.created_at DESC LIMIT ? OFFSET ?`,
      [parseInt(limit, 10), offset]
    );

    const countRow = queryOne('SELECT COUNT(*) as total FROM execution_logs');

    return res.json({
      success: true,
      logs,
      pagination: {
        total: countRow ? countRow.total : logs.length,
        page: parseInt(page, 10),
        limit: parseInt(limit, 10)
      }
    });
  } catch (err) {
    console.error('Get execution logs error:', err);
    return res.status(500).json({ success: false, error: 'Failed to retrieve execution logs.' });
  }
});

module.exports = router;

