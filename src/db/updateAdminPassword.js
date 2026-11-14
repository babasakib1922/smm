const { initDB, query, queryOne, run } = require('./index');
const { hashPassKey } = require('../config/security');

async function updatePassword() {
  await initDB();
  const newHash = await hashPassKey('sakib1922');
  
  // Update admin password
  run("UPDATE users SET pass_key_hash = ? WHERE role = 'ADMIN' OR username = 'admin'", [newHash]);

  // Check if admin user exists, if not create
  let admin = queryOne("SELECT * FROM users WHERE role = 'ADMIN' OR username = 'admin'");
  if (!admin) {
    const now = new Date().toISOString();
    run(
      `INSERT INTO users (username, email, pass_key_hash, role, balance, status, is_protected_admin, created_at)
       VALUES ('admin', 'admin@panel.internal', ?, 'ADMIN', 1000.00, 'ACTIVE', 1, ?)`,
      [newHash, now]
    );
    admin = queryOne("SELECT * FROM users WHERE role = 'ADMIN'");
  }

  console.log('Admin password successfully updated to "sakib1922".');
  console.log('Current Admin record:', JSON.stringify(admin));
}

updatePassword().catch(console.error);

