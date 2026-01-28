// Global test setup
process.env.NODE_ENV = 'test';

// Disable authentication for tests
process.env.AUTH_ENABLED = 'false';

// Use lower bcrypt rounds for faster tests
process.env.BCRYPT_ROUNDS = '4';

// Increase timeout for integration and e2e tests
jest.setTimeout(30000);
