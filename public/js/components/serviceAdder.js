window.ServiceAdderComponent = {
  services: [],
  providers: [],

  async render(container) {
    container.innerHTML = '<div style="text-align: center; padding: 40px;">Loading Service Adder...</div>';

    const [srvRes, provRes] = await Promise.all([
      API.get('/api/services'),
      API.get('/api/api-configs/providers')
    ]);

    if (!srvRes.success || !provRes.success) {
      container.innerHTML = `<div class="glass-panel" style="padding: 24px; color: var(--color-danger);">Failed to load services or providers.</div>`;
      return;
    }

    this.services = srvRes.services || [];
    this.providers = provRes.providers || [];

    let html = `
      <div class="page-header">
        <div>
          <h2>⚡ Service Adder</h2>
          <p>Add and configure SMM services mapped directly to your provider service IDs</p>
        </div>
        <div style="display: flex; gap: 12px;">
          <button class="btn btn-primary" onclick="ServiceAdderComponent.showCreateModal()">+ Add New Service</button>
        </div>
      </div>

      <!-- Quick Info Banner -->
      <div class="glass-panel" style="padding: 16px 20px; margin-bottom: 24px; border-left: 4px solid var(--accent-primary); display: flex; align-items: center; justify-content: space-between;">
        <div style="font-size: 13px;">
          💡 <strong>How it works:</strong> Add your SMM panel services here by entering the <strong>Provider Service ID</strong> (from your SMM provider's services list). These services will immediately appear in your <strong>Engagement</strong> tab for Views and Likes!
        </div>
      </div>

      <!-- Configured Services Table -->
      <div class="glass-panel" style="padding: 24px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
          <h3 style="font-size: 16px;">Configured SMM Services (${this.services.length})</h3>
          <div style="display: flex; gap: 8px;">
            <button class="btn btn-secondary btn-sm" onclick="ServiceAdderComponent.render(document.getElementById('page-content'))">🔄 Refresh List</button>
          </div>
        </div>

        <div class="table-container">
          <table class="data-table">
            <thead>
              <tr>
                <th>Service Name</th>
                <th>Category</th>
                <th>Provider</th>
                <th>Provider Service ID</th>
                <th>Min / Max</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              ${this.services.length > 0 ? this.services.map(s => `
                <tr>
                  <td style="font-weight: 600;">
                    <div>${s.name}</div>
                    <div style="font-size: 11px; color: var(--text-dim); font-family: monospace;">${s.service_id_code || ('ID: ' + s.id)}</div>
                  </td>
                  <td>
                    <span class="status-pill ${s.category.toLowerCase() === 'views' ? 'info' : (s.category.toLowerCase() === 'likes' ? 'warning' : 'connected')}">
                      ${s.category}
                    </span>
                  </td>
                  <td style="font-weight: 500;">${s.provider_name}</td>
                  <td><code style="font-size: 13px; font-weight: 700; color: var(--accent-primary);">${s.provider_service_id}</code></td>
                  <td style="font-size: 13px;">${s.min_quantity ? s.min_quantity.toLocaleString() : '10'} - ${s.max_quantity ? s.max_quantity.toLocaleString() : '100,000'}</td>
                  <td><span class="status-pill ${s.is_active ? 'active' : 'disabled'}">${s.is_active ? 'Active' : 'Disabled'}</span></td>
                  <td>
                    <div style="display: flex; gap: 6px;">
                      <button class="btn btn-secondary btn-sm" onclick="ServiceAdderComponent.showEditModal(${s.id})">Edit</button>
                      <button class="btn btn-danger btn-sm" onclick="ServiceAdderComponent.deleteService(${s.id}, '${s.name}')">Delete</button>
                    </div>
                  </td>
                </tr>
              `).join('') : `
                <tr><td colspan="7" style="text-align: center; color: var(--text-dim); padding: 36px;">No services added yet. Click "+ Add New Service" to add your first service.</td></tr>
              `}
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
        <h3>+ Add New SMM Service</h3>
        <button class="modal-close" onclick="App.closeModal()">✕</button>
      </div>

      <form id="add-service-form">
        <div class="form-group">
          <label class="form-label">Service Name</label>
          <input type="text" id="add-srv-name" class="form-control" placeholder="e.g. YouTube Fast Views HQ or Instagram Real Likes" required autofocus>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
          <div class="form-group">
            <label class="form-label">Category</label>
            <select id="add-srv-category" class="form-control" required>
              <option value="Views" selected>Views</option>
              <option value="Likes">Likes</option>
              <option value="Followers">Followers</option>
              <option value="Subscribers">Subscribers</option>
              <option value="Comments">Comments</option>
              <option value="Shares">Shares</option>
              <option value="Other">Other</option>
            </select>
          </div>

          <div class="form-group">
            <label class="form-label">Target API Provider</label>
            <select id="add-srv-provider" class="form-control" required>
              ${this.providers.map(p => `<option value="${p.id}">${p.name} (${p.slug})</option>`).join('')}
            </select>
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">Provider Service ID (from your SMM provider)</label>
          <input type="text" id="add-srv-prov-id" class="form-control" placeholder="e.g. 10322 or 1123" required>
          <span style="font-size: 11px; color: var(--text-dim);">The exact Service ID number as listed in your SMM panel API.</span>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
          <div class="form-group">
            <label class="form-label">Minimum Quantity</label>
            <input type="number" id="add-srv-min" class="form-control" value="10" min="1" required>
          </div>

          <div class="form-group">
            <label class="form-label">Maximum Quantity</label>
            <input type="number" id="add-srv-max" class="form-control" value="100000" min="1" required>
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">Service Description / Notes (Optional)</label>
          <textarea id="add-srv-desc" class="form-control" rows="2" placeholder="Speed, retention info, or details"></textarea>
        </div>

        <div style="display: flex; gap: 12px; justify-content: flex-end; margin-top: 24px;">
          <button type="button" class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
          <button type="submit" class="btn btn-primary">Save & Add Service</button>
        </div>
      </form>
    `);

    document.getElementById('add-service-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = document.getElementById('add-srv-name').value.trim();
      const category = document.getElementById('add-srv-category').value;
      const providerId = parseInt(document.getElementById('add-srv-provider').value, 10);
      const providerServiceId = document.getElementById('add-srv-prov-id').value.trim();
      const minQuantity = parseInt(document.getElementById('add-srv-min').value, 10);
      const maxQuantity = parseInt(document.getElementById('add-srv-max').value, 10);
      const description = document.getElementById('add-srv-desc').value.trim();

      const res = await API.post('/api/services', {
        name,
        category,
        providerId,
        providerServiceId,
        minQuantity,
        maxQuantity,
        description
      });

      if (res.success) {
        App.closeModal();
        API.showToast(res.message || 'Service added successfully!', 'success');
        this.render(document.getElementById('page-content'));
      } else {
        API.showToast(res.error || 'Failed to add service', 'error');
      }
    });
  },

  showEditModal(serviceId) {
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
            <select id="edit-srv-category" class="form-control" required>
              <option value="Views" ${s.category === 'Views' ? 'selected' : ''}>Views</option>
              <option value="Likes" ${s.category === 'Likes' ? 'selected' : ''}>Likes</option>
              <option value="Followers" ${s.category === 'Followers' ? 'selected' : ''}>Followers</option>
              <option value="Subscribers" ${s.category === 'Subscribers' ? 'selected' : ''}>Subscribers</option>
              <option value="Comments" ${s.category === 'Comments' ? 'selected' : ''}>Comments</option>
              <option value="Shares" ${s.category === 'Shares' ? 'selected' : ''}>Shares</option>
              <option value="Other" ${s.category === 'Other' ? 'selected' : ''}>Other</option>
            </select>
          </div>

          <div class="form-group">
            <label class="form-label">Provider</label>
            <select id="edit-srv-provider" class="form-control" required>
              ${this.providers.map(p => `<option value="${p.id}" ${p.id === s.provider_id ? 'selected' : ''}>${p.name}</option>`).join('')}
            </select>
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">Provider Service ID</label>
          <input type="text" id="edit-srv-prov-id" class="form-control" value="${s.provider_service_id}" required>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
          <div class="form-group">
            <label class="form-label">Min Quantity</label>
            <input type="number" id="edit-srv-min" class="form-control" value="${s.min_quantity}" required>
          </div>

          <div class="form-group">
            <label class="form-label">Max Quantity</label>
            <input type="number" id="edit-srv-max" class="form-control" value="${s.max_quantity}" required>
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">Status</label>
          <select id="edit-srv-active" class="form-control">
            <option value="1" ${s.is_active ? 'selected' : ''}>Active</option>
            <option value="0" ${!s.is_active ? 'selected' : ''}>Disabled</option>
          </select>
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
        category: document.getElementById('edit-srv-category').value,
        providerId: parseInt(document.getElementById('edit-srv-provider').value, 10),
        providerServiceId: document.getElementById('edit-srv-prov-id').value.trim(),
        minQuantity: parseInt(document.getElementById('edit-srv-min').value, 10),
        maxQuantity: parseInt(document.getElementById('edit-srv-max').value, 10),
        isActive: document.getElementById('edit-srv-active').value === '1'
      });

      if (res.success) {
        App.closeModal();
        API.showToast(res.message || 'Service updated.', 'success');
        this.render(document.getElementById('page-content'));
      } else {
        API.showToast(res.error || 'Failed to update service', 'error');
      }
    });
  },

  async deleteService(serviceId, serviceName) {
    if (!confirm(`Are you sure you want to delete the service "${serviceName}"?`)) return;

    const res = await API.delete(`/api/services/${serviceId}`);
    if (res.success) {
      API.showToast(res.message, 'success');
      this.render(document.getElementById('page-content'));
    } else {
      API.showToast(res.error || 'Failed to delete service', 'error');
    }
  }
};

// Alias for backwards compatibility
window.ServiceManagerComponent = window.ServiceAdderComponent;

