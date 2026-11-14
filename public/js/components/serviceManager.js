window.ServiceManagerComponent = {
  services: [],
  providers: [],

  async render(container) {
    container.innerHTML = '<div style="text-align: center; padding: 40px;">Loading Service Manager...</div>';

    const [srvRes, provRes] = await Promise.all([
      API.get('/api/services'),
      API.get('/api/api-configs/providers')
    ]);

    if (!srvRes.success || !provRes.success) {
      container.innerHTML = `<div class="glass-panel" style="padding: 24px; color: var(--color-danger);">Failed to load Service Manager.</div>`;
      return;
    }

    this.services = srvRes.services;
    this.providers = provRes.providers;

    let html = `
      <div class="page-header">
        <div>
          <h2>Service Manager (Administrator)</h2>
          <p>Add, configure, map, and control delivery services across API providers</p>
        </div>
        <div>
          <button class="btn btn-primary" onclick="ServiceManagerComponent.showCreateModal()">+ Add New Service</button>
        </div>
      </div>

      <div class="glass-panel" style="padding: 24px;">
        <div class="table-container">
          <table class="data-table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Name</th>
                <th>Category</th>
                <th>Provider</th>
                <th>Provider Service ID</th>
                <th>Rate / 1k</th>
                <th>Min / Max</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              ${this.services.map(s => `
                <tr>
                  <td style="font-family: monospace; font-weight: 600;">${s.service_id_code}</td>
                  <td style="font-weight: 600;">${s.name}</td>
                  <td><span class="status-pill info">${s.category}</span></td>
                  <td>${s.provider_name}</td>
                  <td><code>${s.provider_service_id}</code></td>
                  <td style="font-weight: 700; color: var(--color-success);">$${s.price_per_k.toFixed(2)}</td>
                  <td style="font-size: 13px;">${s.min_quantity.toLocaleString()} - ${s.max_quantity.toLocaleString()}</td>
                  <td><span class="status-pill ${s.is_active ? 'active' : 'disabled'}">${s.is_active ? 'Active' : 'Disabled'}</span></td>
                  <td>
                    <div style="display: flex; gap: 6px;">
                      <button class="btn btn-secondary btn-sm" onclick="ServiceManagerComponent.showEditModal(${s.id})">Edit</button>
                      <button class="btn btn-danger btn-sm" onclick="ServiceManagerComponent.deleteService(${s.id}, '${s.name}')">Delete</button>
                    </div>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;

    container.innerHTML = html;
  },

  showCreateModal() {
    App.showModal(`
      <div class="modal-header">
        <h3>Create New Service</h3>
        <button class="modal-close" onclick="App.closeModal()">✕</button>
      </div>

      <form id="create-service-form">
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
          <div class="form-group">
            <label class="form-label">Internal Service Code</label>
            <input type="text" id="srv-code" class="form-control" placeholder="SRV-CUSTOM-VIEWS" required>
          </div>

          <div class="form-group">
            <label class="form-label">Service Name</label>
            <input type="text" id="srv-name" class="form-control" placeholder="e.g. Real Organic Views" required>
          </div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
          <div class="form-group">
            <label class="form-label">Category</label>
            <input type="text" id="srv-category" class="form-control" placeholder="Views, Likes, Followers" required>
          </div>

          <div class="form-group">
            <label class="form-label">API Provider</label>
            <select id="srv-provider-id" class="form-control">
              ${this.providers.map(p => `<option value="${p.id}">${p.name} (${p.slug})</option>`).join('')}
            </select>
          </div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px;">
          <div class="form-group">
            <label class="form-label">Provider Service ID</label>
            <input type="text" id="srv-provider-service-id" class="form-control" placeholder="e.g. 10322 or 1123" required>
          </div>

          <div class="form-group">
            <label class="form-label">Rate per 1,000 ($)</label>
            <input type="number" step="0.01" id="srv-rate" class="form-control" value="1.50" required min="0.01">
          </div>

          <div class="form-group">
            <label class="form-label">Min / Max Quantity</label>
            <div style="display: flex; gap: 6px;">
              <input type="number" id="srv-min" class="form-control" placeholder="Min" value="100">
              <input type="number" id="srv-max" class="form-control" placeholder="Max" value="500000">
            </div>
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">Description</label>
          <textarea id="srv-desc" class="form-control" rows="2" placeholder="Service description and speed specifications"></textarea>
        </div>

        <div style="display: flex; gap: 12px; justify-content: flex-end; margin-top: 24px;">
          <button type="button" class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
          <button type="submit" class="btn btn-primary">Save Service</button>
        </div>
      </form>
    `);

    document.getElementById('create-service-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const res = await API.post('/api/services', {
        serviceIdCode: document.getElementById('srv-code').value.trim(),
        name: document.getElementById('srv-name').value.trim(),
        category: document.getElementById('srv-category').value.trim(),
        providerId: parseInt(document.getElementById('srv-provider-id').value, 10),
        providerServiceId: document.getElementById('srv-provider-service-id').value.trim(),
        pricePerK: parseFloat(document.getElementById('srv-rate').value),
        minQuantity: parseInt(document.getElementById('srv-min').value, 10),
        maxQuantity: parseInt(document.getElementById('srv-max').value, 10),
        description: document.getElementById('srv-desc').value.trim()
      });

      App.closeModal();

      if (res.success) {
        API.showToast(res.message, 'success');
        this.render(document.getElementById('page-content'));
      } else {
        API.showToast(res.error || 'Failed to save service', 'error');
      }
    });
  },

  async showEditModal(serviceId) {
    const s = this.services.find(item => item.id === serviceId);
    if (!s) return;

    App.showModal(`
      <div class="modal-header">
        <h3>Edit Service: ${s.name}</h3>
        <button class="modal-close" onclick="App.closeModal()">✕</button>
      </div>

      <form id="edit-service-form">
        <div class="form-group">
          <label class="form-label">Service Name</label>
          <input type="text" id="edit-srv-name" class="form-control" value="${s.name}" required>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
          <div class="form-group">
            <label class="form-label">Category</label>
            <input type="text" id="edit-srv-cat" class="form-control" value="${s.category}" required>
          </div>

          <div class="form-group">
            <label class="form-label">Provider Service ID</label>
            <input type="text" id="edit-srv-pid" class="form-control" value="${s.provider_service_id}" required>
          </div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
          <div class="form-group">
            <label class="form-label">Rate / 1k ($)</label>
            <input type="number" step="0.01" id="edit-srv-rate" class="form-control" value="${s.price_per_k}" required>
          </div>

          <div class="form-group">
            <label class="form-label">Status</label>
            <select id="edit-srv-status" class="form-control">
              <option value="1" ${s.is_active ? 'selected' : ''}>Active</option>
              <option value="0" ${!s.is_active ? 'selected' : ''}>Disabled / Archived</option>
            </select>
          </div>
        </div>

        <div style="display: flex; gap: 12px; justify-content: flex-end; margin-top: 24px;">
          <button type="button" class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
          <button type="submit" class="btn btn-primary">Update Service</button>
        </div>
      </form>
    `);

    document.getElementById('edit-service-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const res = await API.put(`/api/services/${serviceId}`, {
        name: document.getElementById('edit-srv-name').value.trim(),
        category: document.getElementById('edit-srv-cat').value.trim(),
        providerServiceId: document.getElementById('edit-srv-pid').value.trim(),
        pricePerK: parseFloat(document.getElementById('edit-srv-rate').value),
        isActive: document.getElementById('edit-srv-status').value === '1'
      });

      App.closeModal();

      if (res.success) {
        API.showToast(res.message, 'success');
        this.render(document.getElementById('page-content'));
      } else {
        API.showToast(res.error || 'Failed to update service', 'error');
      }
    });
  },

  async deleteService(serviceId, name) {
    if (!confirm(`Are you sure you want to delete or archive service "${name}"?`)) return;
    const res = await API.del(`/api/services/${serviceId}`);
    if (res.success) {
      API.showToast(res.message, 'success');
      this.render(document.getElementById('page-content'));
    } else {
      API.showToast(res.error || 'Failed to delete service', 'error');
    }
  }
};

