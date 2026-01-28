# Talksy Testing Guide

## Quick Start

```bash
# 1. Unit tests (no infrastructure needed)
npm run test:unit

# 2. Full test suite with orchestration (recommended)
npm run test:run:local       # Starts infra, API, runs all tests, cleans up
npm run test:run:docker      # Same but with Docker infrastructure

# 3. Manual step-by-step
npm run infra:local:up       # Start Redis (optional)
npm run start:dev &          # Start API server
npm run test:full:local      # Run Unit + Integration + E2E + Curl + K6
npm run infra:local:down     # Cleanup
```

---

## Overview

Talksy uses a tiered testing strategy to ensure code quality while maintaining fast feedback loops. Tests are organized by their infrastructure requirements.

## Testing Tiers

```
┌─────────────────────────────────────────────────────────────────┐
│  TIER 1: Unit Tests (No Infrastructure Required)                │
│  Fast, isolated tests that mock all external dependencies       │
│  Command: npm run test:unit (776 tests)                         │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  TIER 2: Integration Tests (MongoDB Memory Server)              │
│  Tests service interactions with real module coordination       │
│  Command: npm run test:integration (173 tests)                  │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  TIER 3: E2E Tests (Full Infrastructure Required)               │
│  Complete WebSocket flow testing with all services running      │
│  Command: npm run test:e2e (73 tests)                           │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  TIER 4: Latency Tests (Running API Required)                   │
│  Performance threshold validation for all endpoints             │
│  Command: npm run test:latency (13 tests)                       │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  TIER 5: cURL API Tests (Running API Required)                  │
│  Manual API testing with jq beautification                      │
│  Command: npm run test:api                                      │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  TIER 6: K6 Load Tests (Running API Required)                   │
│  Performance, latency, and cache stress testing with k6         │
│  Command: npm run k6:local                                      │
└─────────────────────────────────────────────────────────────────┘
```

---

## All Test Commands

### Infrastructure Management

| Command | Description |
|---------|-------------|
| `npm run infra:local:up` | Start test Redis (port 6380) |
| `npm run infra:local:down` | Stop test infrastructure |
| `npm run infra:local:status` | Check test infrastructure status |
| `npm run infra:docker:up` | Start Docker stack (Redis) |
| `npm run infra:docker:down` | Stop Docker stack |
| `npm run infra:docker:status` | Check Docker stack status |

### Orchestrated Full Test Suite (Recommended)

These commands handle infrastructure startup, run all tests, and cleanup automatically:

| Command | Description |
|---------|-------------|
| `npm run test:run:local` | Full suite: Unit + Integration + E2E + Curl + K6 (local) |
| `npm run test:run:docker` | Full suite with Docker infrastructure |

### Full Test Suite (Manual Infrastructure)

| Command | Description |
|---------|-------------|
| `npm run test:full:local` | Unit + Integration + E2E + Curl + K6 (local) |
| `npm run test:full:docker` | Unit + Integration + E2E + Curl + K6 (docker) |

### Unit Tests (No Infrastructure)

| Command | Description |
|---------|-------------|
| `npm run test:unit` | Run 776 unit tests (fast, isolated) |

### Jest Tests

| Command | Description |
|---------|-------------|
| `npm test` | Run all Jest tests (1,035 total) |
| `npm run test:watch` | Watch mode for development |
| `npm run test:cov` | Generate coverage report |
| `npm run test:ci` | CI pipeline (with coverage + force exit) |
| `npm run test:integration` | Integration tests only (173 tests) |
| `npm run test:e2e` | E2E tests (73 tests) |
| `npm run test:latency` | Latency/performance tests (13 tests) |
| `npm run test:jest:local` | Unit + Integration + E2E combined |
| `npm run test:comprehensive` | Unit + Integration + E2E combined |
| `npm run test:coverage:check` | Run with 90% coverage threshold |

### cURL API Tests (Require Running API)

| Command | Description |
|---------|-------------|
| `npm run test:api` | Run curl tests (default environment) |
| `npm run test:api:local` | Curl tests against localhost:3000 |
| `npm run test:api:docker` | Curl tests against Docker |
| `npm run test:api:vps` | Curl tests against VPS (set VPS_API_URL) |
| `npm run test:api:staging` | Curl tests against staging |
| `npm run test:api:production` | Curl tests against production |
| `npm run test:api:verbose` | Curl tests with response body output |

### K6 Load Tests

| Command | Description |
|---------|-------------|
| `npm run k6:local` | K6 full test suite (local) |
| `npm run k6:local:smoke` | K6 smoke test (local) |
| `npm run k6:docker` | K6 full test suite (docker) |
| `npm run k6:docker:smoke` | K6 smoke test (docker) |
| `npm run k6:vps` | K6 tests against VPS |
| `npm run k6:staging` | K6 tests against staging |
| `npm run k6:production` | K6 tests against production |

### Individual K6 Scenarios

| Command | Description |
|---------|-------------|
| `npm run test:k6:connection` | WebSocket connection stress test |
| `npm run test:k6:messages` | Message flow test |
| `npm run test:k6:streaming` | Streaming performance test |
| `npm run test:k6:tools` | Tool execution load test |
| `npm run test:k6:ratelimit` | Rate limiting verification |
| `npm run test:k6:all` | All K6 scenarios |
| `npm run test:k6:smoke` | Quick smoke test |

### K6 Latency & Cache Tests

| Command | Description |
|---------|-------------|
| `npm run k6:latency` | All-endpoints latency benchmark |
| `npm run k6:latency:smoke` | Quick latency smoke test |
| `npm run k6:cache` | Redis cache stress test |
| `npm run k6:cache:smoke` | Quick cache stress test |

### Docker Commands

| Command | Description |
|---------|-------------|
| `npm run docker:build` | Build Docker image |
| `npm run docker:up` | Start Docker containers |
| `npm run docker:down` | Stop Docker containers |
| `npm run docker:logs` | View API container logs |
| `npm run docker:test` | Run tests with Docker infrastructure |
| `npm run docker:test:all` | Full test suite with Docker |

---

## Common Workflows

### Run Full Test Suite (Easiest - Recommended)

```bash
# Orchestrated: handles infrastructure, API, tests, and cleanup
npm run test:run:local       # For local development
npm run test:run:docker      # For Docker-based testing
```

### Run Unit Tests Only (No Setup Required)

```bash
npm run test:unit
```

### Run Jest Tests (Unit + Integration + E2E)

```bash
# All tests run without external infrastructure (mocked)
npm run test:comprehensive
```

### Run cURL API Tests

```bash
# Start API server
npm run start:dev &

# Run curl tests
npm run test:api:local

# Or with verbose output
npm run test:api:verbose

# Cleanup
pkill -f "nest start"
```

### Run K6 Load Tests

```bash
# Start API server
npm run start:dev &

# Run K6 tests
npm run k6:local              # Full test
npm run k6:local:smoke        # Quick smoke test

# Cleanup
pkill -f "nest start"
```

### Run Tests Against Remote Environments

```bash
# Against VPS (set API URL)
VPS_API_URL=https://api.yourvps.com npm run test:api:vps
VPS_WS_URL=wss://api.yourvps.com npm run k6:vps

# Against staging
STAGING_API_URL=https://staging.example.com npm run test:api:staging

# Against production (be careful!)
PRODUCTION_API_URL=https://api.example.com npm run test:api:production
```

### Run All Tests for CI

```bash
npm run test:ci
```

### Development Workflow

```bash
# Run tests in watch mode
npm run test:watch

# Or run specific test file
npm test -- src/gateway/assistant.gateway.spec.ts
```

---

## Port Configuration

| Service | Development | Docker Test |
|---------|-------------|-------------|
| API | 3000 | 3000 |
| Redis | 6379 | 6380 |

**Note:** Docker test uses different Redis port (6380) to avoid conflicts with local development.

---

## Test Directory Structure

```
src/
├── **/*.spec.ts              # Unit tests (co-located with source)
│
test/
├── integration/              # Tier 2: Integration tests
│   ├── ai.spec.ts           # AI service integration
│   ├── gateway.spec.ts      # Gateway integration
│   ├── rate-limit.spec.ts   # Rate limit integration
│   ├── session.spec.ts      # Session integration
│   ├── storage.spec.ts      # Storage integration
│   └── tools.spec.ts        # Tools integration
│
├── e2e/                      # Tier 3: End-to-end tests
│   ├── gateway.e2e-spec.ts  # WebSocket gateway flows
│   ├── session.e2e-spec.ts  # Session management
│   ├── app.e2e-spec.ts      # HTTP endpoints
│   └── production.e2e-spec.ts # Production features
│
├── k6/                       # Tier 5: Load tests
│   ├── scenarios/
│   │   ├── websocket-connection.js
│   │   ├── message-flow.js
│   │   ├── streaming-flow.js
│   │   ├── tool-execution.js
│   │   └── rate-limit.js
│   ├── config/
│   │   ├── environments.js
│   │   ├── stages.js
│   │   └── thresholds.js
│   ├── utils/
│   │   └── metrics.js
│   ├── results/              # Test output
│   └── run-all.js           # Orchestrator
│
├── jest-e2e.json            # E2E Jest config
└── setup.ts                 # Jest global setup
```

---

## Test Configuration

### Jest Configuration (package.json)

```json
{
  "jest": {
    "moduleFileExtensions": ["js", "json", "ts"],
    "testRegex": ".*\\.spec\\.ts$",
    "transform": { "^.+\\.(t|j)s$": "ts-jest" },
    "coverageThreshold": {
      "global": {
        "branches": 90,
        "functions": 90,
        "lines": 90,
        "statements": 90
      }
    }
  }
}
```

### Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `NODE_ENV` | `development` | Environment mode |
| `MONGODB_ENABLED` | `true` | Enable MongoDB (uses memory server in tests) |
| `REDIS_ENABLED` | `false` | Enable Redis adapter |
| `REDIS_HOST` | `localhost` | Redis host |
| `REDIS_PORT` | `6379` | Redis port |
| `AUTH_ENABLED` | `false` | Enable API key auth |
| `RATE_LIMIT_ENABLED` | `true` | Enable rate limiting |
| `BCRYPT_ROUNDS` | `4` (test) | bcrypt hashing rounds (use 12 in prod) |

### Test Environment Setup

Tests automatically configure the following via `test/jest.setup.ts`:
- `BCRYPT_ROUNDS=4` for faster bcrypt hashing
- `NODE_ENV=test` for test mode
- 30 second default timeout for async operations

Integration tests use `mongodb-memory-server` for isolated database testing.

---

## Writing Tests

### Unit Tests (Tier 1)

Unit tests should be fast and isolated with no external dependencies:

```typescript
// src/services/example.service.spec.ts
import { ExampleService } from './example.service';

describe('ExampleService', () => {
  let service: ExampleService;

  beforeEach(() => {
    service = new ExampleService();
  });

  it('should do something', () => {
    expect(service.doSomething()).toBe(true);
  });
});
```

### Integration Tests (Tier 2)

Integration tests verify service interactions with real module coordination:

```typescript
// test/integration/example.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { ExampleModule } from '@/example/example.module';
import { ExampleService } from '@/example/example.service';

describe('Example Integration', () => {
  let module: TestingModule;
  let service: ExampleService;

  beforeEach(async () => {
    module = await Test.createTestingModule({
      imports: [ExampleModule],
    }).compile();

    service = module.get<ExampleService>(ExampleService);
  });

  afterEach(async () => {
    await module.close();
  });

  it('should integrate with other services', async () => {
    const result = await service.complexOperation();
    expect(result).toBeDefined();
  });
});
```

### E2E Tests (Tier 3)

E2E tests verify complete WebSocket flows:

```typescript
// test/e2e/example.e2e-spec.ts
import { io, Socket } from 'socket.io-client';

describe('Example E2E', () => {
  let socket: Socket;

  beforeEach((done) => {
    socket = io('http://localhost:3000', {
      transports: ['websocket'],
      forceNew: true,
    });
    socket.on('connect', done);
  });

  afterEach(() => {
    socket.disconnect();
  });

  it('should handle message flow', (done) => {
    socket.on('assistant_response', (response) => {
      expect(response.text).toBeDefined();
      done();
    });

    socket.emit('user_message', { text: 'Hello' });
  });
});
```

---

## Test Coverage

Generate coverage reports:

```bash
npm run test:cov
```

Coverage report is generated in `coverage/` directory:
- `coverage/lcov-report/index.html` - HTML report
- `coverage/lcov.info` - LCOV format for CI tools

### Current Coverage Statistics

| Metric | Coverage |
|--------|----------|
| Statements | 97.15% |
| Branches | 92.00% |
| Functions | 96.95% |
| Lines | 97.12% |

### Test Count

| Category | Tests |
|----------|-------|
| Unit Tests | 776 |
| Integration Tests | 173 |
| E2E Tests | 73 |
| Latency Tests | 13 |
| **Total Jest** | **1,035** |

### K6 Load Test Scenarios

| Scenario | Description |
|----------|-------------|
| All-Endpoints Latency | Tests p95/p99 latency for all HTTP endpoints |
| Cache Stress | Tests LRU cache under concurrent load |
| WebSocket Connection | Connection/disconnection stress test |
| Message Flow | Message throughput testing |
| Streaming | Streaming response performance |

---

## K6 Load Testing

### Prerequisites

```bash
# Install k6 (macOS)
brew install k6

# Install k6 (Linux)
sudo apt-get install k6

# Install k6 (Windows)
choco install k6
```

### Test Types

| Type | Purpose | VUs | Duration |
|------|---------|-----|----------|
| **Smoke** | Quick health checks | 5 | 1 min |
| **Full** | Complete test suite | 10-50 | 5 min |
| **Connection** | WebSocket stress | 50-200 | 6 min |
| **Messages** | Message throughput | 25-50 | 8 min |
| **Streaming** | Streaming performance | 10-20 | 4 min |

### Environment Configuration

```bash
# Local (default)
npm run k6:local

# Docker
npm run k6:docker

# VPS (requires environment variables)
VPS_WS_URL=wss://api.yourdomain.com \
VPS_API_URL=https://api.yourdomain.com \
LOAD_TEST_TOKEN=your-secret \
npm run k6:vps
```

### Performance Thresholds

| Metric | Threshold |
|--------|-----------|
| WebSocket Connect (p95) | < 1000ms |
| Response Time (p95) | < 3000ms |
| Success Rate | > 90% |
| HTTP Response (p95) | < 500ms |

---

## Troubleshooting

### Tests Fail with Connection Errors

```bash
# Ensure API server is running
npm run start:dev

# Check server is accessible
curl http://localhost:3000/health
```

### Tests Hang or Timeout

```bash
# Run with open handle detection
npm test -- --detectOpenHandles

# Increase timeout for slow tests
npm test -- --testTimeout=60000
```

### Redis Connection Issues

```bash
# Check if Redis is needed
# Talksy works without Redis (uses in-memory storage)

# If using Redis, check connection
redis-cli -p 6379 ping
```

### Jest Memory Issues

```bash
# Run with memory limit
NODE_OPTIONS="--max-old-space-size=4096" npm test

# Run tests sequentially (less memory)
npm test -- --runInBand
```

---

## Best Practices

1. **Isolate Tests**: Each test should be independent
2. **Clean Up**: Always clean state in `beforeEach`/`afterEach`
3. **Use Factories**: Create test data using helper functions
4. **Mock External Services**: Don't call real external APIs
5. **Test Edge Cases**: Include error conditions and boundaries
6. **Keep Tests Fast**: Unit tests < 100ms, E2E < 5s
7. **Use Descriptive Names**: Test names should describe behavior
8. **Avoid Sleep/Delays**: Use proper async waiting

---

## CI/CD Integration

### GitHub Actions Example

```yaml
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci
      - run: npm run lint:check
      - run: npm run test:ci
      - run: npm run build
```

### Coverage Enforcement

The CI pipeline enforces 90% coverage thresholds:
- Branches: 90%
- Functions: 90%
- Lines: 90%
- Statements: 90%
