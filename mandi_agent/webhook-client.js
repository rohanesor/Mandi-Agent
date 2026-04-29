/**
 * Mandi Agent Webhook Client
 * Easy-to-use Node.js client for calling custom webhooks
 *
 * Usage:
 * const client = new MandiWebhookClient({
 *   baseUrl: 'https://rohanesor.app.n8n.cloud/webhook',
 *   apiKey: 'your_api_key'
 * });
 *
 * const response = await client.sendVoiceAdvisory({
 *   farmer_id: 'FARMER_001',
 *   phone: '+919876543210',
 *   language: 'hi',
 *   advisory_text: 'आपके गेहूं की कीमत ₹2150 है'
 * });
 */

const axios = require('axios');
const crypto = require('crypto');

class MandiWebhookClient {
  constructor(config = {}) {
    this.baseUrl = config.baseUrl || 'https://rohanesor.app.n8n.cloud/webhook';
    this.apiKey = config.apiKey || process.env.N8N_WEBHOOK_API_KEY;
    this.bearerToken = config.bearerToken || process.env.N8N_WEBHOOK_BEARER_TOKEN;
    this.timeout = config.timeout || 30000;
    this.retries = config.retries || 3;
    this.debug = config.debug || false;
  }

  /**
   * Send a voice advisory to a farmer via WhatsApp
   * @param {Object} data
   * @param {string} data.farmer_id - Farmer ID
   * @param {string} data.phone - WhatsApp number with country code
   * @param {string} data.language - Language code (hi, en, kn, ta, te, mr, gu)
   * @param {string} data.text_input - Farmer's question (optional)
   * @param {string} data.advisory_text - Advisory message to synthesize
   * @param {string} data.session_id - Session tracking ID (optional)
   * @returns {Promise<Object>} Response from n8n
   */
  async sendVoiceAdvisory(data) {
    const payload = {
      farmer_id: data.farmer_id,
      phone: data.phone,
      language: data.language || 'hi',
      text_input: data.text_input,
      advisory_text: data.advisory_text,
      session_id: data.session_id || this._generateSessionId(),
      timestamp: new Date().toISOString()
    };

    return this._request('POST', '/advisory/webhook', payload, {
      headers: { 'Authorization': `Bearer ${this.bearerToken}` }
    });
  }

  /**
   * Broadcast a price crash alert to farmer group
   * @param {Object} data
   * @param {string} data.crop - Crop name
   * @param {string} data.block_id - Region/block identifier
   * @param {number} data.current_price - Current price in ₹/quintal
   * @param {number} data.forecast_price - Forecasted price
   * @param {number} data.drop_pct - Percentage price drop
   * @param {number} data.affected_farmer_count - Number of affected farmers
   * @param {string} data.alternative_mandi - Alternative mandi name (optional)
   * @param {number} data.alternative_price - Price at alternative mandi (optional)
   * @returns {Promise<Object>} Response from n8n
   */
  async broadcastPriceCrash(data) {
    const payload = {
      crop: data.crop,
      block_id: data.block_id,
      current_price: data.current_price,
      forecast_price: data.forecast_price,
      drop_pct: data.drop_pct,
      affected_farmer_count: data.affected_farmer_count,
      alternative_mandi: data.alternative_mandi,
      alternative_price: data.alternative_price,
      timestamp: new Date().toISOString()
    };

    return this._request('POST', '/price-crash/broadcast', payload, {
      headers: { 'X-API-Key': this.apiKey }
    });
  }

  /**
   * Send an emergency spoilage alert
   * @param {Object} data
   * @param {string} data.farmer_id - Farmer ID
   * @param {string} data.farmer_phone - WhatsApp number
   * @param {string} data.crop - Crop name
   * @param {number} data.spoilage_pct - Spoilage percentage (0-100)
   * @param {Object} data.coordinates - GPS coordinates
   * @param {number} data.coordinates.lat - Latitude
   * @param {number} data.coordinates.lng - Longitude
   * @param {string} data.recommended_action - Recommended action in local language
   * @param {string} data.cold_storage_name - Cold storage name (optional)
   * @param {string} data.cold_storage_phone - Cold storage phone (optional)
   * @param {number} data.distance_km - Distance to cold storage (optional)
   * @param {number} data.available_capacity - Available capacity in MT (optional)
   * @param {string} data.severity - Severity level: 'critical', 'high', 'medium' (optional)
   * @returns {Promise<Object>} Response from n8n
   */
  async sendEmergencyAlert(data) {
    const payload = {
      farmer_id: data.farmer_id,
      farmer_phone: data.farmer_phone,
      crop: data.crop,
      spoilage_pct: data.spoilage_pct,
      coordinates: {
        lat: data.coordinates.lat,
        lng: data.coordinates.lng
      },
      recommended_action: data.recommended_action,
      cold_storage_name: data.cold_storage_name,
      cold_storage_phone: data.cold_storage_phone,
      distance_km: data.distance_km,
      available_capacity: data.available_capacity,
      severity: data.severity || 'critical',
      timestamp: new Date().toISOString()
    };

    return this._request('POST', '/emergency/spoilage', payload, {
      headers: { 'Authorization': `Bearer ${this.bearerToken}` }
    });
  }

  /**
   * Internal method to make HTTP request with retry logic
   */
  async _request(method, path, data, options = {}) {
    const url = `${this.baseUrl}${path}`;
    let lastError;

    for (let attempt = 0; attempt <= this.retries; attempt++) {
      try {
        if (this.debug) {
          console.log(`[${new Date().toISOString()}] ${method} ${url}`);
          console.log('Request body:', JSON.stringify(data, null, 2));
        }

        const config = {
          method,
          url,
          data,
          timeout: this.timeout,
          ...options
        };

        const response = await axios(config);

        if (this.debug) {
          console.log('Response:', JSON.stringify(response.data, null, 2));
        }

        return {
          success: true,
          status: response.status,
          data: response.data,
          timestamp: new Date().toISOString()
        };
      } catch (error) {
        lastError = error;

        if (this.debug) {
          console.error(`Attempt ${attempt + 1} failed:`, error.message);
        }

        if (attempt < this.retries) {
          const delay = Math.pow(2, attempt) * 1000; // Exponential backoff
          await this._sleep(delay);
        }
      }
    }

    // All retries failed
    const errorMessage = lastError?.response?.data?.message || lastError?.message;
    return {
      success: false,
      status: lastError?.response?.status || 500,
      error: errorMessage,
      details: lastError?.response?.data,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Sleep helper for retry delays
   */
  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Generate a unique session ID
   */
  _generateSessionId() {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

// ============================================
// EXAMPLE USAGE
// ============================================

async function examples() {
  const client = new MandiWebhookClient({
    baseUrl: 'https://rohanesor.app.n8n.cloud/webhook',
    apiKey: process.env.N8N_WEBHOOK_API_KEY,
    bearerToken: process.env.N8N_WEBHOOK_BEARER_TOKEN,
    debug: true
  });

  // Example 1: Voice Advisory
  console.log('\n=== Example 1: Voice Advisory ===\n');
  const advisoryResponse = await client.sendVoiceAdvisory({
    farmer_id: 'FARMER_001',
    phone: '+919876543210',
    language: 'hi',
    text_input: 'मेरे गेहूं की कीमत क्या है?',
    advisory_text: 'आपके गेहूं की कीमत वर्तमान में ₹2150 प्रति क्विंटल है जो बाजार में अच्छी है।'
  });
  console.log('Advisory Response:', JSON.stringify(advisoryResponse, null, 2));

  // Example 2: Price Crash Broadcast
  console.log('\n=== Example 2: Price Crash Broadcast ===\n');
  const priceResponse = await client.broadcastPriceCrash({
    crop: 'गेहूं',
    block_id: 'HARYANA-JHAJJAR',
    current_price: 2150,
    forecast_price: 1950,
    drop_pct: 9.3,
    affected_farmer_count: 324,
    alternative_mandi: 'गाजीपुर',
    alternative_price: 2300
  });
  console.log('Price Response:', JSON.stringify(priceResponse, null, 2));

  // Example 3: Emergency Spoilage Alert
  console.log('\n=== Example 3: Emergency Spoilage Alert ===\n');
  const emergencyResponse = await client.sendEmergencyAlert({
    farmer_id: 'FARMER_002',
    farmer_phone: '+919876543210',
    crop: 'प्याज',
    spoilage_pct: 65,
    coordinates: {
      lat: 28.7041,
      lng: 77.1025
    },
    recommended_action: 'तुरंत कोल्ड स्टोरेज भेजें',
    cold_storage_name: 'SafeFresh Cold Storage',
    cold_storage_phone: '+919876543212',
    distance_km: 12,
    available_capacity: 50,
    severity: 'critical'
  });
  console.log('Emergency Response:', JSON.stringify(emergencyResponse, null, 2));
}

// Export for use as a module
module.exports = MandiWebhookClient;

// Run examples if executed directly
if (require.main === module) {
  examples().catch(console.error);
}

/**
 * Installation:
 * npm install axios
 *
 * Usage in your code:
 * const MandiWebhookClient = require('./webhook-client');
 * const client = new MandiWebhookClient({...});
 * const response = await client.sendVoiceAdvisory({...});
 */
