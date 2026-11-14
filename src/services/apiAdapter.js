const crypto = require('crypto');
const uuidv4 = () => crypto.randomUUID();
const { redactSecrets } = require('../config/security');

class ProviderAPIError extends Error {
  constructor(message, code, isRecoverable = false, rawResponse = null) {
    super(message);
    this.name = 'ProviderAPIError';
    this.code = code;
    this.isRecoverable = isRecoverable;
    this.rawResponse = rawResponse;
  }
}

/**
 * Standard SMM v2 API Adapter
 * Standard specification supported by almost all SMM panels (Zeofame, Xmedia, etc.)
 */
class StandardSMMv2Adapter {
  constructor(endpoint, apiKey) {
    this.endpoint = endpoint;
    this.apiKey = apiKey;
  }

  async makeRequest(params, requestId = uuidv4()) {
    const url = new URL(this.endpoint);
    const formData = new URLSearchParams();
    formData.append('key', this.apiKey);
    for (const [k, v] of Object.entries(params)) {
      formData.append(k, String(v));
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 sec timeout

    try {
      console.log(`[API Request ${requestId}] Sending action "${params.action}" to ${url.origin}`);
      const res = await fetch(url.toString(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json',
          'X-Request-ID': requestId
        },
        body: formData.toString(),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!res.ok) {
        if (res.status === 429) {
          throw new ProviderAPIError('Provider rate limit reached. Please retry later.', 'RATE_LIMIT', true);
        }
        if (res.status >= 500) {
          throw new ProviderAPIError(`Provider server error (HTTP ${res.status}).`, 'SERVER_ERROR', true);
        }
        throw new ProviderAPIError(`Provider rejected request (HTTP ${res.status}).`, 'HTTP_ERROR', false);
      }

      const text = await res.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch (jsonErr) {
        throw new ProviderAPIError('Invalid JSON response received from provider.', 'INVALID_RESPONSE', false, text);
      }

      // Check standard SMM error format
      if (data.error) {
        const errMsg = String(data.error);
        if (/balance/i.test(errMsg)) {
          throw new ProviderAPIError(`Provider balance insufficient: ${errMsg}`, 'INSUFFICIENT_BALANCE', false, data);
        }
        if (/service/i.test(errMsg)) {
          throw new ProviderAPIError(`Invalid or unavailable service: ${errMsg}`, 'INVALID_SERVICE', false, data);
        }
        if (/rate limit|too many/i.test(errMsg)) {
          throw new ProviderAPIError(`Provider rate limit: ${errMsg}`, 'RATE_LIMIT', true, data);
        }
        throw new ProviderAPIError(`Provider error: ${errMsg}`, 'PROVIDER_ERROR', false, data);
      }

      return data;
    } catch (err) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
        throw new ProviderAPIError('Provider request timed out after 15 seconds.', 'TIMEOUT', true);
      }
      if (err instanceof ProviderAPIError) {
        throw err;
      }
      throw new ProviderAPIError(`Network error communicating with provider: ${err.message}`, 'NETWORK_ERROR', true);
    }
  }

  async checkBalance(requestId) {
    const res = await this.makeRequest({ action: 'balance' }, requestId);
    return {
      balance: parseFloat(res.balance || 0),
      currency: res.currency || 'USD',
      raw: res
    };
  }

  async createOrder({ serviceId, link, quantity, runs, interval }, requestId) {
    const params = {
      action: 'add',
      service: serviceId,
      link: link,
      quantity: quantity
    };
    if (runs && interval) {
      params.runs = runs;
      params.interval = interval;
    }
    const res = await this.makeRequest(params, requestId);
    if (!res.order) {
      throw new ProviderAPIError('Provider response did not contain an order ID.', 'NO_ORDER_ID', false, res);
    }
    return {
      providerOrderId: String(res.order),
      raw: res
    };
  }

  async checkOrderStatus(providerOrderId, requestId) {
    const res = await this.makeRequest({ action: 'status', order: providerOrderId }, requestId);
    return {
      status: res.status || 'Pending',
      charge: res.charge ? parseFloat(res.charge) : 0,
      startCount: res.start_count ? parseInt(res.start_count, 10) : 0,
      remains: res.remains ? parseInt(res.remains, 10) : 0,
      currency: res.currency || 'USD',
      raw: res
    };
  }

  async getServices(requestId) {
    const res = await this.makeRequest({ action: 'services' }, requestId);
    return Array.isArray(res) ? res : [];
  }
}

/**
 * Mock Provider Adapter for testing and internal simulation
 */
class MockProviderAdapter {
  constructor(endpoint, apiKey) {
    this.endpoint = endpoint;
    this.apiKey = apiKey;
  }

  async checkBalance(requestId = uuidv4()) {
    return {
      balance: 1000.00,
      currency: 'USD',
      raw: { balance: '1000.00', currency: 'USD' }
    };
  }

  async createOrder({ serviceId, link, quantity }, requestId = uuidv4()) {
    const mockId = Math.floor(100000 + Math.random() * 900000);
    return {
      providerOrderId: String(mockId),
      raw: { order: mockId, status: 'In progress', charge: (quantity * 0.0015).toFixed(4) }
    };
  }

  async checkOrderStatus(providerOrderId, requestId = uuidv4()) {
    return {
      status: 'Completed',
      charge: 0.15,
      startCount: 100,
      remains: 0,
      currency: 'USD',
      raw: { status: 'Completed', charge: '0.15', start_count: 100, remains: 0 }
    };
  }

  async getServices(requestId = uuidv4()) {
    return [
      { service: 9901, name: 'Sandbox Fast Views', type: 'Default', category: 'Views', rate: '1.00', min: '10', max: '100000' }
    ];
  }
}

/**
 * Factory to instantiate adapter for a provider
 */
function getProviderAdapter(provider, apiKey) {
  if (provider.adapter_type === 'mock_provider' || provider.slug === 'mock-provider' || provider.api_url.startsWith('internal://')) {
    return new MockProviderAdapter(provider.api_url, apiKey);
  }
  return new StandardSMMv2Adapter(provider.api_url, apiKey);
}

module.exports = {
  ProviderAPIError,
  StandardSMMv2Adapter,
  MockProviderAdapter,
  getProviderAdapter
};

