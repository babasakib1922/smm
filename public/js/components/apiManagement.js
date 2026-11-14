window.ApiManagementComponent = {
  providers: [],
  credentials: [],

  async render(container) {
    container.innerHTML = '<div style="text-align: center; padding: 40px;">Loading API configurations...</div>';

    const [provRes, credRes] = await Promise.all([
      API.get('/api/api-configs/providers'),
      API.get('/api/api-configs/user-credentials')
    ]);

    if (!provRes.success || !credRes.success) {
      container.innerHTML = `<div class="glass-panel" style="padding: 24px; color: var(--color-danger);">Failed to load API configurations.</div>`;
      return;
    }

    this.providers = provRes.providers;
    this.credentials = credRes.credentials;

    let html = `
      <div class="page-header">
        <div>
          <h2>🔑 API Manage</h2>
          <p>Connect and manage multiple SMM panel API providers with AES-256 encryption</p>
        </div>
        <div style="display: flex; gap: 10px;">
          <button class="btn btn-secondary" onclick="App.navigate('service-manage')">🛠️ Go to Service Manage ➔</button>
          <button class="btn btn-primary" onclick="ApiManagementComponent.showConnectModal()">+ Connect SMM API Key</button>
        </div>
      </div>

      <!-- Security Notice Banner -->
      <div class="glass-panel" style="padding: 16px 20px; margin-bottom: 24px; border-left: 4px solid var(--accent-primary); display: flex; align-items: center; justify-content: space-between;">
        <div style="font-size: 13px;">
          🔒 <strong>Live Balance & Zero Markup:</strong> When you connect your SMM API key, your external SMM panel's real-time balance is displayed in the header. Orders submitted in the Engagement tab execute directly using your connected key with zero fees!
        </div>
      </div>

      <!-- User Connected Credentials Table -->
      <div class="glass-panel" style="padding: 24px; margin-bottom: 32px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
          <h3 style="font-size: 16px;">Your Connected SMM Provider Credentials</h3>
          <button class="btn btn-secondary btn-sm" onclick="ApiManagementComponent.render(document.getElementById('page-content'))">🔄 Refresh List</button>
        </div>

        <div class="table-container">
          <table class="data-table">
            <thead>
              <tr>
                <th>Provider Name</th>
                <th>API Endpoint</th>
                <th>Masked Key</th>
                <th>Connection Status</th>
                <th>Reported Balance</th>
                <th>Last Checked</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              ${this.credentials.length > 0 ? this.credentials.map(c => `
                <tr>
                  <td style="font-weight: 700;">${c.provider_name}</td>
                  <td style="font-size: 12px; font-family: monospace; color: var(--text-muted); max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                    ${c.api_endpoint || c.default_endpoint}
                  </td>
                  <td><code>${c.masked_key}</code></td>
                  <td><span class="status-pill ${c.connection_status.toLowerCase()}">${c.connection_status}</span></td>
                  <td style="font-weight: 700; color: var(--color-success); font-size: 15px;">
                    ${c.reported_balance !== null ? `$${parseFloat(c.reported_balance).toFixed(2)}` : '$0.00'}
                  </td>
                  <td style="font-size: 12px; color: var(--text-muted);">${c.last_checked_at ? new Date(c.last_checked_at).toLocaleTimeString() : 'Never'}</td>
                  <td>
                    <div style="display: flex; gap: 6px;">
                      <button class="btn btn-secondary btn-sm" onclick="ApiManagementComponent.testConnection(${c.id})">⚡ Test & Sync</button>
                      <button class="btn btn-danger btn-sm" onclick="ApiManagementComponent.disconnectCredential(${c.id})">🗑️ Disconnect</button>
                    </div>
                  </td>
                </tr>
              `).join('') : `
                <tr><td colspan="7" style="text-align: center; color: var(--text-dim); padding: 36px;">No API credentials connected yet. Click "+ Connect SMM API Key" above to link your provider.</td></tr>
              `}
            </tbody>
          </table>
        </div>
      </div>

      <!-- Available System Providers -->
      <div class="glass-panel" style="padding: 24px;">
        <h3 style="font-size: 16px; margin-bottom: 16px;">Supported SMM Platforms</h3>
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px;">
          ${this.providers.map(p => `
            <div style="padding: 16px; background: #f8f8f8; border-radius: var(--radius-sm); border: 1px solid var(--border-glass);">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                <h4 style="font-size: 15px;">${p.name}</h4>
                <span class="status-pill ${p.is_active ? 'active' : 'disabled'}">${p.is_active ? 'Supported' : 'Disabled'}</span>
              </div>
              <p style="font-size: 12px; color: var(--text-muted); margin-bottom: 12px;">${p.description || 'Standard SMM v2 API integration'}</p>
              <div style="font-size: 11px; font-family: monospace; color: var(--text-dim); word-break: break-all;">Endpoint: ${p.api_url}</div>
            </div>
          `).join('')}
        </div>
      </div>
    `;

    container.innerHTML = html;
  },

  showConnectModal() {
    App.showModal(`
      <div class="modal-header">
        <h3>Connect SMM API Credentials</h3>
        <button class="modal-close" onclick="App.closeModal()">✕</button>
      </div>

      <form id="connect-api-form">
        <div class="form-group">
          <label class="form-label">Select API Provider</label>
          <select id="connect-provider-id" class="form-control" required>
            ${this.providers.map(p => `<option value="${p.id}">${p.name} (${p.slug})</option>`).join('')}
            <option value="custom">➕ Add Any Custom SMM Panel (Enter URL)</option>
          </select>
        </div>

        <div id="custom-provider-fields" style="display: none; background: rgba(59, 130, 246, 0.05); border: 1px solid rgba(59, 130, 246, 0.2); border-radius: 8px; padding: 14px; margin-bottom: 16px;">
          <div class="form-group">
            <label class="form-label">Custom Panel Name</label>
            <input type="text" id="connect-custom-name" class="form-control" placeholder="e.g. My Custom SMM Provider">
          </div>
          <div class="form-group" style="margin-bottom: 0;">
            <label class="form-label">Panel API URL</label>
            <input type="url" id="connect-custom-url" class="form-control" placeholder="https://mypanel.com/api/v2">
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">Your Private API Key</label>
          <input type="password" id="connect-api-key" class="form-control" placeholder="Paste your SMM panel API key" required autofocus>
          <span style="font-size: 11px; color: var(--text-dim);">Stored securely using AES-256-GCM encryption. Never shared with others.</span>
        </div>

        <div class="form-group" id="endpoint-override-group">
          <label class="form-label">Custom API Endpoint (Optional)</label>
          <input type="url" id="connect-api-endpoint" class="form-control" placeholder="Leave blank to use default provider endpoint">
        </div>

        <div style="display: flex; gap: 12px; justify-content: flex-end; margin-top: 24px;">
          <button type="button" class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
          <button type="submit" class="btn btn-primary">Encrypt & Save Key</button>
        </div>
      </form>
    `);

    const provSelect = document.getElementById('connect-provider-id');
    const customFields = document.getElementById('custom-provider-fields');
    const overrideGroup = document.getElementById('endpoint-override-group');

    provSelect.addEventListener('change', () => {
      if (provSelect.value === 'custom') {
        customFields.style.display = 'block';
        overrideGroup.style.display = 'none';
      } else {
        customFields.style.display = 'none';
        overrideGroup.style.display = 'block';
      }
    });

    document.getElementById('connect-api-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const val = provSelect.value;
      const apiKey = document.getElementById('connect-api-key').value.trim();

      let payload = { apiKey };

      if (val === 'custom') {
        const customName = document.getElementById('connect-custom-name').value.trim() || 'Custom SMM Panel';
        const customUrl = document.getElementById('connect-custom-url').value.trim();
        if (!customUrl) {
          API.showToast('Please enter the Custom Panel API URL', 'error');
          return;
        }
        payload.providerId = 'custom';
        payload.customProviderName = customName;
        payload.apiEndpoint = customUrl;
      } else {
        payload.providerId = parseInt(val, 10);
        payload.apiEndpoint = document.getElementById('connect-api-endpoint').value.trim() || null;
      }

      API.showToast('Connecting and validating API key with provider...', 'info');

      const res = await API.post('/api/api-configs/user-credentials', payload);

      App.closeModal();

      if (res.success) {
        API.showToast(res.message, 'success');
        await App.loadUser();
        App.updateBalanceDisplay();
        this.render(document.getElementById('page-content'));
      } else {
        API.showToast(res.error || 'Failed to connect API', 'error');
      }
    });
  },

  async testConnection(credId) {
    API.showToast('Testing provider connection and syncing balance...', 'info');
    const res = await API.post(`/api/api-configs/user-credentials/${credId}/test`);
    if (res.success) {
      API.showToast(res.message, 'success');
      await App.loadUser();
      App.updateBalanceDisplay();
      this.render(document.getElementById('page-content'));
    } else {
      API.showToast(res.error || 'Connection failed', 'error');
      this.render(document.getElementById('page-content'));
    }
  },

  async disconnectCredential(credId) {
    if (!confirm('Are you sure you want to disconnect and delete this API key?')) return;

    const res = await API.delete(`/api/api-configs/user-credentials/${credId}`);
    if (res.success) {
      API.showToast(res.message, 'success');
      await App.loadUser();
      App.updateBalanceDisplay();
      this.render(document.getElementById('page-content'));
    } else {
      API.showToast(res.error || 'Failed to disconnect API credential', 'error');
    }
  }
};
