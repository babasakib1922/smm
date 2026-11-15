const express = require('express');
const router = express.Router();
const { query, queryOne, run } = require('../db');
const { authenticate } = require('../middleware/auth');
const { createOrder } = require('../services/orderService');
const { logAudit } = require('../middleware/auditLog');
const { sendNotification } = require('../services/notificationService');
const { pullFromCloud, pushToCloud } = require('../services/cloudSync');
const { runStatusSync } = require('../services/automationEngine');

/**
 * POST /api/orders
 * Create a new single order
 */
router.post('/', authenticate, async (req, res) => {
  try {
    const { serviceId, targetUrl, quantity, idempotencyKey } = req.body;

    if (!serviceId || !targetUrl || !quantity) {
      return res.status(400).json({
        success: false,
        error: 'Service ID, Target URL, and Quantity are required.'
      });
    }

    const order = await createOrder({
      userId: req.user.id,
      serviceId: parseInt(serviceId, 10),
      targetUrl: targetUrl.trim(),
      quantity: parseInt(quantity, 10),
      idempotencyKey
    });

    logAudit(req.user.id, 'CREATE_ORDER', 'orders', order.id, { serviceId, quantity, charge: order.charge }, req);

    // Persist new order to cloud state immediately
    await pushToCloud();

    return res.status(201).json({
      success: true,
      message: `Order #${order.id} created successfully.`,
      order
    });
  } catch (err) {
    console.error('Create order error:', err.message);
    return res.status(400).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/orders
 * List orders with search, status filter, date range, pagination
 * Users only see their own orders; Admins can see all orders or filter by user
 */
router.get('/', authenticate, async (req, res) => {
  try {
    // 1. Sync orders across serverless instances and update live provider statuses
    try {
      await pullFromCloud();
      await runStatusSync();
    } catch (syncErr) {
      // Non-blocking
    }

    const { search, status, startDate, endDate, userId, page = 1, limit = 20 } = req.query;
    const isAdmin = req.user.role === 'ADMIN';
    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);

    let sql = `
      SELECT o.*, s.name as service_name, s.category as service_category,
             p.name as provider_name, u.username as user_name
      FROM orders o
      JOIN services s ON o.service_id = s.id
      LEFT JOIN api_providers p ON o.provider_id = p.id
      JOIN users u ON o.user_id = u.id
      WHERE 1=1
    `;
    const params = [];

    // User isolation: USER can only view own orders!
    if (!isAdmin) {
      sql += ' AND o.user_id = ?';
      params.push(req.user.id);
    } else if (userId) {
      sql += ' AND o.user_id = ?';
      params.push(parseInt(userId, 10));
    }

    if (search) {
      sql += ' AND (o.id LIKE ? OR o.target_url LIKE ? OR s.name LIKE ? OR o.provider_order_id LIKE ?)';
      const term = `%${search}%`;
      params.push(term, term, term, term);
    }

    if (status && status !== 'All') {
      sql += ' AND o.status = ?';
      params.push(status);
    }

    if (startDate) {
      sql += ' AND o.created_at >= ?';
      params.push(startDate);
    }

    if (endDate) {
      sql += ' AND o.created_at <= ?';
      params.push(endDate);
    }

    sql += ' ORDER BY o.created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit, 10), offset);

    const orders = query(sql, params);

    // Get count for pagination
    let countSql = `
      SELECT COUNT(*) as total
      FROM orders o
      JOIN services s ON o.service_id = s.id
      JOIN users u ON o.user_id = u.id
      WHERE 1=1
    `;
    const countParams = [];

    if (!isAdmin) {
      countSql += ' AND o.user_id = ?';
      countParams.push(req.user.id);
    } else if (userId) {
      countSql += ' AND o.user_id = ?';
      countParams.push(parseInt(userId, 10));
    }
    if (search) {
      countSql += ' AND (o.id LIKE ? OR o.target_url LIKE ? OR s.name LIKE ? OR o.provider_order_id LIKE ?)';
      const term = `%${search}%`;
      countParams.push(term, term, term, term);
    }
    if (status && status !== 'All') {
      countSql += ' AND o.status = ?';
      countParams.push(status);
    }
    if (startDate) {
      countSql += ' AND o.created_at >= ?';
      countParams.push(startDate);
    }
    if (endDate) {
      countSql += ' AND o.created_at <= ?';
      countParams.push(endDate);
    }

    const countRow = queryOne(countSql, countParams);

    return res.json({
      success: true,
      orders,
      pagination: {
        total: countRow ? countRow.total : orders.length,
        page: parseInt(page, 10),
        limit: parseInt(limit, 10)
      }
    });
  } catch (err) {
    console.error('List orders error:', err);
    return res.status(500).json({ success: false, error: 'Failed to retrieve orders.' });
  }
});

/**
 * POST /api/orders/sync
 * Manually trigger live status synchronization with SMM providers
 */
router.post('/sync', authenticate, async (req, res) => {
  try {
    await pullFromCloud(true);
    await runStatusSync();
    await pushToCloud();
    return res.json({ success: true, message: 'Orders synchronized with providers.' });
  } catch (err) {
    console.error('Sync orders error:', err);
    return res.status(500).json({ success: false, error: 'Failed to sync orders.' });
  }
});

/**
 * POST /api/orders/:id/cancel
 * Cancel an order anytime
 */
router.post('/:id/cancel', authenticate, async (req, res) => {
  try {
    const orderId = req.params.id;
    const isAdmin = req.user.role === 'ADMIN';

    let order = queryOne('SELECT * FROM orders WHERE id = ?', [orderId]);
    if (!order) {
      await pullFromCloud(true);
      order = queryOne('SELECT * FROM orders WHERE id = ?', [orderId]);
    }

    if (!order) {
      return res.status(404).json({ success: false, error: 'Order not found.' });
    }

    // Access check: Only owner or ADMIN can cancel
    if (!isAdmin && order.user_id !== req.user.id) {
      return res.status(403).json({ success: false, error: 'Access denied. You cannot cancel this order.' });
    }

    if (order.status === 'Canceled') {
      return res.json({
        success: true,
        message: `Order #${orderId} is already canceled.`,
        order
      });
    }

    const nowIso = new Date().toISOString();

    // Update order status to 'Canceled'
    run("UPDATE orders SET status = 'Canceled', updated_at = ? WHERE id = ?", [nowIso, orderId]);

    // If order was part of a campaign batch, update batch status as well
    run("UPDATE campaign_batches SET status = 'Cancelled' WHERE order_id = ?", [orderId]);

    logAudit(req.user.id, 'CANCEL_ORDER', 'orders', orderId, { previousStatus: order.status }, req);

    sendNotification({
      userId: order.user_id,
      title: 'Order Canceled',
      message: `Order #${orderId} was canceled successfully.`,
      type: 'INFO'
    });

    // Synchronize to cloud state
    await pushToCloud();

    const updatedOrder = queryOne('SELECT * FROM orders WHERE id = ?', [orderId]);
    return res.json({
      success: true,
      message: `Order #${orderId} has been canceled successfully.`,
      order: updatedOrder
    });
  } catch (err) {
    console.error('Cancel order error:', err);
    return res.status(500).json({ success: false, error: 'Failed to cancel order: ' + err.message });
  }
});

/**
 * DELETE /api/orders/all
 * Clear all orders (Admin clears all; standard users clear their own)
 */
const handleClearOrders = async (req, res) => {
  try {
    const isAdmin = req.user.role === 'ADMIN';

    run('PRAGMA foreign_keys = OFF');
    if (isAdmin) {
      run('UPDATE campaign_batches SET order_id = NULL');
      run('DELETE FROM orders');
    } else {
      run('UPDATE campaign_batches SET order_id = NULL WHERE campaign_id IN (SELECT id FROM campaigns WHERE user_id = ?)', [req.user.id]);
      run('DELETE FROM orders WHERE user_id = ?', [req.user.id]);
    }
    run('PRAGMA foreign_keys = ON');

    logAudit(req.user.id, 'CLEAR_ORDERS', 'orders', 'all', { role: req.user.role }, req);

    try {
      await pushToCloud();
    } catch (_) {}

    return res.json({
      success: true,
      message: 'All orders have been cleared successfully.'
    });
  } catch (err) {
    console.error('Clear orders error:', err);
    return res.status(500).json({ success: false, error: 'Failed to clear orders: ' + err.message });
  }
};

router.delete('/all', authenticate, handleClearOrders);
router.post('/clear-all', authenticate, handleClearOrders);

/**
 * GET /api/orders/:id
 * Order details
 */
router.get('/:id', authenticate, (req, res) => {
  try {
    const orderId = req.params.id;
    const isAdmin = req.user.role === 'ADMIN';

    let sql = `
      SELECT o.*, s.name as service_name, s.category as service_category, s.price_per_k,
             p.name as provider_name, u.username as user_name
      FROM orders o
      JOIN services s ON o.service_id = s.id
      LEFT JOIN api_providers p ON o.provider_id = p.id
      JOIN users u ON o.user_id = u.id
      WHERE o.id = ?
    `;
    const params = [orderId];

    if (!isAdmin) {
      sql += ' AND o.user_id = ?';
      params.push(req.user.id);
    }

    const order = queryOne(sql, params);
    if (!order) {
      return res.status(404).json({ success: false, error: 'Order not found.' });
    }

    return res.json({ success: true, order });
  } catch (err) {
    console.error('Get order error:', err);
    return res.status(500).json({ success: false, error: 'Failed to retrieve order details.' });
  }
});

module.exports = router;

