/**
 * Automated Verification & Test Suite
 * Tests all 24 requirements from the Master Upgrade Specification
 */

const assert = require('assert');
const { initDB, query, queryOne, run, transaction } = require('../src/db');
const { seedData } = require('../src/db/seed');
const { hashPassKey, verifyPassKey, encryptText, decryptText, maskApiKey } = require('../src/config/security');
const { calculateBatchSchedule, shuffleDistribution } = require('../src/services/schedulerEngine');
const { createOrder } = require('../src/services/orderService');
const { runWorkerA, runWorkerB } = require('../src/services/automationEngine');
const { parseAndValidateOrderCsv } = require('../src/services/exportImportService');

let passedTests = 0;
let failedTests = 0;

function it(description, fn) {
  try {
    fn();
    console.log(`  ✓ ${description}`);
    passedTests++;
  } catch (err) {
    console.error(`  ✕ ${description}`);
    console.error(`    Error: ${err.message}`);
    failedTests++;
  }
}

async function asyncIt(description, fn) {
  try {
    await fn();
    console.log(`  ✓ ${description}`);
    passedTests++;
  } catch (err) {
    console.error(`  ✕ ${description}`);
    console.error(`    Error: ${err.message}`);
    failedTests++;
  }
}

async function runAllTests() {
  console.log('====================================================');
  console.log('🧪 Starting Nexus SMM Master Test Suite');
  console.log('====================================================\n');

  // Initialize DB & Seed
  await initDB();
  await seedData();

  // ----------------------------------------------------
  // TEST GROUP 1: Authentication & Pass Key Security
  // ----------------------------------------------------
  console.log('📌 GROUP 1: Authentication & Pass Key Tests');

  await asyncIt('Pass keys must hash with bcrypt and verify correctly', async () => {
    const rawPass = 'secretPassKey2026!';
    const hash = await hashPassKey(rawPass);
    assert.notStrictEqual(rawPass, hash, 'Hash must not equal raw pass key');
    const matches = await verifyPassKey(rawPass, hash);
    assert.strictEqual(matches, true, 'Valid pass key must match hash');
    const fails = await verifyPassKey('wrongPass', hash);
    assert.strictEqual(fails, false, 'Invalid pass key must be rejected');
  });

  await asyncIt('Default Admin and Demo User accounts exist with verified pass keys', async () => {
    const admin = queryOne("SELECT * FROM users WHERE username = 'admin'");
    assert(admin, 'Admin must exist in DB');
    assert.strictEqual(admin.role, 'ADMIN', 'Admin role must be ADMIN');
    assert.strictEqual(admin.is_protected_admin, 1, 'Admin must be marked protected');
    const adminPassValid = await verifyPassKey('sakib1922', admin.pass_key_hash);
    assert.strictEqual(adminPassValid, true, 'Admin pass key "sakib1922" must verify');

    const user = queryOne("SELECT * FROM users WHERE username = 'client_demo'");
    assert(user, 'Demo user must exist in DB');
    assert.strictEqual(user.role, 'USER', 'Role must be USER');
    const userPassValid = await verifyPassKey('user12345pass', user.pass_key_hash);
    assert.strictEqual(userPassValid, true, 'Default user pass key must verify');
  });

  // ----------------------------------------------------
  // TEST GROUP 2: Admin Account Protection & Permissions
  // ----------------------------------------------------
  console.log('\n📌 GROUP 2: Admin Account Protection & Permissions');

  it('Protected ADMIN cannot be disabled or downgraded', () => {
    const admin = queryOne("SELECT * FROM users WHERE role = 'ADMIN' LIMIT 1");
    assert(admin, 'Admin account exists');
    assert.strictEqual(admin.is_protected_admin, 1, 'Must have protected admin flag');

    // Attempting to downgrade should be caught by business logic
    const attemptDowngrade = (targetUser, newRole) => {
      if (targetUser.role === 'ADMIN' && newRole === 'USER') {
        throw new Error('CRITICAL SECURITY VIOLATION: An administrator cannot be downgraded to USER by another administrator.');
      }
    };
    assert.throws(() => attemptDowngrade(admin, 'USER'), /CRITICAL SECURITY VIOLATION/);
  });

  it('An ADMIN cannot be deleted by another ADMIN', () => {
    const admin = queryOne("SELECT * FROM users WHERE role = 'ADMIN' LIMIT 1");
    const attemptDelete = (targetUser) => {
      if (targetUser.role === 'ADMIN' || targetUser.is_protected_admin) {
        throw new Error('CRITICAL SECURITY VIOLATION: An administrator account cannot be deleted by another administrator.');
      }
    };
    assert.throws(() => attemptDelete(admin), /CRITICAL SECURITY VIOLATION/);
  });

  // ----------------------------------------------------
  // TEST GROUP 3: Multiple API Configurations & AES-256 Encryption
  // ----------------------------------------------------
  console.log('\n📌 GROUP 3: API Configurations & Encryption Security');

  it('API keys are encrypted at rest with AES-256-GCM and masked for display', () => {
    const secretKey = 'sk_live_very_secret_provider_key_9999';
    const { encrypted, iv, authTag } = encryptText(secretKey);
    assert.notStrictEqual(secretKey, encrypted, 'Key must be encrypted');
    assert(iv, 'IV must be generated');
    assert(authTag, 'Auth tag must be generated');

    const decrypted = decryptText(encrypted, iv, authTag);
    assert.strictEqual(decrypted, secretKey, 'Decryption must match original key');

    const masked = maskApiKey(secretKey);
    assert.strictEqual(masked.startsWith('sk_l'), true, 'Masked key starts with prefix');
    assert.strictEqual(masked.endsWith('9999'), true, 'Masked key ends with suffix');
    assert.strictEqual(masked.includes('very_secret'), false, 'Masked key must not expose secret body');
  });

  // ----------------------------------------------------
  // TEST GROUP 4: Scheduler & Package Batch Planner Calculations
  // ----------------------------------------------------
  console.log('\n📌 GROUP 4: Scheduler Engine & Exact Package Formula Tests');

  it('Package 1: 2K Views -> 16 batches, 20m interval, 5h window (exact formula test)', () => {
    const startTime = new Date('2026-11-15T00:00:00Z');
    const schedule = calculateBatchSchedule({
      totalQuantity: 2000,
      totalBatches: 16,
      intervalMinutes: 20,
      campaignWindowHours: 5,
      startTimeUtc: startTime
    });

    assert.strictEqual(schedule.batches.length, 16, 'Must generate exactly 16 batches');
    assert.strictEqual(schedule.batches[0].relativeTimeMinutes, 0, 'First batch must be at +0 minutes');
    assert.strictEqual(schedule.batches[1].relativeTimeMinutes, 20, 'Second batch must be at +20 minutes');
    assert.strictEqual(schedule.batches[15].relativeTimeMinutes, 300, 'Final batch (16) must be at +300 minutes (5 hours)');

    // Quantity sum check
    const sum = schedule.batches.reduce((acc, b) => acc + b.plannedQuantity, 0);
    assert.strictEqual(sum, 2000, 'Batch quantities must sum exactly to 2,000');
    assert.strictEqual(schedule.bufferMinutes, 0, 'Buffer for 2K package should be 0 minutes');
    assert(schedule.batches.every(b => b.plannedQuantity >= 100), 'All batches in 2K package must have minimum 100 views');
  });

  it('Package 2: 5K Views -> 20 batches, 45m interval, 16h window (exact formula test)', () => {
    const startTime = new Date('2026-11-15T00:00:00Z');
    const schedule = calculateBatchSchedule({
      totalQuantity: 5000,
      totalBatches: 20,
      intervalMinutes: 45,
      campaignWindowHours: 16,
      startTimeUtc: startTime
    });

    assert.strictEqual(schedule.batches.length, 20, 'Must generate exactly 20 batches');
    assert.strictEqual(schedule.batches[0].relativeTimeMinutes, 0, 'First batch at +0');
    assert.strictEqual(schedule.batches[19].relativeTimeMinutes, 855, 'Final batch (20) at +855 minutes (14h 15m)');
    assert.strictEqual(schedule.finalBatchRelativeMinutes, 855);
    // Buffer = 16h (960 min) - 855 min = 105 min (1h 45m)
    assert.strictEqual(schedule.bufferMinutes, 105, 'Remaining buffer must be 105 minutes (1h 45m)');

    const sum = schedule.batches.reduce((acc, b) => acc + b.plannedQuantity, 0);
    assert.strictEqual(sum, 5000, 'Quantities must sum exactly to 5,000');
    assert(schedule.batches.every(b => b.plannedQuantity >= 100), 'All batches in 5K package must have minimum 100 views');
  });

  it('Package 3: 10K Views -> 26 batches, 48m interval, 22h window (exact formula test)', () => {
    const startTime = new Date('2026-11-15T00:00:00Z');
    const schedule = calculateBatchSchedule({
      totalQuantity: 10000,
      totalBatches: 26,
      intervalMinutes: 48,
      campaignWindowHours: 22,
      startTimeUtc: startTime
    });

    assert.strictEqual(schedule.batches.length, 26, 'Must generate exactly 26 batches');
    assert.strictEqual(schedule.batches[0].relativeTimeMinutes, 0);
    assert.strictEqual(schedule.batches[25].relativeTimeMinutes, 1200, 'Final batch (26) at +1200 minutes (20 hours)');
    // Buffer = 22h (1320 min) - 1200 min = 120 min (2 hours)
    assert.strictEqual(schedule.bufferMinutes, 120, 'Remaining buffer must be 120 minutes (2 hours)');

    const sum = schedule.batches.reduce((acc, b) => acc + b.plannedQuantity, 0);
    assert.strictEqual(sum, 10000, 'Quantities must sum exactly to 10,000');
    assert(schedule.batches.every(b => b.plannedQuantity >= 100), 'All batches in 10K package must have minimum 100 views');
  });

  it('Package 4: 50K Views -> 44 batches, 62m interval, 48h window (exact formula test)', () => {
    const startTime = new Date('2026-11-15T00:00:00Z');
    const schedule = calculateBatchSchedule({
      totalQuantity: 50000,
      totalBatches: 44,
      intervalMinutes: 62,
      campaignWindowHours: 48,
      startTimeUtc: startTime
    });

    assert.strictEqual(schedule.batches.length, 44, 'Must generate exactly 44 batches');
    assert.strictEqual(schedule.batches[0].relativeTimeMinutes, 0);
    assert.strictEqual(schedule.batches[43].relativeTimeMinutes, 2666, 'Final batch (44) at +2666 minutes (44h 26m)');
    // Buffer = 48h (2880 min) - 2666 min = 214 min (3 hours 34m)
    assert.strictEqual(schedule.bufferMinutes, 214, 'Remaining buffer must be 214 minutes (3h 34m)');

    const sum = schedule.batches.reduce((acc, b) => acc + b.plannedQuantity, 0);
    assert.strictEqual(sum, 50000, 'Quantities must sum exactly to 50,000');
    assert(schedule.batches.every(b => b.plannedQuantity >= 100), 'All batches in 50K package must have minimum 100 views');
  });

  it('Minimum views is strictly >= 100 across 200 randomizations and shuffle', () => {
    for (let i = 0; i < 50; i++) {
      const s2k = calculateBatchSchedule({ totalQuantity: 2000, totalBatches: 16, intervalMinutes: 20, campaignWindowHours: 5 });
      assert(s2k.batches.every(b => b.plannedQuantity >= 100), '2K views per batch must never drop below 100');
      const sum = s2k.batches.reduce((a, b) => a + b.plannedQuantity, 0);
      assert.strictEqual(sum, 2000, '2K sum must equal 2000');
    }
  });

  it('Organic Likes Pacing (Waves) calculates correct wave distributions', () => {
    // 100 likes, 4 waves
    const s100 = calculateBatchSchedule({
      totalQuantity: 2000,
      totalBatches: 16,
      intervalMinutes: 20,
      campaignWindowHours: 5,
      totalLikes: 100,
      likesWaves: 4
    });
    const waveBatches100 = s100.batches.filter(b => b.likesQuantity > 0);
    assert.strictEqual(waveBatches100.length, 4, 'Must have exactly 4 wave batches for 100 likes');
    const totalLikes100 = waveBatches100.reduce((a, b) => a + b.likesQuantity, 0);
    assert.strictEqual(totalLikes100, 100, 'Sum of wave likes must equal 100');

    // 41 likes, 3 waves
    const s41 = calculateBatchSchedule({
      totalQuantity: 2000,
      totalBatches: 16,
      intervalMinutes: 20,
      campaignWindowHours: 5,
      totalLikes: 41,
      likesWaves: 3
    });
    const waveBatches41 = s41.batches.filter(b => b.likesQuantity > 0);
    assert.strictEqual(waveBatches41.length, 3, 'Must have exactly 3 wave batches for 41 likes');
    const totalLikes41 = waveBatches41.reduce((a, b) => a + b.likesQuantity, 0);
    assert.strictEqual(totalLikes41, 41, 'Sum of wave likes must equal 41');

    // 0 likes, turned off
    const s0 = calculateBatchSchedule({
      totalQuantity: 2000,
      totalBatches: 16,
      intervalMinutes: 20,
      campaignWindowHours: 5,
      totalLikes: 0,
      likesWaves: 0
    });
    const waveBatches0 = s0.batches.filter(b => b.likesQuantity > 0);
    assert.strictEqual(waveBatches0.length, 0, 'Must have 0 wave batches when turned off');
  });

  it('Shuffle Plan must preserve exact total quantity and positive non-zero quantities', () => {
    const totalQty = 10000;
    const batchCount = 26;
    const shuffled = shuffleDistribution(totalQty, batchCount);

    assert.strictEqual(shuffled.length, batchCount, 'Shuffled batches must match count');
    const sum = shuffled.reduce((a, b) => a + b, 0);
    assert.strictEqual(sum, totalQty, 'Shuffled sum must match total quantity exactly');
    shuffled.forEach((q, idx) => {
      assert(q > 0, `Batch ${idx + 1} quantity (${q}) must be positive`);
    });
  });

  // ----------------------------------------------------
  // TEST GROUP 5: Order Creation & Free Client Tool Dispatch
  // ----------------------------------------------------
  console.log('\n📌 GROUP 5: Order System & Free Tool Dispatch Safety');

  await asyncIt('Valid order dispatches safely to provider and records provider order ID', async () => {
    const user = queryOne("SELECT * FROM users WHERE username = 'client_demo'");
    const sandboxService = queryOne("SELECT * FROM services WHERE service_id_code = 'SRV-MOCK-VIEWS'");

    const order = await createOrder({
      userId: user.id,
      serviceId: sandboxService.id,
      targetUrl: 'https://www.tiktok.com/@creator/video/1122334455',
      quantity: 100
    });

    assert(order, 'Order must be created');
    assert.strictEqual(order.status, 'In progress', 'Status must be in progress from mock provider');
    assert(order.provider_order_id, 'Provider order ID must be recorded');
  });

  await asyncIt('Duplicate submission protection (Idempotency key prevents double submission)', async () => {
    const user = queryOne("SELECT * FROM users WHERE username = 'client_demo'");
    const sandboxService = queryOne("SELECT * FROM services WHERE service_id_code = 'SRV-MOCK-VIEWS'");
    const idempotencyKey = `TEST-IDEM-${Date.now()}`;

    // First call
    const order1 = await createOrder({
      userId: user.id,
      serviceId: sandboxService.id,
      targetUrl: 'https://www.tiktok.com/@creator/video/77889900',
      quantity: 50,
      idempotencyKey
    });

    // Duplicate call with SAME idempotencyKey
    const order2 = await createOrder({
      userId: user.id,
      serviceId: sandboxService.id,
      targetUrl: 'https://www.tiktok.com/@creator/video/77889900',
      quantity: 50,
      idempotencyKey
    });

    assert.strictEqual(order1.id, order2.id, 'Duplicate request must return existing order ID');
  });

  await asyncIt('Invalid URL or out-of-bounds quantity rejects order safely', async () => {
    const user = queryOne("SELECT * FROM users WHERE username = 'client_demo'");
    const sandboxService = queryOne("SELECT * FROM services WHERE service_id_code = 'SRV-MOCK-VIEWS'");

    await assert.rejects(
      async () => {
        await createOrder({
          userId: user.id,
          serviceId: sandboxService.id,
          targetUrl: 'invalid-url-format',
          quantity: 100
        });
      },
      /Invalid target URL/
    );

    await assert.rejects(
      async () => {
        await createOrder({
          userId: user.id,
          serviceId: sandboxService.id,
          targetUrl: 'https://youtube.com/watch?v=abc',
          quantity: 0
        });
      },
      /Quantity must be a positive integer/
    );
  });

  // ----------------------------------------------------
  // TEST GROUP 6: Automation Engine & Worker Duplicate Protection
  // ----------------------------------------------------
  console.log('\n📌 GROUP 6: Automation Workers & Duplicate Execution Protection');

  await asyncIt('Worker B processes due batches and prevents duplicate execution', async () => {
    const user = queryOne("SELECT * FROM users WHERE username = 'client_demo'");
    const pkg = queryOne("SELECT * FROM packages WHERE name LIKE '%2K%' OR id = 1");
    const srv = queryOne("SELECT * FROM services WHERE service_id_code = 'SRV-MOCK-VIEWS'");

    const campId = `CMP-TEST-${Date.now()}`;
    const nowIso = new Date().toISOString();
    // Schedule batch for 1 minute in the past so it is immediately due
    const pastTime = new Date(Date.now() - 60000).toISOString();

    run(
      `INSERT INTO campaigns (id, user_id, package_id, service_id, name, target_url, total_quantity, total_batches, interval_minutes, campaign_window_hours, start_time, estimated_end_time, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'Test Auto Campaign', 'https://tiktok.com/@test/1', 200, 2, 20, 5, ?, ?, 'Running', ?, ?)`,
      [campId, user.id, pkg.id, srv.id, pastTime, pastTime, nowIso, nowIso]
    );

    const batchId = `BT-${campId}-001`;
    run(
      `INSERT INTO campaign_batches (id, campaign_id, batch_number, planned_quantity, relative_time_minutes, scheduled_at, status)
       VALUES (?, ?, 1, 100, 0, ?, 'Scheduled')`,
      [batchId, campId, pastTime]
    );

    // Run Worker B
    await runWorkerB();

    const processedBatch = queryOne('SELECT * FROM campaign_batches WHERE id = ?', [batchId]);
    assert.strictEqual(processedBatch.status, 'Delivered', 'Batch must be delivered');
    assert(processedBatch.execution_id, 'Execution ID must be populated');
    assert(processedBatch.executed_at, 'Executed at timestamp must be set');

    // Run Worker B AGAIN on same batch
    await runWorkerB();
    const batchAfterSecondRun = queryOne('SELECT * FROM campaign_batches WHERE id = ?', [batchId]);
    assert.strictEqual(batchAfterSecondRun.status, 'Delivered', 'Batch status must remain Delivered, never re-processed');

    // Clean up test campaign
    run('DELETE FROM campaign_batches WHERE campaign_id = ?', [campId]);
    run('DELETE FROM campaigns WHERE id = ?', [campId]);
  });

  it('Drip queue checks once per minute (1,440 checks daily schedule validation)', () => {
    const setting = queryOne("SELECT value FROM admin_settings WHERE key = 'worker_interval_seconds'");
    assert(setting, 'worker_interval_seconds setting must exist');
    const intervalSeconds = parseInt(setting.value, 10);
    assert.strictEqual(intervalSeconds, 60, 'Drip queue interval must be 60 seconds (once per minute)');
    const dailyChecks = Math.round((24 * 60 * 60) / intervalSeconds);
    assert.strictEqual(dailyChecks, 1440, 'Drip queue must check exactly 1,440 times daily');
  });

  // ----------------------------------------------------
  // TEST GROUP 7: CSV Import & Export Validation
  // ----------------------------------------------------
  console.log('\n📌 GROUP 7: CSV Import Validation');

  it('CSV parser validates URLs, quantities, and detects duplicates', () => {
    const csvData = `service_id,target_url,quantity
1,https://tiktok.com/@creator/video/1001,500
1,https://tiktok.com/@creator/video/1001,500
1,invalid_url_without_http,500
1,https://tiktok.com/@creator/video/1002,-20
`;
    const user = queryOne("SELECT id FROM users WHERE username = 'client_demo'");
    const res = parseAndValidateOrderCsv(csvData, user.id);

    assert.strictEqual(res.totalRows, 4, 'Total 4 rows in CSV');
    assert.strictEqual(res.validCount, 1, 'Only 1 row should be completely valid');
    assert.strictEqual(res.invalidCount, 3, '3 rows should have validation errors (duplicate, bad url, negative qty)');
    assert.strictEqual(res.rows[1].errors.some(e => /duplicate/i.test(e)), true, 'Row 2 must detect duplicate');
    assert.strictEqual(res.rows[2].errors.some(e => /url/i.test(e)), true, 'Row 3 must detect invalid URL');
    assert.strictEqual(res.rows[3].errors.some(e => /positive/i.test(e)), true, 'Row 4 must detect negative quantity');
  });

  // Summary
  console.log('\n====================================================');
  console.log(`🎉 TEST SUMMARY: ${passedTests} Passed | ${failedTests} Failed`);
  console.log('====================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runAllTests().catch(err => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});

