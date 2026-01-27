# Talksy Testing Suite

This directory contains all the testing scripts for the Talksy application. The tests are organized by type to make it easier to run specific categories of tests.

## Directory Structure

```
test-scripts/
├── api/                 # API-specific tests
│   ├── basic-test.sh           # Basic API endpoint tests
│   └── comprehensive-test.sh   # Comprehensive API tests with detailed reporting
├── integration/         # Integration and environment tests
│   └── docker-test.sh          # Docker environment tests
├── load/              # Load and stress tests
│   └── load-test.sh            # Load testing scripts
├── performance/       # Performance and benchmarking tests
│   ├── performance-test.sh     # Basic performance tests
│   ├── basic-performance-test.sh # Simple performance tests
│   └── enhanced-performance-test.sh # Advanced performance tests
├── unit/              # Unit tests (handled by Jest)
├── e2e/               # End-to-end tests (handled by Jest)
├── standalone/        # Legacy standalone scripts
└── test-runner.sh     # Main test execution script
```

## Available Test Scripts

### Running Tests

You can run tests using npm scripts defined in `package.json`:

```bash
# Run all tests
npm run test:all

# Run specific test categories
npm run test:unit                    # Unit tests
npm run test:integration            # Integration tests
npm run test:e2e                    # End-to-end tests
npm run test:api                    # Basic API tests
npm run test:api:performance        # Performance tests
npm run test:api:load               # Load tests
npm run test:api:comprehensive      # Comprehensive API tests
npm run test:api:comprehensive:v2   # Alternative comprehensive tests
npm run test:api:performance:basic  # Basic performance tests
npm run test:api:performance:enhanced # Enhanced performance tests
npm run test:integration:docker     # Docker integration tests

# Run with coverage
npm run test:all:with-coverage

# Use the test runner for convenience
npm run test:run [command]
# Commands: all, unit, integration, e2e, api, comprehensive, docker, coverage
```

### Test Runner

The `test-runner.sh` script provides a convenient way to run different test scenarios:

```bash
# Run from project root
npm run test:run api              # Run API tests
npm run test:run docker           # Run Docker tests
npm run test:run all              # Run all tests
npm run test:run coverage         # Run tests with coverage
```

## Test Categories

### API Tests
- **Basic Tests**: Verify basic endpoint functionality and response codes
- **Comprehensive Tests**: Detailed testing with performance metrics, response time analysis, and stability checks
- **Performance Tests**: Measure response times, throughput, and resource usage
- **Load Tests**: Test application behavior under concurrent load

### Integration Tests
- **Docker Tests**: Verify application behavior in Docker environment
- **Environment Tests**: Test external dependencies and integrations

### Unit & E2E Tests
- **Unit Tests**: Individual function/class testing using Jest
- **E2E Tests**: Complete workflow testing using Jest

## Test Reports

API and performance tests generate detailed reports in the `timely-reports/` directory:
- Timestamped test reports with detailed metrics
- Performance statistics and response time analysis
- Stability and error rate measurements

## Adding New Tests

When adding new tests:
1. Place them in the appropriate category directory
2. Update `package.json` with a new npm script if needed
3. Update this documentation if the new test introduces a new category
4. Follow the naming convention: `[test-type]-[description].sh`

## Best Practices

- Use descriptive names for test scripts
- Include error handling in all test scripts
- Generate detailed reports for performance and load tests
- Maintain consistent output formatting
- Ensure tests are idempotent and can be run multiple times