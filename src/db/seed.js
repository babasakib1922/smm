const { query, queryOne, run } = require('./index');
const { hashPassKey, encryptText, maskApiKey } = require('../config/security');

async function seedData() {
  const now = new Date().toISOString();

  // 1. Seed or Update Protected Admin with passKey "1922"
  const adminPassHash = await hashPassKey('1922');
  const adminExists = queryOne("SELECT * FROM users WHERE role = 'ADMIN' LIMIT 1");
  if (!adminExists) {
    run(
      `INSERT INTO users (username, email, pass_key_hash, role, balance, status, is_protected_admin, created_at)
       VALUES (?, ?, ?, 'ADMIN', 1000.00, 'ACTIVE', 1, ?)`,
      ['admin', 'admin@panel.internal', adminPassHash, now]
    );
    console.log('Default Protected Admin seeded: username="admin", passKey="1922"');
  } else {
    // Always keep admin pass key hash synchronized to 1922
    run("UPDATE users SET pass_key_hash = ? WHERE role = 'ADMIN'", [adminPassHash]);
  }

  // 2. Seed Default User ONCE on fresh install (do not resurrect if deleted)
  const seedRecord = queryOne("SELECT value FROM admin_settings WHERE key = 'demo_user_seed_completed'");
  if (!seedRecord) {
    const userExists = queryOne("SELECT * FROM users WHERE role = 'USER' LIMIT 1");
    if (!userExists) {
      const userPassHash = await hashPassKey('user12345pass');
      run(
        `INSERT INTO users (username, email, pass_key_hash, role, balance, status, is_protected_admin, created_at)
         VALUES (?, ?, ?, 'USER', 250.00, 'ACTIVE', 0, ?)`,
        ['client_demo', 'demo@client.internal', userPassHash, now]
      );
      console.log('Default User seeded: username="client_demo", passKey="user12345pass"');
    }
    run("INSERT OR REPLACE INTO admin_settings (key, value, updated_at) VALUES ('demo_user_seed_completed', '1', ?)", [now]);
  }

  // 3. Seed API Providers
  const providers = [
    {
      name: 'Zeofame',
      slug: 'zeofame',
      api_url: 'https://api.zeofame.com/v2',
      adapter_type: 'standard_smm_v2',
      description: 'Authorized likes provider (Service ID 1123)'
    },
    {
      name: 'Xmedia',
      slug: 'xmedia',
      api_url: 'https://api.xmedia.com/v2',
      adapter_type: 'standard_smm_v2',
      description: 'Authorized views provider (Service ID 10322)'
    },
    {
      name: 'Internal Mock Provider',
      slug: 'mock-provider',
      api_url: 'internal://mock-provider/v2',
      adapter_type: 'mock_provider',
      description: 'Instant local sandbox provider for testing orders and scheduler'
    }
  ];

  for (const p of providers) {
    const existing = queryOne('SELECT id FROM api_providers WHERE slug = ?', [p.slug]);
    if (!existing) {
      run(
        `INSERT INTO api_providers (name, slug, api_url, adapter_type, is_active, description, created_at)
         VALUES (?, ?, ?, ?, 1, ?, ?)`,
        [p.name, p.slug, p.api_url, p.adapter_type, p.description, now]
      );
    }
  }

  // 4. Seed User API Credentials (for client_demo with mock provider)
  const clientUser = queryOne("SELECT id FROM users WHERE username = 'client_demo'");
  const mockProvider = queryOne("SELECT id FROM api_providers WHERE slug = 'mock-provider'");
  const xmediaProvider = queryOne("SELECT id FROM api_providers WHERE slug = 'xmedia'");
  const zeofameProvider = queryOne("SELECT id FROM api_providers WHERE slug = 'zeofame'");

  if (clientUser && mockProvider) {
    const existingCred = queryOne('SELECT id FROM user_api_credentials WHERE user_id = ? AND provider_id = ?', [clientUser.id, mockProvider.id]);
    if (!existingCred) {
      const { encrypted, iv, authTag } = encryptText('mock_api_key_demo_secure_key_123');
      run(
        `INSERT INTO user_api_credentials (user_id, provider_id, encrypted_api_key, iv, auth_tag, masked_key, api_endpoint, connection_status, last_checked_at, reported_balance)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'CONNECTED', ?, 500.00)`,
        [clientUser.id, mockProvider.id, encrypted, iv, authTag, maskApiKey('mock_api_key_demo_secure_key_123'), 'internal://mock-provider/v2', now]
      );
    }
  }

  // 5. Seed Services
  const defaultServices = [
    {
      code: 'SRV-XMEDIA-VIEWS',
      name: 'Xmedia High Retention Views',
      category: 'Views',
      provider_slug: 'xmedia',
      provider_service_id: '10322',
      min_quantity: 100,
      max_quantity: 1000000,
      price_per_k: 1.50,
      description: 'Fast, high-retention video views delivered according to platform policies.',
      delivery_settings: JSON.stringify({ speed: 'gradual', drip_feed: true })
    },
    {
      code: 'SRV-ZEOFAME-LIKES',
      name: 'Zeofame Quality Likes',
      category: 'Likes',
      provider_slug: 'zeofame',
      provider_service_id: '1123',
      min_quantity: 50,
      max_quantity: 500000,
      price_per_k: 2.00,
      description: 'Authorized likes delivery compliant with standard platform limits.',
      delivery_settings: JSON.stringify({ speed: 'natural' })
    },
    {
      code: 'SRV-MOCK-VIEWS',
      name: 'Sandbox Views (Fast Test)',
      category: 'Views',
      provider_slug: 'mock-provider',
      provider_service_id: '9901',
      min_quantity: 10,
      max_quantity: 100000,
      price_per_k: 1.00,
      description: 'Instant sandbox testing service for automated batch execution and order testing.',
      delivery_settings: JSON.stringify({ mode: 'simulation' })
    }
  ];

  for (const s of defaultServices) {
    const existing = queryOne('SELECT id FROM services WHERE service_id_code = ?', [s.code]);
    if (!existing) {
      const prov = queryOne('SELECT id FROM api_providers WHERE slug = ?', [s.provider_slug]);
      if (prov) {
        run(
          `INSERT INTO services (service_id_code, name, category, provider_id, provider_service_id, min_quantity, max_quantity, price_per_k, description, delivery_settings, is_active, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
          [s.code, s.name, s.category, prov.id, s.provider_service_id, s.min_quantity, s.max_quantity, s.price_per_k, s.description, s.delivery_settings, now]
        );
      }
    }
  }

  // 6. Seed Packages (Section 8 exact specifications & reference design tiers)
  // Delete old placeholder packages if any
  try {
    run("DELETE FROM packages WHERE name IN ('2K Views', '5K Views', '10K Views', '50K Views')");
  } catch (e) {}

  const defaultPackages = [
    {
      id: 1,
      name: 'TikTok 1st Working 2K',
      display_name: '~2,960 Views',
      badge_text: '5.0 HOURS',
      subtitle: 'Calibrated 5-Hour Organic Pacing for Starter Posts',
      features: 'views,likes',
      category: 'Views',
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
      price: 3.00,
      service_code: 'SRV-XMEDIA-VIEWS'
    },
    {
      id: 2,
      name: 'TikTok Organic Velocity 5K',
      display_name: '~5,100 Views',
      badge_text: '1 DAY (16H)',
      subtitle: '1-Day FYP Momentum with Smooth Co-Delivered Views, Likes, Saves & Reposts',
      features: 'views,likes,saves,reposts',
      category: 'Views',
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
      price: 7.50,
      service_code: 'SRV-XMEDIA-VIEWS'
    },
    {
      id: 3,
      name: 'TikTok FYP Breakthrough 10K',
      display_name: '~10,600 Views',
      badge_text: '1 DAY (22H)',
      subtitle: 'Full 24-Hour Virality with High-Retention Saves & Reposts',
      features: 'views,likes,saves,reposts,shares',
      category: 'Views',
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
      price: 15.00,
      service_code: 'SRV-XMEDIA-VIEWS'
    },
    {
      id: 4,
      name: 'TikTok Viral Mega 50K',
      display_name: '~50,700 Views',
      badge_text: '2 DAYS (48H)',
      subtitle: '2-Day (48-Hour) Full Viral Simulation across International Timezones',
      features: 'views,likes,saves,reposts,shares',
      category: 'Views',
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
      price: 75.00,
      service_code: 'SRV-XMEDIA-VIEWS'
    }
  ];

  for (const pkg of defaultPackages) {
    const existing = queryOne('SELECT id FROM packages WHERE id = ?', [pkg.id]);
    const srv = queryOne('SELECT id FROM services WHERE service_id_code = ?', [pkg.service_code]);
    if (existing) {
      run(
        `UPDATE packages SET 
           name = ?, display_name = ?, badge_text = ?, subtitle = ?, features = ?,
           total_quantity = ?, total_batches = ?, interval_minutes = ?, campaign_window_hours = ?,
           default_likes = ?, likes_waves = ?, default_saves = ?, saves_waves = ?,
           default_reposts = ?, reposts_waves = ?, default_shares = ?, shares_waves = ?, price = ?, service_id = ?
         WHERE id = ?`,
        [
          pkg.name, pkg.display_name, pkg.badge_text, pkg.subtitle, pkg.features,
          pkg.total_quantity, pkg.total_batches, pkg.interval_minutes, pkg.campaign_window_hours,
          pkg.default_likes, pkg.likes_waves, pkg.default_saves, pkg.saves_waves,
          pkg.default_reposts, pkg.reposts_waves, pkg.default_shares || 0, pkg.shares_waves || 0, pkg.price, srv ? srv.id : null,
          pkg.id
        ]
      );
    } else {
      run(
        `INSERT INTO packages (id, name, display_name, badge_text, subtitle, features, category, total_quantity, total_batches, interval_minutes, campaign_window_hours, default_likes, likes_waves, default_saves, saves_waves, default_reposts, reposts_waves, default_shares, shares_waves, service_id, price, is_active, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
        [
          pkg.id, pkg.name, pkg.display_name, pkg.badge_text, pkg.subtitle, pkg.features, pkg.category,
          pkg.total_quantity, pkg.total_batches, pkg.interval_minutes, pkg.campaign_window_hours,
          pkg.default_likes, pkg.likes_waves, pkg.default_saves, pkg.saves_waves,
          pkg.default_reposts, pkg.reposts_waves, pkg.default_shares || 0, pkg.shares_waves || 0, srv ? srv.id : null, pkg.price, now
        ]
      );
    }
  }

  // 7. Seed Admin Settings
  const settings = [
    { key: 'site_name', value: 'Nexus SMM Automation Panel', description: 'Panel Name' },
    { key: 'maintenance_mode', value: 'false', description: 'Enable/disable panel maintenance mode' },
    { key: 'engagement_views_provider', value: 'xmedia', description: 'Default Engagement tab views provider' },
    { key: 'engagement_views_service_id', value: '10322', description: 'Default Engagement tab views service ID' },
    { key: 'engagement_likes_provider', value: 'zeofame', description: 'Default Engagement tab likes provider' },
    { key: 'engagement_likes_service_id', value: '1123', description: 'Default Engagement tab likes service ID' },
    { key: 'worker_interval_seconds', value: '60', description: 'Drip queue check interval in seconds (60s = 1 check per minute, 1,440 checks daily)' },
    { key: 'max_batch_retries', value: '3', description: 'Max retry attempts per failed campaign batch' }
  ];

  for (const st of settings) {
    const existing = queryOne('SELECT key, value FROM admin_settings WHERE key = ?', [st.key]);
    if (!existing) {
      run(
        'INSERT INTO admin_settings (key, value, description, updated_at) VALUES (?, ?, ?, ?)',
        [st.key, st.value, st.description, now]
      );
    } else if (st.key === 'worker_interval_seconds' && existing.value === '10') {
      run(
        'UPDATE admin_settings SET value = ?, description = ?, updated_at = ? WHERE key = ?',
        ['60', st.description, now, st.key]
      );
    }
  }

  console.log('Database seeded successfully.');
}

module.exports = {
  seedData
};

