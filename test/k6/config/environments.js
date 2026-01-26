/**
 * K6 Environment Configuration
 * Defines settings for different test environments
 */

// Socket.IO requires specific path and query params for WebSocket transport
const SOCKET_IO_PATH = '/socket.io/?EIO=4&transport=websocket';

export const environments = {
  local: {
    baseUrl: `ws://localhost:3000${SOCKET_IO_PATH}`,
    httpUrl: 'http://localhost:3000',
    loadTestToken: 'test-load-secret',
  },
  docker: {
    baseUrl: `ws://localhost:3000${SOCKET_IO_PATH}`,
    httpUrl: 'http://localhost:3000',
    loadTestToken: 'test-load-secret',
  },
  vps: {
    baseUrl: (__ENV.VPS_WS_URL || 'wss://api.yourdomain.com') + SOCKET_IO_PATH,
    httpUrl: __ENV.VPS_API_URL || 'https://api.yourdomain.com',
    loadTestToken: __ENV.LOAD_TEST_TOKEN || '',
  },
  staging: {
    baseUrl: (__ENV.STAGING_WS_URL || 'wss://staging.example.com') + SOCKET_IO_PATH,
    httpUrl: __ENV.STAGING_API_URL || 'https://staging.example.com',
    loadTestToken: __ENV.LOAD_TEST_TOKEN || '',
  },
  production: {
    baseUrl: (__ENV.PRODUCTION_WS_URL || 'wss://api.example.com') + SOCKET_IO_PATH,
    httpUrl: __ENV.PRODUCTION_API_URL || 'https://api.example.com',
    loadTestToken: __ENV.LOAD_TEST_TOKEN || '',
  },
};

/**
 * Get environment configuration
 * @param {string} env - Environment name (local, docker, vps, staging, production)
 * @returns {object} Environment configuration
 */
export function getEnvConfig(env) {
  const envName = env || __ENV.ENV || 'local';
  const config = environments[envName];

  if (!config) {
    console.error(`Unknown environment: ${envName}`);
    console.error(`Available: ${Object.keys(environments).join(', ')}`);
    return environments.local;
  }

  // Override with explicit env vars if provided
  if (__ENV.BASE_URL) {
    config.baseUrl = __ENV.BASE_URL;
  }
  if (__ENV.HTTP_URL) {
    config.httpUrl = __ENV.HTTP_URL;
  }
  if (__ENV.LOAD_TEST_TOKEN) {
    config.loadTestToken = __ENV.LOAD_TEST_TOKEN;
  }

  return config;
}

/**
 * Get default headers for requests
 * @param {object} config - Environment configuration
 * @returns {object} Headers object
 */
export function getHeaders(config) {
  const headers = {
    'Content-Type': 'application/json',
  };

  if (config.loadTestToken) {
    headers['X-Load-Test-Token'] = config.loadTestToken;
  }

  return headers;
}
