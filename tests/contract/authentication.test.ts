import { test, describe } from 'node:test';
import assert from 'node:assert';
import request from 'supertest';
import { app } from '../../src/server.js';

/**
 * Contract Test: Authentication Middleware
 * 
 * Tests that authentication works correctly across all endpoints:
 * - JWT token validation
 * - Bearer token format requirements
 * - Token expiration handling
 * - Invalid token rejection
 * - Missing token rejection
 */

describe('Authentication Contract Tests', () => {
  test('should accept valid JWT token', async () => {
    // Test with a valid token on a protected endpoint
    await request(app)
      .get('/api/v1/orders')
      .set('Authorization', 'Bearer valid_jwt_token')
      .expect(200);
  });

  test('should reject requests without Authorization header', async () => {
    const response = await request(app)
      .get('/api/v1/orders')
      .expect(401);

    assert.strictEqual(response.body.error, 'Authorization Required');
    assert.strictEqual(response.body.message, 'Missing Authorization header');
  });

  test('should reject malformed Authorization header', async () => {
    const response = await request(app)
      .get('/api/v1/orders')
      .set('Authorization', 'InvalidFormat token_here')
      .expect(401);

    assert.strictEqual(response.body.error, 'Invalid Authorization Format');
    assert.strictEqual(response.body.message, 'Authorization header must be in format: Bearer <token>');
  });

  test('should reject expired JWT token', async () => {
    const response = await request(app)
      .get('/api/v1/orders')
      .set('Authorization', 'Bearer expired_jwt_token')
      .expect(401);

    assert.strictEqual(response.body.error, 'Token Expired');
    assert.ok(response.body.message.includes('expired'));
  });

  test('should reject invalid JWT signature', async () => {
    const response = await request(app)
      .get('/api/v1/orders')
      .set('Authorization', 'Bearer invalid_signature_token')
      .expect(401);

    assert.strictEqual(response.body.error, 'Invalid Token');
    assert.ok(response.body.message.includes('signature'));
  });

  test('should reject malformed JWT token', async () => {
    const response = await request(app)
      .get('/api/v1/orders')
      .set('Authorization', 'Bearer not.a.valid.jwt.structure')
      .expect(401);

    assert.strictEqual(response.body.error, 'Invalid Token');
    assert.strictEqual(response.body.message, 'Malformed JWT token');
  });

  test('should handle JWT token without Bearer prefix', async () => {
    const response = await request(app)
      .get('/api/v1/orders')
      .set('Authorization', 'valid_jwt_token_without_bearer')
      .expect(401);

    assert.strictEqual(response.body.error, 'Invalid Authorization Format');
  });

  test('should validate token payload structure', async () => {
    const response = await request(app)
      .get('/api/v1/orders')
      .set('Authorization', 'Bearer token_with_missing_required_claims')
      .expect(401);

    assert.strictEqual(response.body.error, 'Invalid Token Claims');
    assert.ok(response.body.message.includes('required claims'));
  });

  test('should handle token with invalid issuer', async () => {
    const response = await request(app)
      .get('/api/v1/orders')
      .set('Authorization', 'Bearer token_from_wrong_issuer')
      .expect(401);

    assert.strictEqual(response.body.error, 'Invalid Token Issuer');
  });

  test('should allow public endpoints without authentication', async () => {
    // Health check should be public
    await request(app)
      .get('/health')
      .expect(200);

    // API documentation should be public
    await request(app)
      .get('/api-docs')
      .expect(200);
  });

  test('should include proper CORS headers for authenticated requests', async () => {
    const response = await request(app)
      .get('/api/v1/orders')
      .set('Authorization', 'Bearer valid_jwt_token')
      .set('Origin', 'http://localhost:3001')
      .expect(200);

    assert.ok(response.headers['access-control-allow-origin']);
    assert.ok(response.headers['access-control-allow-methods']);
    assert.ok(response.headers['access-control-allow-headers']);
  });

  test('should handle OPTIONS preflight requests', async () => {
    const response = await request(app)
      .options('/api/v1/orders')
      .set('Origin', 'http://localhost:3001')
      .set('Access-Control-Request-Method', 'GET')
      .set('Access-Control-Request-Headers', 'Authorization')
      .expect(200);

    assert.ok(response.headers['access-control-allow-origin']);
    assert.ok(response.headers['access-control-allow-methods'].includes('GET'));
    assert.ok(response.headers['access-control-allow-headers'].includes('Authorization'));
  });
});