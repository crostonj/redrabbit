import { describe, it, beforeEach } from 'node:test';
import { strict as assert } from 'node:assert';
import './setup.js';
import { loadEnvironment, getConfig, isProduction, isDevelopment, isTest, getConfigSummary, clearEnvironmentCache } from '../../config/environment.js';

describe('Environment Configuration', () => {
  const originalEnv = { ...process.env };
  
  beforeEach(() => {
    // Reset environment to clean state for each test
    process.env = { ...originalEnv };
    clearEnvironmentCache();
    
    // Set minimal required environment variables for all tests
    process.env.DATABASE_URL = 'postgres://test_user:test_password@localhost:5432/test_db';
  // JWT is asymmetric or JWKS based now; we provide a mock public key for tests
  process.env.JWT_PUBLIC_KEY = '-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAtestpublickeymaterial1234567890\n-----END PUBLIC KEY-----';
    process.env.API_KEY_SALT = 'test-salt-16chars';
    process.env.WEBHOOK_SIGNATURE_SECRET = 'webhook-secret-that-is-at-least-32-characters-long-for-security';
    process.env.NODE_ENV = 'development';
  });

  it('should load default configuration', () => {
    const env = loadEnvironment(true);
    assert.strictEqual(env.NODE_ENV, 'development');
    assert.strictEqual(env.PORT, 3000);
    assert.strictEqual(env.DATABASE_URL, 'postgres://test_user:test_password@localhost:5432/test_db');
    assert.strictEqual(env.API_KEY_SALT, 'test-salt-16chars');
    assert.strictEqual(env.ENABLE_WEBHOOKS, true); // default
  });

  it('should validate required DATABASE_URL', () => {
    delete process.env.DATABASE_URL;
    assert.throws(() => loadEnvironment(true), /Environment configuration validation failed/);
  });

  it('should validate required API key salt', () => {
    delete process.env.API_KEY_SALT;
    assert.throws(() => loadEnvironment(true), /Environment configuration validation failed/);
  });

  it('should provide structured configuration object', () => {
    const cfg = getConfig();
    assert.ok(cfg.app && cfg.database && cfg.auth && cfg.security && cfg.services && cfg.features && cfg.monitoring);
    // Database host derived from URL
    const url = new URL(cfg.database.url);
    assert.strictEqual(url.hostname, 'localhost');
    // Public key present when provided
    assert.ok(cfg.auth.jwtPublicKey);
  });

  it('should detect environment correctly', () => {
    process.env.NODE_ENV = 'development';
    loadEnvironment(true);
    assert.ok(isDevelopment());
    assert.ok(!isProduction());
    assert.ok(!isTest());

    process.env.NODE_ENV = 'test';
    loadEnvironment(true);
    assert.ok(isTest());
  });

  it('should provide configuration summary with masked DB credentials', () => {
    const summary = getConfigSummary();
    assert.ok(summary.environment);
    assert.ok(summary.database.includes('localhost:5432/test_db'));
    assert.ok(summary.database.includes('*****:*****'));
    assert.ok(summary.features.webhooks !== undefined);
  });

  it('should validate webhook signature secret minimum length', () => {
    process.env.WEBHOOK_SIGNATURE_SECRET = 'short-secret';
    assert.throws(() => loadEnvironment(true), /Environment configuration validation failed/);
  });

  it('should parse boolean environment variables correctly', () => {
    process.env.ENABLE_WEBHOOKS = 'false';
    process.env.METRICS_ENABLED = 'false';
    process.env.REQUEST_LOGGING = 'false';
    // Ensure required vars still present
    process.env.DATABASE_URL ||= 'postgres://test_user:test_password@localhost:5432/test_db';
    process.env.API_KEY_SALT ||= 'test-salt-16chars';
    process.env.WEBHOOK_SIGNATURE_SECRET ||= 'webhook-secret-that-is-at-least-32-characters-long-for-security';
    process.env.JWT_PUBLIC_KEY ||= '-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAtestpublickeymaterial1234567890\n-----END PUBLIC KEY-----';
    const env = loadEnvironment(true);
    assert.strictEqual(env.ENABLE_WEBHOOKS, false);
    assert.strictEqual(env.METRICS_ENABLED, false);
    assert.strictEqual(env.REQUEST_LOGGING, false);
  });

  it('should parse numeric environment variables correctly', () => {
    process.env.PORT = '4000';
    process.env.DB_MAX_CONNECTIONS = '50';
    process.env.RATE_LIMIT_MAX_REQUESTS = '200';
    
    const env = loadEnvironment(true);
    
    assert.strictEqual(env.PORT, 4000);
    assert.strictEqual(env.DB_MAX_CONNECTIONS, 50);
    assert.strictEqual(env.RATE_LIMIT_MAX_REQUESTS, 200);
  });

  it('should transform comma-separated values correctly', () => {
    process.env.CORS_ORIGINS = 'http://localhost:3000,http://localhost:3001,https://app.redrabbit.com';
    
    const env = loadEnvironment(true);
    
    assert.deepStrictEqual(env.CORS_ORIGINS, [
      'http://localhost:3000',
      'http://localhost:3001', 
      'https://app.redrabbit.com'
    ]);
  });

  it('should use default values when optional environment variables are not set', () => {
    const env = loadEnvironment(true);
    assert.strictEqual(env.LOG_LEVEL, 'info');
    assert.strictEqual(env.DB_MAX_CONNECTIONS, 20);
    assert.strictEqual(env.BCRYPT_ROUNDS, 12);
  });
});