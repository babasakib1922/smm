const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

module.exports = {
  PORT: process.env.PORT || 3000,
  NODE_ENV: process.env.NODE_ENV || 'production',
  JWT_SECRET: process.env.JWT_SECRET || 'smm-panel-super-secret-jwt-key-2026-secure-auth',
  ENCRYPTION_KEY: process.env.ENCRYPTION_KEY || 'smm-panel-aes-256-secret-key-32b!', // 32 chars
  DB_PATH: path.join(__dirname, '../../data/smm_panel.sqlite'),
  SESSION_EXPIRY_HOURS: 24,
  MAX_LOGIN_ATTEMPTS: 5,
};

