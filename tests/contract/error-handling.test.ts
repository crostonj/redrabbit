import { test, describe } from 'node:test';
import assert from 'node:assert';
import request from 'supertest';
import { app } from '../../src/server.js';

/**
 * Contract Test: Error Handling
 * 
 * Tests that error responses follow the OpenAPI specification:
 * - Consistent error response format
 * - Proper HTTP status codes
 * - Detailed error messages
 * - Error correlation IDs
 * - Rate limiting errors
 */

describe('Error Handling Contract Tests', () => {
  test('should return consistent error format for validation errors', async () => {
    const invalidOrder = {
      customerId: '',
      items: []
    };

    const response = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', 'Bearer valid_jwt_token')
      .send(invalidOrder)
      .expect(400);

    // Verify error response structure matches OpenAPI spec
    assert.strictEqual(response.body.error, 'Validation Error');
    assert.ok(typeof response.body.message === 'string');
    assert.ok(typeof response.body.details === 'string');
    assert.ok(response.body.timestamp);
    assert.ok(response.body.path);
    assert.ok(response.body.correlationId);
  });

  test('should return proper 404 error format', async () => {
    const response = await request(app)
      .get('/api/v1/orders/ord_nonexistent_123')
      .set('Authorization', 'Bearer valid_jwt_token')
      .expect(404);

    assert.strictEqual(response.body.error, 'Order Not Found');
    assert.ok(response.body.message.includes('ord_nonexistent_123'));
    assert.ok(response.body.timestamp);
    assert.ok(response.body.path);
    assert.ok(response.body.correlationId);
  });

  test('should return proper 401 error format', async () => {
    const response = await request(app)
      .get('/api/v1/orders')
      .expect(401);

    assert.strictEqual(response.body.error, 'Authorization Required');
    assert.strictEqual(response.body.message, 'Missing Authorization header');
    assert.ok(response.body.timestamp);
    assert.ok(response.body.path);
    assert.ok(response.body.correlationId);
  });

  test('should return proper 500 error format for server errors', async () => {
    // Trigger a server error (this endpoint should cause an internal error)
    const response = await request(app)
      .get('/api/v1/orders/trigger_server_error')
      .set('Authorization', 'Bearer valid_jwt_token')
      .expect(500);

    assert.strictEqual(response.body.error, 'Internal Server Error');
    assert.strictEqual(response.body.message, 'An unexpected error occurred');
    assert.ok(response.body.timestamp);
    assert.ok(response.body.path);
    assert.ok(response.body.correlationId);
    
    // Should not leak internal error details in production
    assert.ok(!response.body.stack);
    assert.ok(!response.body.details);
  });

  test('should handle rate limiting errors', async () => {
    // Make many requests quickly to trigger rate limiting
    const promises = Array(150).fill(null).map(() =>
      request(app)
        .get('/api/v1/orders')
        .set('Authorization', 'Bearer valid_jwt_token')
    );

    const responses = await Promise.all(promises);
    
    // Some responses should be rate limited
    const rateLimitedResponses = responses.filter(r => r.status === 429);
    assert.ok(rateLimitedResponses.length > 0);

    // Verify rate limit error format
    const rateLimitResponse = rateLimitedResponses[0];
    assert.strictEqual(rateLimitResponse.body.error, 'Too Many Requests');
    assert.ok(rateLimitResponse.body.message.includes('rate limit'));
    assert.ok(rateLimitResponse.headers['retry-after']);
    assert.ok(rateLimitResponse.body.correlationId);
  });

  test('should handle method not allowed errors', async () => {
    const response = await request(app)
      .delete('/api/v1/orders') // DELETE not allowed on collection
      .set('Authorization', 'Bearer valid_jwt_token')
      .expect(405);

    assert.strictEqual(response.body.error, 'Method Not Allowed');
    assert.ok(response.body.message.includes('DELETE'));
    assert.ok(response.headers.allow);
    assert.ok(response.body.correlationId);
  });

  test('should handle unsupported media type errors', async () => {
    const response = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', 'Bearer valid_jwt_token')
      .set('Content-Type', 'application/xml')
      .send('<order>invalid</order>')
      .expect(415);

    assert.strictEqual(response.body.error, 'Unsupported Media Type');
    assert.ok(response.body.message.includes('application/json'));
    assert.ok(response.body.correlationId);
  });

  test('should include proper headers for all error responses', async () => {
    const response = await request(app)
      .get('/api/v1/orders/nonexistent')
      .set('Authorization', 'Bearer valid_jwt_token')
      .expect(404);

    // Verify security headers are present
    assert.ok(response.headers['x-content-type-options']);
    assert.ok(response.headers['x-frame-options']);
    assert.ok(response.headers['x-xss-protection']);
    
    // Verify content type is JSON
    assert.ok(response.headers['content-type'].includes('application/json'));
  });

  test('should handle timeout errors', async () => {
    // This test assumes there's an endpoint that can timeout
    const response = await request(app)
      .get('/api/v1/orders/slow_endpoint')
      .set('Authorization', 'Bearer valid_jwt_token')
      .timeout(100) // Set a very short timeout
      .expect(408);

    assert.strictEqual(response.body.error, 'Request Timeout');
    assert.ok(response.body.message.includes('timeout'));
    assert.ok(response.body.correlationId);
  });

  test('should correlate errors with request IDs', async () => {
    const requestId = 'test-request-123';
    
    const response = await request(app)
      .get('/api/v1/orders/nonexistent')
      .set('Authorization', 'Bearer valid_jwt_token')
      .set('X-Request-ID', requestId)
      .expect(404);

    // Correlation ID should match or include the request ID
    assert.ok(
      response.body.correlationId === requestId ||
      response.body.correlationId.includes(requestId)
    );
  });

  test('should handle concurrent error scenarios', async () => {
    // Test multiple error conditions simultaneously
    const promises = [
      request(app).get('/api/v1/orders/nonexistent').set('Authorization', 'Bearer valid_jwt_token'),
      request(app).get('/api/v1/orders').set('Authorization', 'Bearer invalid_jwt_token'),
      request(app).post('/api/v1/orders').set('Authorization', 'Bearer valid_jwt_token').send({}),
    ];

    const responses = await Promise.all(promises);

    // Verify each error is handled correctly
    assert.strictEqual(responses[0].status, 404);
    assert.strictEqual(responses[1].status, 401);
    assert.strictEqual(responses[2].status, 400);

    // Verify all have proper error format
    responses.forEach(response => {
      assert.ok(response.body.error);
      assert.ok(response.body.message);
      assert.ok(response.body.correlationId);
      assert.ok(response.body.timestamp);
    });
  });

  test('should sanitize error messages for security', async () => {
    // Try to trigger an error that might leak sensitive information
    const response = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', 'Bearer valid_jwt_token')
      .send({
        customerId: 'cust_123',
        items: [{
          productId: '<script>alert("xss")</script>',
          quantity: 1,
          unitPrice: 10.00
        }]
      })
      .expect(400);

    // Error message should not contain the potentially malicious script
    assert.ok(!response.body.message.includes('<script>'));
    assert.ok(!response.body.details.includes('<script>'));
    
    // But should still indicate the validation error
    assert.ok(response.body.details.includes('productId'));
  });
});