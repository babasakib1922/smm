const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const uuidv4 = () => crypto.randomUUID();
const { query, queryOne, run } = require('../db');
const { authenticate } = require('../middleware/auth');
const {
  parseAndValidateOrderCsv,
  executeCsvImport,
  generateCsv
} = require('../services/exportImportService');
const { logAudit } = require('../middleware/auditLog');

/**
 * In-memory preview cache for staged CSV imports before confirmation
 */
const pendingImports = new Map();

/**
 * POST /api/import/preview
 * Validate CSV and preview rows before execution
 */
router.post('/import/preview', authenticate, (req, res) => {
  try {
    const { csvContent, filename = 'orders.csv' } = req.body;

    if (!csvContent) {
      return res.status(400).json({ success: false, error: 'No CSV content provided.' });
    }

    const validation = parseAndValidateOrderCsv(csvContent, req.user.id);
    const importId = `IMP-${uuidv4()}`;

    // Store in memory for confirmation step (expires in 15 mins)
    pendingImports.set(importId, {
      userId: req.user.id,
      filename,
      validation,
      createdAt: Date.now()
    });

    const nowIso = new Date().toISOString();
    run(
      `INSERT INTO csv_imports (id, user_id, filename, total_rows, valid_rows, status, summary, created_at)
       VALUES (?, ?, ?, ?, ?, 'PENDING', ?, ?)`,
      [importId, req.user.id, filename, validation.totalRows, validation.validCount, JSON.stringify({ cost: validation.totalEstimatedCost }), nowIso]
    );

    return res.json({
      success: true,
      importId,
      filename,
      summary: {
        totalRows: validation.totalRows,
        validCount: validation.validCount,
        invalidCount: validation.invalidCount,
        totalEstimatedCost: validation.totalEstimatedCost,
        userBalance: req.user.balance,
        hasSufficientBalance: req.user.balance >= validation.totalEstimatedCost
      },
      previewRows: validation.rows.slice(0, 100) // First 100 preview rows
    });

  } catch (err) {
    console.error('CSV preview error:', err);
    return res.status(400).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/import/confirm
 * Execute staged valid CSV rows after user confirmation
 */
router.post('/import/confirm', authenticate, async (req, res) => {
  try {
    const { importId } = req.body;

    if (!importId || !pendingImports.has(importId)) {
      return res.status(404).json({ success: false, error: 'Import session expired or invalid. Please upload the file again.' });
    }

    const staged = pendingImports.get(importId);
    if (staged.userId !== req.user.id) {
      return res.status(403).json({ success: false, error: 'Unauthorized.' });
    }

    const validRows = staged.validation.rows.filter(r => r.isValid);
    if (validRows.length === 0) {
      return res.status(400).json({ success: false, error: 'No valid rows to import.' });
    }

    // Check user balance
    const user = queryOne('SELECT balance FROM users WHERE id = ?', [req.user.id]);
    if (user.balance < staged.validation.totalEstimatedCost) {
      return res.status(400).json({
        success: false,
        error: `Insufficient balance. Required: $${staged.validation.totalEstimatedCost.toFixed(2)}, Available: $${user.balance.toFixed(2)}.`
      });
    }

    const result = await executeCsvImport(importId, req.user.id, validRows);
    pendingImports.delete(importId);

    logAudit(req.user.id, 'EXECUTE_CSV_IMPORT', 'csv_imports', importId, { imported: result.successful, failed: result.failed }, req);

    return res.json({
      success: true,
      message: `Successfully created ${result.successful} orders from CSV.`,
      result
    });

  } catch (err) {
    console.error('CSV confirm error:', err);
    return res.status(500).json({ success: false, error: 'Failed to execute CSV import.' });
  }
});

/**
 * GET /api/export/orders
 * Export order history as CSV / Excel
 */
router.get('/export/orders', authenticate, (req, res) => {
  try {
    const isAdmin = req.user.role === 'ADMIN';
    let sql = `
      SELECT o.id as "Order ID", u.username as "Username", s.name as "Service Name",
             o.target_url as "Target URL", o.quantity as "Quantity", o.charge as "Charge ($)",
             o.status as "Status", o.provider_order_id as "Provider Order ID",
             o.created_at as "Created At", o.updated_at as "Updated At"
      FROM orders o
      JOIN services s ON o.service_id = s.id
      JOIN users u ON o.user_id = u.id
      WHERE 1=1
    `;
    const params = [];

    if (!isAdmin) {
      sql += ' AND o.user_id = ?';
      params.push(req.user.id);
    }

    sql += ' ORDER BY o.created_at DESC';

    const orders = query(sql, params);
    const columns = ['Order ID', 'Username', 'Service Name', 'Target URL', 'Quantity', 'Charge ($)', 'Status', 'Provider Order ID', 'Created At', 'Updated At'];
    const csvContent = generateCsv(orders, columns);

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="orders_export_${Date.now()}.csv"`);
    return res.send(csvContent);

  } catch (err) {
    console.error('Export orders error:', err);
    return res.status(500).json({ success: false, error: 'Failed to export orders.' });
  }
});

/**
 * GET /api/export/campaign/:id
 * Export campaign batch schedule as CSV / Excel
 */
router.get('/export/campaign/:id', authenticate, (req, res) => {
  try {
    const campaignId = req.params.id;
    const isAdmin = req.user.role === 'ADMIN';

    let sql = 'SELECT * FROM campaigns WHERE id = ?';
    const params = [campaignId];
    if (!isAdmin) {
      sql += ' AND user_id = ?';
      params.push(req.user.id);
    }

    const campaign = queryOne(sql, params);
    if (!campaign) {
      return res.status(404).json({ success: false, error: 'Campaign not found.' });
    }

    const batches = query(
      `SELECT batch_number as "Batch Number", planned_quantity as "Planned Quantity",
              relative_time_minutes as "Relative Time (min)", scheduled_at as "Scheduled Date/Time (UTC)",
              status as "Status", provider_order_id as "Provider Order ID", executed_at as "Delivered At"
       FROM campaign_batches
       WHERE campaign_id = ?
       ORDER BY batch_number ASC`,
      [campaignId]
    );

    const columns = ['Batch Number', 'Planned Quantity', 'Relative Time (min)', 'Scheduled Date/Time (UTC)', 'Status', 'Provider Order ID', 'Delivered At'];
    const csvContent = generateCsv(batches, columns);

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="campaign_${campaignId}_schedule.csv"`);
    return res.send(csvContent);

  } catch (err) {
    console.error('Export campaign error:', err);
    return res.status(500).json({ success: false, error: 'Failed to export campaign schedule.' });
  }
});

/**
 * GET /api/export/transactions
 * Export financial ledger
 */
router.get('/export/transactions', authenticate, (req, res) => {
  try {
    const isAdmin = req.user.role === 'ADMIN';
    let sql = `
      SELECT t.id as "Transaction ID", u.username as "Username", t.amount as "Amount ($)",
             t.type as "Type", t.description as "Description", t.balance_after as "Balance After ($)",
             t.created_at as "Date"
      FROM transactions t
      JOIN users u ON t.user_id = u.id
      WHERE 1=1
    `;
    const params = [];

    if (!isAdmin) {
      sql += ' AND t.user_id = ?';
      params.push(req.user.id);
    }

    sql += ' ORDER BY t.created_at DESC';

    const txs = query(sql, params);
    const columns = ['Transaction ID', 'Username', 'Amount ($)', 'Type', 'Description', 'Balance After ($)', 'Date'];
    const csvContent = generateCsv(txs, columns);

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="transactions_export_${Date.now()}.csv"`);
    return res.send(csvContent);

  } catch (err) {
    console.error('Export transactions error:', err);
    return res.status(500).json({ success: false, error: 'Failed to export transactions.' });
  }
});

module.exports = router;

