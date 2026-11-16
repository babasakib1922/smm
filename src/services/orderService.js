const crypto = require('crypto');
const uuidv4 = () => crypto.randomUUID();
const { queryOne, run, transaction } = require('../db');
const { decryptText } = require('../config/security');
const { getProviderAdapter } = require('./apiAdapter');
const { sendNotification } = require('./notificationService');
const { pullFromCloud } = require('./cloudSync');

/**
 * Validate URL strictly
 */
function isValidUrl(urlString) {
  try {
    const url = new URL(urlString);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch (_) {
    return false;
  }
}

/**
 * Create a new single order with transaction-safe balance deduction and idempotency
 */
async function createOrder({
  userId,
  serviceId,
  targetUrl,
  quantity,
  idempotencyKey = null,
  campaignBatchId = null
}) {
  // 1. Validate inputs
  if (!isValidUrl(targetUrl)) {
    throw new Error('Invalid target URL. Must be a valid http or https URL.');
  }

  const parsedQty = parseInt(quantity, 10);
  if (isNaN(parsedQty) || parsedQty <= 0) {
    throw new Error('Quantity must be a positive integer.');
  }

  // 2. Fetch service
  const service = queryOne('SELECT * FROM services WHERE id = ? AND is_active = 1', [serviceId]);
  if (!service) {
    throw new Error('Selected service is not active or does not exist.');
  }

  // Check if user has an explicit mapping for this service type to use custom limits
  const serviceCategory = (service.category || 'views').toLowerCase();
  const serviceType = serviceCategory.includes('like') ? 'likes' : (serviceCategory.includes('save') ? 'saves' : (serviceCategory.includes('share') ? 'shares' : 'views'));
  const userMapping = queryOne(
    "SELECT * FROM user_service_mappings WHERE user_id = ? AND service_type = ? AND is_enabled = 1",
    [userId, serviceType]
  );

  const effectiveMin = (userMapping && userMapping.min_quantity !== undefined && userMapping.min_quantity !== null) ? userMapping.min_quantity : service.min_quantity;
  const effectiveMax = (userMapping && userMapping.max_quantity !== undefined && userMapping.max_quantity !== null) ? userMapping.max_quantity : service.max_quantity;

  // Check service limits
  if (parsedQty < effectiveMin) {
    throw new Error(`Quantity below minimum limit of ${effectiveMin.toLocaleString()}.`);
  }
  if (parsedQty > effectiveMax) {
    throw new Error(`Quantity exceeds maximum limit of ${effectiveMax.toLocaleString()}.`);
  }

  // Calculate charge: (quantity / 1000) * price_per_k
  const charge = parseFloat(((parsedQty / 1000) * service.price_per_k).toFixed(4));

  // 3. Check idempotency: prevent accidental duplicate submission
  const finalIdempotencyKey = idempotencyKey || `IDEM-${uuidv4()}`;
  const existingOrder = queryOne('SELECT * FROM orders WHERE idempotency_key = ?', [finalIdempotencyKey]);
  if (existingOrder) {
    if (existingOrder.status === 'Failed' && !existingOrder.provider_order_id) {
      console.log(`[Idempotency] Previous order attempt ${existingOrder.id} failed without provider submission. Re-attempting...`);
      run('UPDATE campaign_batches SET order_id = NULL WHERE order_id = ?', [existingOrder.id]);
      run('DELETE FROM orders WHERE id = ?', [existingOrder.id]);
    } else {
      console.log(`[Idempotency] Order already processed for key ${finalIdempotencyKey}: ${existingOrder.id}`);
      return existingOrder;
    }
  }

  // 4. Resolve Provider, Service ID, and API Credentials
  // Prefer user's configured mapping in user_service_mappings, or user's connected provider
  // (serviceCategory and serviceType resolved above)

  // Function to resolve provider and credentials
  function resolveProviderAndCredentials() {
    let resolvedProvider = queryOne('SELECT * FROM api_providers WHERE id = ?', [service.provider_id]);
    let resolvedServiceId = service.provider_service_id;
    let resolvedCred = null;

    // A. Check if user has an explicit mapping for this service type
    const mapping = queryOne(
      "SELECT * FROM user_service_mappings WHERE user_id = ? AND service_type = ? AND is_enabled = 1",
      [userId, serviceType]
    );

    if (mapping) {
      const mappedCred = queryOne(
        'SELECT * FROM user_api_credentials WHERE user_id = ? AND provider_id = ? AND connection_status = "CONNECTED"',
        [userId, mapping.provider_id]
      );
      if (mappedCred) {
        const mappedProvider = queryOne('SELECT * FROM api_providers WHERE id = ? AND is_active = 1', [mapping.provider_id]);
        if (mappedProvider) {
          resolvedProvider = mappedProvider;
          resolvedServiceId = mapping.provider_service_id || resolvedServiceId;
          resolvedCred = mappedCred;
        }
      }
    }

    // B. Check credentials for default service provider
    if (!resolvedCred && resolvedProvider) {
      resolvedCred = queryOne(
        'SELECT * FROM user_api_credentials WHERE user_id = ? AND provider_id = ? AND connection_status = "CONNECTED"',
        [userId, resolvedProvider.id]
      );
    }

    // C. Fallback: If user has ANY connected credential
    if (!resolvedCred) {
      const anyCred = queryOne(
        'SELECT * FROM user_api_credentials WHERE user_id = ? AND connection_status = "CONNECTED" ORDER BY id DESC LIMIT 1',
        [userId]
      );
      if (anyCred) {
        const anyProvider = queryOne('SELECT * FROM api_providers WHERE id = ? AND is_active = 1', [anyCred.provider_id]);
        if (anyProvider) {
          resolvedProvider = anyProvider;
          resolvedCred = anyCred;
        }
      }
    }

    return { resolvedProvider, resolvedServiceId, resolvedCred };
  }

  let { resolvedProvider: provider, resolvedServiceId: providerServiceId, resolvedCred: userCred } = resolveProviderAndCredentials();

  // If credentials or custom provider not found locally (common on cold Vercel lambdas), pull from cloud and re-resolve
  if (!userCred) {
    try {
      await pullFromCloud(true);
      const reResolved = resolveProviderAndCredentials();
      provider = reResolved.resolvedProvider;
      providerServiceId = reResolved.resolvedServiceId;
      userCred = reResolved.resolvedCred;
    } catch (_) {}
  }

  if (!provider || !provider.is_active) {
    throw new Error('API provider for this service is currently disabled or unavailable.');
  }

  let apiKey = '';
  if (userCred && userCred.encrypted_api_key) {
    apiKey = decryptText(userCred.encrypted_api_key, userCred.iv, userCred.auth_tag);
  }

  // If user has not connected credentials, check if provider is mock or fallback
  if (!apiKey) {
    if (provider.slug === 'mock-provider') {
      apiKey = 'mock_key_default';
    } else {
      throw new Error(`You must connect your ${provider.name} API credentials in the API Management or Engagement tab before submitting orders.`);
    }
  }

  // 6. Execute order record creation (Free tool - no internal wallet deduction)
  const orderId = `ORD-${Date.now().toString(36).toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`;
  const now = new Date().toISOString();

  let createdOrder = null;
  transaction((tx) => {
    const user = tx.queryOne('SELECT status FROM users WHERE id = ?', [userId]);
    if (!user || user.status !== 'ACTIVE') {
      throw new Error('User account is not active.');
    }

    // Insert order record
    tx.run(
      `INSERT INTO orders (id, user_id, service_id, target_url, quantity, charge, status, provider_id, idempotency_key, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'Pending', ?, ?, ?, ?)`,
      [orderId, userId, service.id, targetUrl, parsedQty, charge, provider.id, finalIdempotencyKey, now, now]
    );

    createdOrder = tx.queryOne('SELECT * FROM orders WHERE id = ?', [orderId]);
  });

  // 7. Dispatch to provider API
  let providerOrderId = null;
  let providerResponse = null;
  let orderStatus = 'Processing';

  try {
    const adapter = getProviderAdapter(provider, apiKey);
    const apiRes = await adapter.createOrder({
      serviceId: providerServiceId,
      link: targetUrl,
      quantity: parsedQty
    }, orderId);

    providerOrderId = apiRes.providerOrderId;
    providerResponse = JSON.stringify(apiRes.raw);
    orderStatus = 'In progress';

    // Update order with provider details
    run(
      `UPDATE orders SET provider_order_id = ?, provider_response = ?, status = ?, updated_at = ? WHERE id = ?`,
      [providerOrderId, providerResponse, orderStatus, new Date().toISOString(), orderId]
    );

    sendNotification({
      userId,
      title: 'Order Submitted',
      message: `Your order #${orderId} (${parsedQty.toLocaleString()} units) was submitted to provider.`,
      type: 'SUCCESS'
    });

  } catch (apiErr) {
    console.error(`[Order Dispatch Error] Order ${orderId}:`, apiErr.message);
    orderStatus = 'Failed';
    providerResponse = JSON.stringify({ error: apiErr.message, code: apiErr.code });

    run(
      `UPDATE orders SET provider_response = ?, status = 'Failed', updated_at = ? WHERE id = ?`,
      [providerResponse, new Date().toISOString(), orderId]
    );

    sendNotification({
      userId,
      title: 'Order Dispatch Failed',
      message: `Order #${orderId} submission failed: ${apiErr.message}`,
      type: 'ERROR'
    });
  }

  return queryOne('SELECT * FROM orders WHERE id = ?', [orderId]);
}

module.exports = {
  isValidUrl,
  createOrder
};

