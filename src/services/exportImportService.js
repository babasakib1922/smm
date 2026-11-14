const { parse } = require('csv-parse/sync');
const { stringify } = require('csv-stringify/sync');
const crypto = require('crypto');
const uuidv4 = () => crypto.randomUUID();
const { query, queryOne, run } = require('../db');
const { isValidUrl, createOrder } = require('./orderService');

/**
 * Parse and validate uploaded CSV for orders
 */
function parseAndValidateOrderCsv(csvContent, userId) {
  if (!csvContent || typeof csvContent !== 'string') {
    throw new Error('CSV file content is empty or invalid.');
  }

  let records = [];
  try {
    records = parse(csvContent, {
      columns: true,
      skip_empty_lines: true,
      trim: true
    });
  } catch (err) {
    throw new Error(`CSV Parsing failed: ${err.message}`);
  }

  if (records.length === 0) {
    throw new Error('No records found in CSV file.');
  }

  const validatedRows = [];
  let validCount = 0;
  let invalidCount = 0;
  const seenUrls = new Set();
  let totalEstimatedCost = 0;

  records.forEach((row, index) => {
    const rowNum = index + 1;
    const serviceId = row.service_id || row.serviceId || row.ServiceId;
    const targetUrl = row.target_url || row.link || row.url || row.TargetUrl;
    const quantity = parseInt(row.quantity || row.qty || row.Quantity, 10);

    const errors = [];

    // Check service
    const service = queryOne('SELECT * FROM services WHERE id = ? OR service_id_code = ?', [serviceId, serviceId]);
    if (!service) {
      errors.push(`Service "${serviceId}" not found or invalid.`);
    }

    // Check URL
    if (!targetUrl || !isValidUrl(targetUrl)) {
      errors.push('Invalid or missing Target URL.');
    }

    // Check quantity
    if (isNaN(quantity) || quantity <= 0) {
      errors.push('Quantity must be a positive integer.');
    } else if (service) {
      if (quantity < service.min_quantity) {
        errors.push(`Quantity ${quantity} is below service minimum of ${service.min_quantity}.`);
      }
      if (quantity > service.max_quantity) {
        errors.push(`Quantity ${quantity} exceeds service maximum of ${service.max_quantity}.`);
      }
    }

    // Check duplicate within file
    const urlKey = `${serviceId}:${targetUrl}`;
    const isDuplicate = seenUrls.has(urlKey);
    if (isDuplicate) {
      errors.push('Duplicate order row detected within this file.');
    } else if (targetUrl) {
      seenUrls.add(urlKey);
    }

    let estimatedCost = 0;
    if (service && !isNaN(quantity) && quantity > 0) {
      estimatedCost = parseFloat(((quantity / 1000) * service.price_per_k).toFixed(4));
    }

    const isValid = errors.length === 0;
    if (isValid) {
      validCount++;
      totalEstimatedCost += estimatedCost;
    } else {
      invalidCount++;
    }

    validatedRows.push({
      rowNumber: rowNum,
      serviceId: service ? service.id : serviceId,
      serviceName: service ? service.name : 'Unknown',
      targetUrl: targetUrl || '',
      quantity: isNaN(quantity) ? 0 : quantity,
      estimatedCost,
      isValid,
      errors
    });
  });

  return {
    totalRows: records.length,
    validCount,
    invalidCount,
    totalEstimatedCost: parseFloat(totalEstimatedCost.toFixed(2)),
    rows: validatedRows
  };
}

/**
 * Execute verified CSV import rows
 */
async function executeCsvImport(importId, userId, verifiedRows) {
  const results = {
    successful: 0,
    failed: 0,
    orders: []
  };

  for (const row of verifiedRows) {
    if (!row.isValid) continue;

    try {
      const order = await createOrder({
        userId,
        serviceId: row.serviceId,
        targetUrl: row.targetUrl,
        quantity: row.quantity,
        idempotencyKey: `CSV-${importId}-ROW-${row.rowNumber}`
      });

      results.successful++;
      results.orders.push({ rowNumber: row.rowNumber, orderId: order.id, status: order.status });
    } catch (err) {
      results.failed++;
      results.orders.push({ rowNumber: row.rowNumber, error: err.message, status: 'Failed' });
    }
  }

  // Update import record
  run(
    `UPDATE csv_imports SET status = 'CONFIRMED', imported_rows = ?, summary = ? WHERE id = ?`,
    [results.successful, JSON.stringify(results), importId]
  );

  return results;
}

/**
 * Generate CSV / Excel string from data
 */
function generateCsv(dataRows, columns) {
  const rows = (!dataRows || dataRows.length === 0) ? [] : dataRows;
  const csvStr = stringify(rows, {
    header: true,
    columns
  });
  // Prefix with UTF-8 BOM so Excel opens it with proper characters and column delimiters
  return '\uFEFF' + csvStr;
}

module.exports = {
  parseAndValidateOrderCsv,
  executeCsvImport,
  generateCsv
};

