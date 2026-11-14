window.UserManagementComponent = {
  users: [],

  async render(container) {
    container.innerHTML = '<div style="text-align: center; padding: 40px;">Loading registered user records...</div>';

    let html = `
      <div class="page-header">
        <div>
          <h2>User Management & Roles</h2>
          <p>Administer client accounts, manage balances, inspect API connections, and enforce access control</p>
        </div>
        <div>
          <button class="btn btn-primary" onclick="UserManagementComponent.showCreateUserModal()">+ Create User Account</button>
        </div>
      </div>

      <!-- Admin Protection Rule Reminder -->
      <div class="glass-panel" style="padding: 14px 20px; margin-bottom: 24px; border-left: 4px solid var(--color-warning); font-size: 13px;">
        🛡️ <strong>Admin Account Protection Active:</strong> Administrator accounts are protected against accidental disablement, deletion, or downgrading by other administrators.
      </div>

      <!-- Filters & Search -->
      <div class="glass-panel" style="padding: 18px 24px; margin-bottom: 24px; display: flex; gap: 16px; align-items: center; flex-wrap: wrap;">
        <div style="flex: 1; min-width: 240px;">
          <input type="text" id="admin-user-search" class="form-control" placeholder="Search by username, email, or user ID...">
        </div>
        <div>
          <select id="admin-user-role-filter" class="form-control">
            <option value="">All Roles</option>
            <option value="ADMIN">ADMIN</option>
            <option value="USER">USER</option>
          </select>
        </div>
        <div>
          <select id="admin-user-status-filter" class="form-control">
            <option value="">All Statuses</option>
            <option value="ACTIVE">ACTIVE</option>
            <option value="DISABLED">DISABLED</option>
            <option value="DELETED">DELETED</option>
          </select>
        </div>
        <button id="admin-user-filter-btn" class="btn btn-secondary btn-sm">Filter</button>
      </div>

      <!-- Users Table -->
      <div class="glass-panel" style="padding: 24px;">
        <div class="table-container">
          <table class="data-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Username</th>
                <th>Email</th>
                <th>Role</th>
                <th>Balance</th>
                <th>Status</th>
                <th>Orders</th>
                <th>Connected APIs</th>
                <th>Created Date</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody id="admin-users-tbody">
              <tr><td colspan="10" style="text-align: center; padding: 32px;">Loading users...</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    `;

    container.innerHTML = html;

    document.getElementById('admin-user-filter-btn').addEventListener('click', () => this.loadUsers());
    document.getElementById('admin-user-search').addEventListener('keypress', (e) => {
      if (e.key === 'Enter') this.loadUsers();
    });

    this.loadUsers();
  },

  async loadUsers() {
    const search = document.getElementById('admin-user-search').value.trim();
    const role = document.getElementById('admin-user-role-filter').value;
    const status = document.getElementById('admin-user-status-filter').value;

    const res = await API.get('/api/admin/users', { search, role, status });
    const tbody = document.getElementById('admin-users-tbody');

    if (!res.success) {
      tbody.innerHTML = `<tr><td colspan="10" style="color: var(--color-danger); text-align: center;">${res.error}</td></tr>`;
      return;
    }

    this.users = res.users;
    if (this.users.length === 0) {
      tbody.innerHTML = '<tr><td colspan="10" style="text-align: center; color: var(--text-dim); padding: 32px;">No matching users found.</td></tr>';
      return;
    }

    tbody.innerHTML = this.users.map(u => {
      const isSelf = App.user && App.user.id === u.id;
      const isAdminUser = u.role === 'ADMIN';

      return `
        <tr>
          <td style="font-weight: 700;">#${u.id}</td>
          <td style="font-weight: 600;">
            ${u.username}
            ${u.is_protected_admin ? '<span title="Protected Admin" style="font-size: 11px;"> 🛡️</span>' : ''}
          </td>
          <td style="font-size: 13px; color: var(--text-muted);">${u.email}</td>
          <td><span class="role-tag ${u.role.toLowerCase()}">${u.role}</span></td>
          <td style="font-weight: 700; color: var(--color-success);">$${u.balance.toFixed(2)}</td>
          <td><span class="status-pill ${u.status.toLowerCase()}">${u.status}</span></td>
          <td>${u.total_orders || 0}</td>
          <td>${u.connected_apis > 0 ? `<span class="status-pill connected">${u.connected_apis} connected</span>` : '<span style="color: var(--text-dim); font-size: 12px;">None</span>'}</td>
          <td style="font-size: 12px; color: var(--text-muted);">${new Date(u.created_at).toLocaleDateString()}</td>
          <td>
            <div style="display: flex; gap: 6px; align-items: center;">
              <button class="btn btn-secondary btn-sm" onclick="UserManagementComponent.viewUserProfile(${u.id})">🔍 View APIs & Info</button>
              
              <!-- Enable / Disable Button with Admin Protection -->
              ${!isAdminUser && u.status === 'ACTIVE' ? `
                <button class="btn btn-danger btn-sm" onclick="UserManagementComponent.toggleStatus(${u.id}, 'DISABLED')">Disable</button>
              ` : !isAdminUser && u.status === 'DISABLED' ? `
                <button class="btn btn-success btn-sm" onclick="UserManagementComponent.toggleStatus(${u.id}, 'ACTIVE')">Enable</button>
              ` : ''}

              <!-- Delete Button with Admin Protection -->
              ${!isAdminUser && u.status !== 'DELETED' ? `
                <button class="btn btn-danger btn-sm" onclick="UserManagementComponent.deleteUser(${u.id}, '${u.username}')">🗑️ Delete</button>
              ` : ''}
            </div>
          </td>
        </tr>
      `;
    }).join('');
  },

  showCreateUserModal() {
    App.showModal(`
      <div class="modal-header">
        <h3>Create New User Account</h3>
        <button class="modal-close" onclick="App.closeModal()">✕</button>
      </div>

      <form id="create-user-form">
        <div class="form-group">
          <label class="form-label">Username</label>
          <input type="text" id="new-user-username" class="form-control" placeholder="Enter unique username" required>
        </div>

        <div class="form-group">
          <label class="form-label">Email Address</label>
          <input type="email" id="new-user-email" class="form-control" placeholder="user@domain.com" required>
        </div>

        <div class="form-group">
          <label class="form-label">Access Pass Key</label>
          <input type="text" id="new-user-passkey" class="form-control" placeholder="Generate or enter secure pass key" required>
          <span style="font-size: 11px; color: var(--text-dim);">Users require this pass key to log in to the private panel.</span>
        </div>

        <div class="form-group">
          <label class="form-label">Account Role</label>
          <select id="new-user-role" class="form-control">
            <option value="USER">USER</option>
            <option value="ADMIN">ADMIN</option>
          </select>
        </div>

        <div class="form-group">
          <label class="form-label">Initial Balance ($)</label>
          <input type="number" step="0.01" id="new-user-balance" class="form-control" value="0.00" min="0">
        </div>

        <div style="display: flex; gap: 12px; justify-content: flex-end; margin-top: 24px;">
          <button type="button" class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
          <button type="submit" class="btn btn-primary">Create Account</button>
        </div>
      </form>
    `);

    document.getElementById('create-user-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const username = document.getElementById('new-user-username').value.trim();
      const email = document.getElementById('new-user-email').value.trim();
      const passKey = document.getElementById('new-user-passkey').value.trim();
      const role = document.getElementById('new-user-role').value;
      const initialBalance = parseFloat(document.getElementById('new-user-balance').value) || 0;

      const res = await API.post('/api/admin/users', {
        username,
        email,
        passKey,
        role,
        initialBalance
      });

      App.closeModal();

      if (res.success) {
        API.showToast(res.message, 'success');
        this.loadUsers();
      } else {
        API.showToast(res.error || 'Failed to create user', 'error');
      }
    });
  },

  async viewUserProfile(userId) {
    const res = await API.get(`/api/admin/users/${userId}`);
    if (!res.success) {
      API.showToast(res.error || 'Failed to load profile', 'error');
      return;
    }

    const { user, orders, credentials, transactions } = res;
    App.showModal(`
      <div class="modal-header">
        <h3>User Profile: ${user.username}</h3>
        <button class="modal-close" onclick="App.closeModal()">✕</button>
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; font-size: 13px; margin-bottom: 20px;">
        <div>User ID: <strong>#${user.id}</strong></div>
        <div>Email: <strong>${user.email}</strong></div>
        <div>Role: <span class="role-tag ${user.role.toLowerCase()}">${user.role}</span></div>
        <div>Status: <span class="status-pill ${user.status.toLowerCase()}">${user.status}</span></div>
        <div>Current Balance: <strong style="color: var(--color-success); font-size: 15px;">$${user.balance.toFixed(2)}</strong></div>
        <div>Created: <strong>${new Date(user.created_at).toLocaleString()}</strong></div>
        <div>Last Login: <strong>${user.last_login_at ? new Date(user.last_login_at).toLocaleString() : 'Never'}</strong></div>
        <div>Last Login IP: <code>${user.last_login_ip || 'None'}</code></div>
      </div>

      <h4 style="font-size: 14px; margin-bottom: 8px;">Connected API Integrations (${credentials.length})</h4>
      <div style="margin-bottom: 20px;">
        ${credentials.length > 0 ? credentials.map(c => `
          <div style="padding: 8px 12px; background: rgba(255,255,255,0.03); border-radius: var(--radius-sm); margin-bottom: 6px; display: flex; justify-content: space-between; font-size: 12px;">
            <span>${c.provider_name} (<code>${c.masked_key}</code>)</span>
            <span class="status-pill ${c.connection_status.toLowerCase()}">${c.connection_status}</span>
          </div>
        `).join('') : '<div style="font-size: 12px; color: var(--text-dim);">No API credentials connected by this user.</div>'}
      </div>

      <div style="display: flex; justify-content: flex-end;">
        <button class="btn btn-secondary" onclick="App.closeModal()">Close</button>
      </div>
    `);
  },

  showBalanceModal(userId, username, currentBalance) {
    App.showModal(`
      <div class="modal-header">
        <h3>Adjust Balance: ${username}</h3>
        <button class="modal-close" onclick="App.closeModal()">✕</button>
      </div>

      <form id="adjust-balance-form">
        <div style="font-size: 14px; margin-bottom: 16px;">
          Current Balance: <strong style="color: var(--color-success);">$${currentBalance.toFixed(2)}</strong>
        </div>

        <div class="form-group">
          <label class="form-label">Adjustment Type</label>
          <select id="adj-type" class="form-control">
            <option value="CREDIT">CREDIT (+ Add Funds)</option>
            <option value="DEBIT">DEBIT (- Deduct Funds)</option>
          </select>
        </div>

        <div class="form-group">
          <label class="form-label">Amount ($)</label>
          <input type="number" step="0.01" id="adj-amount" class="form-control" placeholder="0.00" required min="0.01">
        </div>

        <div class="form-group">
          <label class="form-label">Reason / Audit Note</label>
          <input type="text" id="adj-reason" class="form-control" placeholder="e.g. Bank deposit reference #9921" required>
        </div>

        <div style="display: flex; gap: 12px; justify-content: flex-end; margin-top: 24px;">
          <button type="button" class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
          <button type="submit" class="btn btn-primary">Save Adjustment</button>
        </div>
      </form>
    `);

    document.getElementById('adjust-balance-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const type = document.getElementById('adj-type').value;
      const amount = parseFloat(document.getElementById('adj-amount').value);
      const reason = document.getElementById('adj-reason').value.trim();

      const res = await API.post(`/api/admin/users/${userId}/balance`, {
        amount,
        type,
        reason
      });

      App.closeModal();

      if (res.success) {
        API.showToast(res.message, 'success');
        this.loadUsers();
      } else {
        API.showToast(res.error || 'Failed to adjust balance', 'error');
      }
    });
  },

  async toggleStatus(userId, newStatus) {
    if (!confirm(`Are you sure you want to change user #${userId} status to ${newStatus}?`)) return;

    const res = await API.put(`/api/admin/users/${userId}/status`, { status: newStatus });
    if (res.success) {
      API.showToast(res.message, 'success');
      this.loadUsers();
    } else {
      API.showToast(res.error || 'Failed to update user status', 'error');
    }
  },

  async deleteUser(userId, username) {
    if (!confirm(`CRITICAL WARNING: Are you sure you want to permanently delete user "${username}"? Active sessions will be revoked immediately and access blocked.`)) return;

    const res = await API.del(`/api/admin/users/${userId}`);
    if (res.success) {
      API.showToast(res.message, 'success');
      this.loadUsers();
    } else {
      API.showToast(res.error || 'Failed to delete user', 'error');
    }
  }
};

