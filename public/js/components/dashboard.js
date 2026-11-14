window.DashboardComponent = {
  async render(container) {
    container.innerHTML = '<div style="text-align: center; padding: 40px;">Loading dashboard data...</div>';

    const res = await API.get('/api/analytics');
    if (!res.success) {
      container.innerHTML = `<div class="glass-panel" style="padding: 24px; color: var(--color-danger);">Failed to load dashboard: ${res.error}</div>`;
      return;
    }

    const { isAdmin, metrics, recentOrders, recentTransactions, recentAudit, providers, dripQueue } = res;

    let html = `
      <div class="page-header">
        <div>
          <h2>${isAdmin ? 'System Administrator Dashboard' : 'User Overview Dashboard'}</h2>
          <p>${isAdmin ? 'Platform-wide telemetry, user activity, and automation health' : 'Welcome back! Here is your campaign and order delivery summary'}</p>
        </div>
        <div style="display: flex; gap: 12px; align-items: center;">
          <div class="glass-panel" style="padding: 6px 14px; font-size: 12px; display: flex; align-items: center; gap: 6px; border-color: rgba(16, 185, 129, 0.3);">
            <span style="color: var(--color-success); font-weight: 700;">● Drip Queue:</span>
            <span>1 check/min (1,440 daily)</span>
          </div>
          <button class="btn btn-primary" onclick="App.navigate('create-order')">+ New Order</button>
        </div>
      </div>

      <!-- Metrics Row -->
      <div class="metrics-grid">
        <div class="metric-card glass-panel info">
          <div class="metric-header">
            <span class="metric-title">${isAdmin ? 'Total Users' : 'Connected SMM API Balance'}</span>
            <span>${isAdmin ? '👥' : '💰'}</span>
          </div>
          <div class="metric-value">${isAdmin ? metrics.totalUsers : (App.user && App.user.hasConnectedApi ? `$${parseFloat(App.user.apiBalance || 0).toFixed(2)}` : 'No API')}</div>
          <div class="metric-sub">${isAdmin ? `${metrics.activeUsers} Active, ${metrics.disabledUsers} Disabled` : (App.user && App.user.hasConnectedApi ? `Live balance from ${App.user.apiProviderName || 'provider'}` : 'Connect your SMM provider API')}</div>
        </div>

        <div class="metric-card glass-panel success">
          <div class="metric-header">
            <span class="metric-title">Total Orders</span>
            <span>🛒</span>
          </div>
          <div class="metric-value">${metrics.totalOrders}</div>
          <div class="metric-sub">${metrics.completedOrders} Completed</div>
        </div>

        <div class="metric-card glass-panel warning">
          <div class="metric-header">
            <span class="metric-title">${isAdmin ? 'Active Campaigns' : 'Scheduled Batches'}</span>
            <span>⏱️</span>
          </div>
          <div class="metric-value">${isAdmin ? metrics.activeCampaigns : metrics.scheduledBatches}</div>
          <div class="metric-sub">${isAdmin ? `${metrics.completedCampaigns} Completed campaigns` : 'In automation queue'}</div>
        </div>

        <div class="metric-card glass-panel danger">
          <div class="metric-header">
            <span class="metric-title">Access Model</span>
            <span>🎁</span>
          </div>
          <div class="metric-value">100% Free</div>
          <div class="metric-sub">Zero fee automation client</div>
        </div>
      </div>

      <!-- Activity Charts & Lists Grid -->
      <div style="display: grid; grid-template-columns: 2fr 1fr; gap: 24px; margin-bottom: 32px;">
        <!-- Chart Container -->
        <div class="glass-panel" style="padding: 24px;">
          <h3 style="font-size: 16px; margin-bottom: 16px;">Delivery & Order Activity</h3>
          <div style="position: relative; height: 260px; width: 100%;">
            <canvas id="dashboard-chart"></canvas>
          </div>
        </div>

        <!-- Quick Status Card -->
        <div class="glass-panel" style="padding: 24px;">
          <h3 style="font-size: 16px; margin-bottom: 16px;">${isAdmin ? 'Provider Status' : 'Account Quick Stats'}</h3>
          ${isAdmin ? `
            <div style="display: flex; flex-direction: column; gap: 12px;">
              ${providers.map(p => `
                <div style="display: flex; align-items: center; justify-content: space-between; padding: 10px; background: rgba(255,255,255,0.03); border-radius: var(--radius-sm);">
                  <div>
                    <div style="font-weight: 600; font-size: 13px;">${p.name}</div>
                    <div style="font-size: 11px; color: var(--text-dim);">${p.slug}</div>
                  </div>
                  <span class="status-pill ${p.is_active ? 'active' : 'disabled'}">
                    ${p.is_active ? 'Online' : 'Disabled'}
                  </span>
                </div>
              `).join('')}
            </div>
          ` : `
            <div style="display: flex; flex-direction: column; gap: 14px;">
              <div style="display: flex; justify-content: space-between; font-size: 13px;">
                <span style="color: var(--text-muted);">Active Orders:</span>
                <span class="status-pill in-progress">${metrics.activeOrders}</span>
              </div>
              <div style="display: flex; justify-content: space-between; font-size: 13px;">
                <span style="color: var(--text-muted);">Completed Orders:</span>
                <span class="status-pill completed">${metrics.completedOrders}</span>
              </div>
              <div style="display: flex; justify-content: space-between; font-size: 13px;">
                <span style="color: var(--text-muted);">Active Campaigns:</span>
                <span style="font-weight: 600;">${metrics.totalCampaigns}</span>
              </div>
              <div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--border-glass);">
                <button class="btn btn-secondary btn-sm" style="width: 100%;" onclick="App.navigate('engagement')">
                  Open Engagement Tab →
                </button>
              </div>
            </div>
          `}
        </div>
      </div>

      <!-- Recent Orders or Audit Table -->
      <div class="glass-panel" style="padding: 24px;">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px;">
          <h3 style="font-size: 16px;">${isAdmin ? 'Recent System Audit Events' : 'Recent Orders'}</h3>
          <button class="btn btn-secondary btn-sm" onclick="App.navigate('${isAdmin ? 'admin-settings' : 'orders'}')">
            View All →
          </button>
        </div>

        <div class="table-container">
          ${isAdmin ? `
            <table class="data-table">
              <thead>
                <tr>
                  <th>Time (UTC)</th>
                  <th>Action</th>
                  <th>Admin</th>
                  <th>Target</th>
                  <th>IP Address</th>
                </tr>
              </thead>
              <tbody>
                ${(recentAudit || []).map(a => `
                  <tr>
                    <td style="font-size: 12px; color: var(--text-muted);">${new Date(a.created_at).toLocaleString()}</td>
                    <td><span class="status-pill info">${a.action}</span></td>
                    <td style="font-weight: 600;">${a.admin_username || 'System'}</td>
                    <td>${a.target_type || '-'} (${a.target_id || '-'})</td>
                    <td style="font-family: monospace; font-size: 12px;">${a.ip_address}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          ` : `
            <table class="data-table">
              <thead>
                <tr>
                  <th>Order ID</th>
                  <th>Service</th>
                  <th>Quantity</th>
                  <th>Charge</th>
                  <th>Status</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                ${(recentOrders || []).length > 0 ? recentOrders.map(o => `
                  <tr>
                    <td style="font-weight: 600;">${o.id}</td>
                    <td>${o.service_name}</td>
                    <td>${o.quantity.toLocaleString()}</td>
                    <td style="color: var(--color-success); font-weight: 600;">$${o.charge.toFixed(2)}</td>
                    <td><span class="status-pill ${o.status.toLowerCase().replace(/\s+/g, '-')}">${o.status}</span></td>
                    <td style="font-size: 12px; color: var(--text-muted);">${new Date(o.created_at).toLocaleString()}</td>
                  </tr>
                `).join('') : `
                  <tr><td colspan="6" style="text-align: center; color: var(--text-dim); padding: 32px;">No orders found. Create your first order now!</td></tr>
                `}
              </tbody>
            </table>
          `}
        </div>
      </div>
    `;

    container.innerHTML = html;

    // Render Chart.js
    setTimeout(() => {
      const ctx = document.getElementById('dashboard-chart');
      if (ctx) {
        const labels = ['Day -6', 'Day -5', 'Day -4', 'Day -3', 'Day -2', 'Yesterday', 'Today'];
        const values = [metrics.completedOrders * 0.1, metrics.completedOrders * 0.2, metrics.completedOrders * 0.15, metrics.completedOrders * 0.4, metrics.completedOrders * 0.6, metrics.completedOrders * 0.8, metrics.completedOrders];
        new Chart(ctx, {
          type: 'line',
          data: {
            labels,
            datasets: [{
              label: 'Confirmed Deliveries',
              data: values.map(v => Math.max(0, Math.round(v))),
              borderColor: '#3b82f6',
              backgroundColor: 'rgba(59, 130, 246, 0.15)',
              tension: 0.35,
              fill: true,
              pointBackgroundColor: '#8b5cf6',
              pointRadius: 4
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
              x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#9ca3af' } },
              y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#9ca3af', beginAtZero: true } }
            }
          }
        });
      }
    }, 100);
  }
};

