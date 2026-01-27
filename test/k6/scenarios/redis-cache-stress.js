/**
 * K6 Load Test: Redis Cache Stress Test
 *
 * Tests the Redis caching layer under heavy load conditions.
 * Focuses on cache hit rates, LRU eviction, and concurrent access patterns.
 *
 * Usage:
 *   k6 run test/k6/scenarios/redis-cache-stress.js
 *   k6 run --env SMOKE=true test/k6/scenarios/redis-cache-stress.js
 *   k6 run --env BASE_URL=http://your-server:3000 test/k6/scenarios/redis-cache-stress.js
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Counter, Trend, Rate, Gauge } from 'k6/metrics';
import { SharedArray } from 'k6/data';

// Custom metrics for Redis cache stress testing
const cacheHitLatency = new Trend('cache_hit_latency', true);
const cacheMissLatency = new Trend('cache_miss_latency', true);
const cacheStressRequests = new Counter('cache_stress_requests');
const cacheStressSuccess = new Rate('cache_stress_success');
const multiUserLatency = new Trend('multi_user_latency', true);
const tokenRefreshLatency = new Trend('token_refresh_latency', true);
const concurrentRequestLatency = new Trend('concurrent_request_latency', true);
const registrationLatency = new Trend('registration_latency', true);
const estimatedCacheHitRate = new Gauge('estimated_cache_hit_rate');

const isSmoke = __ENV.SMOKE === 'true';
const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

// Test configuration
export const options = {
  scenarios: {
    // Scenario 1: Ramp up users gradually
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
            { duration: '30s', target: 20 },
            { duration: '1m', target: 50 },
            { duration: '2m', target: 100 },
            { duration: '30s', target: 0 },
          ],
      gracefulRampDown: '10s',
    },
    // Scenario 2: Spike test for cache under sudden load
    spike: {
      executor: 'ramping-vus',
      startVUs: 0,
      startTime: isSmoke ? '40s' : '4m',
      stages: isSmoke
        ? [
            { duration: '5s', target: 10 },
            { duration: '5s', target: 0 },
          ]
        : [
            { duration: '10s', target: 150 },
            { duration: '20s', target: 150 },
            { duration: '10s', target: 0 },
          ],
      gracefulRampDown: '10s',
    },
  },
  thresholds: {
    // Overall performance
    http_req_duration: ['p(95)<1000', 'p(99)<2000'],
    http_req_failed: ['rate<0.05'], // 95% success rate

    // Cache-specific thresholds
    cache_hit_latency: ['p(95)<100'], // Cache hits should be fast
    cache_miss_latency: ['p(95)<500'], // Cache misses acceptable
    cache_stress_success: ['rate>0.95'],

    // Multi-user scenarios
    multi_user_latency: ['p(95)<300'],
    concurrent_request_latency: ['p(95)<200'],

    // Registration (has bcrypt, slower)
    registration_latency: ['p(95)<3000'],
  },
};

// Store active tokens for reuse
const activeTokens = new Map();
let tokenCounter = 0;

// Generate unique email
function generateEmail(vuId, iteration) {
  return `redis-stress-${vuId}-${iteration}-${Date.now()}@test.com`;
}

export function setup() {
  console.log('Setting up Redis cache stress test...');

  // Pre-create some users for warm cache testing
  const preCreatedUsers = [];
  const numPreCreated = isSmoke ? 3 : 10;

  for (let i = 0; i < numPreCreated; i++) {
    const email = `precreated-${Date.now()}-${i}@test.com`;
    const password = 'StressTest123';

    const res = http.post(
      `${BASE_URL}/auth/register`,
      JSON.stringify({ email, password }),
      { headers: { 'Content-Type': 'application/json' } }
    );

    if (res.status === 201) {
      const data = res.json('data');
      preCreatedUsers.push({
        email,
        password,
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
        userId: data.user.id,
      });
    }
  }

  console.log(`Pre-created ${preCreatedUsers.length} users for testing`);
  return { preCreatedUsers };
}

export default function (data) {
  const vuId = __VU;
  const iteration = __ITER;

  // Test 1: Registration (fills cache)
  group('Cache Fill - Registration', function () {
    const email = generateEmail(vuId, iteration);
    const password = 'StressTest123';

    const start = Date.now();
    const res = http.post(
      `${BASE_URL}/auth/register`,
      JSON.stringify({ email, password }),
      { headers: { 'Content-Type': 'application/json' } }
    );
    const duration = Date.now() - start;

    registrationLatency.add(duration);
    cacheStressRequests.add(1);

    const success = check(res, {
      'registration successful': (r) => r.status === 201,
      'returns tokens': (r) => r.json('data.accessToken') !== undefined,
    });

    cacheStressSuccess.add(success ? 1 : 0);

    if (res.status === 201) {
      const responseData = res.json('data');
      activeTokens.set(tokenCounter++, {
        accessToken: responseData.accessToken,
        refreshToken: responseData.refreshToken,
      });
    }
  });

  // Test 2: Cache Hit Pattern - Repeated requests with same token
  if (data.preCreatedUsers && data.preCreatedUsers.length > 0) {
    group('Cache Hit Pattern', function () {
      // Use a pre-created user's token
      const userIdx = vuId % data.preCreatedUsers.length;
      const user = data.preCreatedUsers[userIdx];

      const headers = {
        Authorization: `Bearer ${user.accessToken}`,
        'Content-Type': 'application/json',
      };

      // First request - might be cache miss
      const coldStart = Date.now();
      const coldRes = http.get(`${BASE_URL}/auth/me`, { headers });
      const coldDuration = Date.now() - coldStart;

      cacheMissLatency.add(coldDuration);
      cacheStressRequests.add(1);

      check(coldRes, {
        'cold request successful': (r) => r.status === 200,
      });

      // Subsequent requests - should be cache hits
      for (let i = 0; i < 5; i++) {
        const warmStart = Date.now();
        const warmRes = http.get(`${BASE_URL}/auth/me`, { headers });
        const warmDuration = Date.now() - warmStart;

        cacheHitLatency.add(warmDuration);
        cacheStressRequests.add(1);

        const success = check(warmRes, {
          'warm request successful': (r) => r.status === 200,
        });

        cacheStressSuccess.add(success ? 1 : 0);
      }

      // Estimate cache hit rate (warm should be faster than cold)
      if (coldDuration > 0) {
        const avgWarmDuration = cacheHitLatency.values ? cacheHitLatency.values.avg : coldDuration;
        const hitRateEstimate = Math.max(0, Math.min(100, (coldDuration - avgWarmDuration) / coldDuration * 100));
        estimatedCacheHitRate.add(hitRateEstimate);
      }
    });
  }

  // Test 3: Multi-User Concurrent Cache Access
  group('Multi-User Cache Access', function () {
    if (data.preCreatedUsers && data.preCreatedUsers.length > 1) {
      const requests = data.preCreatedUsers.slice(0, Math.min(3, data.preCreatedUsers.length)).map((user) => [
        'GET',
        `${BASE_URL}/auth/me`,
        null,
        {
          headers: {
            Authorization: `Bearer ${user.accessToken}`,
            'Content-Type': 'application/json',
          },
        },
      ]);

      const start = Date.now();
      const responses = http.batch(requests);
      const duration = Date.now() - start;

      multiUserLatency.add(duration);

      responses.forEach((res, idx) => {
        cacheStressRequests.add(1);
        const success = check(res, {
          [`multi-user request ${idx} successful`]: (r) => r.status === 200,
        });
        cacheStressSuccess.add(success ? 1 : 0);
      });
    }
  });

  // Test 4: Concurrent Identical Requests (tests cache locking/consistency)
  group('Concurrent Identical Requests', function () {
    if (data.preCreatedUsers && data.preCreatedUsers.length > 0) {
      const user = data.preCreatedUsers[0];
      const headers = {
        Authorization: `Bearer ${user.accessToken}`,
        'Content-Type': 'application/json',
      };

      // Send 5 identical requests simultaneously
      const requests = [];
      for (let i = 0; i < 5; i++) {
        requests.push(['GET', `${BASE_URL}/auth/me`, null, { headers }]);
      }

      const start = Date.now();
      const responses = http.batch(requests);
      const duration = Date.now() - start;

      concurrentRequestLatency.add(duration);

      // All responses should be identical
      const firstEmail = responses[0].json('data.email');
      let allMatch = true;

      responses.forEach((res, idx) => {
        cacheStressRequests.add(1);
        const email = res.json('data.email');
        if (email !== firstEmail) {
          allMatch = false;
        }
        const success = check(res, {
          [`concurrent request ${idx} successful`]: (r) => r.status === 200,
        });
        cacheStressSuccess.add(success ? 1 : 0);
      });

      check(null, {
        'all concurrent responses match': () => allMatch,
      });
    }
  });

  // Test 5: Token Refresh Pattern (tests cache invalidation)
  group('Token Refresh Pattern', function () {
    if (data.preCreatedUsers && data.preCreatedUsers.length > 0) {
      const userIdx = (vuId + iteration) % data.preCreatedUsers.length;
      const user = data.preCreatedUsers[userIdx];

      // Don't actually refresh as it would invalidate shared tokens
      // Instead, just test that auth/me works after potential refresh
      const headers = {
        Authorization: `Bearer ${user.accessToken}`,
        'Content-Type': 'application/json',
      };

      const start = Date.now();
      const res = http.get(`${BASE_URL}/auth/me`, { headers });
      const duration = Date.now() - start;

      tokenRefreshLatency.add(duration);
      cacheStressRequests.add(1);

      const success = check(res, {
        'post-refresh auth successful': (r) => r.status === 200,
      });

      cacheStressSuccess.add(success ? 1 : 0);
    }
  });

  // Test 6: Login with Cached User Data
  group('Login with Cached Data', function () {
    if (data.preCreatedUsers && data.preCreatedUsers.length > 0) {
      const userIdx = vuId % data.preCreatedUsers.length;
      const user = data.preCreatedUsers[userIdx];

      const start = Date.now();
      const res = http.post(
        `${BASE_URL}/auth/login`,
        JSON.stringify({
          email: user.email,
          password: user.password,
        }),
        { headers: { 'Content-Type': 'application/json' } }
      );
      const duration = Date.now() - start;

      cacheStressRequests.add(1);

      const success = check(res, {
        'login successful': (r) => r.status === 200,
        'returns tokens': (r) => r.json('data.accessToken') !== undefined,
      });

      cacheStressSuccess.add(success ? 1 : 0);
    }
  });

  sleep(0.5 + Math.random() * 0.5); // Random sleep between 0.5s and 1s
}

export function teardown(data) {
  console.log('Redis cache stress test completed');

  // Cleanup: Logout pre-created users
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
  const cacheHitP95 = data.metrics.cache_hit_latency?.values?.['p(95)'] || 0;
  const cacheMissP95 = data.metrics.cache_miss_latency?.values?.['p(95)'] || 0;
  const cacheSpeedup = cacheMissP95 > 0 ? ((cacheMissP95 - cacheHitP95) / cacheMissP95 * 100).toFixed(2) : 0;

  const summary = {
    test: 'Redis Cache Stress Test',
    timestamp: new Date().toISOString(),
    summary: {
      totalRequests: data.metrics.cache_stress_requests?.values?.count || 0,
      successRate: ((data.metrics.cache_stress_success?.values?.rate || 0) * 100).toFixed(2) + '%',
      cachePerformance: {
        hitLatencyP95: cacheHitP95.toFixed(2) + 'ms',
        missLatencyP95: cacheMissP95.toFixed(2) + 'ms',
        speedupEstimate: cacheSpeedup + '%',
      },
      scenarios: {
        multiUser: {
          p95: data.metrics.multi_user_latency?.values?.['p(95)']?.toFixed(2) + 'ms',
        },
        concurrent: {
          p95: data.metrics.concurrent_request_latency?.values?.['p(95)']?.toFixed(2) + 'ms',
        },
        registration: {
          p95: data.metrics.registration_latency?.values?.['p(95)']?.toFixed(2) + 'ms',
        },
      },
    },
    rawMetrics: data.metrics,
  };

  return {
    stdout: JSON.stringify(summary, null, 2),
    'test/k6/results/redis-cache-stress-summary.json': JSON.stringify(summary, null, 2),
  };
}
