// Global test setup
process.env.NODE_ENV = 'test';

// Disable authentication for tests
process.env.AUTH_ENABLED = 'false';

// Increase timeout for integration and e2e tests
jest.setTimeout(30000);
