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

// Global Middlewares
app.use(cors({ origin: true, credentials: true }));
app.use(cookieParser());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(rateLimiter(200, 60 * 1000)); // 200 requests per minute per IP

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

// Single Page Application (SPA) routing fallback
app.use((req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Server Initialization
async function startServer() {
  try {
    console.log('[Server] Initializing database...');
    await initDB();

    console.log('[Server] Checking and seeding default records...');
    await seedData();

    console.log('[Server] Starting backend automation engine...');
    startAutomationEngine();

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

module.exports = {
  app,
  startServer
};

