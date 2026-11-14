window.ServicesComponent = {
  async render(container) {
    container.innerHTML = '<div style="text-align: center; padding: 40px;">Loading services catalog...</div>';

    const res = await API.get('/api/services');
    if (!res.success) {
      container.innerHTML = `<div class="glass-panel" style="padding: 24px; color: var(--color-danger);">${res.error}</div>`;
      return;
    }

    const { services, categories } = res;

    let html = `
      <div class="page-header">
        <div>
          <h2>Services Catalog</h2>
          <p>Browse available delivery services and standard platform pricing</p>
        </div>
        ${App.user && App.user.role === 'ADMIN' ? `
          <button class="btn btn-primary btn-sm" onclick="App.navigate('service-manager')">Manage Services 🛠️</button>
        ` : ''}
      </div>

      <!-- Filters -->
      <div class="glass-panel" style="padding: 18px 24px; margin-bottom: 24px; display: flex; gap: 16px; align-items: center;">
        <div style="flex: 1;">
          <input type="text" id="services-search-input" class="form-control" placeholder="Search service by name or code...">
        </div>
        <div>
          <select id="services-category-filter" class="form-control">
            ${categories.map(c => `<option value="${c}">${c}</option>`).join('')}
          </select>
        </div>
      </div>

      <!-- Services Table -->
      <div class="glass-panel" style="padding: 24px;">
        <div class="table-container">
          <table class="data-table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Service Name</th>
                <th>Category</th>
                <th>Rate / 1k</th>
                <th>Min / Max</th>
                <th>Description</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody id="services-tbody">
              ${services.map(s => `
                <tr class="service-row" data-cat="${s.category}" data-search="${(s.name + ' ' + s.service_id_code).toLowerCase()}">
                  <td style="font-family: monospace; font-size: 12px; font-weight: 600;">${s.service_id_code}</td>
                  <td style="font-weight: 600;">${s.name}</td>
                  <td><span class="status-pill info">${s.category}</span></td>
                  <td style="font-weight: 700; color: var(--color-success);">$${s.price_per_k.toFixed(2)}</td>
                  <td style="font-size: 13px;">${s.min_quantity.toLocaleString()} - ${s.max_quantity.toLocaleString()}</td>
                  <td style="font-size: 12px; color: var(--text-muted); max-width: 250px;">${s.description || 'Verified delivery.'}</td>
                  <td>
                    <button class="btn btn-primary btn-sm" onclick="App.navigate('create-order')">Order</button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;

    container.innerHTML = html;

    const searchInput = document.getElementById('services-search-input');
    const catSelect = document.getElementById('services-category-filter');

    const filterRows = () => {
      const q = searchInput.value.toLowerCase().trim();
      const cat = catSelect.value;
      document.querySelectorAll('.service-row').forEach(row => {
        const rowCat = row.getAttribute('data-cat');
        const rowText = row.getAttribute('data-search');
        const matchCat = cat === 'All' || rowCat === cat;
        const matchText = !q || rowText.includes(q);
        row.style.display = matchCat && matchText ? '' : 'none';
      });
    };

    searchInput.addEventListener('input', filterRows);
    catSelect.addEventListener('change', filterRows);
  }
};

