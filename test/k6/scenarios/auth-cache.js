/**
 * K6 Load Test: Auth Cache Performance
 *
 * Tests the performance of the auth caching layer under load.
 * Measures cache hit rates, response times, and throughput.
 *
 * Usage:
 *   k6 run test/k6/scenarios/auth-cache.js
 *   k6 run --env SMOKE=true test/k6/scenarios/auth-cache.js
 *   k6 run --env BASE_URL=http://your-server:3000 test/k6/scenarios/auth-cache.js
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Counter, Trend, Rate, Gauge } from 'k6/metrics';

// Custom metrics for cache performance
const authCacheHitRate = new Gauge('auth_cache_hit_rate');
const authRequestDuration = new Trend('auth_request_duration', true);
const authColdRequestDuration = new Trend('auth_cold_request_duration', true);
const authWarmRequestDuration = new Trend('auth_warm_request_duration', true);
const authRequestsTotal = new Counter('auth_requests_total');
const authRequestsSuccess = new Rate('auth_requests_success');
const tokenValidationDuration = new Trend('token_validation_duration', true);
const userLookupDuration = new Trend('user_lookup_duration', true);
const registrationDuration = new Trend('registration_duration', true);
const loginDuration = new Trend('login_duration', true);

const isSmoke = __ENV.SMOKE === 'true';
const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

// Test configuration
export const options = {
  stages: isSmoke
    ? [
        { duration: '10s', target: 5 },
        { duration: '20s', target: 5 },
        { duration: '10s', target: 0 },
      ]
    : [
        { duration: '30s', target: 10 }, // Ramp up to 10 users
        { duration: '1m', target: 25 }, // Ramp up to 25 users
        { duration: '2m', target: 50 }, // Hold at 50 users
        { duration: '1m', target: 75 }, // Peak at 75 users
        { duration: '30s', target: 50 }, // Step down
        { duration: '30s', target: 0 }, // Ramp down
      ],
  thresholds: {
    // General thresholds
    http_req_duration: ['p(95)<500', 'p(99)<1000'],
    http_req_failed: ['rate<0.01'], // 99% success rate

    // Auth-specific thresholds
    auth_requests_success: ['rate>0.99'],
    auth_request_duration: ['p(95)<200', 'p(99)<500'],

    // Cache performance thresholds
    auth_warm_request_duration: ['p(95)<50'], // Cached requests should be fast
    token_validation_duration: ['p(95)<100'],
    user_lookup_duration: ['p(95)<100'],

    // Registration/Login (slower, involves hashing)
    registration_duration: ['p(95)<1000'],
    login_duration: ['p(95)<500'],
  },
};

// Generate unique test email for each VU
function getTestEmail(vuId, iteration) {
  return `k6-user-${vuId}-${iteration}-${Date.now()}@loadtest.com`;
}

// Shared state per VU
let accessToken = null;
let refreshToken = null;
let userId = null;
let isFirstRequest = true;

export function setup() {
  // Create a test user that all VUs can optionally use for read-heavy tests
  const sharedEmail = `k6-shared-${Date.now()}@loadtest.com`;
  const password = 'TestPassword123';

  const registerRes = http.post(
    `${BASE_URL}/auth/register`,
    JSON.stringify({ email: sharedEmail, password }),
    { headers: { 'Content-Type': 'application/json' } }
  );

  if (registerRes.status === 201) {
    const data = registerRes.json('data');
    return {
      sharedEmail,
      sharedPassword: password,
      sharedAccessToken: data.accessToken,
      sharedRefreshToken: data.refreshToken,
      sharedUserId: data.user.id,
    };
  }

  return { sharedEmail, sharedPassword: password };
}

export default function (data) {
  const vuId = __VU;
  const iteration = __ITER;

  group('Auth Cache Performance Tests', function () {
    // Test 1: Registration (creates new user, populates cache)
    group('Registration', function () {
      const email = getTestEmail(vuId, iteration);
      const password = 'TestPassword123';

      const startTime = Date.now();
      const res = http.post(
        `${BASE_URL}/auth/register`,
        JSON.stringify({ email, password }),
        { headers: { 'Content-Type': 'application/json' } }
      );
      const duration = Date.now() - startTime;

      registrationDuration.add(duration);
      authRequestsTotal.add(1);

      const success = check(res, {
        'registration successful': (r) => r.status === 201,
        'returns access token': (r) => r.json('data.accessToken') !== undefined,
        'returns refresh token': (r) => r.json('data.refreshToken') !== undefined,
        'returns user id': (r) => r.json('data.user.id') !== undefined,
      });

      authRequestsSuccess.add(success ? 1 : 0);

      if (res.status === 201) {
        const responseData = res.json('data');
        accessToken = responseData.accessToken;
        refreshToken = responseData.refreshToken;
        userId = responseData.user.id;
        isFirstRequest = true;
      }
    });

    // Test 2: Token Validation with Cache (GET /auth/me)
    if (accessToken) {
      group('Token Validation (Cold then Warm)', function () {
        // First request - cold cache
        const coldStart = Date.now();
        const coldRes = http.get(`${BASE_URL}/auth/me`, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        });
        const coldDuration = Date.now() - coldStart;

        authColdRequestDuration.add(coldDuration);
        authRequestDuration.add(coldDuration);
        tokenValidationDuration.add(coldDuration);
        authRequestsTotal.add(1);

        check(coldRes, {
          'cold request successful': (r) => r.status === 200,
          'returns user email': (r) => r.json('data.email') !== undefined,
        });

        // Subsequent requests - warm cache (should be faster)
        for (let i = 0; i < 5; i++) {
          const warmStart = Date.now();
          const warmRes = http.get(`${BASE_URL}/auth/me`, {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
          });
          const warmDuration = Date.now() - warmStart;

          authWarmRequestDuration.add(warmDuration);
          authRequestDuration.add(warmDuration);
          authRequestsTotal.add(1);

          const success = check(warmRes, {
            'warm request successful': (r) => r.status === 200,
            'warm request faster than cold': () => warmDuration < coldDuration + 50, // Allow 50ms variance
          });

          authRequestsSuccess.add(success ? 1 : 0);
        }
      });
    }

    // Test 3: Login (uses cached user data)
    group('Login with Cached User', function () {
      if (data.sharedEmail) {
        const startTime = Date.now();
        const res = http.post(
          `${BASE_URL}/auth/login`,
          JSON.stringify({
            email: data.sharedEmail,
            password: data.sharedPassword,
          }),
          { headers: { 'Content-Type': 'application/json' } }
        );
        const duration = Date.now() - startTime;

        loginDuration.add(duration);
        userLookupDuration.add(duration);
        authRequestsTotal.add(1);

        const success = check(res, {
          'login successful': (r) => r.status === 200,
          'returns tokens': (r) => r.json('data.accessToken') !== undefined,
        });

        authRequestsSuccess.add(success ? 1 : 0);
      }
    });

    // Test 4: Token Refresh
    if (refreshToken) {
      group('Token Refresh', function () {
        const startTime = Date.now();
        const res = http.post(
          `${BASE_URL}/auth/refresh`,
          JSON.stringify({ refreshToken }),
          { headers: { 'Content-Type': 'application/json' } }
        );
        const duration = Date.now() - startTime;

        authRequestDuration.add(duration);
        authRequestsTotal.add(1);

        const success = check(res, {
          'refresh successful': (r) => r.status === 200,
          'returns new tokens': (r) => r.json('data.accessToken') !== undefined,
        });

        authRequestsSuccess.add(success ? 1 : 0);

        if (res.status === 200) {
          const responseData = res.json('data');
          accessToken = responseData.accessToken;
          refreshToken = responseData.refreshToken;
        }
      });
    }

    // Test 5: Concurrent Authenticated Requests (simulates real usage)
    if (accessToken) {
      group('Concurrent Auth Requests', function () {
        const requests = [];
        const headers = {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        };

        // Batch 3 requests
        const responses = http.batch([
          ['GET', `${BASE_URL}/auth/me`, null, { headers }],
          ['GET', `${BASE_URL}/auth/me`, null, { headers }],
          ['GET', `${BASE_URL}/auth/me`, null, { headers }],
        ]);

        responses.forEach((res, idx) => {
          authRequestsTotal.add(1);
          const success = check(res, {
            [`batch request ${idx} successful`]: (r) => r.status === 200,
          });
          authRequestsSuccess.add(success ? 1 : 0);
        });
      });
    }

    // Test 6: Logout (clears cache)
    if (refreshToken) {
      group('Logout', function () {
        const startTime = Date.now();
        const res = http.post(
          `${BASE_URL}/auth/logout`,
          JSON.stringify({ refreshToken }),
          { headers: { 'Content-Type': 'application/json' } }
        );
        const duration = Date.now() - startTime;

        authRequestDuration.add(duration);
        authRequestsTotal.add(1);

        const success = check(res, {
          'logout successful': (r) => r.status === 200,
          'returns success true': (r) => r.json('data.success') === true,
        });

        authRequestsSuccess.add(success ? 1 : 0);

        // Clear local tokens
        accessToken = null;
        refreshToken = null;
      });
    }
  });

  sleep(1);
}

export function teardown(data) {
  // Cleanup: Could add cleanup of test users if needed
  console.log('Auth cache load test completed');
}

export function handleSummary(data) {
  // Calculate cache effectiveness estimate
  const coldP95 = data.metrics.auth_cold_request_duration?.values?.['p(95)'] || 0;
  const warmP95 = data.metrics.auth_warm_request_duration?.values?.['p(95)'] || 0;
  const cacheSpeedup = coldP95 > 0 ? ((coldP95 - warmP95) / coldP95 * 100).toFixed(2) : 0;

  const summary = {
    test: 'Auth Cache Performance',
    timestamp: new Date().toISOString(),
    summary: {
      totalRequests: data.metrics.auth_requests_total?.values?.count || 0,
      successRate: ((data.metrics.auth_requests_success?.values?.rate || 0) * 100).toFixed(2) + '%',
      cacheSpeedupEstimate: cacheSpeedup + '%',
      durations: {
        overall: {
          p50: data.metrics.auth_request_duration?.values?.['p(50)']?.toFixed(2) + 'ms',
          p95: data.metrics.auth_request_duration?.values?.['p(95)']?.toFixed(2) + 'ms',
          p99: data.metrics.auth_request_duration?.values?.['p(99)']?.toFixed(2) + 'ms',
        },
        coldRequests: {
          p95: (coldP95 || 0).toFixed(2) + 'ms',
        },
        warmRequests: {
          p95: (warmP95 || 0).toFixed(2) + 'ms',
        },
        registration: {
          p95: data.metrics.registration_duration?.values?.['p(95)']?.toFixed(2) + 'ms',
        },
        login: {
          p95: data.metrics.login_duration?.values?.['p(95)']?.toFixed(2) + 'ms',
        },
      },
    },
    rawMetrics: data.metrics,
  };

  return {
    stdout: JSON.stringify(summary, null, 2),
    'test/k6/results/auth-cache-summary.json': JSON.stringify(summary, null, 2),
  };
}
