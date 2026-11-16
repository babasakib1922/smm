/**
 * Main Application Orchestrator & Router
 */

window.App = {
  user: null,
  currentPage: 'engagement',

  async init() {
    this.initEventListeners();

    // Check if visiting a shared schedule link (#share-<token>)
    if (window.location.hash && window.location.hash.startsWith('#share-')) {
      const token = window.location.hash.substring(7);
      this.renderSharedSchedule(token);
      return;
    }

    // Check authentication
    const token = API.getToken();
    if (token) {
      const res = await API.get('/api/auth/me');
      if (res.success && res.user) {
        this.user = res.user;
        this.showApp();
        this.navigate('engagement');
        this.refreshNotificationsBadge();
        return;
      }
    }

    this.showLogin();
  },

  initEventListeners() {
    // Login form submission
    document.getElementById('login-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const passKeyInput = document.getElementById('login-passkey');
      const passKey = passKeyInput ? passKeyInput.value.trim() : '';

      if (!passKey) {
        API.showToast('Please enter your Access Pass Key.', 'warning');
        return;
      }

      const res = await API.post('/api/auth/login', { passKey });
      if (res.success) {
        API.setToken(res.token);
        this.user = res.user;
        API.showToast(`Welcome back, ${res.user.username}!`, 'success');
        this.showApp();
        this.navigate('engagement');
        this.refreshNotificationsBadge();
      } else {
        API.showToast(res.error || 'Login failed. Invalid Access Pass Key.', 'error');
      }
    });

    // Logout button
    document.getElementById('logout-btn').addEventListener('click', async () => {
      await API.post('/api/auth/logout');
      API.setToken(null);
      this.user = null;
      this.showLogin('You have been logged out.');
    });

    // Sidebar navigation clicks
    document.querySelectorAll('.nav-item').forEach(item => {
      item.addEventListener('click', () => {
        const page = item.getAttribute('data-page');
        if (page) this.navigate(page);
      });
    });

    // Mobile menu toggle
    const mobileBtn = document.getElementById('mobile-toggle');
    const sidebar = document.getElementById('sidebar');
    if (mobileBtn && sidebar) {
      mobileBtn.addEventListener('click', () => {
        sidebar.classList.toggle('mobile-open');
      });
    }

    // Modal background close
    const modal = document.getElementById('generic-modal');
    modal.addEventListener('click', (e) => {
      if (e.target === modal) this.closeModal();
    });
  },

  showLogin(message = null) {
    if (this._heartbeatInterval) {
      clearInterval(this._heartbeatInterval);
      this._heartbeatInterval = null;
    }
    document.getElementById('login-screen').classList.add('active');
    document.getElementById('app-container').style.display = 'none';
    if (message) {
      API.showToast(message, 'info');
    }
  },

  showApp() {
    document.getElementById('login-screen').classList.remove('active');
    document.getElementById('app-container').style.display = 'flex';

    // Start background scheduler heartbeat (ticks every 60 seconds to trigger due batches automatically)
    if (!this._heartbeatInterval) {
      this._heartbeatInterval = setInterval(async () => {
        if (API.getToken()) {
          try {
            await fetch('/api/cron').catch(() => {});
          } catch (_) {}
        }
      }, 60000);
    }

    // Update Header
    document.getElementById('nav-username').textContent = this.user.username;
    this.updateBalanceDisplay();

    const roleTag = document.getElementById('nav-user-role');
    roleTag.textContent = this.user.role;
    roleTag.className = `role-tag ${this.user.role.toLowerCase()}`;

    // Admin-only menu visibility (Section 2 & 22: Do not expose admin navigation to USER accounts)
    const adminSection = document.getElementById('admin-nav-section');
    if (this.user.role === 'ADMIN') {
      adminSection.style.display = 'block';
    } else {
      adminSection.style.display = 'none';
    }
  },

  updateBalanceDisplay() {
    const balanceElem = document.getElementById('nav-user-balance');
    const container = document.getElementById('nav-balance-container');
    if (!balanceElem) return;

    if (this.user && this.user.hasConnectedApi) {
      const pName = this.user.apiProviderName ? `${this.user.apiProviderName}: ` : 'SMM API: ';
      balanceElem.textContent = `${pName}$${parseFloat(this.user.apiBalance || 0).toFixed(2)}`;
      if (container) {
        container.style.background = 'rgba(16, 185, 129, 0.12)';
        container.style.borderColor = 'rgba(16, 185, 129, 0.35)';
      }
    } else {
      balanceElem.textContent = '🔌 Connect SMM API';
      if (container) {
        container.style.background = 'rgba(59, 130, 246, 0.15)';
        container.style.borderColor = 'rgba(59, 130, 246, 0.4)';
      }
    }
  },

  async refreshSmmBalance() {
    if (!this.user || !this.user.hasConnectedApi) {
      if (window.ApiManagementComponent) {
        ApiManagementComponent.showConnectModal();
      }
      return;
    }
    API.showToast('Refreshing live SMM panel balance from provider...', 'info');
    const res = await API.get('/api/api-configs/balance');
    if (res.success && res.hasApi) {
      this.user.apiBalance = res.balance;
      this.user.apiProviderName = res.providerName;
      this.updateBalanceDisplay();
      API.showToast(`Updated ${res.providerName} Balance: $${parseFloat(res.balance).toFixed(2)}`, 'success');
    } else {
      if (window.ApiManagementComponent) {
        ApiManagementComponent.showConnectModal();
      }
    }
  },

  async loadUser() {
    const res = await API.get('/api/auth/me');
    if (res.success && res.user) {
      this.user = res.user;
      this.updateBalanceDisplay();
    }
  },

  async refreshNotificationsBadge() {
    const res = await API.get('/api/notifications');
    const badge = document.getElementById('nav-notif-badge');
    if (res.success && res.unreadCount > 0) {
      badge.textContent = res.unreadCount;
      badge.style.display = 'inline-block';
    } else {
      badge.style.display = 'none';
    }
  },

  navigate(page) {
    this.currentPage = page;

    // Highlight active nav item
    document.querySelectorAll('.nav-item').forEach(item => {
      if (item.getAttribute('data-page') === page) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    });

    const container = document.getElementById('page-content');
    window.scrollTo({ top: 0, behavior: 'smooth' });

    switch (page) {
      case 'engagement':
        EngagementComponent.render(container);
        break;
      case 'orders':
        OrderHistoryComponent.render(container);
        break;
      case 'user-management':
        if (this.user.role !== 'ADMIN') {
          API.showToast('Access denied', 'error');
          this.navigate('engagement');
          return;
        }
        UserManagementComponent.render(container);
        break;
      case 'admin-settings':
        if (this.user.role !== 'ADMIN') {
          API.showToast('Access denied', 'error');
          this.navigate('engagement');
          return;
        }
        AdminSettingsComponent.render(container);
        break;
      case 'api-management':
        ApiManagementComponent.render(container);
        break;
      case 'service-manage':
      case 'service-adder':
      case 'service-manager':
        if (window.ServiceManageComponent) {
          ServiceManageComponent.render(container);
        } else if (window.ServiceAdderComponent) {
          ServiceAdderComponent.render(container);
        }
        break;
        break;
      case 'dashboard':
      case 'create-order':
      case 'scheduler':
      default:
        this.navigate('engagement');
        break;
    }
  },

  showModal(htmlContent) {
    const modalBody = document.getElementById('generic-modal-body');
    const modal = document.getElementById('generic-modal');
    modalBody.innerHTML = htmlContent;
    modal.classList.add('active');
  },

  closeModal() {
    const modal = document.getElementById('generic-modal');
    modal.classList.remove('active');
  },

  async renderSharedSchedule(token) {
    document.getElementById('login-screen').classList.remove('active');
    document.getElementById('app-container').style.display = 'block';
    document.getElementById('sidebar').style.display = 'none';
    document.getElementById('navbar').style.display = 'none';
    document.getElementById('main-wrapper').style.marginLeft = '0';

    const container = document.getElementById('page-content');
    container.innerHTML = '<div style="text-align: center; padding: 40px;">Loading shared campaign schedule...</div>';

    const res = await API.get(`/api/scheduler/share/${token}`);
    if (!res.success) {
      container.innerHTML = `
        <div class="glass-panel" style="padding: 32px; text-align: center; max-width: 600px; margin: 40px auto;">
          <h3 style="color: var(--color-danger); margin-bottom: 8px;">Schedule Not Found</h3>
          <p style="color: var(--text-muted);">${res.error || 'This link has expired or is invalid.'}</p>
        </div>
      `;
      return;
    }

    const { campaign, batches } = res;
    container.innerHTML = `
      <div style="max-width: 900px; margin: 40px auto;">
        <div class="glass-panel" style="padding: 32px; margin-bottom: 24px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
            <div>
              <span class="status-pill info">Read-Only Campaign Schedule</span>
              <h2 style="font-size: 24px; font-weight: 700; margin-top: 6px;">${campaign.name}</h2>
            </div>
            <span class="status-pill ${campaign.status.toLowerCase()}">${campaign.status}</span>
          </div>

          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; font-size: 13px; margin-bottom: 24px; background: rgba(0,0,0,0.2); padding: 16px; border-radius: var(--radius-sm);">
            <div>Package: <strong>${campaign.package_name}</strong></div>
            <div>Total Volume: <strong>${campaign.total_quantity.toLocaleString()}</strong></div>
            <div>Batches: <strong>${campaign.total_batches}</strong></div>
            <div>Interval: <strong>${campaign.interval_minutes} minutes</strong></div>
            <div>Campaign Window: <strong>${campaign.campaign_window_hours} hours</strong></div>
            <div>Estimated Completion: <strong>${new Date(campaign.estimated_end_time).toLocaleString()}</strong></div>
          </div>

          <div class="table-container">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Batch #</th>
                  <th>Quantity</th>
                  <th>Relative Time</th>
                  <th>Scheduled Date & Time (UTC)</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                ${batches.map(b => `
                  <tr>
                    <td>Batch ${b.batch_number}</td>
                    <td style="font-weight: 600;">${b.planned_quantity.toLocaleString()}</td>
                    <td>+${b.relative_time_minutes} min</td>
                    <td style="font-size: 12px; color: var(--text-muted);">${new Date(b.scheduled_at).toUTCString()}</td>
                    <td><span class="status-pill ${b.status.toLowerCase()}">${b.status}</span></td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  }
};

window.addEventListener('DOMContentLoaded', () => {
  App.init();
});

