window.CampaignSchedulerComponent = {
  packages: [],
  selectedPackage: null,
  currentSchedule: null,
  isShuffled: false,

  async render(container) {
    container.innerHTML = '<div style="text-align: center; padding: 40px;">Loading Campaign Scheduler configurations...</div>';

    const res = await API.get('/api/scheduler/packages');
    if (!res.success) {
      container.innerHTML = `<div class="glass-panel" style="padding: 24px; color: var(--color-danger);">Failed to load packages: ${res.error}</div>`;
      return;
    }

    this.packages = res.packages;
    if (this.packages.length > 0 && !this.selectedPackage) {
      this.selectedPackage = this.packages[0];
    }

    // Detect user timezone
    const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

    // Default start time: now (formatted for datetime-local)
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    const defaultStartLocal = now.toISOString().slice(0, 16);

    let html = `
      <div class="page-header">
        <div>
          <h2>Campaign Scheduler & Package Batch Planner</h2>
          <p>Configure exact drip schedules and calculate formula-based batch delivery intervals</p>
        </div>
        <div style="display: flex; gap: 12px; align-items: center;">
          <div class="glass-panel" style="padding: 6px 14px; font-size: 12px; display: flex; align-items: center; gap: 6px; border-color: rgba(16, 185, 129, 0.3);">
            <span style="color: var(--color-success); font-weight: 700;">● Drip Queue:</span>
            <span>1 check/min (1,440 daily)</span>
          </div>
          <div style="font-size: 13px; color: var(--text-muted); display: flex; align-items: center; gap: 8px;">
            <span>🌐 Timezone:</span>
            <span style="color: var(--accent-primary); font-weight: 600;">${userTimezone}</span>
          </div>
        </div>
      </div>

      <!-- Package Selection Cards (Section 8) -->
      <div style="margin-bottom: 24px;">
        <label class="form-label" style="margin-bottom: 12px; display: block;">Select Standard Delivery Package:</label>
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 16px;">
          ${this.packages.map(p => `
            <div class="glass-panel package-card ${this.selectedPackage && this.selectedPackage.id === p.id ? 'active' : ''}" 
                 data-package-id="${p.id}"
                 style="padding: 20px; cursor: pointer; border: 2px solid ${this.selectedPackage && this.selectedPackage.id === p.id ? 'var(--accent-primary)' : 'var(--border-glass)'}; transition: all 0.2s ease;">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                <h3 style="font-size: 18px; font-weight: 700;">${p.name}</h3>
                <span class="status-pill completed" style="font-size: 11px;">Free Tool Preset</span>
              </div>
              <div style="font-size: 13px; color: var(--text-muted); display: flex; flex-direction: column; gap: 4px;">
                <div>📦 Total Batches: <strong>${p.total_batches}</strong></div>
                <div>⏱️ Interval: <strong>${p.interval_minutes} minutes</strong></div>
                <div>🕒 Campaign Window: <strong>${p.campaign_window_hours} hours</strong></div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>

      <!-- Configuration & Actions Row -->
      <div class="glass-panel" style="padding: 24px; margin-bottom: 24px;">
        <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 20px; align-items: flex-end;">
          <div class="form-group" style="margin-bottom: 0;">
            <label class="form-label">Campaign Name</label>
            <input type="text" id="scheduler-campaign-name" class="form-control" placeholder="e.g. My TikTok Video Campaign" value="Campaign - ${this.selectedPackage ? this.selectedPackage.name : ''}">
          </div>

          <div class="form-group" style="margin-bottom: 0;">
            <label class="form-label">Target Link / URL</label>
            <input type="url" id="scheduler-target-url" class="form-control" placeholder="https://..." required>
          </div>

          <div class="form-group" style="margin-bottom: 0;">
            <label class="form-label">Campaign Start Date & Time</label>
            <input type="datetime-local" id="scheduler-start-time" class="form-control" value="${defaultStartLocal}">
          </div>
        </div>

        <div style="display: flex; gap: 12px; margin-top: 20px; flex-wrap: wrap;">
          <button id="recalculate-schedule-btn" class="btn btn-primary btn-sm">
            🔄 Recalculate Schedule
          </button>
          <button id="shuffle-plan-btn" class="btn btn-secondary btn-sm" title="Preview an alternative distribution while preserving exact totals">
            🔀 Shuffle Plan Preview
          </button>
          <button id="save-campaign-btn" class="btn btn-success btn-sm">
            💾 Save & Launch Campaign
          </button>
          <button id="export-preview-csv-btn" class="btn btn-secondary btn-sm">
            📥 Export Schedule CSV
          </button>
          <button id="copy-schedule-btn" class="btn btn-secondary btn-sm">
            📋 Copy Schedule
          </button>
        </div>
      </div>

      <!-- Buffer Information Banner (Section 8 Requirement) -->
      <div id="buffer-banner-container"></div>

      <!-- Schedule Preview Table Card -->
      <div class="glass-panel" style="padding: 24px; margin-bottom: 32px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
          <div>
            <h3 style="font-size: 16px;">Planned Batch Delivery Schedule</h3>
            <p style="font-size: 12px; color: var(--text-muted); margin-top: 2px;">
              Formula: <code>Batch Time = Start Time + ((Batch Number - 1) × Interval)</code>
            </p>
          </div>
          <span id="shuffle-badge" style="display: none;" class="status-pill info">Shuffled Distribution Active</span>
        </div>

        <div class="table-container">
          <table class="data-table" id="schedule-preview-table">
            <thead>
              <tr>
                <th>Batch #</th>
                <th>Planned Quantity</th>
                <th>Relative Time</th>
                <th>Scheduled Date</th>
                <th>Scheduled Time (${userTimezone})</th>
                <th>Current Status</th>
              </tr>
            </thead>
            <tbody id="schedule-preview-tbody">
              <tr><td colspan="6" style="text-align: center; padding: 24px;">Calculating schedule...</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Active User Campaigns List -->
      <div class="glass-panel" style="padding: 24px;">
        <h3 style="font-size: 16px; margin-bottom: 16px;">Your Scheduled & Active Campaigns</h3>
        <div id="user-campaigns-list">Loading campaigns...</div>
      </div>
    `;

    container.innerHTML = html;

    this.initEvents();
    this.calculateSchedule();
    this.loadUserCampaigns();
  },

  initEvents() {
    // Package card selection
    document.querySelectorAll('.package-card').forEach(card => {
      card.addEventListener('click', () => {
        const pkgId = parseInt(card.getAttribute('data-package-id'), 10);
        this.selectedPackage = this.packages.find(p => p.id === pkgId);
        this.isShuffled = false;

        document.querySelectorAll('.package-card').forEach(c => {
          c.style.borderColor = 'var(--border-glass)';
          c.classList.remove('active');
        });
        card.style.borderColor = 'var(--accent-primary)';
        card.classList.add('active');

        document.getElementById('scheduler-campaign-name').value = `Campaign - ${this.selectedPackage.name}`;
        this.calculateSchedule();
      });
    });

    // Recalculate button
    document.getElementById('recalculate-schedule-btn').addEventListener('click', () => {
      this.isShuffled = false;
      this.calculateSchedule();
    });

    // Shuffle plan button (Section 8)
    document.getElementById('shuffle-plan-btn').addEventListener('click', () => {
      this.shuffleSchedule();
    });

    // Save campaign button
    document.getElementById('save-campaign-btn').addEventListener('click', () => {
      this.saveCampaign();
    });

    // Export CSV
    document.getElementById('export-preview-csv-btn').addEventListener('click', () => {
      this.exportScheduleCsv();
    });

    // Copy Schedule to clipboard
    document.getElementById('copy-schedule-btn').addEventListener('click', () => {
      this.copyScheduleToClipboard();
    });
  },

  async calculateSchedule(customQuantities = null) {
    if (!this.selectedPackage) return;

    const startInput = document.getElementById('scheduler-start-time').value;
    const startDate = startInput ? new Date(startInput) : new Date();

    const res = await API.post('/api/scheduler/calculate', {
      packageId: this.selectedPackage.id,
      startTime: startDate.toISOString(),
      customQuantities
    });

    if (res.success) {
      this.currentSchedule = res.schedule;
      this.renderScheduleTable();
    } else {
      API.showToast(res.error || 'Failed to calculate schedule', 'error');
    }
  },

  async shuffleSchedule() {
    if (!this.selectedPackage) return;

    const startInput = document.getElementById('scheduler-start-time').value;
    const startDate = startInput ? new Date(startInput) : new Date();

    const res = await API.post('/api/scheduler/shuffle', {
      packageId: this.selectedPackage.id,
      startTime: startDate.toISOString()
    });

    if (res.success) {
      this.currentSchedule = res.schedule;
      this.isShuffled = true;
      API.showToast('Shuffled alternative plan generated. Total quantity and batch intervals preserved.', 'info');
      this.renderScheduleTable();
    } else {
      API.showToast(res.error || 'Failed to shuffle plan', 'error');
    }
  },

  renderScheduleTable() {
    const s = this.currentSchedule;
    if (!s) return;

    const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    const shuffleBadge = document.getElementById('shuffle-badge');
    shuffleBadge.style.display = this.isShuffled ? 'inline-flex' : 'none';

    // Render Buffer Banner (Section 8: Show the remaining buffer between the final planned batch and the campaign window!)
    const bufferContainer = document.getElementById('buffer-banner-container');
    bufferContainer.innerHTML = `
      <div class="buffer-banner">
        <div>
          <strong style="color: var(--accent-primary);">Campaign Timeline & Buffer Analysis:</strong>
          <div style="font-size: 13px; color: var(--text-muted); margin-top: 4px;">
            Final batch executed at: <strong>${s.batches[s.batches.length - 1].relativeTimeText}</strong> | 
            Configured campaign window: <strong>${s.campaignWindowHours} hours</strong> (${s.campaignWindowMinutes} mins)
          </div>
        </div>
        <div style="text-align: right;">
          <div style="font-size: 11px; text-transform: uppercase; color: var(--text-dim); font-weight: 700;">Remaining Buffer</div>
          <div style="font-size: 18px; font-weight: 800; color: var(--color-success);">${s.bufferText}</div>
        </div>
      </div>
    `;

    // Render Table Rows
    const tbody = document.getElementById('schedule-preview-tbody');
    tbody.innerHTML = s.batches.map(b => {
      const dateObj = new Date(b.scheduledAt);
      const dateStr = dateObj.toLocaleDateString();
      const timeStr = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

      return `
        <tr>
          <td style="font-weight: 700;">Batch ${b.batchNumber}</td>
          <td style="font-weight: 600; color: var(--accent-primary);">${b.plannedQuantity.toLocaleString()}</td>
          <td><code>${b.relativeTimeText}</code></td>
          <td>${dateStr}</td>
          <td style="font-family: monospace;">${timeStr}</td>
          <td><span class="status-pill scheduled">Scheduled</span></td>
        </tr>
      `;
    }).join('');
  },

  async saveCampaign() {
    const name = document.getElementById('scheduler-campaign-name').value.trim();
    const targetUrl = document.getElementById('scheduler-target-url').value.trim();
    const startTime = document.getElementById('scheduler-start-time').value;

    if (!name || !targetUrl) {
      API.showToast('Please provide a campaign name and valid target URL.', 'error');
      return;
    }

    if (!/^https?:\/\/.+/i.test(targetUrl)) {
      API.showToast('Target URL must begin with http:// or https://', 'error');
      return;
    }

    const customQuantities = this.isShuffled && this.currentSchedule
      ? this.currentSchedule.batches.map(b => b.plannedQuantity)
      : null;

    const res = await API.post('/api/scheduler/campaigns', {
      name,
      packageId: this.selectedPackage.id,
      serviceId: this.selectedPackage.service_id,
      targetUrl,
      startTime: startTime ? new Date(startTime).toISOString() : new Date().toISOString(),
      customQuantities
    });

    if (res.success) {
      API.showToast(`Campaign "${name}" scheduled successfully!`, 'success');
      this.loadUserCampaigns();

      // Show Share Plan Dialog
      this.showShareDialog(res.campaignId, res.shareToken);
    } else {
      API.showToast(res.error || 'Failed to save campaign', 'error');
    }
  },

  showShareDialog(campaignId, shareToken) {
    const shareUrl = `${window.location.origin}/#share-${shareToken}`;
    App.showModal(`
      <div class="modal-header">
        <h3>Campaign Scheduled & Share Link</h3>
        <button class="modal-close" onclick="App.closeModal()">✕</button>
      </div>
      <div style="font-size: 14px; margin-bottom: 20px;">
        <p style="margin-bottom: 12px; color: var(--color-success); font-weight: 600;">✓ Your campaign batches have been registered in the automation queue.</p>
        <p style="color: var(--text-muted); margin-bottom: 16px;">You can share this read-only schedule preview with clients or collaborators:</p>
        <div style="display: flex; gap: 8px;">
          <input type="text" id="share-link-input" class="form-control" value="${shareUrl}" readonly>
          <button class="btn btn-primary btn-sm" onclick="navigator.clipboard.writeText('${shareUrl}'); API.showToast('Link copied to clipboard!', 'success');">Copy Link</button>
        </div>
      </div>
      <div style="display: flex; justify-content: flex-end;">
        <button class="btn btn-secondary" onclick="App.closeModal()">Done</button>
      </div>
    `);
  },

  copyScheduleToClipboard() {
    if (!this.currentSchedule) return;
    let text = `Campaign Schedule - ${this.selectedPackage.name}\n`;
    text += `Total Quantity: ${this.currentSchedule.totalQuantity.toLocaleString()} | Batches: ${this.currentSchedule.totalBatches} | Interval: ${this.currentSchedule.intervalMinutes}m\n\n`;
    this.currentSchedule.batches.forEach(b => {
      text += `Batch ${b.batchNumber}: Qty ${b.plannedQuantity} at ${b.relativeTimeText} (${new Date(b.scheduledAt).toLocaleString()})\n`;
    });
    navigator.clipboard.writeText(text);
    API.showToast('Complete schedule copied to clipboard!', 'success');
  },

  exportScheduleCsv() {
    if (!this.currentSchedule) return;
    let csv = '\uFEFFBatch Number,Planned Quantity,Relative Time,Scheduled Date Time\n';
    this.currentSchedule.batches.forEach(b => {
      csv += `${b.batchNumber},${b.plannedQuantity},"${b.relativeTimeText}","${b.scheduledAt}"\n`;
    });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `schedule_${this.selectedPackage.name.replace(/\s+/g, '_')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    API.showToast('Schedule exported to CSV!', 'success');
  },

  async loadUserCampaigns() {
    const listContainer = document.getElementById('user-campaigns-list');
    if (!listContainer) return;

    const res = await API.get('/api/scheduler/campaigns');
    if (!res.success) {
      listContainer.innerHTML = `<div style="color: var(--color-danger);">Failed to load campaigns: ${res.error}</div>`;
      return;
    }

    const campaigns = res.campaigns;
    if (campaigns.length === 0) {
      listContainer.innerHTML = '<div style="color: var(--text-dim); padding: 16px 0;">No scheduled campaigns yet.</div>';
      return;
    }

    listContainer.innerHTML = `
      <div class="table-container">
        <table class="data-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Campaign Name</th>
              <th>Package</th>
              <th>Batches</th>
              <th>Start Time</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${campaigns.map(c => `
              <tr>
                <td style="font-weight: 600;">${c.id}</td>
                <td>${c.name}</td>
                <td>${c.package_name}</td>
                <td>${c.delivered_batches || 0} / ${c.total_batches}</td>
                <td style="font-size: 12px; color: var(--text-muted);">${new Date(c.start_time).toLocaleString()}</td>
                <td><span class="status-pill ${c.status.toLowerCase()}">${c.status}</span></td>
                <td>
                  <div style="display: flex; gap: 6px;">
                    ${c.status === 'Running' ? `
                      <button class="btn btn-secondary btn-sm" onclick="CampaignSchedulerComponent.updateStatus('${c.id}', 'Paused')">Pause</button>
                    ` : c.status === 'Paused' ? `
                      <button class="btn btn-secondary btn-sm" onclick="CampaignSchedulerComponent.updateStatus('${c.id}', 'Running')">Resume</button>
                    ` : ''}
                    ${['Scheduled', 'Running', 'Paused'].includes(c.status) ? `
                      <button class="btn btn-danger btn-sm" onclick="CampaignSchedulerComponent.updateStatus('${c.id}', 'Cancelled')">Cancel</button>
                    ` : ''}
                    <button class="btn btn-secondary btn-sm" onclick="CampaignSchedulerComponent.viewDetails('${c.id}')">View</button>
                  </div>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  },

  async updateStatus(campaignId, newStatus) {
    if (!confirm(`Are you sure you want to change campaign status to ${newStatus}?`)) return;
    const res = await API.post(`/api/scheduler/campaigns/${campaignId}/status`, { status: newStatus });
    if (res.success) {
      API.showToast(res.message, 'success');
      this.loadUserCampaigns();
    } else {
      API.showToast(res.error || 'Failed to update campaign', 'error');
    }
  },

  async viewDetails(campaignId) {
    const res = await API.get(`/api/scheduler/campaigns/${campaignId}`);
    if (!res.success) {
      API.showToast(res.error || 'Failed to load details', 'error');
      return;
    }

    const { campaign, batches, nextBatch } = res;
    App.showModal(`
      <div class="modal-header">
        <h3>Campaign Details: ${campaign.name}</h3>
        <button class="modal-close" onclick="App.closeModal()">✕</button>
      </div>

      <div style="margin-bottom: 16px; font-size: 13px; display: grid; grid-template-columns: 1fr 1fr; gap: 10px; background: rgba(0,0,0,0.02); padding: 14px; border-radius: 8px; border: 1px solid rgba(0,0,0,0.05);">
        <div>Status: <span class="status-pill ${campaign.status.toLowerCase()}">${campaign.status}</span></div>
        <div>Interval: <strong>${campaign.interval_minutes} mins</strong> (${campaign.total_batches} Batches)</div>
        <div>Target URL: <a href="${campaign.target_url}" target="_blank" style="color: var(--accent-primary); word-break: break-all;">${campaign.target_url}</a></div>
        <div>Next Batch: <strong>${nextBatch ? `Batch ${nextBatch.batch_number} at ${new Date(nextBatch.scheduled_at).toLocaleTimeString()}` : 'Completed / None'}</strong></div>
      </div>

      <!-- Package Metric Breakdown Summary -->
      <div style="margin-bottom: 20px; display: flex; gap: 8px; flex-wrap: wrap;">
        <span style="background: rgba(59, 130, 246, 0.1); color: #2563eb; border: 1px solid rgba(59, 130, 246, 0.25); padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 600;">👁️ Views: ${campaign.total_quantity.toLocaleString()}</span>
        ${campaign.total_likes ? `<span style="background: rgba(239, 68, 68, 0.1); color: #dc2626; border: 1px solid rgba(239, 68, 68, 0.25); padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 600;">❤️ Likes: ${campaign.total_likes.toLocaleString()} (${campaign.likes_waves || 3} waves)</span>` : ''}
        ${campaign.total_saves ? `<span style="background: rgba(245, 158, 11, 0.1); color: #d97706; border: 1px solid rgba(245, 158, 11, 0.25); padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 600;">🔖 Saves: ${campaign.total_saves.toLocaleString()} (${campaign.saves_waves || 2} waves)</span>` : ''}
        ${campaign.total_shares ? `<span style="background: rgba(16, 185, 129, 0.1); color: #059669; border: 1px solid rgba(16, 185, 129, 0.25); padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 600;">↗️ Shares: ${campaign.total_shares.toLocaleString()} (${campaign.shares_waves || 2} waves)</span>` : ''}
        ${campaign.total_reposts ? `<span style="background: rgba(99, 102, 241, 0.1); color: #4f46e5; border: 1px solid rgba(99, 102, 241, 0.25); padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 600;">🔁 Reposts: ${campaign.total_reposts.toLocaleString()} (${campaign.reposts_waves || 2} waves)</span>` : ''}
      </div>

      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
        <h4 style="font-size: 14px; margin: 0;">Batch Execution List (${batches.length} Batches)</h4>
        <a href="/api/export/campaign/${campaign.id}" class="btn btn-secondary btn-sm" target="_blank">📥 Export CSV</a>
      </div>

      <div class="table-container" style="max-height: 320px; overflow-y: auto;">
        <table class="data-table" style="font-size: 12px;">
          <thead>
            <tr>
              <th>#</th>
              <th>Views</th>
              <th>Engagement Added</th>
              <th>Schedule & Dispatched</th>
              <th>Status</th>
              <th>Provider Orders</th>
            </tr>
          </thead>
          <tbody>
            ${batches.map(b => `
              <tr>
                <td><strong>Batch ${b.batch_number}</strong></td>
                <td><strong>${b.planned_quantity.toLocaleString()}</strong></td>
                <td>
                  <div style="display: flex; gap: 4px; flex-wrap: wrap;">
                    ${b.likes_quantity > 0 ? `<span style="background: rgba(239, 68, 68, 0.12); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.3); padding: 1px 6px; border-radius: 4px; font-weight: 700; font-size: 11px;">❤️ +${b.likes_quantity} Likes</span>` : ''}
                    ${b.saves_quantity > 0 ? `<span style="background: rgba(245, 158, 11, 0.12); color: #d97706; border: 1px solid rgba(245, 158, 11, 0.3); padding: 1px 6px; border-radius: 4px; font-weight: 700; font-size: 11px;">🔖 +${b.saves_quantity} Saves</span>` : ''}
                    ${b.shares_quantity > 0 ? `<span style="background: rgba(16, 185, 129, 0.12); color: #059669; border: 1px solid rgba(16, 185, 129, 0.3); padding: 1px 6px; border-radius: 4px; font-weight: 700; font-size: 11px;">↗️ +${b.shares_quantity} Shares</span>` : ''}
                    ${b.reposts_quantity > 0 ? `<span style="background: rgba(99, 102, 241, 0.12); color: #4f46e5; border: 1px solid rgba(99, 102, 241, 0.3); padding: 1px 6px; border-radius: 4px; font-weight: 700; font-size: 11px;">🔁 +${b.reposts_quantity} Reposts</span>` : ''}
                    ${(!b.likes_quantity && !b.saves_quantity && !b.shares_quantity && !b.reposts_quantity) ? `<span style="color: var(--text-muted); font-size: 11px;">Views Only</span>` : ''}
                  </div>
                </td>
                <td>
                  <div><span style="color: var(--text-muted); font-size: 11px;">Sched:</span> <strong>${new Date(b.scheduled_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</strong></div>
                  ${b.executed_at ? `<div style="font-size: 11px; color: #10b981; margin-top: 3px; font-weight: 600;">⚡ Sent: ${new Date(b.executed_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</div>` : ''}
                </td>
                <td>
                  ${b.status === 'Delivered' ? `<span class="status-pill delivered">Delivered</span>` : ''}
                  ${b.status === 'Processing' ? `<span class="status-pill processing">Processing</span>` : ''}
                  ${b.status === 'Scheduled' && b.last_error && b.last_error.toLowerCase().includes('active order') ? `<span class="status-pill" style="background: rgba(245, 158, 11, 0.15); color: #d97706; border: 1px solid rgba(245, 158, 11, 0.3); font-weight: 600;" title="${b.last_error}">⏳ Active Order (Retrying)</span>` : ''}
                  ${b.status === 'Scheduled' && (!b.last_error || !b.last_error.toLowerCase().includes('active order')) ? `<span class="status-pill scheduled">${b.status}</span>` : ''}
                  ${b.status === 'Failed' ? `<span class="status-pill failed" title="${b.last_error || 'Error'}">Failed</span>` : ''}
                  ${b.status === 'Cancelled' ? `<span class="status-pill canceled">Cancelled</span>` : ''}
                  ${b.last_error && !b.last_error.toLowerCase().includes('active order') ? `<span title="${b.last_error}" style="color: #ef4444; font-size: 11px; margin-left: 4px; cursor: help;">⚠️ Details</span>` : ''}
                </td>
                <td>
                  <div style="display: flex; flex-direction: column; gap: 3px;">
                    <div>
                      <span style="font-size: 11px; color: var(--accent-primary); font-weight: 700;">👁️ Views:</span>
                      <code style="font-size: 11px;">${b.provider_order_id ? `#${b.provider_order_id}` : (b.last_error && b.last_error.toLowerCase().includes('active order') ? 'Waiting release' : (b.status === 'Failed' ? 'Failed' : 'Queued'))}</code>
                    </div>
                    ${(b.likes_quantity > 0 || b.likes_provider_order_id) ? `
                      <div>
                        <span style="font-size: 11px; color: #ef4444; font-weight: 700;">❤️ Likes:</span>
                        <code style="font-size: 11px; color: #ef4444;">${b.likes_provider_order_id ? `#${b.likes_provider_order_id}` : (b.status === 'Delivered' ? 'Delivering...' : 'Queued')}</code>
                      </div>
                    ` : ''}
                  </div>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>

      <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 18px; flex-wrap: wrap; gap: 10px;">
        <div style="display: flex; gap: 8px;">
          <button class="btn btn-primary btn-sm" onclick="CampaignScheduler.dispatchCampaignNow('${campaign.id}')">⚡ Dispatch Due Batches Now</button>
          ${['Scheduled', 'Running', 'Paused'].includes(campaign.status) ? `<button class="btn btn-danger btn-sm" onclick="CampaignScheduler.updateCampaignStatus('${campaign.id}', 'Cancelled')" style="background: rgba(239,68,68,0.15); color: #ef4444; border: 1px solid rgba(239,68,68,0.3);">Cancel Campaign</button>` : ''}
        </div>
        <button class="btn btn-secondary btn-sm" onclick="App.closeModal()">Close</button>
      </div>
    `);
  },

  async dispatchCampaignNow(campaignId) {
    API.showToast('Dispatching due batches...', 'info');
    const res = await API.post(`/api/scheduler/campaigns/${campaignId}/dispatch-now`);
    if (res.success) {
      API.showToast(res.message || 'Due batches dispatched successfully', 'success');
      this.viewDetails(campaignId);
      this.loadUserCampaigns();
    } else {
      API.showToast(res.error || 'Failed to dispatch batches', 'error');
    }
  }
};

