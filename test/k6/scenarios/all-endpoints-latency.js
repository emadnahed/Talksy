/**
 * K6 Comprehensive Latency Test - ALL Endpoints
 *
 * Tests latency for every HTTP endpoint in the application.
 * Includes thresholds and detailed metrics per endpoint.
 *
 * Usage:
 *   k6 run test/k6/scenarios/all-endpoints-latency.js
 *   k6 run --env SMOKE=true test/k6/scenarios/all-endpoints-latency.js
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Trend, Rate, Counter, Gauge } from 'k6/metrics';

// Custom metrics for each endpoint
const metrics = {
  // App endpoints
  rootLatency: new Trend('latency_root', true),
  healthLatency: new Trend('latency_health', true),
  healthDetailedLatency: new Trend('latency_health_detailed', true),

  // Auth endpoints
  registerLatency: new Trend('latency_auth_register', true),
  loginLatency: new Trend('latency_auth_login', true),
  meLatency: new Trend('latency_auth_me', true),
  refreshLatency: new Trend('latency_auth_refresh', true),
  logoutLatency: new Trend('latency_auth_logout', true),

  // Aggregate metrics
  totalRequests: new Counter('total_requests'),
  successRate: new Rate('success_rate'),
  cacheHitEstimate: new Gauge('cache_hit_estimate'),
};

const isSmoke = __ENV.SMOKE === 'true';
const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

export const options = {
  scenarios: {
    // Scenario 1: Gradual ramp-up
    ramp_up: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: isSmoke
        ? [
            { duration: '10s', target: 5 },
            { duration: '20s', target: 5 },
            { duration: '10s', target: 0 },
          ]
        : [
            { duration: '30s', target: 10 },
            { duration: '1m', target: 30 },
            { duration: '1m', target: 50 },
            { duration: '30s', target: 0 },
          ],
      gracefulRampDown: '10s',
    },
    // Scenario 2: Constant load for steady-state latency
    steady_state: {
      executor: 'constant-vus',
      vus: isSmoke ? 3 : 20,
      duration: isSmoke ? '20s' : '2m',
      startTime: isSmoke ? '40s' : '3m',
    },
  },
  thresholds: {
    // Global thresholds
    http_req_duration: ['p(95)<1000', 'p(99)<2000'],
    http_req_failed: ['rate<0.05'],
    success_rate: ['rate>0.95'],

    // App endpoint thresholds
    latency_root: ['p(95)<50', 'p(99)<100'],
    latency_health: ['p(95)<50', 'p(99)<100'],
    latency_health_detailed: ['p(95)<100', 'p(99)<200'],

    // Auth endpoint thresholds
    latency_auth_register: ['p(95)<2000', 'p(99)<3000'], // bcrypt heavy
    latency_auth_login: ['p(95)<1500', 'p(99)<2000'], // bcrypt (~300-700ms base + variance)
    latency_auth_me: ['p(95)<100', 'p(99)<200'], // should be cached
    latency_auth_refresh: ['p(95)<200', 'p(99)<400'],
    latency_auth_logout: ['p(95)<100', 'p(99)<200'],
  },
};

// Store active tokens
const activeUsers = new Map();

function generateEmail(vuId, iteration) {
  return `k6-latency-${vuId}-${iteration}-${Date.now()}@test.com`;
}

export function setup() {
  console.log('Setting up comprehensive latency test...');

  // Pre-create test users for warm cache testing
  const preCreatedUsers = [];
  const numUsers = isSmoke ? 3 : 10;

  for (let i = 0; i < numUsers; i++) {
    const email = `k6-precreated-${Date.now()}-${i}@test.com`;
    const password = 'K6LatencyTest123';

    const res = http.post(
      `${BASE_URL}/auth/register`,
      JSON.stringify({ email, password }),
      { headers: { 'Content-Type': 'application/json' } }
    );

    if (res.status === 201) {
      const data = res.json('data') || res.json();
      preCreatedUsers.push({
        email,
        password,
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
      });
    }
  }

  console.log(`Pre-created ${preCreatedUsers.length} users for testing`);
  return { preCreatedUsers };
}

export default function (data) {
  const vuId = __VU;
  const iteration = __ITER;
  const preCreatedUsers = data.preCreatedUsers || [];

  // ============================================
  // APP ENDPOINTS
  // ============================================
  group('App Endpoints', function () {
    // GET /
    const rootStart = Date.now();
    const rootRes = http.get(`${BASE_URL}/`);
    metrics.rootLatency.add(Date.now() - rootStart);
    metrics.totalRequests.add(1);
    const rootSuccess = check(rootRes, {
      'GET / status 200': (r) => r.status === 200,
    });
    metrics.successRate.add(rootSuccess ? 1 : 0);

    // GET /health
    const healthStart = Date.now();
    const healthRes = http.get(`${BASE_URL}/health`);
    metrics.healthLatency.add(Date.now() - healthStart);
    metrics.totalRequests.add(1);
    const healthSuccess = check(healthRes, {
      'GET /health status 200': (r) => r.status === 200,
    });
    metrics.successRate.add(healthSuccess ? 1 : 0);

    // GET /health/detailed
    const healthDetailedStart = Date.now();
    const healthDetailedRes = http.get(`${BASE_URL}/health/detailed`);
    metrics.healthDetailedLatency.add(Date.now() - healthDetailedStart);
    metrics.totalRequests.add(1);
    const healthDetailedSuccess = check(healthDetailedRes, {
      'GET /health/detailed status 200': (r) => r.status === 200,
    });
    metrics.successRate.add(healthDetailedSuccess ? 1 : 0);
  });

  // ============================================
  // AUTH ENDPOINTS - Using pre-created users
  // ============================================
  if (preCreatedUsers.length > 0) {
    group('Auth Endpoints (Pre-created Users)', function () {
      const userIndex = vuId % preCreatedUsers.length;
      const user = preCreatedUsers[userIndex];

      // GET /auth/me (with caching)
      const meHeaders = {
        Authorization: `Bearer ${user.accessToken}`,
        'Content-Type': 'application/json',
      };

      // First request - potential cache miss
      const meColdStart = Date.now();
      const meColdRes = http.get(`${BASE_URL}/auth/me`, { headers: meHeaders });
      const meColdLatency = Date.now() - meColdStart;

      // Subsequent requests - should be cache hits
      for (let i = 0; i < 5; i++) {
        const meStart = Date.now();
        const meRes = http.get(`${BASE_URL}/auth/me`, { headers: meHeaders });
        const meLatency = Date.now() - meStart;
        metrics.meLatency.add(meLatency);
        metrics.totalRequests.add(1);

        const meSuccess = check(meRes, {
          'GET /auth/me status 200': (r) => r.status === 200,
        });
        metrics.successRate.add(meSuccess ? 1 : 0);
      }

      // POST /auth/login
      const loginStart = Date.now();
      const loginRes = http.post(
        `${BASE_URL}/auth/login`,
        JSON.stringify({ email: user.email, password: user.password }),
        { headers: { 'Content-Type': 'application/json' } }
      );
      metrics.loginLatency.add(Date.now() - loginStart);
      metrics.totalRequests.add(1);
      const loginSuccess = check(loginRes, {
        'POST /auth/login status 200': (r) => r.status === 200,
      });
      metrics.successRate.add(loginSuccess ? 1 : 0);
    });
  }

  // ============================================
  // AUTH ENDPOINTS - Fresh user registration
  // ============================================
  if (iteration % 10 === 0) {
    // Only register every 10th iteration to avoid too many users
    group('Auth Registration Flow', function () {
      const email = generateEmail(vuId, iteration);
      const password = 'K6LatencyTest123';

      // POST /auth/register
      const registerStart = Date.now();
      const registerRes = http.post(
        `${BASE_URL}/auth/register`,
        JSON.stringify({ email, password }),
        { headers: { 'Content-Type': 'application/json' } }
      );
      metrics.registerLatency.add(Date.now() - registerStart);
      metrics.totalRequests.add(1);

      const registerSuccess = check(registerRes, {
        'POST /auth/register status 201': (r) => r.status === 201,
      });
      metrics.successRate.add(registerSuccess ? 1 : 0);

      if (registerRes.status === 201) {
        const data = registerRes.json('data') || registerRes.json();

        // POST /auth/refresh
        if (data.refreshToken) {
          const refreshStart = Date.now();
          const refreshRes = http.post(
            `${BASE_URL}/auth/refresh`,
            JSON.stringify({ refreshToken: data.refreshToken }),
            { headers: { 'Content-Type': 'application/json' } }
          );
          metrics.refreshLatency.add(Date.now() - refreshStart);
          metrics.totalRequests.add(1);
          const refreshSuccess = check(refreshRes, {
            'POST /auth/refresh status 200': (r) => r.status === 200,
          });
          metrics.successRate.add(refreshSuccess ? 1 : 0);

          // POST /auth/logout
          const newData = refreshRes.json('data') || refreshRes.json();
          const logoutToken = newData.refreshToken || data.refreshToken;

          const logoutStart = Date.now();
          const logoutRes = http.post(
            `${BASE_URL}/auth/logout`,
            JSON.stringify({ refreshToken: logoutToken }),
            { headers: { 'Content-Type': 'application/json' } }
          );
          metrics.logoutLatency.add(Date.now() - logoutStart);
          metrics.totalRequests.add(1);
          const logoutSuccess = check(logoutRes, {
            'POST /auth/logout status 200': (r) => r.status === 200,
          });
          metrics.successRate.add(logoutSuccess ? 1 : 0);
        }
      }
    });
  }

  sleep(0.5 + Math.random() * 0.5);
}

export function teardown(data) {
  console.log('Comprehensive latency test completed');

  // Cleanup pre-created users
  if (data.preCreatedUsers) {
    data.preCreatedUsers.forEach((user) => {
      http.post(
        `${BASE_URL}/auth/logout`,
        JSON.stringify({ refreshToken: user.refreshToken }),
        { headers: { 'Content-Type': 'application/json' } }
      );
    });
  }
}

export function handleSummary(data) {
  const endpoints = [
    { name: 'GET /', metric: 'latency_root', threshold: { p95: 50, p99: 100 } },
    { name: 'GET /health', metric: 'latency_health', threshold: { p95: 50, p99: 100 } },
    { name: 'GET /health/detailed', metric: 'latency_health_detailed', threshold: { p95: 100, p99: 200 } },
    { name: 'POST /auth/register', metric: 'latency_auth_register', threshold: { p95: 2000, p99: 3000 } },
    { name: 'POST /auth/login', metric: 'latency_auth_login', threshold: { p95: 1500, p99: 2000 } },
    { name: 'GET /auth/me', metric: 'latency_auth_me', threshold: { p95: 100, p99: 200 } },
    { name: 'POST /auth/refresh', metric: 'latency_auth_refresh', threshold: { p95: 200, p99: 400 } },
    { name: 'POST /auth/logout', metric: 'latency_auth_logout', threshold: { p95: 100, p99: 200 } },
  ];

  const results = endpoints.map((endpoint) => {
    const metricData = data.metrics[endpoint.metric];
    const p95 = metricData?.values?.['p(95)'] || 0;
    const p99 = metricData?.values?.['p(99)'] || 0;
    const avg = metricData?.values?.avg || 0;
    const min = metricData?.values?.min || 0;
    const max = metricData?.values?.max || 0;
    const count = metricData?.values?.count || 0;

    const p95Pass = p95 <= endpoint.threshold.p95;
    const p99Pass = p99 <= endpoint.threshold.p99;

    return {
      endpoint: endpoint.name,
      latency: {
        min: min.toFixed(2),
        avg: avg.toFixed(2),
        p95: p95.toFixed(2),
        p99: p99.toFixed(2),
        max: max.toFixed(2),
      },
      threshold: endpoint.threshold,
      passed: p95Pass && p99Pass,
      count,
    };
  });

  const allPassed = results.every((r) => r.passed);
  const totalRequests = data.metrics.total_requests?.values?.count || 0;
  const successRate = ((data.metrics.success_rate?.values?.rate || 0) * 100).toFixed(2);

  const summary = {
    test: 'Comprehensive Endpoint Latency Test',
    timestamp: new Date().toISOString(),
    overview: {
      totalRequests,
      successRate: successRate + '%',
      allThresholdsPassed: allPassed,
    },
    endpoints: results,
    rawMetrics: data.metrics,
  };

  // Console output
  let output = '\n';
  output += '╔═══════════════════════════════════════════════════════════════════════════════════════╗\n';
  output += '║                    COMPREHENSIVE ENDPOINT LATENCY SUMMARY                             ║\n';
  output += '╠═══════════════════════════════════════════════════════════════════════════════════════╣\n';
  output += '║ Endpoint                │ Min      │ Avg      │ p95      │ p99      │ Status         ║\n';
  output += '╠═════════════════════════╪══════════╪══════════╪══════════╪══════════╪════════════════╣\n';

  results.forEach((r) => {
    const name = r.endpoint.padEnd(23).slice(0, 23);
    const min = (r.latency.min + 'ms').padStart(8);
    const avg = (r.latency.avg + 'ms').padStart(8);
    const p95 = (r.latency.p95 + 'ms').padStart(8);
    const p99 = (r.latency.p99 + 'ms').padStart(8);
    const status = r.passed ? '✅ PASS'.padEnd(14) : '❌ FAIL'.padEnd(14);
    output += `║ ${name} │ ${min} │ ${avg} │ ${p95} │ ${p99} │ ${status} ║\n`;
  });

  output += '╚═══════════════════════════════════════════════════════════════════════════════════════╝\n';
  output += `\nTotal Requests: ${totalRequests} | Success Rate: ${successRate}% | All Passed: ${allPassed ? '✅ YES' : '❌ NO'}\n`;

  return {
    stdout: output + '\n' + JSON.stringify(summary, null, 2),
    'test/k6/results/all-endpoints-latency-summary.json': JSON.stringify(summary, null, 2),
  };
}
