/**
 * Comprehensive Latency Benchmark using Autocannon
 *
 * Measures precise latency metrics for ALL HTTP endpoints.
 * Run with: npm run test:latency:benchmark
 */

import autocannon from 'autocannon';
import http from 'http';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

interface LatencyReport {
  endpoint: string;
  method: string;
  latency: {
    min: number;
    max: number;
    average: number;
    p50: number;
    p90: number;
    p95: number;
    p99: number;
    stddev: number;
  };
  throughput: {
    average: number;
    mean: number;
    stddev: number;
    min: number;
    max: number;
  };
  requests: {
    total: number;
    average: number;
    sent: number;
  };
  errors: number;
  timeouts: number;
  duration: number;
}

interface TestConfig {
  name: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  body?: Record<string, unknown>;
  headers?: Record<string, string>;
  setupFn?: () => Promise<Record<string, string>>;
  duration?: number;
  connections?: number;
  threshold?: { p95: number; p99: number };
}

class LatencyBenchmark {
  private results: LatencyReport[] = [];
  private authToken: string | null = null;
  private refreshToken: string | null = null;
  private testEmail: string;
  private testPassword = 'BenchmarkTest123';

  constructor() {
    this.testEmail = `benchmark-test-${Date.now()}@test.com`;
  }

  async setup(): Promise<void> {
    console.log('\n🔧 Setting up test user...\n');

    const registerResponse = await this.makeRequest('POST', '/auth/register', {
      email: this.testEmail,
      password: this.testPassword,
    });

    const data = registerResponse.data || registerResponse;
    if (data && data.accessToken) {
      this.authToken = data.accessToken;
      this.refreshToken = data.refreshToken;
      console.log(`✅ Test user created: ${this.testEmail}`);
    } else {
      throw new Error('Failed to create test user');
    }
  }

  private makeRequest(
    method: string,
    path: string,
    body?: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
      const url = new URL(BASE_URL);
      const options: http.RequestOptions = {
        hostname: url.hostname,
        port: url.port || 3000,
        path: path,
        method: method,
        headers: {
          'Content-Type': 'application/json',
          ...(this.authToken && { Authorization: `Bearer ${this.authToken}` }),
        },
      };

      const req = http.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch {
            resolve({});
          }
        });
      });

      req.on('error', reject);

      if (body) {
        req.write(JSON.stringify(body));
      }
      req.end();
    });
  }

  async runBenchmark(config: TestConfig): Promise<LatencyReport> {
    console.log(`\n📊 Running benchmark: ${config.name}`);
    console.log(`   ${config.method} ${config.path}`);

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...config.headers,
    };

    if (config.setupFn) {
      const setupHeaders = await config.setupFn();
      Object.assign(headers, setupHeaders);
    }

    const autocannonConfig: autocannon.Options = {
      url: `${BASE_URL}${config.path}`,
      method: config.method,
      headers,
      body: config.body ? JSON.stringify(config.body) : undefined,
      duration: config.duration || 10,
      connections: config.connections || 10,
      pipelining: 1,
    };

    return new Promise((resolve, reject) => {
      const instance = autocannon(autocannonConfig, (err, result) => {
        if (err) {
          reject(err);
          return;
        }

        const report: LatencyReport = {
          endpoint: config.path,
          method: config.method,
          latency: {
            min: result.latency.min,
            max: result.latency.max,
            average: result.latency.average,
            p50: result.latency.p50,
            p90: result.latency.p90,
            p95: result.latency.p95,
            p99: result.latency.p99,
            stddev: result.latency.stddev,
          },
          throughput: {
            average: result.throughput.average,
            mean: result.throughput.mean,
            stddev: result.throughput.stddev,
            min: result.throughput.min,
            max: result.throughput.max,
          },
          requests: {
            total: result.requests.total,
            average: result.requests.average,
            sent: result.requests.sent,
          },
          errors: result.errors,
          timeouts: result.timeouts,
          duration: result.duration,
        };

        this.results.push(report);
        this.printReport(config.name, report, config.threshold);
        resolve(report);
      });

      autocannon.track(instance, { renderProgressBar: true });
    });
  }

  private printReport(
    name: string,
    report: LatencyReport,
    threshold?: { p95: number; p99: number },
  ): void {
    const p95Status = threshold
      ? report.latency.p95 <= threshold.p95
        ? '✅'
        : '❌'
      : '  ';
    const p99Status = threshold
      ? report.latency.p99 <= threshold.p99
        ? '✅'
        : '❌'
      : '  ';

    console.log(`\n   📈 Results for ${name}:`);
    console.log(`   ┌────────────────────────────────────────┐`);
    console.log(`   │ Latency (ms)                           │`);
    console.log(`   ├────────────────────────────────────────┤`);
    console.log(`   │ Min:     ${report.latency.min.toFixed(2).padStart(10)} ms              │`);
    console.log(`   │ Max:     ${report.latency.max.toFixed(2).padStart(10)} ms              │`);
    console.log(`   │ Average: ${report.latency.average.toFixed(2).padStart(10)} ms              │`);
    console.log(`   │ p50:     ${report.latency.p50.toFixed(2).padStart(10)} ms              │`);
    console.log(`   │ p90:     ${report.latency.p90.toFixed(2).padStart(10)} ms              │`);
    console.log(`   │ p95:     ${report.latency.p95.toFixed(2).padStart(10)} ms ${p95Status}           │`);
    console.log(`   │ p99:     ${report.latency.p99.toFixed(2).padStart(10)} ms ${p99Status}           │`);
    console.log(`   │ Std Dev: ${report.latency.stddev.toFixed(2).padStart(10)} ms              │`);
    console.log(`   ├────────────────────────────────────────┤`);
    console.log(`   │ Requests: ${report.requests.total.toString().padStart(8)} total           │`);
    console.log(`   │ Errors:   ${report.errors.toString().padStart(8)}                  │`);
    console.log(`   │ Timeouts: ${report.timeouts.toString().padStart(8)}                  │`);
    console.log(`   └────────────────────────────────────────┘`);
  }

  async runAllBenchmarks(): Promise<void> {
    const tests: TestConfig[] = [
      // ============================================
      // APP ENDPOINTS
      // ============================================
      {
        name: 'GET / (App Info)',
        method: 'GET',
        path: '/',
        duration: 10,
        connections: 20,
        threshold: { p95: 50, p99: 100 },
      },
      {
        name: 'GET /health (Health Check)',
        method: 'GET',
        path: '/health',
        duration: 10,
        connections: 20,
        threshold: { p95: 50, p99: 100 },
      },
      {
        name: 'GET /health/detailed (Detailed Health)',
        method: 'GET',
        path: '/health/detailed',
        duration: 10,
        connections: 20,
        threshold: { p95: 100, p99: 200 },
      },

      // ============================================
      // AUTH ENDPOINTS
      // ============================================
      {
        name: 'POST /auth/login (User Login)',
        method: 'POST',
        path: '/auth/login',
        body: {
          email: this.testEmail,
          password: this.testPassword,
        },
        duration: 10,
        connections: 5, // Lower for bcrypt
        threshold: { p95: 500, p99: 1000 },
      },
      {
        name: 'GET /auth/me (Current User - Cached)',
        method: 'GET',
        path: '/auth/me',
        setupFn: async () => ({
          Authorization: `Bearer ${this.authToken}`,
        }),
        duration: 15,
        connections: 50, // High concurrency to test caching
        threshold: { p95: 100, p99: 200 },
      },
      {
        name: 'GET /auth/me (High Concurrency - 100 connections)',
        method: 'GET',
        path: '/auth/me',
        setupFn: async () => ({
          Authorization: `Bearer ${this.authToken}`,
        }),
        duration: 15,
        connections: 100,
        threshold: { p95: 150, p99: 300 },
      },

      // ============================================
      // REGISTRATION (bcrypt heavy - separate test)
      // ============================================
      // Note: Registration creates new users each time,
      // so we use very low concurrency and short duration
    ];

    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('                    RUNNING ALL BENCHMARKS                      ');
    console.log('═══════════════════════════════════════════════════════════════');

    for (const test of tests) {
      try {
        await this.runBenchmark(test);
      } catch (error) {
        console.error(`❌ Benchmark failed: ${test.name}`, error);
      }
    }

    // Registration benchmark (special handling)
    console.log('\n📊 Running benchmark: POST /auth/register (User Registration)');
    console.log('   ⚠️  Note: Creating unique users - limited iterations');
    await this.runRegistrationBenchmark();
  }

  private async runRegistrationBenchmark(): Promise<void> {
    const samples: number[] = [];
    const iterations = 5;

    for (let i = 0; i < iterations; i++) {
      const email = `benchmark-reg-${Date.now()}-${i}@test.com`;
      const start = Date.now();

      await this.makeRequest('POST', '/auth/register', {
        email,
        password: this.testPassword,
      });

      samples.push(Date.now() - start);
    }

    const sorted = [...samples].sort((a, b) => a - b);
    const avg = sorted.reduce((a, b) => a + b, 0) / sorted.length;

    const report: LatencyReport = {
      endpoint: '/auth/register',
      method: 'POST',
      latency: {
        min: sorted[0],
        max: sorted[sorted.length - 1],
        average: avg,
        p50: sorted[Math.floor(sorted.length * 0.5)],
        p90: sorted[Math.floor(sorted.length * 0.9)] || sorted[sorted.length - 1],
        p95: sorted[Math.floor(sorted.length * 0.95)] || sorted[sorted.length - 1],
        p99: sorted[sorted.length - 1],
        stddev: Math.sqrt(sorted.reduce((acc, val) => acc + Math.pow(val - avg, 2), 0) / sorted.length),
      },
      throughput: { average: 0, mean: 0, stddev: 0, min: 0, max: 0 },
      requests: { total: iterations, average: 0, sent: iterations },
      errors: 0,
      timeouts: 0,
      duration: samples.reduce((a, b) => a + b, 0),
    };

    this.results.push(report);
    this.printReport('POST /auth/register (Registration)', report, { p95: 2000, p99: 3000 });
  }

  printSummary(): void {
    console.log('\n\n');
    console.log('╔═══════════════════════════════════════════════════════════════════════════════════════════════════╗');
    console.log('║                              COMPREHENSIVE LATENCY BENCHMARK SUMMARY                              ║');
    console.log('╠═══════════════════════════════════════════════════════════════════════════════════════════════════╣');
    console.log('║ Endpoint                          │ Min      │ Avg      │ p95      │ p99      │ Req/s   │ Errors  ║');
    console.log('╠═══════════════════════════════════╪══════════╪══════════╪══════════╪══════════╪═════════╪═════════╣');

    for (const result of this.results) {
      const name = `${result.method} ${result.endpoint}`.padEnd(33).slice(0, 33);
      const min = `${result.latency.min.toFixed(0)}ms`.padStart(8);
      const avg = `${result.latency.average.toFixed(0)}ms`.padStart(8);
      const p95 = `${result.latency.p95.toFixed(0)}ms`.padStart(8);
      const p99 = `${result.latency.p99.toFixed(0)}ms`.padStart(8);
      const rps = result.requests.average ? result.requests.average.toFixed(0).padStart(7) : 'N/A'.padStart(7);
      const errors = result.errors.toString().padStart(7);
      console.log(`║ ${name} │ ${min} │ ${avg} │ ${p95} │ ${p99} │ ${rps} │ ${errors} ║`);
    }

    console.log('╚═══════════════════════════════════════════════════════════════════════════════════════════════════╝');

    // Threshold check summary
    console.log('\n✅ Latency Threshold Results:');

    const thresholds: Record<string, { p95: number; p99: number }> = {
      '/': { p95: 50, p99: 100 },
      '/health': { p95: 50, p99: 100 },
      '/health/detailed': { p95: 100, p99: 200 },
      '/auth/register': { p95: 2000, p99: 3000 },
      '/auth/login': { p95: 500, p99: 1000 },
      '/auth/me': { p95: 150, p99: 300 },
    };

    let allPassed = true;
    for (const result of this.results) {
      const threshold = thresholds[result.endpoint];
      if (threshold) {
        const p95Pass = result.latency.p95 <= threshold.p95;
        const p99Pass = result.latency.p99 <= threshold.p99;
        const status = p95Pass && p99Pass ? '✅ PASS' : '❌ FAIL';
        if (!p95Pass || !p99Pass) allPassed = false;
        console.log(`   ${result.method} ${result.endpoint}: ${status} (p95: ${result.latency.p95.toFixed(0)}ms/${threshold.p95}ms, p99: ${result.latency.p99.toFixed(0)}ms/${threshold.p99}ms)`);
      }
    }

    console.log(`\n${allPassed ? '✅' : '❌'} Overall: ${allPassed ? 'ALL THRESHOLDS PASSED' : 'SOME THRESHOLDS FAILED'}`);
  }

  async cleanup(): Promise<void> {
    console.log('\n🧹 Cleaning up...');
    if (this.refreshToken) {
      await this.makeRequest('POST', '/auth/logout', {
        refreshToken: this.refreshToken,
      });
    }
    console.log('✅ Cleanup complete');
  }
}

async function main(): Promise<void> {
  console.log('╔═══════════════════════════════════════════════════════════════╗');
  console.log('║     COMPREHENSIVE LATENCY BENCHMARK - All HTTP Endpoints      ║');
  console.log('║                                                               ║');
  console.log('║  Testing all endpoints with Autocannon for precise metrics    ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝');

  const benchmark = new LatencyBenchmark();

  try {
    await benchmark.setup();
    await benchmark.runAllBenchmarks();
    benchmark.printSummary();
  } catch (error) {
    console.error('Benchmark failed:', error);
    process.exit(1);
  } finally {
    await benchmark.cleanup();
  }
}

main();
