// Database schema definitions

const SCHEMA_SQL = `
-- 1. Users
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  pass_key_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'USER' CHECK(role IN ('ADMIN', 'USER')),
  balance REAL NOT NULL DEFAULT 0.00,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE', 'DISABLED', 'DELETED')),
  is_protected_admin INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  last_login_at TEXT,
  last_login_ip TEXT
);

-- 2. Sessions
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token TEXT UNIQUE NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

-- 3. API Providers
CREATE TABLE IF NOT EXISTS api_providers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  api_url TEXT NOT NULL,
  adapter_type TEXT NOT NULL DEFAULT 'standard_smm_v2' CHECK(adapter_type IN ('standard_smm_v2', 'custom_json', 'mock_provider')),
  is_active INTEGER NOT NULL DEFAULT 1,
  description TEXT,
  created_at TEXT NOT NULL
);

-- 4. User API Credentials (Per user per provider)
CREATE TABLE IF NOT EXISTS user_api_credentials (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider_id INTEGER NOT NULL REFERENCES api_providers(id) ON DELETE CASCADE,
  encrypted_api_key TEXT NOT NULL,
  iv TEXT NOT NULL,
  auth_tag TEXT NOT NULL,
  masked_key TEXT NOT NULL,
  api_endpoint TEXT,
  connection_status TEXT NOT NULL DEFAULT 'DISCONNECTED' CHECK(connection_status IN ('CONNECTED', 'DISCONNECTED', 'ERROR')),
  last_checked_at TEXT,
  last_error TEXT,
  reported_balance REAL DEFAULT 0.00,
  UNIQUE(user_id, provider_id)
);

-- 5. Services
CREATE TABLE IF NOT EXISTS services (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  service_id_code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  provider_id INTEGER NOT NULL REFERENCES api_providers(id),
  provider_service_id TEXT NOT NULL,
  min_quantity INTEGER NOT NULL DEFAULT 10,
  max_quantity INTEGER NOT NULL DEFAULT 100000,
  price_per_k REAL NOT NULL DEFAULT 1.00,
  description TEXT,
  delivery_settings TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  assigned_user_id INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL
);

-- 6. Packages (for Campaign Scheduler)
CREATE TABLE IF NOT EXISTS packages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  category TEXT NOT NULL DEFAULT 'Views',
  total_quantity INTEGER NOT NULL,
  total_batches INTEGER NOT NULL,
  interval_minutes INTEGER NOT NULL,
  campaign_window_hours INTEGER NOT NULL,
  service_id INTEGER REFERENCES services(id),
  price REAL NOT NULL DEFAULT 0.00,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

-- 7. Orders
CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  service_id INTEGER NOT NULL REFERENCES services(id),
  target_url TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  charge REAL NOT NULL,
  status TEXT NOT NULL DEFAULT 'Pending' CHECK(status IN ('Pending', 'Processing', 'In progress', 'Completed', 'Partial', 'Canceled', 'Failed')),
  provider_id INTEGER REFERENCES api_providers(id),
  provider_order_id TEXT,
  provider_response TEXT,
  idempotency_key TEXT UNIQUE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- 8. Campaigns
CREATE TABLE IF NOT EXISTS campaigns (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  package_id INTEGER NOT NULL REFERENCES packages(id),
  service_id INTEGER NOT NULL REFERENCES services(id),
  name TEXT NOT NULL,
  target_url TEXT NOT NULL,
  total_quantity INTEGER NOT NULL,
  total_batches INTEGER NOT NULL,
  interval_minutes INTEGER NOT NULL,
  campaign_window_hours INTEGER NOT NULL,
  start_time TEXT NOT NULL,
  estimated_end_time TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Scheduled' CHECK(status IN ('Draft', 'Scheduled', 'Running', 'Paused', 'Completed', 'Failed', 'Cancelled')),
  total_cost REAL NOT NULL DEFAULT 0.00,
  share_token TEXT UNIQUE,
  locked_at TEXT,
  locked_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- 9. Campaign Batches
CREATE TABLE IF NOT EXISTS campaign_batches (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  batch_number INTEGER NOT NULL,
  planned_quantity INTEGER NOT NULL,
  relative_time_minutes INTEGER NOT NULL,
  scheduled_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Scheduled' CHECK(status IN ('Scheduled', 'Processing', 'Delivered', 'Failed', 'Cancelled')),
  order_id TEXT REFERENCES orders(id),
  provider_order_id TEXT,
  provider_response TEXT,
  execution_id TEXT UNIQUE,
  executed_at TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  UNIQUE(campaign_id, batch_number)
);

-- 10. Financial Transactions
CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  amount REAL NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('CREDIT', 'DEBIT')),
  description TEXT NOT NULL,
  reference_id TEXT,
  balance_after REAL NOT NULL,
  created_at TEXT NOT NULL
);

-- 11. In-panel Notifications
CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'INFO' CHECK(type IN ('INFO', 'SUCCESS', 'WARNING', 'ERROR')),
  is_read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

-- 12. Admin Settings
CREATE TABLE IF NOT EXISTS admin_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  description TEXT,
  updated_at TEXT NOT NULL
);

-- 13. Audit Logs
CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  details TEXT,
  ip_address TEXT,
  created_at TEXT NOT NULL
);

-- 14. CSV Imports
CREATE TABLE IF NOT EXISTS csv_imports (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  filename TEXT NOT NULL,
  total_rows INTEGER NOT NULL,
  valid_rows INTEGER NOT NULL,
  imported_rows INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING', 'CONFIRMED', 'CANCELLED', 'FAILED')),
  summary TEXT,
  created_at TEXT NOT NULL
);

-- 15. Execution Logs (Worker & Automation Traceability)
CREATE TABLE IF NOT EXISTS execution_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_execution_id TEXT,
  worker_name TEXT NOT NULL,
  campaign_id TEXT,
  batch_id TEXT,
  action TEXT NOT NULL,
  status TEXT NOT NULL,
  provider_id INTEGER,
  request_payload TEXT,
  response_payload TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL
);

-- 16. User Service Mappings for Engagement Automation Slots
CREATE TABLE IF NOT EXISTS user_service_mappings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  service_type TEXT NOT NULL, -- 'views', 'likes', 'saves', 'reposts', 'shares'
  is_enabled INTEGER NOT NULL DEFAULT 1,
  provider_id INTEGER REFERENCES api_providers(id),
  provider_service_id TEXT,
  service_name TEXT,
  rate_per_k REAL DEFAULT 0,
  min_quantity INTEGER DEFAULT 10,
  max_quantity INTEGER DEFAULT 100000,
  updated_at TEXT NOT NULL,
  UNIQUE(user_id, service_type)
);

-- 17. Provider Services Cache for Multi-Provider Cross Search
CREATE TABLE IF NOT EXISTS provider_services_cache (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider_id INTEGER NOT NULL REFERENCES api_providers(id) ON DELETE CASCADE,
  provider_service_id TEXT NOT NULL,
  name TEXT NOT NULL,
  category TEXT,
  type TEXT,
  rate REAL DEFAULT 0,
  min_quantity INTEGER DEFAULT 10,
  max_quantity INTEGER DEFAULT 100000,
  raw_json TEXT,
  synced_at TEXT NOT NULL,
  UNIQUE(provider_id, provider_service_id)
);

-- Indices for high performance
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_campaigns_user_id ON campaigns(user_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_status ON campaigns(status);
CREATE INDEX IF NOT EXISTS idx_batches_campaign_id ON campaign_batches(campaign_id);
CREATE INDEX IF NOT EXISTS idx_batches_status ON campaign_batches(status);
CREATE INDEX IF NOT EXISTS idx_batches_scheduled_at ON campaign_batches(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
`;

module.exports = {
  SCHEMA_SQL
};

