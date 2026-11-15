const crypto = require('crypto');
const uuidv4 = () => crypto.randomUUID();
const { query, queryOne, run, transaction } = require('../db');
const { createOrder } = require('./orderService');
const { sendNotification, notifyAdmins } = require('./notificationService');
const { getProviderAdapter } = require('./apiAdapter');
const { decryptText } = require('../config/security');

let isWorkerARunning = false;
let isWorkerBRunning = false;
let isSyncRunning = false;
let workerIntervalId = null;
let syncIntervalId = null;

let dripQueueStats = {
  intervalSeconds: 60,
  intervalText: '1 minute',
  dailyChecksExpected: 1440,
  totalChecks: 0,
  lastCheckAt: null
};

function getDripQueueStats() {
  return { ...dripQueueStats };
}

/**
 * Worker A: Scheduled Campaign Worker
 * Responsible for finding due campaigns, checking eligibility, and updating campaign status
 */
async function runWorkerA() {
  if (isWorkerARunning) return;
  isWorkerARunning = true;

  try {
    const nowIso = new Date().toISOString();
    const workerInstanceId = `worker-A-${process.pid}`;

    // 1. Find scheduled campaigns whose start time has arrived
    const dueCampaigns = query(
      `SELECT * FROM campaigns 
       WHERE status = 'Scheduled' 
       AND start_time <= ? 
       ORDER BY start_time ASC LIMIT 10`,
      [nowIso]
    );

    for (const campaign of dueCampaigns) {
      // Validate user status
      const user = queryOne('SELECT status, balance FROM users WHERE id = ?', [campaign.user_id]);
      if (!user || user.status !== 'ACTIVE') {
        console.warn(`[Worker A] Campaign ${campaign.id} cancelled: User not active.`);
        run("UPDATE campaigns SET status = 'Cancelled', updated_at = ? WHERE id = ?", [nowIso, campaign.id]);
        run("UPDATE campaign_batches SET status = 'Cancelled' WHERE campaign_id = ? AND status = 'Scheduled'", [campaign.id]);
        continue;
      }

      // Atomic transition from 'Scheduled' to 'Running'
      const updateRes = run(
        `UPDATE campaigns 
         SET status = 'Running', locked_at = ?, locked_by = ?, updated_at = ? 
         WHERE id = ? AND status = 'Scheduled'`,
        [nowIso, workerInstanceId, nowIso, campaign.id]
      );

      if (updateRes.changes > 0) {
        console.log(`[Worker A] Campaign ${campaign.id} started. Status changed to Running.`);
        sendNotification({
          userId: campaign.user_id,
          title: 'Campaign Started',
          message: `Campaign "${campaign.name}" has officially started. Batches are now executing on schedule.`,
          type: 'INFO'
        });
      }
    }

    // 2. Check running campaigns for completion
    const runningCampaigns = query("SELECT id, user_id, name FROM campaigns WHERE status = 'Running'");
    for (const camp of runningCampaigns) {
      const remainingBatches = queryOne(
        `SELECT COUNT(*) as count FROM campaign_batches 
         WHERE campaign_id = ? AND status IN ('Scheduled', 'Processing')`,
        [camp.id]
      );

      if (remainingBatches && remainingBatches.count === 0) {
        // All batches processed! Mark completed
        run("UPDATE campaigns SET status = 'Completed', updated_at = ? WHERE id = ?", [nowIso, camp.id]);
        console.log(`[Worker A] Campaign ${camp.id} completed.`);
        sendNotification({
          userId: camp.user_id,
          title: 'Campaign Completed',
          message: `Campaign "${camp.name}" has finished all batches successfully.`,
          type: 'SUCCESS'
        });
      }
    }

  } catch (err) {
    console.error('[Worker A Error]', err.message);
  } finally {
    isWorkerARunning = false;
  }
}

async function dispatchAuxiliaryMetric({ userId, serviceType, targetUrl, quantity, idempotencyKey, campaignBatchId }) {
  try {
    const existing = queryOne('SELECT * FROM orders WHERE idempotency_key = ?', [idempotencyKey]);
    if (existing) {
      console.log(`[Worker B Auxiliary] Metric ${serviceType} already dispatched with key ${idempotencyKey}: order ${existing.id}`);
      return existing;
    }

    const mapping = queryOne(
      "SELECT * FROM user_service_mappings WHERE user_id = ? AND service_type = ? AND is_enabled = 1",
      [userId, serviceType]
    );
    if (!mapping || !mapping.provider_id || !mapping.provider_service_id) {
      console.warn(`[Worker B Auxiliary] No enabled mapping for ${serviceType} (user ${userId})`);
      return null;
    }

    const userCred = queryOne(
      'SELECT * FROM user_api_credentials WHERE user_id = ? AND provider_id = ? AND connection_status = "CONNECTED"',
      [userId, mapping.provider_id]
    );
    if (!userCred || !userCred.encrypted_api_key) {
      console.warn(`[Worker B Auxiliary] No connected credentials for provider ${mapping.provider_id}`);
      return null;
    }

    const provider = queryOne('SELECT * FROM api_providers WHERE id = ? AND is_active = 1', [mapping.provider_id]);
    if (!provider) {
      console.warn(`[Worker B Auxiliary] Provider ${mapping.provider_id} not found or inactive`);
      return null;
    }

    const apiKey = decryptText(userCred.encrypted_api_key, userCred.iv, userCred.auth_tag);
    if (!apiKey) return null;

    const adapter = getProviderAdapter(provider, apiKey);
    const orderId = `ORD-${Date.now().toString(36).toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`;

    const result = await adapter.createOrder({
      serviceId: mapping.provider_service_id,
      link: targetUrl,
      quantity
    }, orderId);

    const now = new Date().toISOString();
    const isSuccess = !!result.providerOrderId;
    const providerOrderId = result.providerOrderId || null;
    const providerResponse = result.raw ? JSON.stringify(result.raw) : '';
    const charge = parseFloat(((quantity / 1000) * (mapping.rate_per_k || 0.85)).toFixed(4));

    // Find service ID by category
    const srv = queryOne("SELECT id FROM services WHERE LOWER(category) LIKE ? LIMIT 1", [`%${serviceType.slice(0, 4)}%`]);
    const serviceId = srv ? srv.id : 2;

    run(
      `INSERT INTO orders (id, user_id, service_id, target_url, quantity, charge, status, provider_id, provider_order_id, provider_response, idempotency_key, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        orderId, userId, serviceId, targetUrl, quantity, charge,
        isSuccess ? 'In progress' : 'Failed',
        provider.id, providerOrderId,
        providerResponse,
        idempotencyKey, now, now
      ]
    );

    if (campaignBatchId && serviceType === 'likes' && providerOrderId) {
      run(
        `UPDATE campaign_batches SET likes_provider_order_id = ? WHERE id = ?`,
        [providerOrderId, campaignBatchId]
      );
    }

    console.log(`[Worker B Auxiliary] Dispatched ${quantity} ${serviceType} for batch ${campaignBatchId} to ${provider.name} -> Order #${providerOrderId}`);
    return result;
  } catch (err) {
    console.warn(`[Worker B Auxiliary ${serviceType}] Error:`, err.message);
    return null;
  }
}

/**
 * Worker B: Batch Processing Worker
 * Processes due batches one by one with strict duplicate execution protection,
 * unique execution IDs, and idempotency guarantees.
 */
async function runWorkerB() {
  if (isWorkerBRunning) return;
  isWorkerBRunning = true;

  try {
    const nowIso = new Date().toISOString();
    const workerInstanceId = `worker-B-${process.pid}`;

    // Get max retries from settings
    const maxRetriesSetting = queryOne("SELECT value FROM admin_settings WHERE key = 'max_batch_retries'");
    const maxRetries = maxRetriesSetting ? parseInt(maxRetriesSetting.value, 10) : 3;

    // Find due batches belonging to 'Running' campaigns
    const dueBatches = query(
      `SELECT b.*, c.user_id, c.service_id, c.target_url, c.name as campaign_name
       FROM campaign_batches b
       JOIN campaigns c ON b.campaign_id = c.id
       WHERE b.status = 'Scheduled'
       AND c.status = 'Running'
       AND b.scheduled_at <= ?
       AND b.retry_count <= ?
       ORDER BY b.scheduled_at ASC LIMIT 10`,
      [nowIso, maxRetries]
    );

    for (const batch of dueBatches) {
      if (batch.provider_order_id) {
        console.warn(`[Worker B] Batch ${batch.id} already has provider order #${batch.provider_order_id}. Marking Delivered.`);
        run(`UPDATE campaign_batches SET status = 'Delivered' WHERE id = ?`, [batch.id]);
        continue;
      }

      const executionId = `EXEC-${batch.id}`;

      // CRITICAL DUPLICATE PROTECTION: Atomic status transition
      // Only one worker process can successfully transition this batch from 'Scheduled' to 'Processing'
      const claimResult = run(
        `UPDATE campaign_batches 
         SET status = 'Processing', execution_id = ? 
         WHERE id = ? AND status = 'Scheduled'`,
        [executionId, batch.id]
      );

      if (claimResult.changes === 0) {
        // Another worker or thread claimed this batch. Skip to avoid duplicate execution!
        console.warn(`[Worker B] Batch ${batch.id} was already claimed. Skipping duplicate execution.`);
        continue;
      }

      // Log execution start
      run(
        `INSERT INTO execution_logs (batch_execution_id, worker_name, campaign_id, batch_id, action, status, created_at)
         VALUES (?, ?, ?, ?, 'BATCH_DISPATCH_START', 'PROCESSING', ?)`,
        [executionId, workerInstanceId, batch.campaign_id, batch.id, nowIso]
      );

      console.log(`[Worker B] Processing batch ${batch.batch_number} for campaign ${batch.campaign_id} (Qty: ${batch.planned_quantity})`);

      try {
        // Execute batch order via orderService with unique idempotencyKey
        const order = await createOrder({
          userId: batch.user_id,
          serviceId: batch.service_id,
          targetUrl: batch.target_url,
          quantity: batch.planned_quantity,
          idempotencyKey: executionId,
          campaignBatchId: batch.id
        });

        const isSuccess = order && (order.status === 'In progress' || order.status === 'Processing' || order.status === 'Pending' || order.status === 'Completed');
        const providerResp = order ? (order.provider_response || '') : '';
        const isActiveOrderLock = providerResp.toLowerCase().includes('active order') || providerResp.toLowerCase().includes('order being completed');

        let batchStatus;
        let lastErrorText = null;
        let retryCount = batch.retry_count;

        if (isSuccess) {
          batchStatus = 'Delivered';
        } else if (isActiveOrderLock) {
          // Provider link is busy with active order. Keep as Scheduled so it auto-retries without failing permanently
          batchStatus = 'Scheduled';
          lastErrorText = 'Provider busy: Active order in progress on this link. Will auto-retry once provider finishes.';
        } else {
          retryCount += 1;
          batchStatus = retryCount >= maxRetries ? 'Failed' : 'Scheduled';
          lastErrorText = providerResp || 'Order submission failed';
        }

        const executedAt = new Date().toISOString();

        run(
          `UPDATE campaign_batches 
           SET status = ?, order_id = ?, provider_order_id = ?, provider_response = ?, executed_at = ?, retry_count = ?, last_error = ?
           WHERE id = ?`,
          [batchStatus, order ? order.id : null, order ? order.provider_order_id : null, providerResp, executedAt, retryCount, lastErrorText, batch.id]
        );

        // Record execution completion
        run(
          `INSERT INTO execution_logs (batch_execution_id, worker_name, campaign_id, batch_id, action, status, response_payload, created_at)
           VALUES (?, ?, ?, ?, 'BATCH_DISPATCH_COMPLETE', ?, ?, ?)`,
          [executionId, workerInstanceId, batch.campaign_id, batch.id, batchStatus, order ? order.provider_response : '', executedAt]
        );

        if (batchStatus === 'Delivered') {
          sendNotification({
            userId: batch.user_id,
            title: 'Campaign Batch Delivered',
            message: `Batch #${batch.batch_number} (${batch.planned_quantity.toLocaleString()} units) for campaign "${batch.campaign_name}" was delivered to provider.`,
            type: 'SUCCESS'
          });

          // Dispatch auxiliary waves (Likes, Saves, Shares, Reposts) if scheduled in this batch
          if (batch.likes_quantity > 0) {
            await dispatchAuxiliaryMetric({
              userId: batch.user_id,
              serviceType: 'likes',
              targetUrl: batch.target_url,
              quantity: batch.likes_quantity,
              idempotencyKey: `${executionId}-likes`,
              campaignBatchId: batch.id
            });
          }
          if (batch.saves_quantity > 0) {
            await dispatchAuxiliaryMetric({
              userId: batch.user_id,
              serviceType: 'saves',
              targetUrl: batch.target_url,
              quantity: batch.saves_quantity,
              idempotencyKey: `${executionId}-saves`,
              campaignBatchId: batch.id
            });
          }
          if (batch.shares_quantity > 0) {
            await dispatchAuxiliaryMetric({
              userId: batch.user_id,
              serviceType: 'shares',
              targetUrl: batch.target_url,
              quantity: batch.shares_quantity,
              idempotencyKey: `${executionId}-shares`,
              campaignBatchId: batch.id
            });
          }
          if (batch.reposts_quantity > 0) {
            await dispatchAuxiliaryMetric({
              userId: batch.user_id,
              serviceType: 'reposts',
              targetUrl: batch.target_url,
              quantity: batch.reposts_quantity,
              idempotencyKey: `${executionId}-reposts`,
              campaignBatchId: batch.id
            });
          }
        }

      } catch (execErr) {
        console.error(`[Worker B Error] Failed to execute batch ${batch.id}:`, execErr.message);
        const isLockError = execErr.message.toLowerCase().includes('active order') || execErr.message.toLowerCase().includes('order being completed');
        let failedStatus;
        let retryCount = batch.retry_count;
        let errorMsg = execErr.message;

        if (isLockError) {
          failedStatus = 'Scheduled';
          errorMsg = 'Provider busy: Active order in progress on this link. Will auto-retry once provider finishes.';
        } else {
          retryCount += 1;
          failedStatus = retryCount >= maxRetries ? 'Failed' : 'Scheduled';
        }

        run(
          `UPDATE campaign_batches 
           SET status = ?, retry_count = ?, last_error = ? 
           WHERE id = ?`,
          [failedStatus, retryCount, errorMsg, batch.id]
        );

        run(
          `INSERT INTO execution_logs (batch_execution_id, worker_name, campaign_id, batch_id, action, status, error_message, created_at)
           VALUES (?, ?, ?, ?, 'BATCH_EXECUTION_ERROR', ?, ?, ?)`,
          [executionId, workerInstanceId, batch.campaign_id, batch.id, failedStatus, execErr.message, new Date().toISOString()]
        );

        if (failedStatus === 'Failed') {
          sendNotification({
            userId: batch.user_id,
            title: 'Campaign Batch Failed',
            message: `Batch #${batch.batch_number} for campaign "${batch.campaign_name}" failed after ${retryCount} attempts: ${execErr.message}`,
            type: 'ERROR'
          });
        }
      }
    }

  } catch (err) {
    console.error('[Worker B Error]', err.message);
  } finally {
    isWorkerBRunning = false;
  }
}

/**
 * Sync active orders with provider APIs
 */
async function runStatusSync() {
  if (isSyncRunning) return;
  isSyncRunning = true;

  try {
    // Find non-final orders with provider_order_id
    const activeOrders = query(
      `SELECT o.*, p.api_url, p.adapter_type, p.slug as provider_slug
       FROM orders o
       JOIN api_providers p ON o.provider_id = p.id
       WHERE o.status IN ('Pending', 'Processing', 'In progress')
       AND o.provider_order_id IS NOT NULL
       ORDER BY o.updated_at ASC LIMIT 15`
    );

    for (const order of activeOrders) {
      try {
        // Get user api key or fallback
        const userCred = queryOne(
          'SELECT * FROM user_api_credentials WHERE user_id = ? AND provider_id = ?',
          [order.user_id, order.provider_id]
        );
        let apiKey = '';
        if (userCred && userCred.encrypted_api_key) {
          apiKey = decryptText(userCred.encrypted_api_key, userCred.iv, userCred.auth_tag);
        }
        if (!apiKey && order.provider_slug === 'mock-provider') {
          apiKey = 'mock_key_default';
        }
        if (!apiKey) continue;

        const provider = { api_url: order.api_url, adapter_type: order.adapter_type, slug: order.provider_slug };
        const adapter = getProviderAdapter(provider, apiKey);
        const statusRes = await adapter.checkOrderStatus(order.provider_order_id);

        if (statusRes && statusRes.status && statusRes.status !== order.status) {
          run(
            `UPDATE orders SET status = ?, updated_at = ? WHERE id = ?`,
            [statusRes.status, new Date().toISOString(), order.id]
          );

          if (statusRes.status === 'Completed') {
            sendNotification({
              userId: order.user_id,
              title: 'Order Completed',
              message: `Your order #${order.id} has been marked as Completed by the provider.`,
              type: 'SUCCESS'
            });
          }
        }
      } catch (syncErr) {
        // Log quietly for non-critical sync errors
      }
    }
  } catch (err) {
    console.error('[Status Sync Error]', err.message);
  } finally {
    isSyncRunning = false;
  }
}

/**
 * Start backend automation engine and cron loops
 * Drip queue checks once per minute (1,440 checks daily)
 */
function startAutomationEngine() {
  // Query interval setting from database or default to 60 seconds (1 minute)
  const setting = queryOne("SELECT value FROM admin_settings WHERE key = 'worker_interval_seconds'");
  const intervalSeconds = setting ? Math.max(10, parseInt(setting.value, 10)) : 60;
  const intervalMs = intervalSeconds * 1000;
  const dailyChecks = Math.round((24 * 60 * 60) / intervalSeconds);

  dripQueueStats.intervalSeconds = intervalSeconds;
  dripQueueStats.intervalText = intervalSeconds === 60 ? '1 minute' : `${intervalSeconds} seconds`;
  dripQueueStats.dailyChecksExpected = dailyChecks;

  console.log(`[Drip Queue Engine] Started: Checking once per ${dripQueueStats.intervalText} (${intervalSeconds}s interval, ${dailyChecks.toLocaleString()} checks daily)...`);
  
  // Run initial check immediately on boot
  dripQueueStats.totalChecks++;
  dripQueueStats.lastCheckAt = new Date().toISOString();
  runWorkerA();
  runWorkerB();
  runStatusSync();

  // Schedule Drip Queue Workers: exactly once per minute (60s) = 1,440 checks daily
  workerIntervalId = setInterval(async () => {
    dripQueueStats.totalChecks++;
    dripQueueStats.lastCheckAt = new Date().toISOString();
    console.log(`[Drip Queue] Periodic check #${dripQueueStats.totalChecks} (${dripQueueStats.intervalText} tick, 1,440 daily schedule)`);
    await runWorkerA();
    await runWorkerB();
  }, intervalMs);

  // Schedule Status Sync every 60 seconds
  syncIntervalId = setInterval(async () => {
    await runStatusSync();
  }, 60000);
}

function stopAutomationEngine() {
  if (workerIntervalId) clearInterval(workerIntervalId);
  if (syncIntervalId) clearInterval(syncIntervalId);
  console.log('[Automation Engine] Stopped.');
}

async function tickAutomation() {
  await runWorkerA();
  await runWorkerB();
  await runStatusSync();
}

module.exports = {
  startAutomationEngine,
  stopAutomationEngine,
  runWorkerA,
  runWorkerB,
  runStatusSync,
  tickAutomation,
  getDripQueueStats
};

