const express = require('express');
const router = express.Router();
const { query, queryOne } = require('../db');
const { authenticate } = require('../middleware/auth');
const { getDripQueueStats } = require('../services/automationEngine');

/**
 * GET /api/analytics
 * Returns tailored analytics data for USER or ADMIN based on real database records
 */
router.get('/', authenticate, (req, res) => {
  try {
    const isAdmin = req.user.role === 'ADMIN';

    if (isAdmin) {
      // 1. ADMIN Metrics
      const totalUsersRow = queryOne('SELECT COUNT(*) as count FROM users');
      const activeUsersRow = queryOne("SELECT COUNT(*) as count FROM users WHERE status = 'ACTIVE'");
      const disabledUsersRow = queryOne("SELECT COUNT(*) as count FROM users WHERE status = 'DISABLED'");
      const totalUserBalancesRow = queryOne("SELECT SUM(balance) as total FROM users WHERE status != 'DELETED'");

      const totalOrdersRow = queryOne('SELECT COUNT(*) as count, SUM(charge) as totalSpent FROM orders');
      const activeOrdersRow = queryOne("SELECT COUNT(*) as count FROM orders WHERE status IN ('Pending', 'Processing', 'In progress')");
      const completedOrdersRow = queryOne("SELECT COUNT(*) as count FROM orders WHERE status = 'Completed'");
      const failedOrdersRow = queryOne("SELECT COUNT(*) as count FROM orders WHERE status = 'Failed'");

      const activeCampaignsRow = queryOne("SELECT COUNT(*) as count FROM campaigns WHERE status IN ('Scheduled', 'Running')");
      const completedCampaignsRow = queryOne("SELECT COUNT(*) as count FROM campaigns WHERE status = 'Completed'");

      // Provider statuses
      const providers = query(
        `SELECT p.id, p.name, p.slug, p.api_url, p.is_active,
                (SELECT COUNT(*) FROM user_api_credentials WHERE provider_id = p.id AND connection_status = 'CONNECTED') as active_connections,
                (SELECT COUNT(*) FROM user_api_credentials WHERE provider_id = p.id AND connection_status = 'ERROR') as error_connections
         FROM api_providers p`
      );

      // Recent admin activity (Audit Logs)
      const recentAudit = query(
        `SELECT a.*, u.username as admin_username
         FROM audit_logs a
         LEFT JOIN users u ON a.user_id = u.id
         ORDER BY a.created_at DESC LIMIT 10`
      );

      // Orders by day (last 7 days)
      const ordersByDay = query(
        `SELECT substr(created_at, 1, 10) as day, COUNT(*) as count, SUM(charge) as volume
         FROM orders
         GROUP BY substr(created_at, 1, 10)
         ORDER BY day DESC LIMIT 7`
      );

      return res.json({
        success: true,
        isAdmin: true,
        dripQueue: getDripQueueStats(),
        metrics: {
          totalUsers: totalUsersRow ? totalUsersRow.count : 0,
          activeUsers: activeUsersRow ? activeUsersRow.count : 0,
          disabledUsers: disabledUsersRow ? disabledUsersRow.count : 0,
          totalUserBalances: totalUserBalancesRow && totalUserBalancesRow.total ? parseFloat(totalUserBalancesRow.total.toFixed(2)) : 0.00,
          totalOrders: totalOrdersRow ? totalOrdersRow.count : 0,
          totalVolume: totalOrdersRow && totalOrdersRow.totalSpent ? parseFloat(totalOrdersRow.totalSpent.toFixed(2)) : 0.00,
          activeOrders: activeOrdersRow ? activeOrdersRow.count : 0,
          completedOrders: completedOrdersRow ? completedOrdersRow.count : 0,
          failedOrders: failedOrdersRow ? failedOrdersRow.count : 0,
          activeCampaigns: activeCampaignsRow ? activeCampaignsRow.count : 0,
          completedCampaigns: completedCampaignsRow ? completedCampaignsRow.count : 0
        },
        providers,
        recentAudit,
        ordersByDay
      });

    } else {
      // 2. USER Metrics
      const userId = req.user.id;

      const userOrdersRow = queryOne('SELECT COUNT(*) as count, SUM(charge) as totalSpent FROM orders WHERE user_id = ?', [userId]);
      const activeOrdersRow = queryOne("SELECT COUNT(*) as count FROM orders WHERE user_id = ? AND status IN ('Pending', 'Processing', 'In progress')", [userId]);
      const completedOrdersRow = queryOne("SELECT COUNT(*) as count FROM orders WHERE user_id = ? AND status = 'Completed'", [userId]);
      const failedOrdersRow = queryOne("SELECT COUNT(*) as count FROM orders WHERE user_id = ? AND status = 'Failed'", [userId]);

      const userCampaignsRow = queryOne('SELECT COUNT(*) as count FROM campaigns WHERE user_id = ?', [userId]);
      const scheduledBatchesRow = queryOne(
        `SELECT COUNT(*) as count FROM campaign_batches b 
         JOIN campaigns c ON b.campaign_id = c.id 
         WHERE c.user_id = ? AND b.status = 'Scheduled'`,
        [userId]
      );

      // Recent transactions
      const recentTransactions = query(
        'SELECT * FROM transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT 5',
        [userId]
      );

      // Recent orders
      const recentOrders = query(
        `SELECT o.*, s.name as service_name 
         FROM orders o 
         JOIN services s ON o.service_id = s.id 
         WHERE o.user_id = ? 
         ORDER BY o.created_at DESC LIMIT 5`,
        [userId]
      );

      // Activity by day (last 7 days)
      const userActivityByDay = query(
        `SELECT substr(created_at, 1, 10) as day, COUNT(*) as count, SUM(charge) as spent
         FROM orders
         WHERE user_id = ?
         GROUP BY substr(created_at, 1, 10)
         ORDER BY day DESC LIMIT 7`,
        [userId]
      );

      return res.json({
        success: true,
        isAdmin: false,
        dripQueue: getDripQueueStats(),
        metrics: {
          balance: req.user.balance,
          totalOrders: userOrdersRow ? userOrdersRow.count : 0,
          totalSpent: userOrdersRow && userOrdersRow.totalSpent ? parseFloat(userOrdersRow.totalSpent.toFixed(2)) : 0.00,
          activeOrders: activeOrdersRow ? activeOrdersRow.count : 0,
          completedOrders: completedOrdersRow ? completedOrdersRow.count : 0,
          failedOrders: failedOrdersRow ? failedOrdersRow.count : 0,
          totalCampaigns: userCampaignsRow ? userCampaignsRow.count : 0,
          scheduledBatches: scheduledBatchesRow ? scheduledBatchesRow.count : 0
        },
        recentTransactions,
        recentOrders,
        userActivityByDay
      });
    }

  } catch (err) {
    console.error('Analytics error:', err);
    return res.status(500).json({ success: false, error: 'Failed to load analytics.' });
  }
});

module.exports = router;

