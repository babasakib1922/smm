const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const isVercel = !!process.env.VERCEL;
const defaultDbPath = path.join(__dirname, '../../data/smm_panel.sqlite');
const dbPath = isVercel ? path.join('/tmp', 'smm_panel.sqlite') : defaultDbPath;

if (isVercel && !fs.existsSync(dbPath)) {
  if (fs.existsSync(defaultDbPath)) {
    try {
      fs.copyFileSync(defaultDbPath, dbPath);
    } catch (e) {
      console.error('Failed to copy initial DB to /tmp:', e.message);
    }
  }
}

module.exports = {
  PORT: process.env.PORT || 3000,
  NODE_ENV: process.env.NODE_ENV || 'production',
  JWT_SECRET: process.env.JWT_SECRET || 'smm-panel-super-secret-jwt-key-2026-secure-auth',
  ENCRYPTION_KEY: process.env.ENCRYPTION_KEY || 'smm-panel-aes-256-secret-key-32b!', // 32 chars
  DB_PATH: dbPath,
  IS_VERCEL: isVercel,
  SESSION_EXPIRY_HOURS: 24,
  MAX_LOGIN_ATTEMPTS: 5,
};

