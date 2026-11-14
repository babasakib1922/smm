const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');
const env = require('../config/env');
const { SCHEMA_SQL } = require('./schema');

let dbInstance = null;
let SQL = null;
let isInitialized = false;

// Convert sql.js exec result to array of objects
function resultToObjects(result) {
  if (!result || result.length === 0) return [];
  const { columns, values } = result[0];
  return values.map(row => {
    const obj = {};
    columns.forEach((col, idx) => {
      obj[col] = row[idx];
    });
    return obj;
  });
}

// Persist the database to disk atomically
function saveDatabase() {
  if (!dbInstance) return;
  try {
    const data = dbInstance.export();
    const buffer = Buffer.from(data);
    const dbDir = path.dirname(env.DB_PATH);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }
    fs.writeFileSync(env.DB_PATH, buffer);
  } catch (err) {
    try {
      const data = dbInstance.export();
      const buffer = Buffer.from(data);
      const tempPath = `${env.DB_PATH}.tmp`;
      fs.writeFileSync(tempPath, buffer);
      fs.renameSync(tempPath, env.DB_PATH);
    } catch (e) {
      // Non-blocking on Windows file locks
    }
  }
}

async function initDB() {
  if (isInitialized && dbInstance) return dbInstance;

  SQL = await initSqlJs();
  const dbDir = path.dirname(env.DB_PATH);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  if (fs.existsSync(env.DB_PATH)) {
    const fileBuffer = fs.readFileSync(env.DB_PATH);
    dbInstance = new SQL.Database(fileBuffer);
  } else {
    dbInstance = new SQL.Database();
  }

  // Enable foreign keys
  dbInstance.run('PRAGMA foreign_keys = ON;');

  // Run schema migrations safely
  dbInstance.exec(SCHEMA_SQL);

  // Dynamic migrations for optional campaign likes/saves/reposts/shares tracking
  try {
    const batchCols = query('PRAGMA table_info(campaign_batches);');
    if (!batchCols.some(c => c.name === 'likes_quantity')) {
      dbInstance.run('ALTER TABLE campaign_batches ADD COLUMN likes_quantity INTEGER NOT NULL DEFAULT 0;');
    }
    if (!batchCols.some(c => c.name === 'saves_quantity')) {
      dbInstance.run('ALTER TABLE campaign_batches ADD COLUMN saves_quantity INTEGER NOT NULL DEFAULT 0;');
    }
    if (!batchCols.some(c => c.name === 'reposts_quantity')) {
      dbInstance.run('ALTER TABLE campaign_batches ADD COLUMN reposts_quantity INTEGER NOT NULL DEFAULT 0;');
    }
    if (!batchCols.some(c => c.name === 'shares_quantity')) {
      dbInstance.run('ALTER TABLE campaign_batches ADD COLUMN shares_quantity INTEGER NOT NULL DEFAULT 0;');
    }
  } catch (e) {}

  try {
    const campCols = query('PRAGMA table_info(campaigns);');
    if (!campCols.some(c => c.name === 'total_likes')) {
      dbInstance.run('ALTER TABLE campaigns ADD COLUMN total_likes INTEGER NOT NULL DEFAULT 0;');
    }
    if (!campCols.some(c => c.name === 'likes_waves')) {
      dbInstance.run('ALTER TABLE campaigns ADD COLUMN likes_waves INTEGER NOT NULL DEFAULT 0;');
    }
    if (!campCols.some(c => c.name === 'total_saves')) {
      dbInstance.run('ALTER TABLE campaigns ADD COLUMN total_saves INTEGER NOT NULL DEFAULT 0;');
    }
    if (!campCols.some(c => c.name === 'saves_waves')) {
      dbInstance.run('ALTER TABLE campaigns ADD COLUMN saves_waves INTEGER NOT NULL DEFAULT 0;');
    }
    if (!campCols.some(c => c.name === 'total_reposts')) {
      dbInstance.run('ALTER TABLE campaigns ADD COLUMN total_reposts INTEGER NOT NULL DEFAULT 0;');
    }
    if (!campCols.some(c => c.name === 'reposts_waves')) {
      dbInstance.run('ALTER TABLE campaigns ADD COLUMN reposts_waves INTEGER NOT NULL DEFAULT 0;');
    }
    if (!campCols.some(c => c.name === 'total_shares')) {
      dbInstance.run('ALTER TABLE campaigns ADD COLUMN total_shares INTEGER NOT NULL DEFAULT 0;');
    }
    if (!campCols.some(c => c.name === 'shares_waves')) {
      dbInstance.run('ALTER TABLE campaigns ADD COLUMN shares_waves INTEGER NOT NULL DEFAULT 0;');
    }
  } catch (e) {}

  // Dynamic migrations & seeding for 4 Growth Tiers in packages table
  try {
    const pkgCols = query('PRAGMA table_info(packages);');
    if (!pkgCols.some(c => c.name === 'display_name')) {
      dbInstance.run('ALTER TABLE packages ADD COLUMN display_name TEXT;');
    }
    if (!pkgCols.some(c => c.name === 'badge_text')) {
      dbInstance.run('ALTER TABLE packages ADD COLUMN badge_text TEXT;');
    }
    if (!pkgCols.some(c => c.name === 'subtitle')) {
      dbInstance.run('ALTER TABLE packages ADD COLUMN subtitle TEXT;');
    }
    if (!pkgCols.some(c => c.name === 'features')) {
      dbInstance.run('ALTER TABLE packages ADD COLUMN features TEXT;');
    }
    if (!pkgCols.some(c => c.name === 'default_likes')) {
      dbInstance.run('ALTER TABLE packages ADD COLUMN default_likes INTEGER NOT NULL DEFAULT 0;');
    }
    if (!pkgCols.some(c => c.name === 'likes_waves')) {
      dbInstance.run('ALTER TABLE packages ADD COLUMN likes_waves INTEGER NOT NULL DEFAULT 0;');
    }
    if (!pkgCols.some(c => c.name === 'default_saves')) {
      dbInstance.run('ALTER TABLE packages ADD COLUMN default_saves INTEGER NOT NULL DEFAULT 0;');
    }
    if (!pkgCols.some(c => c.name === 'saves_waves')) {
      dbInstance.run('ALTER TABLE packages ADD COLUMN saves_waves INTEGER NOT NULL DEFAULT 0;');
    }
    if (!pkgCols.some(c => c.name === 'default_reposts')) {
      dbInstance.run('ALTER TABLE packages ADD COLUMN default_reposts INTEGER NOT NULL DEFAULT 0;');
    }
    if (!pkgCols.some(c => c.name === 'reposts_waves')) {
      dbInstance.run('ALTER TABLE packages ADD COLUMN reposts_waves INTEGER NOT NULL DEFAULT 0;');
    }
    if (!pkgCols.some(c => c.name === 'default_shares')) {
      dbInstance.run('ALTER TABLE packages ADD COLUMN default_shares INTEGER NOT NULL DEFAULT 0;');
    }
    if (!pkgCols.some(c => c.name === 'shares_waves')) {
      dbInstance.run('ALTER TABLE packages ADD COLUMN shares_waves INTEGER NOT NULL DEFAULT 0;');
    }

    const tiers = [
      {
        id: 1,
        name: 'TikTok 1st Working 2K',
        display_name: '~2,960 Views',
        badge_text: '5.0 HOURS',
        subtitle: 'Calibrated 5-Hour Organic Pacing for Starter Posts',
        features: 'views,likes',
        total_quantity: 2000,
        total_batches: 16,
        interval_minutes: 20,
        campaign_window_hours: 5,
        default_likes: 41,
        likes_waves: 3,
        default_saves: 0,
        saves_waves: 0,
        default_reposts: 0,
        reposts_waves: 0,
        price: 3.00
      },
      {
        id: 2,
        name: 'TikTok Organic Velocity 5K',
        display_name: '~5,100 Views',
        badge_text: '1 DAY (16H)',
        subtitle: '1-Day FYP Momentum with Smooth Co-Delivered Views, Likes, Saves & Reposts',
        features: 'views,likes,saves,reposts',
        total_quantity: 5150,
        total_batches: 20,
        interval_minutes: 45,
        campaign_window_hours: 16,
        default_likes: 179,
        likes_waves: 14,
        default_saves: 41,
        saves_waves: 4,
        default_reposts: 23,
        reposts_waves: 2,
        price: 7.50
      },
      {
        id: 3,
        name: 'TikTok FYP Breakthrough 10K',
        display_name: '~10,600 Views',
        badge_text: '1 DAY (22H)',
        subtitle: 'Full 24-Hour Virality with High-Retention Saves & Reposts',
        features: 'views,likes,saves,reposts,shares',
        total_quantity: 10590,
        total_batches: 26,
        interval_minutes: 48,
        campaign_window_hours: 22,
        default_likes: 381,
        likes_waves: 24,
        default_saves: 94,
        saves_waves: 8,
        default_reposts: 42,
        reposts_waves: 4,
        default_shares: 46,
        shares_waves: 4,
        price: 15.00
      },
      {
        id: 4,
        name: 'TikTok Viral Mega 50K',
        display_name: '~50,700 Views',
        badge_text: '2 DAYS (48H)',
        subtitle: '2-Day (48-Hour) Full Viral Simulation across International Timezones',
        features: 'views,likes,saves,reposts,shares',
        total_quantity: 50694,
        total_batches: 44,
        interval_minutes: 62,
        campaign_window_hours: 48,
        default_likes: 2028,
        likes_waves: 40,
        default_saves: 443,
        saves_waves: 30,
        default_shares: 176,
        shares_waves: 15,
        default_reposts: 176,
        reposts_waves: 11,
        price: 75.00
      }
    ];

    for (const t of tiers) {
      const existing = queryOne('SELECT id FROM packages WHERE id = ?', [t.id]);
      if (existing) {
        dbInstance.run(
          `UPDATE packages SET 
             name = ?, display_name = ?, badge_text = ?, subtitle = ?, features = ?,
             total_quantity = ?, total_batches = ?, interval_minutes = ?, campaign_window_hours = ?,
             default_likes = ?, likes_waves = ?, default_saves = ?, saves_waves = ?,
             default_reposts = ?, reposts_waves = ?, default_shares = ?, shares_waves = ?, price = ?
           WHERE id = ?`,
          [
            t.name, t.display_name, t.badge_text, t.subtitle, t.features,
            t.total_quantity, t.total_batches, t.interval_minutes, t.campaign_window_hours,
            t.default_likes, t.likes_waves, t.default_saves, t.saves_waves,
            t.default_reposts, t.reposts_waves, t.default_shares || 0, t.shares_waves || 0, t.price,
            t.id
          ]
        );
      } else {
        dbInstance.run(
          `INSERT INTO packages (
             id, name, display_name, badge_text, subtitle, features,
             total_quantity, total_batches, interval_minutes, campaign_window_hours,
             default_likes, likes_waves, default_saves, saves_waves,
             default_reposts, reposts_waves, default_shares, shares_waves, price, is_active, created_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, datetime('now'))`,
          [
            t.id, t.name, t.display_name, t.badge_text, t.subtitle, t.features,
            t.total_quantity, t.total_batches, t.interval_minutes, t.campaign_window_hours,
            t.default_likes, t.likes_waves, t.default_saves, t.saves_waves,
            t.default_reposts, t.reposts_waves, t.default_shares || 0, t.shares_waves || 0, t.price
          ]
        );
      }
    }
  } catch (e) {
    console.error('Packages migration error:', e);
  }

  saveDatabase();

  isInitialized = true;
  return dbInstance;
}

/**
 * Execute a SELECT query and return array of objects
 */
function query(sql, params = []) {
  if (!dbInstance) throw new Error('Database not initialized');
  const stmt = dbInstance.prepare(sql);
  try {
    if (params && params.length > 0) {
      stmt.bind(params);
    }
    const rows = [];
    while (stmt.step()) {
      rows.push(stmt.getAsObject());
    }
    return rows;
  } finally {
    stmt.free();
  }
}

/**
 * Execute a SELECT query and return first object or null
 */
function queryOne(sql, params = []) {
  const rows = query(sql, params);
  return rows.length > 0 ? rows[0] : null;
}

/**
 * Execute an INSERT, UPDATE, or DELETE query and persist
 */
function run(sql, params = []) {
  if (!dbInstance) throw new Error('Database not initialized');
  dbInstance.run(sql, params);
  saveDatabase();

  // Get last insert rowid and changes
  const lastRow = queryOne('SELECT last_insert_rowid() AS id, changes() AS changes');
  return {
    lastInsertRowid: lastRow ? lastRow.id : null,
    changes: lastRow ? lastRow.changes : 0
  };
}

/**
 * Execute arbitrary SQL string (multiple statements)
 */
function exec(sql) {
  if (!dbInstance) throw new Error('Database not initialized');
  dbInstance.exec(sql);
  saveDatabase();
}

/**
 * Run operations inside a transaction
 */
function transaction(callback) {
  if (!dbInstance) throw new Error('Database not initialized');
  dbInstance.run('BEGIN TRANSACTION;');
  try {
    const result = callback({
      query,
      queryOne,
      run: (sql, params = []) => {
        dbInstance.run(sql, params);
        const lastRow = queryOne('SELECT last_insert_rowid() AS id, changes() AS changes');
        return {
          lastInsertRowid: lastRow ? lastRow.id : null,
          changes: lastRow ? lastRow.changes : 0
        };
      }
    });
    dbInstance.run('COMMIT;');
    saveDatabase();
    return result;
  } catch (err) {
    try {
      dbInstance.run('ROLLBACK;');
    } catch (rbErr) {
      console.error('Rollback error:', rbErr.message);
    }
    throw err;
  }
}

module.exports = {
  initDB,
  query,
  queryOne,
  run,
  exec,
  transaction,
  saveDatabase,
  getRawDB: () => dbInstance
};

