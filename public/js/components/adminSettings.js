window.AdminSettingsComponent = {
  settings: [],
  packages: [],

  async render(container) {
    container.innerHTML = '<div style="text-align: center; padding: 40px;">Loading Admin Settings...</div>';

    const [setRes, auditRes, execRes] = await Promise.all([
      API.get('/api/admin/settings'),
      API.get('/api/admin/settings/audit-logs'),
      API.get('/api/admin/settings/execution-logs')
    ]);

    if (!setRes.success) {
      container.innerHTML = `<div class="glass-panel" style="padding: 24px; color: var(--color-danger);">${setRes.error}</div>`;
      return;
    }

    this.settings = setRes.settings;
    this.packages = setRes.packages;
    const auditLogs = auditRes.success ? auditRes.logs : [];
    const execLogs = execRes.success ? execRes.logs : [];

    let html = `
      <div class="page-header">
        <div>
          <h2>Platform Administration & System Settings</h2>
          <p>Configure packages, automation intervals, provider mappings, and inspect execution logs</p>
        </div>
      </div>

      <!-- Configurable Package Scheduler Definitions (Section 8 & 19) -->
      <div class="glass-panel" style="padding: 24px; margin-bottom: 32px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
          <div>
            <h3 style="font-size: 16px;">Campaign Scheduler Package Rules</h3>
            <p style="font-size: 12px; color: var(--text-muted); margin-top: 2px;">
              Manage package parameters persistently. Changes immediately take effect in the scheduler engine without requiring code changes.
            </p>
          </div>
        </div>

        <div class="table-container">
          <table class="data-table">
            <thead>
              <tr>
                <th>Package Name</th>
                <th>Total Volume</th>
                <th>Total Batches</th>
                <th>Interval (Mins)</th>
                <th>Campaign Window (Hours)</th>
                <th>Tool Access</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              ${this.packages.map(p => `
                <tr>
                  <td style="font-weight: 700;">${p.name}</td>
                  <td>${p.total_quantity.toLocaleString()}</td>
                  <td><strong>${p.total_batches}</strong></td>
                  <td><strong>${p.interval_minutes} mins</strong></td>
                  <td><strong>${p.campaign_window_hours} hours</strong></td>
                  <td><span class="status-pill completed">100% Free Tool</span></td>
                  <td>
                    <button class="btn btn-secondary btn-sm" onclick="AdminSettingsComponent.editPackageModal(${p.id})">Edit Config</button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>

      <!-- General System Settings Grid -->
      <div class="glass-panel" style="padding: 24px; margin-bottom: 32px;">
        <h3 style="font-size: 16px; margin-bottom: 16px;">System Parameters</h3>

        <form id="system-settings-form">
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
            ${this.settings.map(s => `
              <div class="form-group">
                <label class="form-label">${s.description || s.key} <code>(${s.key})</code></label>
                <input type="text" class="form-control setting-input" data-key="${s.key}" value="${s.value}">
              </div>
            `).join('')}
          </div>

          <div style="margin-top: 16px; display: flex; justify-content: flex-end;">
            <button type="submit" class="btn btn-primary">Save System Parameters</button>
          </div>
        </form>
      </div>

      <!-- Automation Worker Execution Logs (Section 10 & 11) -->
      <div class="glass-panel" style="padding: 24px; margin-bottom: 32px;">
        <h3 style="font-size: 16px; margin-bottom: 16px;">Automation Worker Execution & Idempotency Logs</h3>
        <div class="table-container" style="max-height: 280px; overflow-y: auto;">
          <table class="data-table">
            <thead>
              <tr>
                <th>Execution ID</th>
                <th>Worker</th>
                <th>Campaign</th>
                <th>Action</th>
                <th>Status</th>
                <th>Time (UTC)</th>
              </tr>
            </thead>
            <tbody>
              ${execLogs.length > 0 ? execLogs.map(e => `
                <tr>
                  <td style="font-family: monospace; font-size: 11px;">${e.batch_execution_id}</td>
                  <td><span class="status-pill info" style="font-size: 11px;">${e.worker_name}</span></td>
                  <td>${e.campaign_name || e.campaign_id || '-'}</td>
                  <td style="font-size: 12px;">${e.action}</td>
                  <td><span class="status-pill ${e.status.toLowerCase()}">${e.status}</span></td>
                  <td style="font-size: 11px; color: var(--text-muted);">${new Date(e.created_at).toLocaleString()}</td>
                </tr>
              `).join('') : `
                <tr><td colspan="6" style="text-align: center; color: var(--text-dim); padding: 24px;">No execution logs recorded yet.</td></tr>
              `}
            </tbody>
          </table>
        </div>
      </div>

      <!-- Audit Trail Table -->
      <div class="glass-panel" style="padding: 24px;">
        <h3 style="font-size: 16px; margin-bottom: 16px;">Administrative Audit Trail</h3>
        <div class="table-container" style="max-height: 280px; overflow-y: auto;">
          <table class="data-table">
            <thead>
              <tr>
                <th>Date & Time</th>
                <th>Administrator</th>
                <th>Action</th>
                <th>Target</th>
                <th>IP Address</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              ${auditLogs.map(a => `
                <tr>
                  <td style="font-size: 12px; color: var(--text-muted);">${new Date(a.created_at).toLocaleString()}</td>
                  <td style="font-weight: 600;">${a.admin_username || 'System'}</td>
                  <td><span class="status-pill info">${a.action}</span></td>
                  <td>${a.target_type} #${a.target_id}</td>
                  <td style="font-family: monospace; font-size: 11px;">${a.ip_address}</td>
                  <td style="font-size: 12px; max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${a.details || '-'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;

    container.innerHTML = html;

    document.getElementById('system-settings-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const inputs = document.querySelectorAll('.setting-input');
      const settingsList = [];
      inputs.forEach(inp => {
        settingsList.push({
          key: inp.getAttribute('data-key'),
          value: inp.value.trim()
        });
      });

      const res = await API.put('/api/admin/settings', { settings: settingsList });
      if (res.success) {
        API.showToast(res.message, 'success');
      } else {
        API.showToast(res.error || 'Failed to save settings', 'error');
      }
    });
  },

  editPackageModal(pkgId) {
    const p = this.packages.find(item => item.id === pkgId);
    if (!p) return;

    App.showModal(`
      <div class="modal-header">
        <h3>Edit Package Rules: ${p.name}</h3>
        <button class="modal-close" onclick="App.closeModal()">✕</button>
      </div>

      <form id="edit-package-form">
        <div class="form-group">
          <label class="form-label">Package Display Name</label>
          <input type="text" id="pkg-name" class="form-control" value="${p.name}" required>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
          <div class="form-group">
            <label class="form-label">Total Volume (Quantity)</label>
            <input type="number" id="pkg-quantity" class="form-control" value="${p.total_quantity}" required>
          </div>

          <div class="form-group">
            <label class="form-label">Total Batches</label>
            <input type="number" id="pkg-batches" class="form-control" value="${p.total_batches}" required>
          </div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
          <div class="form-group">
            <label class="form-label">Interval (Minutes between batches)</label>
            <input type="number" id="pkg-interval" class="form-control" value="${p.interval_minutes}" required>
          </div>

          <div class="form-group">
            <label class="form-label">Campaign Window (Total Hours)</label>
            <input type="number" id="pkg-window" class="form-control" value="${p.campaign_window_hours}" required>
          </div>
        </div>

        <div style="display: flex; gap: 12px; justify-content: flex-end; margin-top: 24px;">
          <button type="button" class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
          <button type="submit" class="btn btn-primary">Save Package Settings</button>
        </div>
      </form>
    `);

    document.getElementById('edit-package-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const res = await API.put(`/api/admin/settings/packages/${pkgId}`, {
        name: document.getElementById('pkg-name').value.trim(),
        totalQuantity: parseInt(document.getElementById('pkg-quantity').value, 10),
        totalBatches: parseInt(document.getElementById('pkg-batches').value, 10),
        intervalMinutes: parseInt(document.getElementById('pkg-interval').value, 10),
        campaignWindowHours: parseInt(document.getElementById('pkg-window').value, 10),
        price: 0.00
      });

      App.closeModal();

      if (res.success) {
        API.showToast(res.message, 'success');
        this.render(document.getElementById('page-content'));
      } else {
        API.showToast(res.error || 'Failed to update package', 'error');
      }
    });
  }
};

