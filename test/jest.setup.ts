/**
 * Global Jest setup for all test suites
 * This file is loaded before each test file runs
 */

// Set test environment
process.env.NODE_ENV = 'test';

// Use lower bcrypt rounds for faster tests (default is 12, which is slow)
// This significantly speeds up auth-related tests
if (!process.env.BCRYPT_ROUNDS) {
  process.env.BCRYPT_ROUNDS = '4';
}

// Increase default timeout for tests that involve async operations
jest.setTimeout(30000);
