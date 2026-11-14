/**
 * Service Management Component
 * Cross-provider service search across all connected API providers
 * Engagement Automation Slot mapping & enable/disable toggles (Views, Likes, Saves, Reposts, Shares)
 */

window.ServiceManageComponent = {
  mappings: [],
  services: [],
  providers: [],
  currentQuery: '',
  currentCategory: 'All',
  currentProviderId: 'All',
  isLoading: false,

  async render(container) {
    container.innerHTML = '<div style="text-align: center; padding: 50px; color: var(--text-muted);">Loading Service Management...</div>';

    await this.loadData();
    this.renderView(container);
  },

  async loadData() {
    this.isLoading = true;
    try {
      const [mapRes, srvRes] = await Promise.all([
        API.get('/api/services/user-mappings'),
        API.get(`/api/services/provider-search?q=${encodeURIComponent(this.currentQuery)}&category=${encodeURIComponent(this.currentCategory)}&providerId=${encodeURIComponent(this.currentProviderId)}`)
      ]);

      if (mapRes.success) {
        this.mappings = mapRes.mappings || [];
      }
      if (srvRes.success) {
        this.services = srvRes.services || [];
        this.providers = srvRes.providers || [];
      }
    } catch (err) {
      console.error('Failed to load service data:', err);
    } finally {
      this.isLoading = false;
    }
  },

  renderView(container) {
    const slotIcons = {
      views: '👁️',
      likes: '❤️',
      saves: '💾',
      reposts: '🔁',
      shares: '↗️'
    };

    const slotLabels = {
      views: 'Views Delivery',
      likes: 'Likes Delivery',
      saves: 'Saves / Favorites',
      reposts: 'Reposts Pacing',
      shares: 'Direct Shares'
    };

    let html = `
      <div class="page-header">
        <div>
          <h2>🛠️ Service Management & Automation Slots</h2>
          <p>Search services across all connected SMM providers and assign them to your Engagement automation slots</p>
        </div>
        <div style="display: flex; gap: 10px;">
          <button class="btn btn-secondary btn-sm" onclick="ServiceManageComponent.syncProviderServices()">
            🔄 Sync Services from APIs
          </button>
        </div>
      </div>

      <!-- SECTION 1: ENGAGEMENT AUTOMATION SLOTS CONFIGURATION -->
      <div class="glass-panel" style="padding: 24px; margin-bottom: 28px; border-radius: 14px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
          <div>
            <h3 style="font-size: 16px; font-weight: 700; margin: 0 0 4px 0;">⚡ Engagement Automation Slots</h3>
            <p style="font-size: 12px; color: var(--text-muted); margin: 0;">
              Configure which connected SMM service powers each engagement feature in your <strong>⚡ Engagement</strong> tab.
              You can enable or disable any optional engagement type.
            </p>
          </div>
          <span class="status-pill active" style="font-size: 11px;">5 Configured Slots</span>
        </div>

        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 14px;" id="automation-slots-grid">
          ${this.mappings.map(m => {
            const type = m.service_type;
            const icon = slotIcons[type] || '⚡';
            const label = slotLabels[type] || type.toUpperCase();
            const isEnabled = m.is_enabled === 1;

            return `
              <div class="glass-panel" style="padding: 16px; border-radius: 12px; background: ${isEnabled ? '#ffffff' : '#f8f8f8'}; border: 1.5px solid ${isEnabled ? '#bfdbfe' : '#e8e8e8'};">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                  <div style="display: flex; align-items: center; gap: 8px;">
                    <span style="font-size: 20px;">${icon}</span>
                    <strong style="font-size: 14px; text-transform: capitalize; color: #0f172a;">${label}</strong>
                  </div>
                  
                  <!-- Enable / Disable Toggle -->
                  <label style="display: flex; align-items: center; gap: 6px; font-size: 12px; cursor: pointer; user-select: none;">
                    <span style="color: ${isEnabled ? 'var(--color-success)' : 'var(--text-dim)'}; font-weight: 600;">
                      ${isEnabled ? 'Enabled' : 'Disabled'}
                    </span>
                    <input type="checkbox" ${isEnabled ? 'checked' : ''} 
                           onchange="ServiceManageComponent.toggleSlot('${type}', this.checked)"
                           style="width: 16px; height: 16px; cursor: pointer; accent-color: #2563eb;">
                  </label>
                </div>

                <!-- Current Assigned Service Details -->
                <div style="padding: 10px 12px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; margin-bottom: 12px; font-size: 12px;">
                  <div style="color: var(--text-muted); margin-bottom: 2px;">Assigned Service:</div>
                  <div style="font-weight: 600; color: #0f172a; margin-bottom: 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                    ${m.service_name || 'No service assigned'}
                  </div>
                  <div style="display: flex; justify-content: space-between; color: var(--text-dim); font-size: 11px;">
                    <span>Provider: <strong style="color: var(--text-muted);">${m.provider_name || 'None'}</strong></span>
                    <span>ID: <code style="color: var(--accent-primary);">${m.provider_service_id || '—'}</code></span>
                    <span>Rate: <strong style="color: var(--color-success);">$${parseFloat(m.rate_per_k || 0).toFixed(2)}/k</strong></span>
                  </div>
                </div>

                <div style="display: flex; gap: 8px;">
                  <button class="btn btn-secondary btn-sm" style="flex: 1; font-size: 11px; padding: 6px;"
                          onclick="ServiceManageComponent.filterCategoryForSlot('${type}')">
                    🔍 Find in Search
                  </button>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>

      <!-- SECTION 2: CROSS-PROVIDER SERVICES SEARCH -->
      <div class="glass-panel" style="padding: 24px; border-radius: 14px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; flex-wrap: wrap; gap: 12px;">
          <div>
            <h3 style="font-size: 16px; font-weight: 700; margin: 0 0 4px 0;">🔍 Search Services Across Connected Providers</h3>
            <p style="font-size: 12px; color: var(--text-muted); margin: 0;">
              Browse or search live services from all of your connected APIs. Select any service to assign it to an automation slot.
            </p>
          </div>
          
          <div style="display: flex; gap: 10px; align-items: center; flex-wrap: wrap;">
            <!-- Category Filter -->
            <select id="service-search-category" class="form-control" style="font-size: 12px; padding: 6px 12px; width: auto;"
                    onchange="ServiceManageComponent.onCategoryChange(this.value)">
              <option value="All" ${this.currentCategory === 'All' ? 'selected' : ''}>All Categories</option>
              <option value="Views" ${this.currentCategory === 'Views' ? 'selected' : ''}>Views</option>
              <option value="Likes" ${this.currentCategory === 'Likes' ? 'selected' : ''}>Likes</option>
              <option value="Saves" ${this.currentCategory === 'Saves' ? 'selected' : ''}>Saves</option>
              <option value="Reposts" ${this.currentCategory === 'Reposts' ? 'selected' : ''}>Reposts</option>
              <option value="Shares" ${this.currentCategory === 'Shares' ? 'selected' : ''}>Shares</option>
            </select>

            <!-- Provider Filter -->
            <select id="service-search-provider" class="form-control" style="font-size: 12px; padding: 6px 12px; width: auto;"
                    onchange="ServiceManageComponent.onProviderChange(this.value)">
              <option value="All" ${this.currentProviderId === 'All' ? 'selected' : ''}>All Providers</option>
              ${this.providers.map(p => `
                <option value="${p.id}" ${this.currentProviderId == p.id ? 'selected' : ''}>${p.name}</option>
              `).join('')}
            </select>

            <!-- Text Search Input -->
            <div style="position: relative; width: 220px;">
              <input type="text" id="service-search-query" class="form-control" placeholder="Search service name or ID..."
                     value="${this.currentQuery}"
                     style="font-size: 12px; padding: 6px 10px;"
                     oninput="ServiceManageComponent.onSearchInput(this.value)">
            </div>
          </div>
        </div>

        <!-- Services Results Table -->
        <div id="service-results-container">
          ${this.renderServicesTable()}
        </div>
      </div>
    `;

    container.innerHTML = html;
  },

  renderServicesTable() {
    if (this.isLoading) {
      return '<div style="text-align: center; padding: 30px; color: var(--text-dim);">Searching provider services...</div>';
    }

    if (this.services.length === 0) {
      return `
        <div style="text-align: center; padding: 40px; color: var(--text-dim);">
          <div style="font-size: 24px; margin-bottom: 8px;">🔍</div>
          <div style="font-size: 14px; font-weight: 600; color: var(--text-muted);">No services found</div>
          <div style="font-size: 12px; margin-top: 4px; margin-bottom: 14px;">Try searching for another keyword or click "🔄 Sync Services from APIs" above.</div>
          <button class="btn btn-secondary btn-sm" onclick="ServiceManageComponent.resetFilters()">
            ✕ Reset Filters & Show All Services
          </button>
        </div>
      `;
    }

    return `
      <div class="table-container">
        <table class="data-table">
          <thead>
            <tr>
              <th>Provider</th>
              <th>Service ID</th>
              <th>Service Name</th>
              <th>Category</th>
              <th>Rate / 1k</th>
              <th>Min / Max</th>
              <th style="text-align: right;">Assign to Automation</th>
            </tr>
          </thead>
          <tbody>
            ${this.services.map(s => `
              <tr>
                <td>
                  <span class="status-pill connected" style="font-size: 11px; padding: 3px 8px;">
                    ${s.provider_name}
                  </span>
                </td>
                <td>
                  <code style="font-size: 12px; font-weight: 700; color: var(--accent-primary);">
                    ${s.provider_service_id}
                  </code>
                </td>
                <td style="font-weight: 600; font-size: 13px; max-width: 320px;">
                  <div>${s.name}</div>
                </td>
                <td>
                  <span class="status-pill ${this.getCategoryPillClass(s.category)}" style="font-size: 11px;">
                    ${s.category}
                  </span>
                </td>
                <td style="font-weight: 700; color: var(--color-success); font-size: 13px;">
                  $${parseFloat(s.rate || 0).toFixed(2)}
                </td>
                <td style="font-size: 12px; color: var(--text-muted);">
                  ${parseInt(s.min_quantity || 10).toLocaleString()} - ${parseInt(s.max_quantity || 100000).toLocaleString()}
                </td>
                <td style="text-align: right;">
                  <div style="display: inline-flex; gap: 6px;">
                    <select class="form-control" style="font-size: 11px; padding: 4px 8px; width: auto; cursor: pointer;"
                            onchange="ServiceManageComponent.assignFromSelect('${s.provider_id}', '${s.provider_service_id}', '${encodeURIComponent(s.name)}', ${s.rate || 0}, ${s.min_quantity || 10}, ${s.max_quantity || 100000}, this)">
                      <option value="">Assign to Slot ▾</option>
                      <option value="views">Set as 👁️ Views</option>
                      <option value="likes">Set as ❤️ Likes</option>
                      <option value="saves">Set as 💾 Saves</option>
                      <option value="reposts">Set as 🔁 Reposts</option>
                      <option value="shares">Set as ↗️ Shares</option>
                    </select>
                  </div>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
      <div style="margin-top: 12px; font-size: 11px; color: var(--text-dim); text-align: right;">
        Showing ${this.services.length} services across connected providers
      </div>
    `;
  },

  getCategoryPillClass(category) {
    const c = (category || '').toLowerCase();
    if (c.includes('view')) return 'info';
    if (c.includes('like')) return 'warning';
    if (c.includes('save') || c.includes('fav')) return 'connected';
    if (c.includes('repost')) return 'active';
    if (c.includes('share')) return 'pending';
    return 'info';
  },

  async resetFilters() {
    this.currentQuery = '';
    this.currentCategory = 'All';
    this.currentProviderId = 'All';
    const qInput = document.getElementById('service-search-query');
    if (qInput) qInput.value = '';
    const catSelect = document.getElementById('service-search-category');
    if (catSelect) catSelect.value = 'All';
    const provSelect = document.getElementById('service-search-provider');
    if (provSelect) provSelect.value = 'All';
    await this.loadData();
    const resContainer = document.getElementById('service-results-container');
    if (resContainer) resContainer.innerHTML = this.renderServicesTable();
  },

  async onSearchInput(val) {
    this.currentQuery = val;
    clearTimeout(this._searchTimeout);
    this._searchTimeout = setTimeout(async () => {
      await this.loadData();
      const resContainer = document.getElementById('service-results-container');
      if (resContainer) resContainer.innerHTML = this.renderServicesTable();
    }, 300);
  },

  async onCategoryChange(cat) {
    this.currentCategory = cat;
    await this.loadData();
    const resContainer = document.getElementById('service-results-container');
    if (resContainer) resContainer.innerHTML = this.renderServicesTable();
  },

  async onProviderChange(pId) {
    this.currentProviderId = pId;
    await this.loadData();
    const resContainer = document.getElementById('service-results-container');
    if (resContainer) resContainer.innerHTML = this.renderServicesTable();
  },

  filterCategoryForSlot(slotType) {
    const catMap = {
      views: 'Views',
      likes: 'Likes',
      saves: 'Saves',
      reposts: 'Reposts',
      shares: 'Shares'
    };
    this.currentCategory = catMap[slotType] || 'All';
    const catSelect = document.getElementById('service-search-category');
    if (catSelect) catSelect.value = this.currentCategory;
    this.onCategoryChange(this.currentCategory);
    
    // Smooth scroll down to search section
    const resElem = document.getElementById('service-results-container');
    if (resElem) resElem.scrollIntoView({ behavior: 'smooth' });
  },

  async toggleSlot(serviceType, isEnabled) {
    const res = await API.post('/api/services/user-mappings/toggle', {
      serviceType,
      isEnabled: isEnabled ? 1 : 0
    });

    if (res.success) {
      API.showToast(res.message, 'success');
      await this.loadData();
      this.renderView(document.getElementById('page-content'));
    } else {
      API.showToast(res.error || 'Failed to toggle slot', 'error');
    }
  },

  async assignFromSelect(providerId, providerServiceId, encodedName, rate, minQty, maxQty, selectElem) {
    const serviceType = selectElem.value;
    if (!serviceType) return;

    selectElem.value = ''; // Reset select dropdown
    const serviceName = decodeURIComponent(encodedName);

    API.showToast(`Assigning to ${serviceType.toUpperCase()} automation slot...`, 'info');

    const res = await API.post('/api/services/user-mappings', {
      serviceType,
      isEnabled: 1,
      providerId: parseInt(providerId, 10),
      providerServiceId,
      serviceName,
      ratePerK: rate,
      minQuantity: minQty,
      maxQuantity: maxQty
    });

    if (res.success) {
      API.showToast(`✓ Assigned ${serviceName} to ${serviceType.toUpperCase()} slot!`, 'success');
      await this.loadData();
      this.renderView(document.getElementById('page-content'));
    } else {
      API.showToast(res.error || 'Failed to assign service', 'error');
    }
  },

  async syncProviderServices() {
    API.showToast('Connecting to your API providers and syncing latest services...', 'info');
    const res = await API.post('/api/services/sync-provider-services');
    if (res.success) {
      API.showToast(res.message, 'success');
      await this.loadData();
      this.renderView(document.getElementById('page-content'));
    } else {
      API.showToast(res.error || 'Failed to sync services', 'error');
    }
  }
};

