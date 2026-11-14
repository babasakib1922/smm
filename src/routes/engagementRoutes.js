const express = require('express');
const router = express.Router();
const { query, queryOne } = require('../db');
const { authenticate } = require('../middleware/auth');

/**
 * GET /api/engagement/status
 * Get user's provider connection status for configured Likes and Views providers
 */
router.get('/status', authenticate, (req, res) => {
  try {
    // Fetch configured provider mappings from settings
    const viewsProviderSetting = queryOne("SELECT value FROM admin_settings WHERE key = 'engagement_views_provider'") || { value: 'xmedia' };
    const viewsServiceSetting = queryOne("SELECT value FROM admin_settings WHERE key = 'engagement_views_service_id'") || { value: '10322' };
    const likesProviderSetting = queryOne("SELECT value FROM admin_settings WHERE key = 'engagement_likes_provider'") || { value: 'zeofame' };
    const likesServiceSetting = queryOne("SELECT value FROM admin_settings WHERE key = 'engagement_likes_service_id'") || { value: '1123' };

    // Get provider details
    const viewsProvider = queryOne('SELECT id, name, slug, api_url FROM api_providers WHERE slug = ?', [viewsProviderSetting.value]);
    const likesProvider = queryOne('SELECT id, name, slug, api_url FROM api_providers WHERE slug = ?', [likesProviderSetting.value]);

    // Check user credentials for these providers
    const viewsCred = viewsProvider ? queryOne(
      'SELECT id, masked_key, connection_status, last_checked_at, reported_balance, last_error FROM user_api_credentials WHERE user_id = ? AND provider_id = ?',
      [req.user.id, viewsProvider.id]
    ) : null;

    const likesCred = likesProvider ? queryOne(
      'SELECT id, masked_key, connection_status, last_checked_at, reported_balance, last_error FROM user_api_credentials WHERE user_id = ? AND provider_id = ?',
      [req.user.id, likesProvider.id]
    ) : null;

    // Fetch corresponding services
    const viewsService = viewsProvider ? queryOne(
      'SELECT id, name, category, price_per_k, min_quantity, max_quantity, provider_service_id FROM services WHERE provider_id = ? AND provider_service_id = ? AND is_active = 1',
      [viewsProvider.id, viewsServiceSetting.value]
    ) : null;

    const likesService = likesProvider ? queryOne(
      'SELECT id, name, category, price_per_k, min_quantity, max_quantity, provider_service_id FROM services WHERE provider_id = ? AND provider_service_id = ? AND is_active = 1',
      [likesProvider.id, likesServiceSetting.value]
    ) : null;

    // Fetch all active views and likes services available to user
    const viewsServices = query(
      `SELECT s.id, s.name, s.category, s.provider_service_id, s.min_quantity, s.max_quantity, p.name as provider_name
       FROM services s
       JOIN api_providers p ON s.provider_id = p.id
       WHERE s.is_active = 1 AND (LOWER(s.category) LIKE '%view%' OR LOWER(s.name) LIKE '%view%')
       ORDER BY s.id ASC`
    );

    const likesServices = query(
      `SELECT s.id, s.name, s.category, s.provider_service_id, s.min_quantity, s.max_quantity, p.name as provider_name
       FROM services s
       JOIN api_providers p ON s.provider_id = p.id
       WHERE s.is_active = 1 AND (LOWER(s.category) LIKE '%like%' OR LOWER(s.name) LIKE '%like%')
       ORDER BY s.id ASC`
    );

    const allServices = query(
      `SELECT s.id, s.name, s.category, s.provider_service_id, s.min_quantity, s.max_quantity, p.name as provider_name
       FROM services s
       JOIN api_providers p ON s.provider_id = p.id
       WHERE s.is_active = 1
       ORDER BY s.category ASC, s.name ASC`
    );

    // Fetch recent engagement orders
    const recentOrders = query(
      `SELECT o.id, o.target_url, o.quantity, o.status, o.provider_order_id, o.created_at,
              s.name as service_name, s.category as service_category, p.name as provider_name
       FROM orders o
       JOIN services s ON o.service_id = s.id
       LEFT JOIN api_providers p ON o.provider_id = p.id
       WHERE o.user_id = ?
       ORDER BY o.created_at DESC LIMIT 10`,
      [req.user.id]
    );

    // Order statistics for metrics
    const orderStats = query(
      `SELECT status, COUNT(*) as count, SUM(quantity) as total_quantity
       FROM orders
       WHERE user_id = ?
       GROUP BY status`,
      [req.user.id]
    );

    // Check active campaign activity for this user
    const recentCampaigns = query(
      `SELECT c.id, c.name, c.target_url, c.total_quantity, c.total_batches, c.status, c.created_at,
              (SELECT COUNT(*) FROM campaign_batches WHERE campaign_id = c.id AND status = 'Delivered') as delivered_batches
       FROM campaigns c
       WHERE c.user_id = ?
       ORDER BY c.created_at DESC LIMIT 5`,
      [req.user.id]
    );

    // Calculate real batch delivery statistics for graphs
    const batchStats = query(
      `SELECT b.status, COUNT(*) as count, SUM(b.planned_quantity) as total_quantity
       FROM campaign_batches b
       JOIN campaigns c ON b.campaign_id = c.id
       WHERE c.user_id = ?
       GROUP BY b.status`,
      [req.user.id]
    );

    return res.json({
      success: true,
      userBalance: req.user.balance,
      views: {
        providerName: viewsProvider ? viewsProvider.name : viewsProviderSetting.value,
        providerSlug: viewsProviderSetting.value,
        serviceId: viewsServiceSetting.value,
        serviceDetails: viewsService,
        isConnected: viewsCred ? viewsCred.connection_status === 'CONNECTED' : false,
        credentials: viewsCred
      },
      likes: {
        providerName: likesProvider ? likesProvider.name : likesProviderSetting.value,
        providerSlug: likesProviderSetting.value,
        serviceId: likesServiceSetting.value,
        serviceDetails: likesService,
        isConnected: likesCred ? likesCred.connection_status === 'CONNECTED' : false,
        credentials: likesCred
      },
      viewsServices,
      likesServices,
      allServices,
      recentOrders,
      orderStats,
      recentCampaigns,
      batchStats
    });

  } catch (err) {
    console.error('Engagement status error:', err);
    return res.status(500).json({ success: false, error: 'Failed to retrieve engagement status.' });
  }
});

module.exports = router;

