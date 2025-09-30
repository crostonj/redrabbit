import { test, describe } from 'node:test';
import assert from 'node:assert';
import request from 'supertest';
import { app } from '../../src/server.js';

/**
 * Contract Test: Get Order Endpoint
 * 
 * Tests that the GET /api/v1/orders/:id endpoint:
 * - Returns order data in correct format
 * - Handles non-existent orders appropriately
 * - Requires proper authentication
 * - Returns proper HTTP status codes
 * - Follows OpenAPI specification exactly
 */

describe('GET /api/v1/orders/:id - Get Order Contract', () => {
  test('should retrieve existing order', async () => {
    // This assumes an order with this ID exists (will be seeded in integration tests)
    const orderId = 'ord_test_123456789';

    const response = await request(app)
      .get(`/api/v1/orders/${orderId}`)
      .set('Authorization', 'Bearer valid_jwt_token')
      .expect(200);

    // Verify response structure matches OpenAPI spec
    assert.strictEqual(response.body.id, orderId);
    assert.ok(response.body.customerId);
    assert.ok(['pending', 'confirmed', 'shipped', 'delivered', 'cancelled'].includes(response.body.status));
    assert.ok(response.body.createdAt);
    assert.ok(response.body.updatedAt);
    assert.ok(Array.isArray(response.body.items));
    assert.ok(typeof response.body.subtotal === 'number');
    assert.ok(typeof response.body.tax === 'number');
    assert.ok(typeof response.body.total === 'number');
    
    // Verify address structure if present
    if (response.body.shippingAddress) {
      assert.ok(response.body.shippingAddress.street);
      assert.ok(response.body.shippingAddress.city);
      assert.ok(response.body.shippingAddress.state);
      assert.ok(response.body.shippingAddress.postalCode);
      assert.ok(response.body.shippingAddress.country);
    }
  });

  test('should return 404 for non-existent order', async () => {
    const nonExistentId = 'ord_nonexistent_999999';

    const response = await request(app)
      .get(`/api/v1/orders/${nonExistentId}`)
      .set('Authorization', 'Bearer valid_jwt_token')
      .expect(404);

    assert.strictEqual(response.body.error, 'Order Not Found');
    assert.strictEqual(response.body.message, `Order with ID ${nonExistentId} not found`);
  });

  test('should reject unauthorized requests', async () => {
    const orderId = 'ord_test_123456789';

    await request(app)
      .get(`/api/v1/orders/${orderId}`)
      .expect(401);
  });

  test('should reject requests with invalid JWT', async () => {
    const orderId = 'ord_test_123456789';

    await request(app)
      .get(`/api/v1/orders/${orderId}`)
      .set('Authorization', 'Bearer invalid_jwt_token')
      .expect(401);
  });

  test('should handle malformed order ID format', async () => {
    const malformedId = 'invalid-id-format';

    const response = await request(app)
      .get(`/api/v1/orders/${malformedId}`)
      .set('Authorization', 'Bearer valid_jwt_token')
      .expect(400);

    assert.strictEqual(response.body.error, 'Invalid Order ID Format');
  });

  test('should include audit trail in response', async () => {
    const orderId = 'ord_test_with_history';

    const response = await request(app)
      .get(`/api/v1/orders/${orderId}`)
      .set('Authorization', 'Bearer valid_jwt_token')
      .expect(200);

    // Verify audit trail structure
    assert.ok(Array.isArray(response.body.events));
    if (response.body.events.length > 0) {
      const event = response.body.events[0];
      assert.ok(event.type);
      assert.ok(event.timestamp);
      assert.ok(event.data);
    }
  });
});