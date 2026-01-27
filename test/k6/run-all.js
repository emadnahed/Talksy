import { group } from 'k6';
import ws from 'k6/ws';
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Rate, Counter } from 'k6/metrics';
import { getEnvConfig, getHeaders } from './config/environments.js';

/**
 * K6 Load Test Orchestrator
 * Runs all test scenarios sequentially
 *
 * Usage:
 *   k6 run test/k6/run-all.js                              # Local environment
 *   k6 run --env ENV=docker test/k6/run-all.js             # Docker environment
 *   k6 run --env SMOKE=true test/k6/run-all.js             # Smoke test (lighter load)
 *   k6 run --env ENV=vps --env LOAD_TEST_TOKEN=xxx test/k6/run-all.js  # VPS
 */

// Get environment configuration
const config = getEnvConfig(__ENV.ENV);
const headers = getHeaders(config);
const isSmoke = __ENV.SMOKE === 'true';

// Custom metrics for combined reporting
const wsConnecting = new Trend('ws_connecting', true);
const wsResponseTime = new Trend('ws_response_time', true);
const wsSuccessRate = new Rate('ws_success_rate');
const wsTotalConnections = new Counter('ws_total_connections');
const wsTotalMessages = new Counter('ws_total_messages');
const wsTotalErrors = new Counter('ws_total_errors');
const httpResponseTime = new Trend('http_response_time', true);
const httpSuccessRate = new Rate('http_success_rate');

// Auth cache metrics
const authRequestDuration = new Trend('auth_request_duration', true);
const authWarmDuration = new Trend('auth_warm_duration', true);
const authColdDuration = new Trend('auth_cold_duration', true);
const authSuccessRate = new Rate('auth_success_rate');
const authRequestsTotal = new Counter('auth_requests_total');

export const options = {
  scenarios: {
    health_check: {
      executor: 'constant-vus',
      vus: 1,
      duration: '10s',
      exec: 'healthCheck',
    },
    connection_test: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: isSmoke
        ? [{ duration: '15s', target: 5 }]
        : [
            { duration: '30s', target: 25 },
            { duration: '30s', target: 50 },
            { duration: '30s', target: 0 },
          ],
      exec: 'connectionTest',
      startTime: '15s',
    },
    message_test: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: isSmoke
        ? [{ duration: '15s', target: 5 }]
        : [
            { duration: '30s', target: 15 },
            { duration: '30s', target: 30 },
            { duration: '30s', target: 0 },
          ],
      exec: 'messageTest',
      startTime: isSmoke ? '35s' : '115s',
    },
    streaming_test: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: isSmoke
        ? [{ duration: '15s', target: 3 }]
        : [
            { duration: '30s', target: 10 },
            { duration: '30s', target: 0 },
          ],
      exec: 'streamingTest',
      startTime: isSmoke ? '55s' : '215s',
    },
    auth_cache_test: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: isSmoke
        ? [{ duration: '15s', target: 5 }]
        : [
            { duration: '30s', target: 10 },
            { duration: '30s', target: 25 },
            { duration: '30s', target: 0 },
          ],
      exec: 'authCacheTest',
      startTime: isSmoke ? '75s' : '280s',
    },
  },
  thresholds: {
    ws_connecting: ['p(95)<1000'],
    ws_response_time: ['p(95)<3000'],
    ws_success_rate: ['rate>0.90'],
    ws_total_errors: ['count<100'],
    http_response_time: ['p(95)<500'],
    http_success_rate: ['rate>0.99'],
    // Auth cache thresholds
    auth_request_duration: ['p(95)<300'],
    auth_warm_duration: ['p(95)<100'],
    auth_success_rate: ['rate>0.95'],
  },
};

/**
 * Parse Socket.IO Engine.IO packet
 * Packet format: <packet_type>[data]
 * - 0: open (server sends session info)
 * - 2: ping (server sends, client responds with 3)
 * - 3: pong
 * - 4: message (contains Socket.IO packet)
 *
 * Socket.IO packet format (after 4): <packet_type>[data]
 * - 0: connect
 * - 2: event (followed by JSON array)
 */
function parseSocketIOMessage(data) {
  if (!data || data.length === 0) return null;

  const packetType = data.charAt(0);
  const payload = data.substring(1);

  return {
    engineType: packetType,
    payload,
    socketType: packetType === '4' && payload.length > 0 ? payload.charAt(0) : null,
    socketPayload: packetType === '4' && payload.length > 1 ? payload.substring(1) : null,
  };
}

// Health check test
export function healthCheck() {
  const startTime = Date.now();
  const res = http.get(`${config.httpUrl}/health`, { headers });

  httpResponseTime.add(Date.now() - startTime);

  const success = check(res, {
    'health check returns 200': (r) => r.status === 200,
    'health check returns ok': (r) => r.json('status') === 'ok',
  });

  httpSuccessRate.add(success ? 1 : 0);
  sleep(1);
}

// WebSocket connection test
export function connectionTest() {
  const startTime = Date.now();
  let connectionSuccessful = false;
  let sessionReceived = false;

  const res = ws.connect(config.baseUrl, {}, function (socket) {
    const connectTime = Date.now() - startTime;
    wsConnecting.add(connectTime);
    wsTotalConnections.add(1);

    socket.on('open', function () {
      connectionSuccessful = true;
    });

    socket.on('message', function (data) {
      const packet = parseSocketIOMessage(data);
      if (!packet) return;

      switch (packet.engineType) {
        case '0': // Open - server sends session info
          socket.send('40'); // Connect to default namespace
          break;

        case '2': // Ping - respond with pong
          socket.send('3');
          break;

        case '4': // Message - contains Socket.IO packet
          if (packet.socketType === '2') { // Event
            try {
              const eventData = JSON.parse(packet.socketPayload);
              if (Array.isArray(eventData) && eventData[0] === 'connected') {
                sessionReceived = true;
                wsSuccessRate.add(1);
              }
            } catch (e) {
              // JSON parse error
            }
          }
          break;
      }
    });

    socket.on('error', function (e) {
      wsTotalErrors.add(1);
      wsSuccessRate.add(0);
    });

    socket.setTimeout(function () {
      if (!sessionReceived) {
        wsSuccessRate.add(0);
      }
      socket.close();
    }, 5000);
  });

  check(res, {
    'connection status is 101': (r) => r && r.status === 101,
  });

  if (!res || res.status !== 101) {
    wsSuccessRate.add(0);
  }

  sleep(1);
}

// Message flow test
export function messageTest() {
  let responseReceived = false;
  let messageStartTime = 0;

  const res = ws.connect(config.baseUrl, {}, function (socket) {
    wsTotalConnections.add(1);

    socket.on('message', function (data) {
      const packet = parseSocketIOMessage(data);
      if (!packet) return;

      switch (packet.engineType) {
        case '0': // Open - server sends session info
          socket.send('40'); // Connect to default namespace
          break;

        case '2': // Ping - respond with pong
          socket.send('3');
          break;

        case '4': // Message - contains Socket.IO packet
          if (packet.socketType === '2') { // Event
            try {
              const eventData = JSON.parse(packet.socketPayload);
              if (Array.isArray(eventData)) {
                const [event] = eventData;

                if (event === 'connected' || event === 'session_created') {
                  messageStartTime = Date.now();
                  const payload = JSON.stringify(['user_message', { text: 'Hello from k6' }]);
                  socket.send('42' + payload);
                  wsTotalMessages.add(1);
                }

                if (event === 'assistant_response') {
                  responseReceived = true;
                  wsResponseTime.add(Date.now() - messageStartTime);
                  wsSuccessRate.add(1);
                  socket.close();
                }
              }
            } catch (e) {
              // JSON parse error
            }
          }
          break;
      }
    });

    socket.on('error', function (e) {
      wsTotalErrors.add(1);
      wsSuccessRate.add(0);
    });

    socket.setTimeout(function () {
      if (!responseReceived) {
        wsSuccessRate.add(0);
      }
      socket.close();
    }, 10000);
  });

  check(res, {
    'connection established': (r) => r && r.status === 101,
  });

  sleep(1);
}

// Streaming flow test
export function streamingTest() {
  let streamCompleted = false;
  const startTime = Date.now();

  const res = ws.connect(config.baseUrl, {}, function (socket) {
    wsTotalConnections.add(1);

    socket.on('message', function (data) {
      const packet = parseSocketIOMessage(data);
      if (!packet) return;

      switch (packet.engineType) {
        case '0': // Open - server sends session info
          socket.send('40'); // Connect to default namespace
          break;

        case '2': // Ping - respond with pong
          socket.send('3');
          break;

        case '4': // Message - contains Socket.IO packet
          if (packet.socketType === '2') { // Event
            try {
              const eventData = JSON.parse(packet.socketPayload);
              if (Array.isArray(eventData)) {
                const [event] = eventData;

                if (event === 'connected' || event === 'session_created') {
                  const payload = JSON.stringify(['user_message_stream', { text: 'Tell me something interesting' }]);
                  socket.send('42' + payload);
                  wsTotalMessages.add(1);
                }

                if (event === 'stream_end') {
                  streamCompleted = true;
                  wsResponseTime.add(Date.now() - startTime);
                  wsSuccessRate.add(1);
                  socket.close();
                }
              }
            } catch (e) {
              // JSON parse error
            }
          }
          break;
      }
    });

    socket.on('error', function (e) {
      wsTotalErrors.add(1);
      wsSuccessRate.add(0);
    });

    socket.setTimeout(function () {
      if (!streamCompleted) {
        wsSuccessRate.add(0);
      }
      socket.close();
    }, 15000);
  });

  check(res, {
    'connection established': (r) => r && r.status === 101,
  });

  sleep(1);
}

// Auth cache test
export function authCacheTest() {
  const vuId = __VU;
  const iter = __ITER;
  const email = `k6-auth-${vuId}-${iter}-${Date.now()}@test.com`;
  const password = 'TestPassword123';

  // Step 1: Register
  const registerStart = Date.now();
  const registerRes = http.post(
    `${config.httpUrl}/auth/register`,
    JSON.stringify({ email, password }),
    { headers: { 'Content-Type': 'application/json' } }
  );
  const registerDuration = Date.now() - registerStart;
  authRequestDuration.add(registerDuration);
  authRequestsTotal.add(1);

  if (registerRes.status !== 201) {
    authSuccessRate.add(0);
    return;
  }
  authSuccessRate.add(1);

  const accessToken = registerRes.json('data.accessToken');
  const refreshToken = registerRes.json('data.refreshToken');

  // Step 2: First /auth/me request (cold cache)
  const coldStart = Date.now();
  const coldRes = http.get(`${config.httpUrl}/auth/me`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  });
  const coldDuration = Date.now() - coldStart;
  authColdDuration.add(coldDuration);
  authRequestDuration.add(coldDuration);
  authRequestsTotal.add(1);
  authSuccessRate.add(coldRes.status === 200 ? 1 : 0);

  // Step 3: Multiple warm requests (should be faster due to caching)
  for (let i = 0; i < 5; i++) {
    const warmStart = Date.now();
    const warmRes = http.get(`${config.httpUrl}/auth/me`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });
    const warmDuration = Date.now() - warmStart;
    authWarmDuration.add(warmDuration);
    authRequestDuration.add(warmDuration);
    authRequestsTotal.add(1);
    authSuccessRate.add(warmRes.status === 200 ? 1 : 0);
  }

  // Step 4: Logout
  const logoutRes = http.post(
    `${config.httpUrl}/auth/logout`,
    JSON.stringify({ refreshToken }),
    { headers: { 'Content-Type': 'application/json' } }
  );
  authRequestsTotal.add(1);
  authSuccessRate.add(logoutRes.status === 200 ? 1 : 0);

  sleep(0.5);
}

export function handleSummary(data) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const env = __ENV.ENV || 'local';

  return {
    'stdout': textSummary(data),
    [`test/k6/results/${env}-summary-${timestamp}.json`]: JSON.stringify(data, null, 2),
  };
}

function textSummary(data) {
  const metrics = data.metrics;
  let summary = '\n';
  summary += '═══════════════════════════════════════════════════════════════\n';
  summary += '                    K6 LOAD TEST SUMMARY\n';
  summary += '═══════════════════════════════════════════════════════════════\n\n';

  summary += `Environment: ${__ENV.ENV || 'local'}\n`;
  summary += `Mode: ${__ENV.SMOKE === 'true' ? 'Smoke Test' : 'Full Test'}\n\n`;

  summary += 'HTTP HEALTH CHECKS:\n';
  if (metrics.http_response_time) {
    summary += `  Response Time (p95): ${metrics.http_response_time.values['p(95)']?.toFixed(2) || 'N/A'}ms\n`;
  }
  if (metrics.http_success_rate) {
    summary += `  Success Rate: ${((metrics.http_success_rate.values.rate || 0) * 100).toFixed(2)}%\n`;
  }

  summary += '\nWEBSOCKET CONNECTIONS:\n';
  if (metrics.ws_total_connections) {
    summary += `  Total: ${metrics.ws_total_connections.values.count}\n`;
  }
  if (metrics.ws_connecting) {
    summary += `  Connect Time (p95): ${metrics.ws_connecting.values['p(95)']?.toFixed(2) || 'N/A'}ms\n`;
  }

  summary += '\nMESSAGES:\n';
  if (metrics.ws_total_messages) {
    summary += `  Total: ${metrics.ws_total_messages.values.count}\n`;
  }
  if (metrics.ws_response_time) {
    summary += `  Response Time (p95): ${metrics.ws_response_time.values['p(95)']?.toFixed(2) || 'N/A'}ms\n`;
  }

  summary += '\nSUCCESS RATE:\n';
  if (metrics.ws_success_rate) {
    summary += `  Rate: ${((metrics.ws_success_rate.values.rate || 0) * 100).toFixed(2)}%\n`;
  }

  summary += '\nERRORS:\n';
  if (metrics.ws_total_errors) {
    summary += `  Total: ${metrics.ws_total_errors.values.count}\n`;
  }

  summary += '\nAUTH CACHE PERFORMANCE:\n';
  if (metrics.auth_requests_total) {
    summary += `  Total Auth Requests: ${metrics.auth_requests_total.values.count}\n`;
  }
  if (metrics.auth_success_rate) {
    summary += `  Success Rate: ${((metrics.auth_success_rate.values.rate || 0) * 100).toFixed(2)}%\n`;
  }
  if (metrics.auth_cold_duration) {
    summary += `  Cold Cache (p95): ${metrics.auth_cold_duration.values['p(95)']?.toFixed(2) || 'N/A'}ms\n`;
  }
  if (metrics.auth_warm_duration) {
    summary += `  Warm Cache (p95): ${metrics.auth_warm_duration.values['p(95)']?.toFixed(2) || 'N/A'}ms\n`;
  }
  if (metrics.auth_cold_duration && metrics.auth_warm_duration) {
    const cold = metrics.auth_cold_duration.values['p(95)'] || 0;
    const warm = metrics.auth_warm_duration.values['p(95)'] || 0;
    if (cold > 0) {
      const speedup = ((cold - warm) / cold * 100).toFixed(1);
      summary += `  Cache Speedup: ~${speedup}%\n`;
    }
  }

  summary += '\n═══════════════════════════════════════════════════════════════\n';

  return summary;
}
