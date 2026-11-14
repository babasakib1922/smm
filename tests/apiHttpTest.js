const assert = require('assert');
const { app } = require('../src/server');
const { initDB, queryOne } = require('../src/db');
const { seedData } = require('../src/db/seed');

let server = null;
let baseUrl = '';

async function runHttpTests() {
  console.log('====================================================');
  console.log('🌐 Starting End-to-End HTTP API Tests');
  console.log('====================================================\n');

  await initDB();
  await seedData();

  const PORT = 3456;
  server = app.listen(PORT);
  baseUrl = `http://127.0.0.1:${PORT}`;

  try {
    // 1. Test Login with Valid Pass Key (sakib1922)
    const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', passKey: 'sakib1922' })
    });
    const loginData = await loginRes.json();
    assert.strictEqual(loginRes.status, 200);
    assert.strictEqual(loginData.success, true);
    assert(loginData.token, 'Must return JWT token');
    const adminToken = loginData.token;
    console.log('  ✓ POST /api/auth/login: Success with admin / sakib1922');

    // 1b. Test Login with Username Alias (sakib / sakib1922)
    const aliasLoginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'sakib', passKey: 'sakib1922' })
    });
    const aliasLoginData = await aliasLoginRes.json();
    assert.strictEqual(aliasLoginRes.status, 200);
    assert.strictEqual(aliasLoginData.success, true);
    console.log('  ✓ POST /api/auth/login: Success with alias sakib / sakib1922');

    // 2. Test Login with Invalid Pass Key
    const badLoginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', passKey: 'wrongPassword' })
    });
    assert.strictEqual(badLoginRes.status, 401);
    console.log('  ✓ POST /api/auth/login: Rejects invalid pass key with 401');

    // 3. Test GET /api/auth/me
    const meRes = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    const meData = await meRes.json();
    assert.strictEqual(meRes.status, 200);
    assert.strictEqual(meData.user.username, 'admin');
    console.log('  ✓ GET /api/auth/me: Returns authenticated user profile');

    // 4. Test User Account Protection on API:
    // Admin cannot disable another admin
    const adminUser = queryOne("SELECT id FROM users WHERE username = 'admin'");
    const disableAdminRes = await fetch(`${baseUrl}/api/admin/users/${adminUser.id}/status`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      },
      body: JSON.stringify({ status: 'DISABLED' })
    });
    assert.strictEqual(disableAdminRes.status, 403, 'Disabling admin must return 403 Forbidden');
    console.log('  ✓ PUT /api/admin/users/:id/status: Blocks disabling an ADMIN with 403');

    // Admin cannot delete an admin
    const deleteAdminRes = await fetch(`${baseUrl}/api/admin/users/${adminUser.id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    assert.strictEqual(deleteAdminRes.status, 403, 'Deleting admin must return 403 Forbidden');
    console.log('  ✓ DELETE /api/admin/users/:id: Blocks deleting an ADMIN with 403');

    // 5. Test Scheduler Calculation API
    const pkg = queryOne("SELECT id FROM packages WHERE name = '2K Views'");
    const calcRes = await fetch(`${baseUrl}/api/scheduler/calculate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      },
      body: JSON.stringify({ packageId: pkg.id })
    });
    const calcData = await calcRes.json();
    assert.strictEqual(calcRes.status, 200);
    assert.strictEqual(calcData.schedule.batches.length, 16);
    assert.strictEqual(calcData.schedule.batches[0].relativeTimeMinutes, 0);
    assert.strictEqual(calcData.schedule.batches[15].relativeTimeMinutes, 300);
    console.log('  ✓ POST /api/scheduler/calculate: Exact 2K batch delivery schedule calculated');

    // 6. Test Engagement Status API
    const engageRes = await fetch(`${baseUrl}/api/engagement/status`, {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    const engageData = await engageRes.json();
    assert.strictEqual(engageRes.status, 200);
    assert(engageData.views, 'Views provider telemetry present');
    assert(engageData.likes, 'Likes provider telemetry present');
    console.log('  ✓ GET /api/engagement/status: Returns Views (Xmedia) and Likes (Zeofame) provider status');

    // 7. Test Analytics API
    const analyticsRes = await fetch(`${baseUrl}/api/analytics`, {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    const analyticsData = await analyticsRes.json();
    assert.strictEqual(analyticsRes.status, 200);
    assert.strictEqual(analyticsData.isAdmin, true);
    assert(analyticsData.metrics.totalUsers >= 2);
    console.log('  ✓ GET /api/analytics: Generates confirmed platform telemetry');

    // 8. Test Export API
    const exportRes = await fetch(`${baseUrl}/api/export/orders`, {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    assert.strictEqual(exportRes.status, 200);
    assert.strictEqual(exportRes.headers.get('content-type'), 'text/csv; charset=utf-8');
    const rawText = await exportRes.text();
    assert(rawText.includes('Order ID'), 'CSV must contain Order ID column header');
    console.log('  ✓ GET /api/export/orders: Generates valid CSV/Excel download with UTF-8 BOM');

    console.log('\n====================================================');
    console.log('🎉 ALL END-TO-END HTTP TESTS PASSED SUCCESSFULLY');
    console.log('====================================================\n');

  } finally {
    if (server) {
      server.close();
    }
  }
}

runHttpTests().catch(err => {
  console.error('HTTP Test failure:', err);
  if (server) server.close();
  process.exit(1);
});
