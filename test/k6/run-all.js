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
  },
  thresholds: {
    ws_connecting: ['p(95)<1000'],
    ws_response_time: ['p(95)<3000'],
    ws_success_rate: ['rate>0.90'],
    ws_total_errors: ['count<100'],
    http_response_time: ['p(95)<500'],
    http_success_rate: ['rate>0.99'],
  },
};

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

  const res = ws.connect(config.baseUrl, {}, function (socket) {
    const connectTime = Date.now() - startTime;
    wsConnecting.add(connectTime);
    wsTotalConnections.add(1);

    socket.on('message', function (data) {
      try {
        const message = JSON.parse(data);
        if (Array.isArray(message) && message[0] === 'connected') {
          wsSuccessRate.add(1);
        }
      } catch (e) {
        // Ignore parse errors
      }
    });

    socket.on('error', function (e) {
      wsTotalErrors.add(1);
      wsSuccessRate.add(0);
    });

    socket.setTimeout(function () {
      socket.close();
    }, 3000);
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
  const startTime = Date.now();

  const res = ws.connect(config.baseUrl, {}, function (socket) {
    wsTotalConnections.add(1);
    let messageStartTime = 0;

    socket.on('message', function (data) {
      try {
        const message = JSON.parse(data);
        if (Array.isArray(message)) {
          const [event] = message;

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
        // Ignore
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
      try {
        const message = JSON.parse(data);
        if (Array.isArray(message)) {
          const [event] = message;

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
        // Ignore
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

  summary += '\n═══════════════════════════════════════════════════════════════\n';

  return summary;
}
