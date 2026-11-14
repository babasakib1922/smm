window.AnalyticsComponent = {
  async render(container) {
    container.innerHTML = '<div style="text-align: center; padding: 40px;">Generating real-time analytics...</div>';

    const res = await API.get('/api/analytics');
    if (!res.success) {
      container.innerHTML = `<div class="glass-panel" style="padding: 24px; color: var(--color-danger);">${res.error}</div>`;
      return;
    }

    const { isAdmin, metrics, ordersByDay, userActivityByDay } = res;

    let html = `
      <div class="page-header">
        <div>
          <h2>System & Performance Analytics</h2>
          <p>Real-time telemetry generated directly from active database records and provider delivery logs</p>
        </div>
      </div>

      <!-- Core Stats Cards -->
      <div class="metrics-grid">
        <div class="metric-card glass-panel success">
          <span class="metric-title">Completed Orders</span>
          <span class="metric-value">${metrics.completedOrders}</span>
          <span class="metric-sub">Confirmed provider delivery</span>
        </div>

        <div class="metric-card glass-panel info">
          <span class="metric-title">In Progress / Pending</span>
          <span class="metric-value">${metrics.activeOrders}</span>
          <span class="metric-sub">Active in queue</span>
        </div>

        <div class="metric-card glass-panel danger">
          <span class="metric-title">Failed Orders</span>
          <span class="metric-value">${metrics.failedOrders}</span>
          <span class="metric-sub">Unfulfilled or rejected</span>
        </div>

        <div class="metric-card glass-panel warning">
          <span class="metric-title">${isAdmin ? 'Total System Volume' : 'Total Spending'}</span>
          <span class="metric-value">$${(isAdmin ? metrics.totalVolume : metrics.totalSpent).toFixed(2)}</span>
          <span class="metric-sub">Actual financial deductions</span>
        </div>
      </div>

      <!-- Historical Graphs -->
      <div class="glass-panel" style="padding: 24px; margin-bottom: 32px;">
        <h3 style="font-size: 16px; margin-bottom: 16px;">Daily Order Volume & Deliveries</h3>
        <div style="position: relative; height: 320px; width: 100%;">
          <canvas id="detailed-analytics-chart"></canvas>
        </div>
      </div>
    `;

    container.innerHTML = html;

    // Render detailed Chart.js
    setTimeout(() => {
      const ctx = document.getElementById('detailed-analytics-chart');
      if (ctx) {
        const dataRows = isAdmin ? (ordersByDay || []) : (userActivityByDay || []);
        const labels = dataRows.length > 0 ? dataRows.map(r => r.day) : ['Today'];
        const counts = dataRows.length > 0 ? dataRows.map(r => r.count) : [metrics.totalOrders];
        const amounts = dataRows.length > 0 ? dataRows.map(r => r.volume || r.spent || 0) : [isAdmin ? metrics.totalVolume : metrics.totalSpent];

        new Chart(ctx, {
          type: 'bar',
          data: {
            labels,
            datasets: [
              {
                label: 'Orders Count',
                data: counts,
                backgroundColor: 'rgba(59, 130, 246, 0.7)',
                borderRadius: 4
              },
              {
                label: 'Spend ($)',
                data: amounts,
                backgroundColor: 'rgba(16, 185, 129, 0.7)',
                borderRadius: 4
              }
            ]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
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

