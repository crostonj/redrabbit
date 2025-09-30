import { test, describe } from 'node:test';
import assert from 'node:assert';
import request from 'supertest';
import { app } from '../../src/server.js';

/**
 * Contract Test: Create Order Endpoint
 * 
 * Tests that the POST /api/v1/orders endpoint:
 * - Accepts valid order creation requests
 * - Returns proper response structure
 * - Validates required fields
 * - Handles validation errors correctly
 * - Follows OpenAPI specification exactly
 */

describe('POST /api/v1/orders - Create Order Contract', () => {
  test('should create order with valid data', async () => {
    const orderData = {
      customerId: 'cust_123456789',
      items: [
        {
          productId: 'prod_hammer_001',
          quantity: 2,
          unitPrice: 25.99
        },
        {
          productId: 'prod_screws_pack',
          quantity: 1,
          unitPrice: 8.50
        }
      ],
      shippingAddress: {
        street: '123 Main St',
        city: 'Anytown',
        state: 'CA',
        postalCode: '12345',
        country: 'US'
      },
      billingAddress: {
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
      .send(orderData)
      .expect(201);

    // Verify response structure matches OpenAPI spec
    assert.ok(response.body.id);
    assert.strictEqual(response.body.customerId, orderData.customerId);
    assert.strictEqual(response.body.status, 'pending');
    assert.ok(response.body.createdAt);
    assert.ok(response.body.updatedAt);
    assert.strictEqual(response.body.items.length, 2);
    
    // Verify calculated totals
    assert.strictEqual(response.body.subtotal, 60.48);
    assert.ok(response.body.total > response.body.subtotal); // includes tax
  });

  test('should reject order with missing required fields', async () => {
    const invalidOrderData = {
      customerId: 'cust_123456789'
      // Missing required items array
    };

    const response = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', 'Bearer valid_jwt_token')
      .send(invalidOrderData)
      .expect(400);

    assert.strictEqual(response.body.error, 'Validation Error');
    assert.ok(response.body.details.includes('items'));
  });

  test('should reject order with invalid item data', async () => {
    const invalidOrderData = {
      customerId: 'cust_123456789',
      items: [
        {
          productId: 'prod_hammer_001',
          quantity: -1, // Invalid negative quantity
          unitPrice: 25.99
        }
      ],
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
      .send(invalidOrderData)
      .expect(400);

    assert.strictEqual(response.body.error, 'Validation Error');
    assert.ok(response.body.details.includes('quantity'));
  });

  test('should reject unauthorized requests', async () => {
    const orderData = {
      customerId: 'cust_123456789',
      items: [
        {
          productId: 'prod_hammer_001',
          quantity: 1,
          unitPrice: 25.99
        }
      ]
    };

    await request(app)
      .post('/api/v1/orders')
      .send(orderData)
      .expect(401);
  });

  test('should handle malformed JSON', async () => {
    await request(app)
      .post('/api/v1/orders')
      .set('Authorization', 'Bearer valid_jwt_token')
      .set('Content-Type', 'application/json')
      .send('invalid json')
      .expect(400);
  });
});