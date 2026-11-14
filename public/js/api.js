/**
 * API Client with JWT authorization, error interception, and toast notifications
 */

const API = {
  getToken() {
    return localStorage.getItem('smm_panel_token');
  },

  setToken(token) {
    if (token) {
      localStorage.setItem('smm_panel_token', token);
    } else {
      localStorage.removeItem('smm_panel_token');
    }
  },

  showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    // Deduplicate: Don't show identical message if already visible
    const existing = Array.from(container.children).find(t => t.textContent.includes(message));
    if (existing) return;

    // Limit maximum active toasts to 3
    while (container.children.length >= 3) {
      container.removeChild(container.firstChild);
    }

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
      <span>${type === 'success' ? '✓' : type === 'error' ? '✕' : 'ℹ'}</span>
      <span>${message}</span>
    `;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  },

  async request(endpoint, options = {}) {
    const token = this.getToken();
    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      ...(options.headers || {})
    };

    try {
      const response = await fetch(endpoint, {
        ...options,
        headers
      });

      // Intercept authentication failure
      if (response.status === 401 || response.status === 403) {
        const errorData = await response.json().catch(() => ({}));
        if (endpoint !== '/api/auth/login') {
          this.setToken(null);
          if (window.App && typeof window.App.showLogin === 'function') {
            window.App.showLogin(errorData.error || 'Session expired. Please log in with your access pass key.');
          }
          return { success: false, error: errorData.error || 'Unauthorized' };
        }
        return errorData;
      }

      // Check if response is raw file / blob
      const contentType = response.headers.get('content-type');
      if (contentType && (contentType.includes('text/csv') || contentType.includes('application/octet-stream'))) {
        return await response.blob();
      }

      const data = await response.json();
      return data;
    } catch (err) {
      console.error(`API Error on ${endpoint}:`, err);
      this.showToast(err.message || 'Network communication error', 'error');
      return { success: false, error: err.message };
    }
  },

  get(endpoint, params = {}) {
    const query = new URLSearchParams(params).toString();
    const url = query ? `${endpoint}?${query}` : endpoint;
    return this.request(url, { method: 'GET' });
  },

  post(endpoint, body = {}) {
    return this.request(endpoint, {
      method: 'POST',
      body: JSON.stringify(body)
    });
  },

  put(endpoint, body = {}) {
    return this.request(endpoint, {
      method: 'PUT',
      body: JSON.stringify(body)
    });
  },

  del(endpoint) {
    return this.request(endpoint, {
      method: 'DELETE'
    });
  }
};

window.API = API;

