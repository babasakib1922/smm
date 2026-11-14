window.NotificationsComponent = {
  async render(container) {
    container.innerHTML = '<div style="text-align: center; padding: 40px;">Loading notifications...</div>';

    const res = await API.get('/api/notifications');
    if (!res.success) {
      container.innerHTML = `<div class="glass-panel" style="padding: 24px; color: var(--color-danger);">${res.error}</div>`;
      return;
    }

    const { notifications, unreadCount } = res;

    let html = `
      <div class="page-header">
        <div>
          <h2>Notifications Center</h2>
          <p>Real-time delivery milestones, automation status updates, and account alerts</p>
        </div>
        <div>
          <button id="mark-all-read-btn" class="btn btn-secondary btn-sm" ${unreadCount === 0 ? 'disabled' : ''}>
            ✓ Mark All as Read
          </button>
        </div>
      </div>

      <div class="glass-panel" style="padding: 24px;">
        ${notifications.length > 0 ? `
          <div style="display: flex; flex-direction: column; gap: 12px;">
            ${notifications.map(n => `
              <div class="glass-panel" style="padding: 16px 20px; display: flex; justify-content: space-between; align-items: flex-start; border-left: 4px solid ${
                n.type === 'SUCCESS' ? 'var(--color-success)' :
                n.type === 'ERROR' ? 'var(--color-danger)' :
                n.type === 'WARNING' ? 'var(--color-warning)' : 'var(--accent-primary)'
              }; background: ${n.is_read ? 'rgba(255,255,255,0.02)' : 'rgba(59, 130, 246, 0.06)'};">
                <div style="flex: 1;">
                  <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 4px;">
                    <span style="font-size: 16px;">${
                      n.type === 'SUCCESS' ? '✅' :
                      n.type === 'ERROR' ? '❌' :
                      n.type === 'WARNING' ? '⚠️' : 'ℹ️'
                    }</span>
                    <h4 style="font-size: 15px; font-weight: 700;">${n.title}</h4>
                    ${!n.is_read ? '<span class="status-pill info" style="font-size: 10px; padding: 1px 6px;">New</span>' : ''}
                  </div>
                  <p style="font-size: 13px; color: var(--text-muted); margin-left: 26px;">${n.message}</p>
                  <div style="font-size: 11px; color: var(--text-dim); margin-left: 26px; margin-top: 6px;">
                    ${new Date(n.created_at).toLocaleString()}
                  </div>
                </div>

                ${!n.is_read ? `
                  <button class="btn btn-secondary btn-sm" onclick="NotificationsComponent.markRead('${n.id}')">
                    Mark Read
                  </button>
                ` : ''}
              </div>
            `).join('')}
          </div>
        ` : `
          <div style="text-align: center; color: var(--text-dim); padding: 48px;">
            <div style="font-size: 32px; margin-bottom: 8px;">🔔</div>
            <div>No notifications to display.</div>
          </div>
        `}
      </div>
    `;

    container.innerHTML = html;

    document.getElementById('mark-all-read-btn')?.addEventListener('click', async () => {
      await API.post('/api/notifications/read-all');
      API.showToast('All notifications marked as read', 'success');
      App.refreshNotificationsBadge();
      this.render(container);
    });
  },

  async markRead(id) {
    await API.post(`/api/notifications/${id}/read`);
    App.refreshNotificationsBadge();
    this.render(document.getElementById('page-content'));
  }
};

