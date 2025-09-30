import { test, describe } from 'node:test';
import assert from 'node:assert';
import request from 'supertest';
import { app } from '../../src/server.js';

/**
 * Contract Test: API Validation
 * 
 * Tests that request/response validation works correctly:
 * - Request body validation with Zod schemas
 * - Query parameter validation
 * - Response format validation
 * - Error response structure
 * - Content-Type handling
 */

describe('API Validation Contract Tests', () => {
  test('should validate request Content-Type header', async () => {
    const response = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', 'Bearer valid_jwt_token')
      .set('Content-Type', 'text/plain')
      .send('not json data')
      .expect(400);

    assert.strictEqual(response.body.error, 'Invalid Content Type');
    assert.strictEqual(response.body.message, 'Content-Type must be application/json');
  });

  test('should validate JSON request body syntax', async () => {
    const response = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', 'Bearer valid_jwt_token')
      .set('Content-Type', 'application/json')
      .send('{"invalid": json}')
      .expect(400);

    assert.strictEqual(response.body.error, 'Invalid JSON');
    assert.ok(response.body.message.includes('syntax'));
  });

  test('should validate required fields in request body', async () => {
    const incompleteOrder = {
      customerId: 'cust_123456789'
      // Missing required 'items' field
    };

    const response = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', 'Bearer valid_jwt_token')
      .send(incompleteOrder)
      .expect(400);

    assert.strictEqual(response.body.error, 'Validation Error');
    assert.ok(response.body.details);
    assert.ok(response.body.details.includes('items'));
    assert.ok(response.body.details.includes('required'));
  });

  test('should validate field types in request body', async () => {
    const invalidTypeOrder = {
      customerId: 12345, // Should be string
      items: [
        {
          productId: 'prod_123',
          quantity: '2', // Should be number
          unitPrice: 'twenty-five' // Should be number
        }
      ]
    };

    const response = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', 'Bearer valid_jwt_token')
      .send(invalidTypeOrder)
      .expect(400);

    assert.strictEqual(response.body.error, 'Validation Error');
    assert.ok(response.body.details.includes('customerId'));
    assert.ok(response.body.details.includes('quantity'));
    assert.ok(response.body.details.includes('unitPrice'));
  });

  test('should validate field constraints and ranges', async () => {
    const invalidRangeOrder = {
      customerId: 'cust_123456789',
      items: [
        {
          productId: '', // Should not be empty
          quantity: -1, // Should be positive
          unitPrice: 0 // Should be greater than 0
        }
      ]
    };

    const response = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', 'Bearer valid_jwt_token')
      .send(invalidRangeOrder)
      .expect(400);

    assert.strictEqual(response.body.error, 'Validation Error');
    assert.ok(response.body.details.includes('productId'));
    assert.ok(response.body.details.includes('quantity'));
    assert.ok(response.body.details.includes('unitPrice'));
  });

  test('should validate query parameters', async () => {
    const response = await request(app)
      .get('/api/v1/orders')
      .query({
        page: 'not_a_number',
        limit: -5,
        status: 'invalid_status'
      })
      .set('Authorization', 'Bearer valid_jwt_token')
      .expect(400);

    assert.strictEqual(response.body.error, 'Invalid Query Parameters');
    assert.ok(response.body.details.includes('page'));
    assert.ok(response.body.details.includes('limit'));
    assert.ok(response.body.details.includes('status'));
  });

  test('should validate nested object structures', async () => {
    const invalidAddressOrder = {
      customerId: 'cust_123456789',
      items: [
        {
          productId: 'prod_123',
          quantity: 2,
          unitPrice: 25.99
        }
      ],
      shippingAddress: {
        street: '', // Required field is empty
        city: 'Anytown',
        // Missing required 'state' field
        postalCode: '12345',
        country: 'US'
      }
    };

    const response = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', 'Bearer valid_jwt_token')
      .send(invalidAddressOrder)
      .expect(400);

    assert.strictEqual(response.body.error, 'Validation Error');
    assert.ok(response.body.details.includes('shippingAddress.street'));
    assert.ok(response.body.details.includes('shippingAddress.state'));
  });

  test('should validate array field constraints', async () => {
    const emptyItemsOrder = {
      customerId: 'cust_123456789',
      items: [], // Should have at least one item
      shippingAddress: {
        street: '123 Main St',
        city: 'Anytown',
        state: 'CA',
        postalCode: '12345',
        country: 'US'
      }
    };

    const response = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', 'Bearer valid_jwt_token')
      .send(emptyItemsOrder)
      .expect(400);

    assert.strictEqual(response.body.error, 'Validation Error');
    assert.ok(response.body.details.includes('items'));
    assert.ok(response.body.details.includes('at least one'));
  });

  test('should return validation errors in consistent format', async () => {
    const invalidOrder = {
      customerId: 123,
      items: 'not an array'
    };

    const response = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', 'Bearer valid_jwt_token')
      .send(invalidOrder)
      .expect(400);

    // Verify error response structure
    assert.strictEqual(response.body.error, 'Validation Error');
    assert.ok(typeof response.body.message === 'string');
    assert.ok(typeof response.body.details === 'string');
    assert.ok(response.body.timestamp);
    assert.ok(response.body.path);
  });

  test('should handle oversized request payloads', async () => {
    // Create a very large order with many items
    const oversizedOrder = {
      customerId: 'cust_123456789',
      items: Array(10000).fill({
        productId: 'prod_123',
        quantity: 1,
        unitPrice: 1.00
      })
    };

    const response = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', 'Bearer valid_jwt_token')
      .send(oversizedOrder)
      .expect(413);

    assert.strictEqual(response.body.error, 'Payload Too Large');
  });

  test('should validate string field patterns', async () => {
    const invalidPatternOrder = {
      customerId: 'invalid_customer_id_format',
      items: [
        {
          productId: 'prod@123#invalid', // Invalid characters
          quantity: 2,
          unitPrice: 25.99
        }
      ]
    };

    const response = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', 'Bearer valid_jwt_token')
      .send(invalidPatternOrder)
      .expect(400);

    assert.strictEqual(response.body.error, 'Validation Error');
    assert.ok(response.body.details.includes('customerId') || response.body.details.includes('productId'));
  });
});