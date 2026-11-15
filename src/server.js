const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const env = require('./config/env');
const { initDB } = require('./db');
const { seedData } = require('./db/seed');
const { rateLimiter } = require('./middleware/rateLimiter');
const { startAutomationEngine } = require('./services/automationEngine');

// Import routes
const authRoutes = require('./routes/authRoutes');
const adminUserRoutes = require('./routes/adminUserRoutes');
const serviceRoutes = require('./routes/serviceRoutes');
const apiConfigRoutes = require('./routes/apiConfigRoutes');
const orderRoutes = require('./routes/orderRoutes');
const schedulerRoutes = require('./routes/schedulerRoutes');
const engagementRoutes = require('./routes/engagementRoutes');
const analyticsRoutes = require('./routes/analyticsRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const importExportRoutes = require('./routes/importExportRoutes');
const adminSettingsRoutes = require('./routes/adminSettingsRoutes');

const app = express();

let isDbReady = false;
let initPromise = null;

async function ensureDbReady() {
  if (isDbReady) return;
  if (!initPromise) {
    initPromise = (async () => {
      console.log('[Server] Initializing database...');
      await initDB();
      console.log('[Server] Checking and seeding default records...');
      await seedData();
      try {
        const { pullFromCloud } = require('./services/cloudSync');
        await pullFromCloud(true);
      } catch (err) {
        // Non-blocking in offline / test environments
      }
      isDbReady = true;
    })();
  }
  await initPromise;
}

// Global Middlewares
app.use(cors({ origin: true, credentials: true }));
app.use(cookieParser());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(rateLimiter(200, 60 * 1000)); // 200 requests per minute per IP

// Ensure database is ready before any route/request is handled
app.use(async (req, res, next) => {
  try {
    await ensureDbReady();
    next();
  } catch (err) {
    console.error('[Server] DB initialization error:', err);
    res.status(500).json({ error: 'Database initialization failed: ' + err.message });
  }
});

// Throttled opportunistic execution on serverless: ensure due batches execute whenever traffic arrives
let lastOpportunisticCheck = 0;
const OPPORTUNISTIC_INTERVAL_MS = 25000;

app.use((req, res, next) => {
  const now = Date.now();
  if (now - lastOpportunisticCheck > OPPORTUNISTIC_INTERVAL_MS && req.path !== '/api/cron' && !req.path.startsWith('/css') && !req.path.startsWith('/js')) {
    lastOpportunisticCheck = now;
    (async () => {
      try {
        const { runWorkerA, runWorkerB } = require('./services/automationEngine');
        await runWorkerA();
        await runWorkerB();
      } catch (err) {
        // Non-blocking
      }
    })();
  }
  next();
});

// Serve static assets from public/
app.use(express.static(path.join(__dirname, '../public')));

// Mount API routes
app.use('/api/auth', authRoutes);
app.use('/api/admin/users', adminUserRoutes);
app.use('/api/services', serviceRoutes);
app.use('/api/api-configs', apiConfigRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/scheduler', schedulerRoutes);
app.use('/api/engagement', engagementRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api', importExportRoutes); // handles /api/import and /api/export
app.use('/api/admin/settings', adminSettingsRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Automation cron endpoint (callable by Vercel Cron or external monitors)
app.get('/api/cron', async (req, res) => {
  try {
    const { pullFromCloud, pushToCloud } = require('./services/cloudSync');
    const { runWorkerA, runWorkerB } = require('./services/automationEngine');
    await pullFromCloud();
    await runWorkerA();
    await runWorkerB();
    await pushToCloud();
    return res.json({
      success: true,
      timestamp: new Date().toISOString(),
      message: 'Automation cron cycle executed successfully.'
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Single Page Application (SPA) routing fallback
app.use((req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Server Initialization
async function startServer() {
  try {
    await ensureDbReady();

    if (!env.IS_VERCEL) {
      console.log('[Server] Starting backend automation engine...');
      startAutomationEngine();
    }

    const server = app.listen(env.PORT, () => {
      console.log(`====================================================`);
      console.log(`🚀 Nexus SMM Automation Panel running on port ${env.PORT}`);
      console.log(`   URL: http://localhost:${env.PORT}`);
      console.log(`   Admin Login: username="admin" (or "sakib"), passKey="sakib1922"`);
      console.log(`   User Login:  username="client_demo", passKey="user12345pass"`);
      console.log(`====================================================`);
    });

    return server;
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

// Start if executed directly
if (require.main === module) {
  startServer();
}

module.exports = app;
module.exports.app = app;
module.exports.startServer = startServer;

