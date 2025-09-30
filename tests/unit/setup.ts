/**
 * Common test setup for unit tests
 * Sets up environment variables that are required across all unit tests
 */

// Set consistent environment variables for all tests
process.env.JWT_SECRET = 'test-fallback-secret-key-minimum-32-chars';
process.env.DATABASE_URL = 'postgres://test_user:test_password@localhost:5432/test_db';
process.env.API_KEY_SALT = 'test-salt-16chars';
process.env.WEBHOOK_SIGNATURE_SECRET = 'webhook-secret-that-is-at-least-32-characters-long-for-security';
process.env.NODE_ENV = 'test';

console.log('Test environment setup complete');