window.CsvImportExportComponent = {
  currentImportId: null,

  async render(container) {
    let html = `
      <div class="page-header">
        <div>
          <h2>CSV Import & Export Engine</h2>
          <p>Batch import multiple validated orders or export campaign schedules and financial ledgers</p>
        </div>
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 32px; margin-bottom: 32px;">
        <!-- CSV Import Card -->
        <div class="glass-panel" style="padding: 28px;">
          <h3 style="font-size: 16px; margin-bottom: 12px;">📥 Batch Order CSV Import</h3>
          <p style="font-size: 13px; color: var(--text-muted); margin-bottom: 20px;">
            Upload a CSV file containing your orders. Columns supported: <code>service_id, target_url, quantity</code>.
          </p>

          <div id="drop-zone" style="border: 2px dashed var(--border-glass); border-radius: var(--radius-md); padding: 32px; text-align: center; cursor: pointer; transition: all 0.2s ease; margin-bottom: 20px;">
            <div style="font-size: 32px; margin-bottom: 8px;">📄</div>
            <div style="font-weight: 600; margin-bottom: 4px;">Click to select CSV file</div>
            <div style="font-size: 12px; color: var(--text-dim);">or drag and drop here</div>
            <input type="file" id="csv-file-input" accept=".csv" style="display: none;">
          </div>

          <!-- Sample CSV Template Download -->
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <button class="btn btn-secondary btn-sm" onclick="CsvImportExportComponent.downloadSampleCsv()">
              Download Sample CSV Template
            </button>
            <span id="file-name-label" style="font-size: 12px; color: var(--text-muted);"></span>
          </div>
        </div>

        <!-- Export Center Card -->
        <div class="glass-panel" style="padding: 28px;">
          <h3 style="font-size: 16px; margin-bottom: 12px;">📤 Export Data (CSV & Excel)</h3>
          <p style="font-size: 13px; color: var(--text-muted); margin-bottom: 20px;">
            Download complete records with UTF-8 BOM encoding for seamless Microsoft Excel and spreadsheet viewing.
          </p>

          <div style="display: flex; flex-direction: column; gap: 14px;">
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; background: rgba(255,255,255,0.03); border-radius: var(--radius-sm);">
              <div>
                <div style="font-weight: 600; font-size: 14px;">Complete Order History</div>
                <div style="font-size: 12px; color: var(--text-dim);">All orders, statuses, charges, and provider references</div>
              </div>
              <a href="/api/export/orders" class="btn btn-primary btn-sm" target="_blank">Export CSV</a>
            </div>

            <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; background: rgba(255,255,255,0.03); border-radius: var(--radius-sm);">
              <div>
                <div style="font-weight: 600; font-size: 14px;">Financial Transactions Ledger</div>
                <div style="font-size: 12px; color: var(--text-dim);">Debits, credits, balance adjustments, and audit timestamps</div>
              </div>
              <a href="/api/export/transactions" class="btn btn-primary btn-sm" target="_blank">Export CSV</a>
            </div>
          </div>
        </div>
      </div>

      <!-- Preview Container -->
      <div id="import-preview-container"></div>
    `;

    container.innerHTML = html;

    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('csv-file-input');

    dropZone.addEventListener('click', () => fileInput.click());

    fileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) this.processCsvFile(file);
    });

    dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropZone.style.borderColor = 'var(--accent-primary)';
    });

    dropZone.addEventListener('dragleave', () => {
      dropZone.style.borderColor = 'var(--border-glass)';
    });

    dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropZone.style.borderColor = 'var(--border-glass)';
      const file = e.dataTransfer.files[0];
      if (file) this.processCsvFile(file);
    });
  },

  downloadSampleCsv() {
    const sample = 'service_id,target_url,quantity\n1,https://tiktok.com/@creator/video/1234567890,500\n2,https://tiktok.com/@creator/video/1234567890,200\n';
    const blob = new Blob([sample], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'sample_orders_template.csv';
    a.click();
    URL.revokeObjectURL(url);
  },

  async processCsvFile(file) {
    document.getElementById('file-name-label').textContent = file.name;
    const reader = new FileReader();
    reader.onload = async (e) => {
      const content = e.target.result;
      const res = await API.post('/api/import/preview', {
        csvContent: content,
        filename: file.name
      });

      if (!res.success) {
        API.showToast(res.error || 'Invalid CSV file', 'error');
        return;
      }

      this.currentImportId = res.importId;
      this.renderPreview(res);
    };
    reader.readAsText(file);
  },

  renderPreview(data) {
    const container = document.getElementById('import-preview-container');
    const { summary, previewRows, importId } = data;

    container.innerHTML = `
      <div class="glass-panel" style="padding: 24px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
          <div>
            <h3 style="font-size: 16px;">CSV Import Row Validation Preview</h3>
            <p style="font-size: 12px; color: var(--text-muted); margin-top: 2px;">
              Review rows before final execution. Only valid rows will be processed.
            </p>
          </div>
          <div style="display: flex; gap: 12px; align-items: center;">
            <div style="font-size: 13px; text-align: right;">
              <div>Estimated Total: <strong style="color: var(--color-success); font-size: 16px;">$${summary.totalEstimatedCost.toFixed(2)}</strong></div>
              <div style="font-size: 11px; color: var(--text-dim);">Available Balance: $${summary.userBalance.toFixed(2)}</div>
            </div>
            <button id="confirm-import-btn" class="btn btn-primary" ${!summary.hasSufficientBalance || summary.validCount === 0 ? 'disabled' : ''}>
              Confirm & Execute (${summary.validCount} valid rows)
            </button>
          </div>
        </div>

        <!-- Summary Badges -->
        <div style="display: flex; gap: 12px; margin-bottom: 20px;">
          <span class="status-pill completed">✓ ${summary.validCount} Valid Records</span>
          <span class="status-pill failed">✕ ${summary.invalidCount} Invalid / Rejected Records</span>
          ${!summary.hasSufficientBalance ? '<span class="status-pill error">⚠️ Insufficient Balance</span>' : ''}
        </div>

        <div class="table-container">
          <table class="data-table">
            <thead>
              <tr>
                <th>Row #</th>
                <th>Service</th>
                <th>Target URL</th>
                <th>Quantity</th>
                <th>Est. Cost</th>
                <th>Status</th>
                <th>Errors / Details</th>
              </tr>
            </thead>
            <tbody>
              ${previewRows.map(r => `
                <tr style="background: ${r.isValid ? 'transparent' : 'rgba(239, 68, 68, 0.05)'};">
                  <td>#${r.rowNumber}</td>
                  <td>${r.serviceName}</td>
                  <td style="font-size: 12px; max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${r.targetUrl || '-'}</td>
                  <td>${r.quantity ? r.quantity.toLocaleString() : '-'}</td>
                  <td style="color: var(--color-success); font-weight: 600;">$${r.estimatedCost.toFixed(2)}</td>
                  <td><span class="status-pill ${r.isValid ? 'completed' : 'failed'}">${r.isValid ? 'Valid' : 'Invalid'}</span></td>
                  <td style="font-size: 12px; color: ${r.isValid ? 'var(--text-dim)' : 'var(--color-danger)'};">
                    ${r.errors && r.errors.length > 0 ? r.errors.join('; ') : 'Ready for order submission'}
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;

    document.getElementById('confirm-import-btn')?.addEventListener('click', async () => {
      const btn = document.getElementById('confirm-import-btn');
      btn.disabled = true;
      btn.textContent = 'Processing orders...';

      const res = await API.post('/api/import/confirm', { importId });
      if (res.success) {
        API.showToast(res.message, 'success');
        await App.loadUser();
        App.navigate('orders');
      } else {
        API.showToast(res.error || 'Failed to execute import', 'error');
        btn.disabled = false;
        btn.textContent = 'Confirm & Execute';
      }
    });
  }
};

