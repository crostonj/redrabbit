// Set environment variable BEFORE any imports
process.env.JWT_SECRET = 'test-fallback-secret-key-minimum-32-chars';

import { describe, it, before, after } from 'node:test';
import { strict as assert } from 'node:assert';
import request from 'supertest';
import { Express } from 'express';
import { z } from 'zod';
import jwt from 'jsonwebtoken';

// Simple Contract test for Authentication Middleware (Basic JWT validation only)
describe('Contract Test: Authentication Middleware (Basic JWT)', () => {
  let app: Express;
  
  before(async () => {
    // Import Express app now that implementation is complete
    const { app: expressApp } = await import('../../src/server.js');
    app = expressApp;
  });

  after(async () => {
    // Cleanup after tests
  });

  // Schema for actual middleware error responses
  const AuthErrorResponseSchema = z.object({
    success: z.literal(false),
    error: z.string().min(1),
    message: z.string().min(1)
  });

  // Test JWT tokens (must match the system's JWT_SECRET)
  const JWT_SECRET = 'test-fallback-secret-key-minimum-32-chars';
  
  const generateValidToken = (payload: any): string => {
    return jwt.sign(payload, JWT_SECRET, { 
      expiresIn: '1h',
      algorithm: 'HS256'
    });
  };

  const malformedToken = 'not.a.valid.jwt.token';
  const expiredToken = jwt.sign({
    sub: '123e4567-e89b-12d3-a456-426614174000',
    email: 'expired@example.com',
    role: 'customer'
  }, JWT_SECRET, { expiresIn: '-1h' }); // Already expired

  describe('Basic Authentication Requirements', () => {
    it('should require authentication for GET /api/v1/orders', async () => {
      await request(app)
        .get('/api/v1/orders')
        .expect(401);
    });

    it('should require authentication for POST /api/v1/orders', async () => {
      const response = await request(app)
        .post('/api/v1/orders')
        .set('Content-Type', 'application/json')
        .send({ test: 'data' });
      
      // Should be 401 (auth required), not 415 (content type)
      assert.strictEqual(response.status, 401);
    });

    it('should require authentication for GET /api/v1/customers', async () => {
      await request(app)
        .get('/api/v1/customers')
        .expect(401);
    });

    it('should reject request with missing Bearer prefix', async () => {
      await request(app)
        .get('/api/v1/orders')
        .set('Authorization', 'invalid-format-token')
        .expect(401);
    });

    it('should reject request with malformed JWT token', async () => {
      const response = await request(app)
        .get('/api/v1/orders')
        .set('Authorization', `Bearer ${malformedToken}`)
        .expect(401);

      const parsedResponse = AuthErrorResponseSchema.parse(response.body);
      assert.strictEqual(parsedResponse.error, 'Invalid token');
      assert.match(parsedResponse.message, /invalid|expired/i);
    });

    it('should reject expired JWT token', async () => {
      const response = await request(app)
        .get('/api/v1/orders')
        .set('Authorization', `Bearer ${expiredToken}`)
        .expect(401);

      const parsedResponse = AuthErrorResponseSchema.parse(response.body);
      assert.strictEqual(parsedResponse.error, 'Invalid token');
      assert.match(parsedResponse.message, /invalid|expired/i);
    });

    it('should reject token with invalid signature', async () => {
      const invalidSignatureToken = jwt.sign({
        sub: '123e4567-e89b-12d3-a456-426614174000',
        email: 'test@example.com',
        role: 'customer'
      }, 'wrong-secret', { expiresIn: '1h' });

      const response = await request(app)
        .get('/api/v1/orders')
        .set('Authorization', `Bearer ${invalidSignatureToken}`)
        .expect(401);

      const parsedResponse = AuthErrorResponseSchema.parse(response.body);
      assert.strictEqual(parsedResponse.error, 'Invalid token');
    });

    it('should accept valid JWT tokens', async () => {
      const validToken = generateValidToken({
        sub: '123e4567-e89b-12d3-a456-426614174000',
        email: 'test@example.com',
        role: 'customer'
      });

      // Note: This may fail with 500 due to database connection, but should not fail with 401
      const response = await request(app)
        .get('/api/v1/orders')
        .set('Authorization', `Bearer ${validToken}`);
      
      // Should NOT be 401 (authentication failure)
      assert.notStrictEqual(response.status, 401, `Should not fail authentication but got ${response.status}: ${response.text}`);
    });
  });

  describe('App Loading Test', () => {
    it('should load the Express app successfully', () => {
      assert.ok(app, 'Express app should be loaded');
    });
  });
});