import { test, describe } from 'node:test';
import assert from 'node:assert';
import request from 'supertest';
import { app } from '../../src/server.js';

/**
 * Contract Test: List Orders Endpoint
 * 
 * Tests that the GET /api/v1/orders endpoint:
 * - Returns paginated order list
 * - Supports filtering by status and customer
 * - Handles pagination parameters correctly
 * - Returns proper response format
 * - Follows OpenAPI specification exactly
 */

describe('GET /api/v1/orders - List Orders Contract', () => {
  test('should list orders with default pagination', async () => {
    const response = await request(app)
      .get('/api/v1/orders')
      .set('Authorization', 'Bearer valid_jwt_token')
      .expect(200);

    // Verify pagination structure
    assert.ok(Array.isArray(response.body.data));
    assert.ok(typeof response.body.pagination === 'object');
    assert.ok(typeof response.body.pagination.page === 'number');
    assert.ok(typeof response.body.pagination.limit === 'number');
    assert.ok(typeof response.body.pagination.total === 'number');
    assert.ok(typeof response.body.pagination.totalPages === 'number');

    // Verify default limit
    assert.ok(response.body.data.length <= 20); // default limit

    // Verify order structure if any orders exist
    if (response.body.data.length > 0) {
      const order = response.body.data[0];
      assert.ok(order.id);
      assert.ok(order.customerId);
      assert.ok(order.status);
      assert.ok(order.createdAt);
      assert.ok(order.total);
    }
  });

  test('should handle custom pagination parameters', async () => {
    const response = await request(app)
      .get('/api/v1/orders')
      .query({
        page: 2,
        limit: 5
      })
      .set('Authorization', 'Bearer valid_jwt_token')
      .expect(200);

    assert.strictEqual(response.body.pagination.page, 2);
    assert.strictEqual(response.body.pagination.limit, 5);
    assert.ok(response.body.data.length <= 5);
  });

  test('should filter orders by status', async () => {
    const response = await request(app)
      .get('/api/v1/orders')
      .query({ status: 'pending' })
      .set('Authorization', 'Bearer valid_jwt_token')
      .expect(200);

    // All returned orders should have pending status
    response.body.data.forEach((order: any) => {
      assert.strictEqual(order.status, 'pending');
    });
  });

  test('should filter orders by customer ID', async () => {
    const customerId = 'cust_123456789';
    
    const response = await request(app)
      .get('/api/v1/orders')
      .query({ customerId })
      .set('Authorization', 'Bearer valid_jwt_token')
      .expect(200);

    // All returned orders should belong to the specified customer
    response.body.data.forEach((order: any) => {
      assert.strictEqual(order.customerId, customerId);
    });
  });

  test('should handle date range filtering', async () => {
    const fromDate = '2024-01-01';
    const toDate = '2024-12-31';

    const response = await request(app)
      .get('/api/v1/orders')
      .query({
        createdFrom: fromDate,
        createdTo: toDate
      })
      .set('Authorization', 'Bearer valid_jwt_token')
      .expect(200);

    // Verify dates are within range
    response.body.data.forEach((order: any) => {
      const orderDate = new Date(order.createdAt);
      assert.ok(orderDate >= new Date(fromDate));
      assert.ok(orderDate <= new Date(toDate));
    });
  });

  test('should reject invalid pagination parameters', async () => {
    await request(app)
      .get('/api/v1/orders')
      .query({
        page: 0, // Invalid: pages start at 1
        limit: 101 // Invalid: exceeds max limit of 100
      })
      .set('Authorization', 'Bearer valid_jwt_token')
      .expect(400);
  });

  test('should reject invalid status filter', async () => {
    await request(app)
      .get('/api/v1/orders')
      .query({ status: 'invalid_status' })
      .set('Authorization', 'Bearer valid_jwt_token')
      .expect(400);
  });

  test('should reject unauthorized requests', async () => {
    await request(app)
      .get('/api/v1/orders')
      .expect(401);
  });

  test('should support sorting by different fields', async () => {
    const response = await request(app)
      .get('/api/v1/orders')
      .query({
        sort: 'createdAt',
        order: 'desc'
      })
      .set('Authorization', 'Bearer valid_jwt_token')
      .expect(200);

    // Verify orders are sorted by creation date descending
    if (response.body.data.length > 1) {
      for (let i = 1; i < response.body.data.length; i++) {
        const current = new Date(response.body.data[i].createdAt);
        const previous = new Date(response.body.data[i - 1].createdAt);
        assert.ok(current <= previous);
      }
    }
  });
});