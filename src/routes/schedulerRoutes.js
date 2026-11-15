const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const uuidv4 = () => crypto.randomUUID();
const { query, queryOne, run, transaction } = require('../db');
const { authenticate } = require('../middleware/auth');
const {
  calculateBatchSchedule,
  shuffleDistribution,
  distributeQuantity
} = require('../services/schedulerEngine');
const { logAudit } = require('../middleware/auditLog');
const { sendNotification } = require('../services/notificationService');
const { pullFromCloud, pushToCloud } = require('../services/cloudSync');
const { runWorkerA, runWorkerB } = require('../services/automationEngine');

/**
 * GET /api/scheduler/packages
 * Get all available configured packages
 */
router.get('/packages', authenticate, (req, res) => {
  try {
    const packages = query(
      `SELECT p.*, s.name as service_name, s.service_id_code, s.price_per_k
       FROM packages p
       LEFT JOIN services s ON p.service_id = s.id
       WHERE p.is_active = 1
       ORDER BY p.total_quantity ASC`
    );

    return res.json({ success: true, packages });
  } catch (err) {
    console.error('List packages error:', err);
    return res.status(500).json({ success: false, error: 'Failed to retrieve packages.' });
  }
});

/**
 * POST /api/scheduler/calculate
 * Calculate full schedule preview using Section 8 exact logic & formula
 */
router.post('/calculate', authenticate, (req, res) => {
  try {
    const {
      packageId,
      startTime,
      customQuantities,
      totalQuantity,
      totalLikes,
      likesWaves,
      totalSaves,
      savesWaves,
      totalReposts,
      repostsWaves,
      totalShares,
      sharesWaves
    } = req.body;

    const pkg = queryOne('SELECT * FROM packages WHERE id = ?', [packageId]);
    if (!pkg) {
      return res.status(404).json({ success: false, error: 'Package not found.' });
    }

    const targetQty = totalQuantity !== undefined ? parseInt(totalQuantity, 10) : pkg.total_quantity;
    const finalLikes = totalLikes !== undefined ? parseInt(totalLikes, 10) : (pkg.default_likes !== undefined ? pkg.default_likes : 41);
    const finalLikesWaves = likesWaves !== undefined ? parseInt(likesWaves, 10) : (pkg.likes_waves !== undefined ? pkg.likes_waves : (finalLikes > 0 ? (finalLikes > 50 ? 4 : 3) : 0));
    const finalSaves = totalSaves !== undefined ? parseInt(totalSaves, 10) : (pkg.default_saves !== undefined ? pkg.default_saves : 0);
    const finalSavesWaves = savesWaves !== undefined ? parseInt(savesWaves, 10) : (pkg.saves_waves !== undefined ? pkg.saves_waves : (finalSaves > 0 ? (finalSaves > 30 ? 3 : 2) : 0));
    const finalReposts = totalReposts !== undefined ? parseInt(totalReposts, 10) : (pkg.default_reposts !== undefined ? pkg.default_reposts : 0);
    const finalRepostsWaves = repostsWaves !== undefined ? parseInt(repostsWaves, 10) : (pkg.reposts_waves !== undefined ? pkg.reposts_waves : (finalReposts > 0 ? (finalReposts > 25 ? 3 : 2) : 0));
    const finalShares = totalShares !== undefined ? parseInt(totalShares, 10) : (pkg.default_shares !== undefined ? pkg.default_shares : 0);
    const finalSharesWaves = sharesWaves !== undefined ? parseInt(sharesWaves, 10) : (pkg.shares_waves !== undefined ? pkg.shares_waves : (finalShares > 0 ? 2 : 0));

    const schedule = calculateBatchSchedule({
      totalQuantity: targetQty,
      totalBatches: pkg.total_batches,
      intervalMinutes: pkg.interval_minutes,
      campaignWindowHours: pkg.campaign_window_hours,
      startTimeUtc: startTime ? new Date(startTime) : new Date(),
      customQuantities,
      totalLikes: finalLikes,
      likesWaves: finalLikesWaves,
      totalSaves: finalSaves,
      savesWaves: finalSavesWaves,
      totalReposts: finalReposts,
      repostsWaves: finalRepostsWaves,
      totalShares: finalShares,
      sharesWaves: finalSharesWaves
    });

    return res.json({
      success: true,
      package: pkg,
      schedule
    });
  } catch (err) {
    console.error('Calculate schedule error:', err);
    return res.status(500).json({ success: false, error: 'Failed to calculate schedule.' });
  }
});

/**
 * POST /api/scheduler/shuffle
 * Generate alternative quantity distribution preview
 * Preserves total quantity, batch count, interval, campaign window
 */
router.post('/shuffle', authenticate, (req, res) => {
  try {
    const {
      packageId,
      startTime,
      totalQuantity,
      totalLikes,
      likesWaves,
      totalSaves,
      savesWaves,
      totalReposts,
      repostsWaves,
      totalShares,
      sharesWaves
    } = req.body;

    const pkg = queryOne('SELECT * FROM packages WHERE id = ?', [packageId]);
    if (!pkg) {
      return res.status(404).json({ success: false, error: 'Package not found.' });
    }

    const targetQty = totalQuantity !== undefined ? parseInt(totalQuantity, 10) : pkg.total_quantity;
    const finalLikes = totalLikes !== undefined ? parseInt(totalLikes, 10) : (pkg.default_likes !== undefined ? pkg.default_likes : 41);
    const finalLikesWaves = likesWaves !== undefined ? parseInt(likesWaves, 10) : (pkg.likes_waves !== undefined ? pkg.likes_waves : (finalLikes > 0 ? (finalLikes > 50 ? 4 : 3) : 0));
    const finalSaves = totalSaves !== undefined ? parseInt(totalSaves, 10) : (pkg.default_saves !== undefined ? pkg.default_saves : 0);
    const finalSavesWaves = savesWaves !== undefined ? parseInt(savesWaves, 10) : (pkg.saves_waves !== undefined ? pkg.saves_waves : (finalSaves > 0 ? (finalSaves > 30 ? 3 : 2) : 0));
    const finalReposts = totalReposts !== undefined ? parseInt(totalReposts, 10) : (pkg.default_reposts !== undefined ? pkg.default_reposts : 0);
    const finalRepostsWaves = repostsWaves !== undefined ? parseInt(repostsWaves, 10) : (pkg.reposts_waves !== undefined ? pkg.reposts_waves : (finalReposts > 0 ? (finalReposts > 25 ? 3 : 2) : 0));
    const finalShares = totalShares !== undefined ? parseInt(totalShares, 10) : (pkg.default_shares !== undefined ? pkg.default_shares : 0);
    const finalSharesWaves = sharesWaves !== undefined ? parseInt(sharesWaves, 10) : (pkg.shares_waves !== undefined ? pkg.shares_waves : (finalShares > 0 ? 2 : 0));

    const shuffledQuantities = shuffleDistribution(targetQty, pkg.total_batches);

    const schedule = calculateBatchSchedule({
      totalQuantity: targetQty,
      totalBatches: pkg.total_batches,
      intervalMinutes: pkg.interval_minutes,
      campaignWindowHours: pkg.campaign_window_hours,
      startTimeUtc: startTime ? new Date(startTime) : new Date(),
      customQuantities: shuffledQuantities,
      totalLikes: finalLikes,
      likesWaves: finalLikesWaves,
      totalSaves: finalSaves,
      savesWaves: finalSavesWaves,
      totalReposts: finalReposts,
      repostsWaves: finalRepostsWaves,
      totalShares: finalShares,
      sharesWaves: finalSharesWaves,
      isShuffle: true
    });

    return res.json({
      success: true,
      package: pkg,
      schedule,
      isShuffled: true
    });
  } catch (err) {
    console.error('Shuffle schedule error:', err);
    return res.status(500).json({ success: false, error: 'Failed to shuffle schedule.' });
  }
});

/**
 * POST /api/scheduler/campaigns
 * Save and schedule a new campaign with its planned batches
 */
router.post('/campaigns', authenticate, async (req, res) => {
  try {
    try {
      await pullFromCloud(true);
    } catch (_) {}

    const {
      name,
      packageId,
      serviceId,
      targetUrl,
      startTime,
      customQuantities = null,
      totalLikes = 41,
      likesWaves = 3,
      totalSaves = 0,
      savesWaves = 0,
      totalReposts = 0,
      repostsWaves = 0,
      totalShares = 0,
      sharesWaves = 0
    } = req.body;

    if (!name || !packageId || !targetUrl) {
      return res.status(400).json({ success: false, error: 'Campaign name, package, and target URL are required.' });
    }

    const pkg = queryOne('SELECT * FROM packages WHERE id = ?', [packageId]);
    if (!pkg) {
      return res.status(404).json({ success: false, error: 'Package not found.' });
    }

    const actualServiceId = serviceId || pkg.service_id;
    const service = queryOne('SELECT * FROM services WHERE id = ?', [actualServiceId]);
    if (!service) {
      return res.status(404).json({ success: false, error: 'Associated service not found.' });
    }

    const startDate = startTime ? new Date(startTime) : new Date();
    const parsedLikes = totalLikes !== undefined ? parseInt(totalLikes, 10) : 41;
    const parsedWaves = likesWaves !== undefined ? parseInt(likesWaves, 10) : (parsedLikes > 50 ? 4 : (parsedLikes > 0 ? 3 : 0));
    const parsedSaves = parseInt(totalSaves, 10) || 0;
    const parsedSavesWaves = parseInt(savesWaves, 10) || (parsedSaves > 0 ? 2 : 0);
    const parsedReposts = parseInt(totalReposts, 10) || 0;
    const parsedRepostsWaves = parseInt(repostsWaves, 10) || (parsedReposts > 0 ? 2 : 0);
    const parsedShares = parseInt(totalShares, 10) || 0;
    const parsedSharesWaves = parseInt(sharesWaves, 10) || (parsedShares > 0 ? 2 : 0);

    const schedule = calculateBatchSchedule({
      totalQuantity: pkg.total_quantity,
      totalBatches: pkg.total_batches,
      intervalMinutes: pkg.interval_minutes,
      campaignWindowHours: pkg.campaign_window_hours,
      startTimeUtc: startDate,
      customQuantities,
      totalLikes: parsedLikes,
      likesWaves: parsedWaves,
      totalSaves: parsedSaves,
      savesWaves: parsedSavesWaves,
      totalReposts: parsedReposts,
      repostsWaves: parsedRepostsWaves,
      totalShares: parsedShares,
      sharesWaves: parsedSharesWaves
    });

    const campaignId = `CMP-${Date.now().toString(36).toUpperCase()}-${Math.floor(100 + Math.random() * 900)}`;
    const shareToken = uuidv4().replace(/-/g, '');
    const nowIso = new Date().toISOString();
    const totalCost = pkg.price || parseFloat(((pkg.total_quantity / 1000) * service.price_per_k).toFixed(2));

    // Save campaign and all batches in transaction
    transaction((tx) => {
      tx.run(
        `INSERT INTO campaigns 
         (id, user_id, package_id, service_id, name, target_url, total_quantity, total_batches, interval_minutes, campaign_window_hours, total_likes, likes_waves, total_saves, saves_waves, total_reposts, reposts_waves, total_shares, shares_waves, start_time, estimated_end_time, status, total_cost, share_token, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Scheduled', ?, ?, ?, ?)`,
        [
          campaignId,
          req.user.id,
          pkg.id,
          service.id,
          name.trim(),
          targetUrl.trim(),
          pkg.total_quantity,
          pkg.total_batches,
          pkg.interval_minutes,
          pkg.campaign_window_hours,
          parsedLikes,
          parsedWaves,
          parsedSaves,
          parsedSavesWaves,
          parsedReposts,
          parsedRepostsWaves,
          parsedShares,
          parsedSharesWaves,
          startDate.toISOString(),
          schedule.estimatedEndTime,
          totalCost,
          shareToken,
          nowIso,
          nowIso
        ]
      );

      // Insert each batch individually
      schedule.batches.forEach((b) => {
        const batchId = `BT-${campaignId}-${String(b.batchNumber).padStart(3, '0')}`;
        tx.run(
          `INSERT INTO campaign_batches 
           (id, campaign_id, batch_number, planned_quantity, likes_quantity, saves_quantity, reposts_quantity, shares_quantity, relative_time_minutes, scheduled_at, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Scheduled')`,
          [
            batchId,
            campaignId,
            b.batchNumber,
            b.plannedQuantity,
            b.likesQuantity || 0,
            b.savesQuantity || 0,
            b.repostsQuantity || 0,
            b.sharesQuantity || 0,
            b.relativeTimeMinutes,
            b.scheduledAt
          ]
        );
      });
    });

    logAudit(req.user.id, 'CREATE_CAMPAIGN', 'campaigns', campaignId, { name, totalQuantity: pkg.total_quantity, batches: pkg.total_batches }, req);

    sendNotification({
      userId: req.user.id,
      title: 'Campaign Scheduled',
      message: `Campaign "${name}" (${pkg.total_batches} batches) scheduled to start at ${new Date(startDate).toLocaleString()}.`,
      type: 'INFO'
    });

    // Persist campaign & batches to cloud immediately
    await pushToCloud();

    // Trigger immediate execution of due batches (Batch #1 is scheduled for immediate start)
    try {
      await runWorkerA();
      await runWorkerB();
      await pushToCloud();
    } catch (workerErr) {
      console.warn('Initial worker dispatch notice:', workerErr.message);
    }

    return res.status(201).json({
      success: true,
      message: `Campaign "${name}" scheduled successfully.`,
      campaignId,
      shareToken,
      schedule
    });

  } catch (err) {
    console.error('Create campaign error:', err);
    return res.status(500).json({ success: false, error: 'Failed to create campaign.' });
  }
});

/**
 * GET /api/scheduler/campaigns
 * List user or all campaigns
 */
router.get('/campaigns', authenticate, async (req, res) => {
  try {
    try {
      await pullFromCloud();
      await runWorkerA();
      await runWorkerB();
    } catch (e) {}

    const isAdmin = req.user.role === 'ADMIN';
    let sql = `
      SELECT c.*, p.name as package_name, s.name as service_name, u.username as user_name,
             (SELECT COUNT(*) FROM campaign_batches WHERE campaign_id = c.id AND status = 'Delivered') as delivered_batches,
             (SELECT COUNT(*) FROM campaign_batches WHERE campaign_id = c.id AND status = 'Scheduled') as remaining_batches
      FROM campaigns c
      LEFT JOIN packages p ON c.package_id = p.id
      LEFT JOIN services s ON c.service_id = s.id
      JOIN users u ON c.user_id = u.id
      WHERE 1=1
    `;
    const params = [];

    if (!isAdmin) {
      sql += ' AND c.user_id = ?';
      params.push(req.user.id);
    }

    sql += ' ORDER BY c.created_at DESC';

    const campaigns = query(sql, params);
    return res.json({ success: true, campaigns });
  } catch (err) {
    console.error('List campaigns error:', err);
    return res.status(500).json({ success: false, error: 'Failed to retrieve campaigns.' });
  }
});

/**
 * GET /api/scheduler/campaigns/:id
 * Get campaign details with full batch list and execution status
 */
router.get('/campaigns/:id', authenticate, async (req, res) => {
  try {
    const campaignId = req.params.id;
    const isAdmin = req.user.role === 'ADMIN';

    // Synchronize cloud state and process any due batches
    try {
      await pullFromCloud();
      await runWorkerA();
      await runWorkerB();
      await pushToCloud();
    } catch (e) {}

    let sql = `
      SELECT c.*, p.name as package_name, s.name as service_name, u.username as user_name
      FROM campaigns c
      LEFT JOIN packages p ON c.package_id = p.id
      LEFT JOIN services s ON c.service_id = s.id
      JOIN users u ON c.user_id = u.id
      WHERE c.id = ?
    `;
    const params = [campaignId];

    if (!isAdmin) {
      sql += ' AND c.user_id = ?';
      params.push(req.user.id);
    }

    let campaign = queryOne(sql, params);
    if (!campaign) {
      await pullFromCloud(true);
      campaign = queryOne(sql, params);
    }

    if (!campaign) {
      return res.status(404).json({ success: false, error: 'Campaign not found.' });
    }

    // Fetch batches
    const batches = query(
      'SELECT * FROM campaign_batches WHERE campaign_id = ? ORDER BY batch_number ASC',
      [campaignId]
    );

    // Find next scheduled batch
    const nextBatch = queryOne(
      `SELECT * FROM campaign_batches 
       WHERE campaign_id = ? AND status = 'Scheduled' 
       ORDER BY scheduled_at ASC LIMIT 1`,
      [campaignId]
    );

    return res.json({
      success: true,
      campaign,
      batches,
      nextBatch
    });
  } catch (err) {
    console.error('Get campaign error:', err);
    return res.status(500).json({ success: false, error: 'Failed to retrieve campaign details.' });
  }
});

/**
 * POST /api/scheduler/campaigns/:id/dispatch
 * Manually trigger dispatch of any due batches for this campaign
 */
router.post('/campaigns/:id/dispatch', authenticate, async (req, res) => {
  try {
    const campaignId = req.params.id;
    await pullFromCloud(true);

    const nowIso = new Date().toISOString();
    // If campaign is Scheduled, activate to Running so Worker B processes due batches
    run("UPDATE campaigns SET status = 'Running', updated_at = ? WHERE id = ? AND status = 'Scheduled'", [nowIso, campaignId]);
    // Reset any failed batches to Scheduled with retry_count = 0 so they can be re-dispatched
    run("UPDATE campaign_batches SET status = 'Scheduled', retry_count = 0, last_error = NULL WHERE campaign_id = ? AND status = 'Failed'", [campaignId]);

    await runWorkerA();
    await runWorkerB();
    await pushToCloud();

    const batches = query(
      'SELECT * FROM campaign_batches WHERE campaign_id = ? ORDER BY batch_number ASC',
      [campaignId]
    );

    return res.json({
      success: true,
      message: 'Batch dispatch cycle completed.',
      batches
    });
  } catch (err) {
    console.error('Dispatch error:', err);
    return res.status(500).json({ success: false, error: 'Failed to dispatch: ' + err.message });
  }
});

/**
 * GET /api/scheduler/share/:token
 * Read-only share link for campaign schedule
 */
router.get('/share/:token', async (req, res) => {
  try {
    const token = req.params.token;
    let campaign = queryOne(
      `SELECT c.id, c.name, c.total_quantity, c.total_batches, c.interval_minutes,
              c.campaign_window_hours, c.start_time, c.estimated_end_time, c.status,
              COALESCE(p.name, c.name) as package_name, COALESCE(s.name, 'SMM Service') as service_name
       FROM campaigns c
       LEFT JOIN packages p ON c.package_id = p.id
       LEFT JOIN services s ON c.service_id = s.id
       WHERE c.share_token = ?`,
      [token]
    );

    if (!campaign) {
      await pullFromCloud(true);
      campaign = queryOne(
        `SELECT c.id, c.name, c.total_quantity, c.total_batches, c.interval_minutes,
                c.campaign_window_hours, c.start_time, c.estimated_end_time, c.status,
                COALESCE(p.name, c.name) as package_name, COALESCE(s.name, 'SMM Service') as service_name
         FROM campaigns c
         LEFT JOIN packages p ON c.package_id = p.id
         LEFT JOIN services s ON c.service_id = s.id
         WHERE c.share_token = ?`,
        [token]
      );
    }

    if (!campaign) {
      return res.status(404).json({ success: false, error: 'Schedule not found or share link is invalid.' });
    }

    const batches = query(
      `SELECT batch_number, planned_quantity, relative_time_minutes, scheduled_at, status
       FROM campaign_batches WHERE campaign_id = ? ORDER BY batch_number ASC`,
      [campaign.id]
    );

    return res.json({
      success: true,
      campaign,
      batches
    });
  } catch (err) {
    console.error('Share schedule error:', err);
    return res.status(500).json({ success: false, error: 'Failed to retrieve shared schedule.' });
  }
});

/**
 * POST /api/scheduler/campaigns/:id/status
 * Pause, resume, or cancel campaign
 */
router.post('/campaigns/:id/status', authenticate, async (req, res) => {
  try {
    const campaignId = req.params.id;
    const { status } = req.body;
    const isAdmin = req.user.role === 'ADMIN';

    if (!['Paused', 'Running', 'Cancelled'].includes(status)) {
      return res.status(400).json({ success: false, error: 'Invalid campaign status.' });
    }

    let sql = 'SELECT * FROM campaigns WHERE id = ?';
    const params = [campaignId];
    if (!isAdmin) {
      sql += ' AND user_id = ?';
      params.push(req.user.id);
    }

    let campaign = queryOne(sql, params);
    if (!campaign) {
      await pullFromCloud(true);
      campaign = queryOne(sql, params);
    }

    if (!campaign) {
      return res.status(404).json({ success: false, error: 'Campaign not found.' });
    }

    const nowIso = new Date().toISOString();
    run('UPDATE campaigns SET status = ?, updated_at = ? WHERE id = ?', [status, nowIso, campaignId]);

    if (status === 'Cancelled') {
      run("UPDATE campaign_batches SET status = 'Cancelled' WHERE campaign_id = ? AND status = 'Scheduled'", [campaignId]);
    }

    logAudit(req.user.id, 'CHANGE_CAMPAIGN_STATUS', 'campaigns', campaignId, { oldStatus: campaign.status, newStatus: status }, req);

    sendNotification({
      userId: campaign.user_id,
      title: `Campaign ${status}`,
      message: `Campaign "${campaign.name}" status changed to ${status}.`,
      type: status === 'Cancelled' ? 'WARNING' : 'INFO'
    });

    await pushToCloud();

    return res.json({
      success: true,
      message: `Campaign status updated to ${status}.`
    });
  } catch (err) {
    console.error('Update campaign status error:', err);
    return res.status(500).json({ success: false, error: 'Failed to update campaign status.' });
  }
});

module.exports = router;

