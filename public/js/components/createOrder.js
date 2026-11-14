window.CreateOrderComponent = {
  services: [],
  selectedService: null,

  async render(container) {
    container.innerHTML = '<div style="text-align: center; padding: 40px;">Loading services catalog...</div>';

    const res = await API.get('/api/services');
    if (!res.success) {
      container.innerHTML = `<div class="glass-panel" style="padding: 24px; color: var(--color-danger);">Failed to load services: ${res.error}</div>`;
      return;
    }

    this.services = res.services;
    const categories = res.categories;

    let html = `
      <div class="page-header">
        <div>
          <h2>Create New Order</h2>
          <p>Submit orders directly through verified API providers with transaction safety</p>
        </div>
      </div>

      <div style="display: grid; grid-template-columns: 2fr 1fr; gap: 32px;">
        <!-- Order Form Card -->
        <div class="glass-panel" style="padding: 28px;">
          <form id="order-form">
            <!-- Category Select -->
            <div class="form-group">
              <label class="form-label">Category</label>
              <select id="order-category-select" class="form-control">
                ${categories.map(c => `<option value="${c}">${c}</option>`).join('')}
              </select>
            </div>

            <!-- Service Select -->
            <div class="form-group">
              <label class="form-label">Service</label>
              <select id="order-service-select" class="form-control"></select>
            </div>

            <!-- Service Info Box -->
            <div id="service-info-box" style="display: none; background: rgba(59, 130, 246, 0.08); border: 1px solid rgba(59, 130, 246, 0.2); border-radius: var(--radius-sm); padding: 14px; margin-bottom: 20px;">
              <div style="display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 6px;">
                <span style="color: var(--text-muted);">Rate per 1,000:</span>
                <span id="info-rate" style="font-weight: 700; color: var(--color-success);">$0.00</span>
              </div>
              <div style="display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 6px;">
                <span style="color: var(--text-muted);">Min / Max Quantity:</span>
                <span id="info-min-max">10 - 100,000</span>
              </div>
              <p id="info-desc" style="font-size: 12px; color: var(--text-muted); margin-top: 8px; border-top: 1px solid rgba(255,255,255,0.05); padding-top: 8px;"></p>
            </div>

            <!-- Target URL -->
            <div class="form-group">
              <label class="form-label">Target Link / URL</label>
              <input type="url" id="order-target-url" class="form-control" placeholder="https://..." required>
              <span id="url-validation-msg" style="font-size: 11px; color: var(--color-danger); display: none;">Please enter a valid URL beginning with http:// or https://</span>
            </div>

            <!-- Quantity -->
            <div class="form-group">
              <label class="form-label">Quantity</label>
              <input type="number" id="order-quantity" class="form-control" placeholder="Enter quantity" required min="1">
              <span id="qty-validation-msg" style="font-size: 11px; color: var(--color-danger); display: none;"></span>
            </div>

            <!-- Price Calculation Display -->
            <div class="glass-panel" style="padding: 16px; margin: 24px 0; background: rgba(0,0,0,0.2);">
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <span style="font-size: 14px; color: var(--text-muted);">Calculated Charge:</span>
                <span id="calculated-charge" style="font-size: 22px; font-weight: 800; color: var(--color-success);">$0.00</span>
              </div>
            </div>

            <button type="submit" id="submit-order-btn" class="btn btn-primary" style="width: 100%; padding: 14px; font-size: 15px;">
              Review & Submit Order
            </button>
          </form>
        </div>

        <!-- Sidebar Guidelines & Balance -->
        <div style="display: flex; flex-direction: column; gap: 24px;">
          <div class="glass-panel" style="padding: 24px;">
            <h4 style="font-size: 15px; margin-bottom: 12px;">Account Balance</h4>
            <div style="font-size: 26px; font-weight: 800; color: var(--color-success); margin-bottom: 8px;">
              $${App.user ? App.user.balance.toFixed(2) : '0.00'}
            </div>
            <p style="font-size: 12px; color: var(--text-muted);">
              Orders deduct balance transactionally upon provider confirmation.
            </p>
          </div>

          <div class="glass-panel" style="padding: 24px;">
            <h4 style="font-size: 15px; margin-bottom: 12px;">🛡️ Ordering Rules</h4>
            <ul style="font-size: 13px; color: var(--text-muted); display: flex; flex-direction: column; gap: 10px; padding-left: 16px;">
              <li>Ensure your link is public and accessible.</li>
              <li>Do not place duplicate orders for the same link while an order is processing.</li>
              <li>Only authorized providers and services compliant with platform guidelines are utilized.</li>
            </ul>
          </div>
        </div>
      </div>
    `;

    container.innerHTML = html;

    // Attach event listeners
    this.initFormLogic();
  },

  initFormLogic() {
    const categorySelect = document.getElementById('order-category-select');
    const serviceSelect = document.getElementById('order-service-select');
    const targetUrlInput = document.getElementById('order-target-url');
    const quantityInput = document.getElementById('order-quantity');
    const chargeDisplay = document.getElementById('calculated-charge');
    const orderForm = document.getElementById('order-form');
    const submitBtn = document.getElementById('submit-order-btn');

    const updateServiceOptions = () => {
      const selectedCat = categorySelect.value;
      const filtered = selectedCat === 'All'
        ? this.services
        : this.services.filter(s => s.category === selectedCat);

      serviceSelect.innerHTML = filtered.map(s => `
        <option value="${s.id}">${s.name} - $${s.price_per_k.toFixed(2)}/1k</option>
      `).join('');

      this.updateSelectedService();
    };

    categorySelect.addEventListener('change', updateServiceOptions);
    serviceSelect.addEventListener('change', () => this.updateSelectedService());

    quantityInput.addEventListener('input', () => {
      this.recalculatePrice();
    });

    targetUrlInput.addEventListener('input', () => {
      const val = targetUrlInput.value.trim();
      const msg = document.getElementById('url-validation-msg');
      if (val && !/^https?:\/\/.+/i.test(val)) {
        msg.style.display = 'block';
      } else {
        msg.style.display = 'none';
      }
    });

    orderForm.addEventListener('submit', (e) => {
      e.preventDefault();
      this.handleFormSubmit();
    });

    // Initial population
    updateServiceOptions();
  },

  updateSelectedService() {
    const serviceSelect = document.getElementById('order-service-select');
    const serviceId = parseInt(serviceSelect.value, 10);
    this.selectedService = this.services.find(s => s.id === serviceId);

    const infoBox = document.getElementById('service-info-box');
    if (this.selectedService) {
      infoBox.style.display = 'block';
      document.getElementById('info-rate').textContent = `$${this.selectedService.price_per_k.toFixed(2)}`;
      document.getElementById('info-min-max').textContent = `${this.selectedService.min_quantity.toLocaleString()} - ${this.selectedService.max_quantity.toLocaleString()}`;
      document.getElementById('info-desc').textContent = this.selectedService.description || 'Standard high quality automated delivery.';
    } else {
      infoBox.style.display = 'none';
    }

    this.recalculatePrice();
  },

  recalculatePrice() {
    const qtyInput = document.getElementById('order-quantity');
    const chargeDisplay = document.getElementById('calculated-charge');
    const qtyMsg = document.getElementById('qty-validation-msg');

    const qty = parseInt(qtyInput.value, 10);
    if (!this.selectedService || isNaN(qty) || qty <= 0) {
      chargeDisplay.textContent = '$0.00';
      qtyMsg.style.display = 'none';
      return;
    }

    // Limit check
    if (qty < this.selectedService.min_quantity) {
      qtyMsg.textContent = `Quantity below minimum limit (${this.selectedService.min_quantity.toLocaleString()})`;
      qtyMsg.style.display = 'block';
    } else if (qty > this.selectedService.max_quantity) {
      qtyMsg.textContent = `Quantity exceeds maximum limit (${this.selectedService.max_quantity.toLocaleString()})`;
      qtyMsg.style.display = 'block';
    } else {
      qtyMsg.style.display = 'none';
    }

    const price = (qty / 1000) * this.selectedService.price_per_k;
    chargeDisplay.textContent = `$${price.toFixed(4)}`;
  },

  handleFormSubmit() {
    const url = document.getElementById('order-target-url').value.trim();
    const qty = parseInt(document.getElementById('order-quantity').value, 10);

    if (!/^https?:\/\/.+/i.test(url)) {
      API.showToast('Please enter a valid HTTP or HTTPS target URL.', 'error');
      return;
    }

    if (!this.selectedService || isNaN(qty) || qty < this.selectedService.min_quantity || qty > this.selectedService.max_quantity) {
      API.showToast('Quantity is invalid or out of allowed limits.', 'error');
      return;
    }

    const charge = (qty / 1000) * this.selectedService.price_per_k;
    if (App.user && App.user.balance < charge) {
      API.showToast(`Insufficient balance ($${App.user.balance.toFixed(2)} available, $${charge.toFixed(2)} required).`, 'error');
      return;
    }

    // Show Confirmation Modal
    App.showModal(`
      <div class="modal-header">
        <h3>Confirm Order Details</h3>
        <button class="modal-close" onclick="App.closeModal()">✕</button>
      </div>
      <div style="font-size: 14px; display: flex; flex-direction: column; gap: 12px; margin-bottom: 24px;">
        <div style="display: flex; justify-content: space-between;">
          <span style="color: var(--text-muted);">Service:</span>
          <span style="font-weight: 600;">${this.selectedService.name}</span>
        </div>
        <div style="display: flex; justify-content: space-between;">
          <span style="color: var(--text-muted);">Target URL:</span>
          <span style="word-break: break-all; max-width: 60%;">${url}</span>
        </div>
        <div style="display: flex; justify-content: space-between;">
          <span style="color: var(--text-muted);">Quantity:</span>
          <span style="font-weight: 600;">${qty.toLocaleString()}</span>
        </div>
        <div style="display: flex; justify-content: space-between; border-top: 1px solid var(--border-glass); padding-top: 10px;">
          <span style="font-weight: 700;">Total Charge:</span>
          <span style="font-weight: 800; color: var(--color-success); font-size: 18px;">$${charge.toFixed(2)}</span>
        </div>
      </div>
      <div style="display: flex; gap: 12px; justify-content: flex-end;">
        <button class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
        <button class="btn btn-primary" id="confirm-submit-btn">Confirm & Deduct Balance</button>
      </div>
    `);

    document.getElementById('confirm-submit-btn').addEventListener('click', async () => {
      const btn = document.getElementById('confirm-submit-btn');
      btn.disabled = true;
      btn.textContent = 'Submitting...';

      const res = await API.post('/api/orders', {
        serviceId: this.selectedService.id,
        targetUrl: url,
        quantity: qty
      });

      App.closeModal();

      if (res.success) {
        API.showToast(`Order #${res.order.id} submitted successfully!`, 'success');
        await App.loadUser(); // Refresh user balance in header
        App.navigate('orders');
      } else {
        API.showToast(res.error || 'Failed to submit order', 'error');
      }
    });
  }
};

