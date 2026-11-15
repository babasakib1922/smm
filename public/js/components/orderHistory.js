window.OrderHistoryComponent = {
  async render(container) {
    container.innerHTML = '<div style="text-align: center; padding: 40px;">Loading order history...</div>';

    let html = `
      <div class="page-header">
        <div>
          <h2>Order System</h2>
          <p>Track your submitted orders, delivery statuses, and provider confirmations</p>
        </div>
        <div style="display: flex; gap: 10px; align-items: center; flex-wrap: wrap;">
          ${App.user && App.user.role === 'ADMIN' ? '<button id="clear-orders-btn" class="btn btn-sm" onclick="OrderHistoryComponent.clearAllOrders()" style="background: rgba(239, 68, 68, 0.12); color: #dc2626; border: 1px solid rgba(239, 68, 68, 0.3); font-weight: 600;">🗑️ Clear All Orders</button>' : ''}
          <button id="refresh-orders-btn" class="btn btn-secondary btn-sm" onclick="OrderHistoryComponent.syncOrders()">🔄 Refresh Live Status</button>
          <a href="/api/export/orders" class="btn btn-secondary btn-sm" target="_blank">📥 Export (CSV/Excel)</a>
          <button class="btn btn-primary btn-sm" onclick="App.navigate('engagement')">⚡ New Engagement</button>
        </div>
      </div>

      <!-- Filters Row -->
      <div class="glass-panel" style="padding: 18px 24px; margin-bottom: 24px; display: flex; gap: 16px; flex-wrap: wrap; align-items: center;">
        <div style="flex: 1; min-width: 200px;">
          <input type="text" id="order-filter-search" class="form-control" placeholder="Search by Order ID, Link, or Service...">
        </div>

        <div>
          <select id="order-filter-status" class="form-control">
            <option value="All">All Statuses</option>
            <option value="Pending">Pending</option>
            <option value="Processing">Processing</option>
            <option value="In progress">In Progress</option>
            <option value="Completed">Completed</option>
            <option value="Partial">Partial</option>
            <option value="Canceled">Canceled</option>
            <option value="Failed">Failed</option>
          </select>
        </div>

        <button id="apply-order-filters-btn" class="btn btn-secondary btn-sm">Filter</button>
      </div>

      <!-- Orders Table -->
      <div class="glass-panel" style="padding: 24px;">
        <div class="table-container">
          <table class="data-table">
            <thead>
              <tr>
                <th>Order ID</th>
                ${App.user && App.user.role === 'ADMIN' ? '<th>User</th>' : ''}
                <th>Service Name</th>
                <th>Target URL</th>
                <th>Quantity</th>
                <th>Charge</th>
                <th>Status</th>
                <th>Provider ID</th>
                <th>Date</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody id="orders-tbody">
              <tr><td colspan="10" style="text-align: center; padding: 32px;">Loading records...</td></tr>
            </tbody>
          </table>
        </div>
        <div id="orders-pagination" style="display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px;"></div>
      </div>
    `;

    container.innerHTML = html;

    document.getElementById('apply-order-filters-btn').addEventListener('click', () => {
      this.loadOrders(1);
    });

    document.getElementById('order-filter-search').addEventListener('keypress', (e) => {
      if (e.key === 'Enter') this.loadOrders(1);
    });

    document.getElementById('order-filter-status').addEventListener('change', () => {
      this.loadOrders(1);
    });

    this.loadOrders(1);
  },

  async syncOrders() {
    API.showToast('Checking latest delivery status with provider APIs...', 'info');
    await API.post('/api/orders/sync');
    await this.loadOrders(1);
    API.showToast('Order statuses synchronized.', 'success');
  },

  async cancelOrder(orderId) {
    if (!confirm(`Are you sure you want to cancel order #${orderId}?`)) return;
    API.showToast(`Canceling order #${orderId}...`, 'info');
    const res = await API.post(`/api/orders/${orderId}/cancel`);
    if (res.success) {
      API.showToast(res.message || `Order #${orderId} canceled successfully.`, 'success');
      App.closeModal();
      this.loadOrders(1);
    } else {
      API.showToast(res.error || 'Failed to cancel order.', 'error');
    }
  },

  async clearAllOrders() {
    if (!confirm('Are you sure you want to clear all orders from history? This action cannot be undone.')) return;
    API.showToast('Clearing all orders...', 'info');
    const res = await API.delete('/api/orders/all');
    if (res.success) {
      API.showToast(res.message || 'All orders cleared successfully.', 'success');
      this.loadOrders(1);
    } else {
      API.showToast(res.error || 'Failed to clear orders.', 'error');
    }
  },

  async loadOrders(page = 1) {
    const search = document.getElementById('order-filter-search').value.trim();
    const status = document.getElementById('order-filter-status').value;

    const res = await API.get('/api/orders', {
      search,
      status,
      page,
      limit: 20
    });

    const tbody = document.getElementById('orders-tbody');
    if (!res.success) {
      tbody.innerHTML = `<tr><td colspan="10" style="color: var(--color-danger); text-align: center;">${res.error}</td></tr>`;
      return;
    }

    const { orders, pagination } = res;
    if (orders.length === 0) {
      tbody.innerHTML = '<tr><td colspan="10" style="text-align: center; color: var(--text-dim); padding: 32px;">No matching orders found.</td></tr>';
      return;
    }

    const isAdmin = App.user && App.user.role === 'ADMIN';

    tbody.innerHTML = orders.map(o => `
      <tr>
        <td style="font-weight: 600; font-family: monospace;">${o.id}</td>
        ${isAdmin ? `<td style="font-weight: 600;">${o.user_name || '-'}</td>` : ''}
        <td>${o.service_name}</td>
        <td style="max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
          <a href="${o.target_url}" target="_blank" style="color: var(--accent-primary); text-decoration: none;">${o.target_url}</a>
        </td>
        <td style="font-weight: 600;">${o.quantity.toLocaleString()}</td>
        <td style="font-weight: 700; color: var(--color-success);">$${o.charge.toFixed(2)}</td>
        <td><span class="status-pill ${o.status.toLowerCase().replace(/\s+/g, '-')}">${o.status}</span></td>
        <td style="font-family: monospace; font-size: 11px;">${o.provider_order_id || '-'}</td>
        <td style="font-size: 12px; color: var(--text-muted);">${new Date(o.created_at).toLocaleString()}</td>
        <td>
          <div style="display: flex; gap: 6px; align-items: center;">
            <button class="btn btn-secondary btn-sm" onclick="OrderHistoryComponent.showDetail('${o.id}')">View</button>
            ${o.status !== 'Canceled' ? `<button class="btn btn-sm" onclick="OrderHistoryComponent.cancelOrder('${o.id}')" style="background: rgba(239, 68, 68, 0.12); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.3); font-weight: 600; cursor: pointer; padding: 4px 8px; border-radius: 6px;">Cancel</button>` : ''}
          </div>
        </td>
      </tr>
    `).join('');
  },

  async showDetail(orderId) {
    const res = await API.get(`/api/orders/${orderId}`);
    if (!res.success) {
      API.showToast(res.error || 'Failed to load details', 'error');
      return;
    }

    const o = res.order;
    App.showModal(`
      <div class="modal-header">
        <h3>Order #${o.id} Details</h3>
        <button class="modal-close" onclick="App.closeModal()">✕</button>
      </div>
      <div style="font-size: 14px; display: flex; flex-direction: column; gap: 12px; margin-bottom: 24px;">
        <div style="display: flex; justify-content: space-between;">
          <span style="color: var(--text-muted);">Status:</span>
          <span class="status-pill ${o.status.toLowerCase().replace(/\s+/g, '-')}">${o.status}</span>
        </div>
        <div style="display: flex; justify-content: space-between;">
          <span style="color: var(--text-muted);">Service:</span>
          <span style="font-weight: 600;">${o.service_name} (${o.service_category})</span>
        </div>
        <div style="display: flex; justify-content: space-between;">
          <span style="color: var(--text-muted);">Target URL:</span>
          <span style="word-break: break-all; max-width: 60%;"><a href="${o.target_url}" target="_blank" style="color: var(--accent-primary);">${o.target_url}</a></span>
        </div>
        <div style="display: flex; justify-content: space-between;">
          <span style="color: var(--text-muted);">Quantity:</span>
          <span style="font-weight: 600;">${o.quantity.toLocaleString()}</span>
        </div>
        <div style="display: flex; justify-content: space-between;">
          <span style="color: var(--text-muted);">Total Charge:</span>
          <span style="font-weight: 800; color: var(--color-success); font-size: 16px;">$${o.charge.toFixed(4)}</span>
        </div>
        <div style="display: flex; justify-content: space-between;">
          <span style="color: var(--text-muted);">Provider Order ID:</span>
          <span style="font-family: monospace;">${o.provider_order_id || 'Awaiting dispatch'}</span>
        </div>
        <div style="display: flex; justify-content: space-between;">
          <span style="color: var(--text-muted);">Created Date:</span>
          <span>${new Date(o.created_at).toLocaleString()}</span>
        </div>
        <div style="display: flex; justify-content: space-between;">
          <span style="color: var(--text-muted);">Last Updated:</span>
          <span>${new Date(o.updated_at).toLocaleString()}</span>
        </div>
      </div>
      <div style="display: flex; justify-content: flex-end; gap: 8px;">
        ${o.status !== 'Canceled' ? `<button class="btn btn-danger" onclick="OrderHistoryComponent.cancelOrder('${o.id}')" style="background: #ef4444; color: #fff; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-weight: 600;">Cancel Order</button>` : ''}
        <button class="btn btn-secondary" onclick="App.closeModal()">Close</button>
      </div>
    `);
  }
};

