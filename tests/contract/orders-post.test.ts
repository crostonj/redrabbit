import { describe, it, before, after } from 'node:test';
import { strict as assert } from 'node:assert';
import request from 'supertest';
import { Express } from 'express';
import { z } from 'zod';

// This test will fail initially - no Express app exists yet (TDD requirement)
describe('Contract Test: POST /v1/orders', () => {
  let app: Express;
  
  before(async () => {
    // Import Express app when it exists
    app = await import('../../src/server.js').then(m => m.app);
  });

  after(async () => {
    // Cleanup after tests
  });

  // Zod schema for order creation request validation
  const CreateOrderRequestSchema = z.object({
    customerId: z.string().uuid('Invalid customer ID format'),
    items: z.array(z.object({
      productId: z.string().uuid('Invalid product ID format'),
      quantity: z.number().int().positive('Quantity must be positive'),
      unitPriceCents: z.number().int().nonnegative('Unit price cannot be negative')
    })).min(1, 'Order must contain at least one item'),
    shippingAddressId: z.string().uuid('Invalid shipping address ID format'),
    billingAddressId: z.string().uuid('Invalid billing address ID format').optional(),
    notes: z.string().max(500, 'Notes cannot exceed 500 characters').optional(),
  });

  // Zod schema for order creation response validation
  const CreateOrderResponseSchema = z.object({
    id: z.string().uuid(),
    orderNumber: z.string().regex(/^ORD-\d{8}-\d{4}$/, 'Invalid order number format'),
    customerId: z.string().uuid(),
    status: z.enum(['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded']),
    subtotalCents: z.number().int().nonnegative(),
    taxCents: z.number().int().nonnegative(),
    shippingCents: z.number().int().nonnegative(),
    discountCents: z.number().int().nonnegative(),
    totalCents: z.number().int().nonnegative(),
    currency: z.string().length(3),
    items: z.array(z.object({
      id: z.string().uuid(),
      productId: z.string().uuid(),
      quantity: z.number().int().positive(),
      unitPriceCents: z.number().int().nonnegative(),
      totalPriceCents: z.number().int().nonnegative()
    })),
    shippingAddress: z.object({
      id: z.string().uuid(),
      street: z.string(),
      city: z.string(),
      state: z.string(),
      postalCode: z.string(),
      country: z.string().default('US')
    }),
    billingAddress: z.object({
      id: z.string().uuid(),
      street: z.string(),
      city: z.string(), 
      state: z.string(),
      postalCode: z.string(),
      country: z.string().default('US')
    }).optional(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    notes: z.string().optional()
  });

  describe('Valid Order Creation', () => {
    const validOrderPayload = {
      customerId: '123e4567-e89b-12d3-a456-426614174000',
      items: [
        {
          productId: '123e4567-e89b-12d3-a456-426614174001',
          quantity: 2,
          unitPriceCents: 1999
        },
        {
          productId: '123e4567-e89b-12d3-a456-426614174002', 
          quantity: 1,
          unitPriceCents: 2499
        }
      ],
      shippingAddressId: '123e4567-e89b-12d3-a456-426614174003',
      billingAddressId: '123e4567-e89b-12d3-a456-426614174004',
      notes: 'Please deliver to the side door'
    };

    it('should create order with valid payload', async () => {
      const response = await request(app)
        .post('/v1/orders')
        .send(validOrderPayload)
        .expect('Content-Type', /json/)
        .expect(201);

      // Validate response structure
      const parsedResponse = CreateOrderResponseSchema.parse(response.body);
      
      // Verify response data matches request
      assert.strictEqual(parsedResponse.customerId, validOrderPayload.customerId);
      assert.strictEqual(parsedResponse.items.length, validOrderPayload.items.length);
      assert.strictEqual(parsedResponse.status, 'pending');
      assert.strictEqual(parsedResponse.currency, 'USD');
      
      // Verify total calculation
      const expectedSubtotal = validOrderPayload.items.reduce(
        (sum, item) => sum + (item.quantity * item.unitPriceCents), 0
      );
      assert.strictEqual(parsedResponse.subtotalCents, expectedSubtotal);
      assert.strictEqual(parsedResponse.totalCents, parsedResponse.subtotalCents + parsedResponse.taxCents + parsedResponse.shippingCents - parsedResponse.discountCents);
      
      // Verify order number format
      assert.match(parsedResponse.orderNumber, /^ORD-\d{8}-\d{4}$/);
      
      // Verify timestamps
      const createdAt = new Date(parsedResponse.createdAt);
      const updatedAt = new Date(parsedResponse.updatedAt);
      assert.ok(createdAt instanceof Date && !isNaN(createdAt.getTime()));
      assert.ok(updatedAt instanceof Date && !isNaN(updatedAt.getTime()));
    });

    it('should create order with minimal payload (no billing address or notes)', async () => {
      const minimalPayload = {
        customerId: '123e4567-e89b-12d3-a456-426614174000',
        items: [
          {
            productId: '123e4567-e89b-12d3-a456-426614174001',
            quantity: 1,
            unitPriceCents: 1999
          }
        ],
        shippingAddressId: '123e4567-e89b-12d3-a456-426614174003'
      };

      const response = await request(app)
        .post('/v1/orders')
        .send(minimalPayload)
        .expect('Content-Type', /json/)
        .expect(201);

      const parsedResponse = CreateOrderResponseSchema.parse(response.body);
      assert.strictEqual(parsedResponse.customerId, minimalPayload.customerId);
      assert.strictEqual(parsedResponse.items.length, 1);
    });

    it('should handle multiple line items correctly', async () => {
      const multiItemPayload = {
        ...validOrderPayload,
        items: [
          { productId: '123e4567-e89b-12d3-a456-426614174001', quantity: 3, unitPriceCents: 1000 },
          { productId: '123e4567-e89b-12d3-a456-426614174002', quantity: 2, unitPriceCents: 2000 },
          { productId: '123e4567-e89b-12d3-a456-426614174003', quantity: 1, unitPriceCents: 5000 }
        ]
      };

      const response = await request(app)
        .post('/v1/orders')
        .send(multiItemPayload)
        .expect(201);

      const parsedResponse = CreateOrderResponseSchema.parse(response.body);
      assert.strictEqual(parsedResponse.items.length, 3);
      assert.strictEqual(parsedResponse.subtotalCents, 12000); // 3*1000 + 2*2000 + 1*5000
    });
  });

  describe('Request Validation Errors', () => {
    it('should reject order with invalid customer ID', async () => {
      const invalidPayload = {
        customerId: 'invalid-uuid',
        items: [{ productId: '123e4567-e89b-12d3-a456-426614174001', quantity: 1, unitPriceCents: 1999 }],
        shippingAddressId: '123e4567-e89b-12d3-a456-426614174003'
      };

      const response = await request(app)
        .post('/v1/orders')
        .send(invalidPayload)
        .expect('Content-Type', /json/)
        .expect(400);

      assert.ok(response.body.error);
      assert.match(response.body.message, /Invalid customer ID format/);
    });

    it('should reject order with no items', async () => {
      const invalidPayload = {
        customerId: '123e4567-e89b-12d3-a456-426614174000',
        items: [],
        shippingAddressId: '123e4567-e89b-12d3-a456-426614174003'
      };

      const response = await request(app)
        .post('/v1/orders')
        .send(invalidPayload)
        .expect(400);

      assert.ok(response.body.error);
      assert.match(response.body.message, /Order must contain at least one item/);
    });

    it('should reject order with negative quantity', async () => {
      const invalidPayload = {
        customerId: '123e4567-e89b-12d3-a456-426614174000',
        items: [{ productId: '123e4567-e89b-12d3-a456-426614174001', quantity: -1, unitPriceCents: 1999 }],
        shippingAddressId: '123e4567-e89b-12d3-a456-426614174003'
      };

      const response = await request(app)
        .post('/v1/orders')
        .send(invalidPayload)
        .expect(400);

      assert.ok(response.body.error);
      assert.match(response.body.message, /Quantity must be positive/);
    });

    it('should reject order with negative unit price', async () => {
      const invalidPayload = {
        customerId: '123e4567-e89b-12d3-a456-426614174000',
        items: [{ productId: '123e4567-e89b-12d3-a456-426614174001', quantity: 1, unitPriceCents: -100 }],
        shippingAddressId: '123e4567-e89b-12d3-a456-426614174003'
      };

      const response = await request(app)
        .post('/v1/orders')
        .send(invalidPayload)
        .expect(400);

      assert.ok(response.body.error);
      assert.match(response.body.message, /Unit price cannot be negative/);
    });

    it('should reject order with invalid shipping address ID', async () => {
      const invalidPayload = {
        customerId: '123e4567-e89b-12d3-a456-426614174000',
        items: [{ productId: '123e4567-e89b-12d3-a456-426614174001', quantity: 1, unitPriceCents: 1999 }],
        shippingAddressId: 'not-a-uuid'
      };

      const response = await request(app)
        .post('/v1/orders')
        .send(invalidPayload)
        .expect(400);

      assert.ok(response.body.error);
      assert.match(response.body.message, /Invalid shipping address ID format/);
    });

    it('should reject order with notes exceeding 500 characters', async () => {
      const invalidPayload = {
        customerId: '123e4567-e89b-12d3-a456-426614174000',
        items: [{ productId: '123e4567-e89b-12d3-a456-426614174001', quantity: 1, unitPriceCents: 1999 }],
        shippingAddressId: '123e4567-e89b-12d3-a456-426614174003',
        notes: 'A'.repeat(501) // 501 characters
      };

      const response = await request(app)
        .post('/v1/orders')
        .send(invalidPayload)
        .expect(400);

      assert.ok(response.body.error);
      assert.match(response.body.message, /Notes cannot exceed 500 characters/);
    });
  });

  describe('Business Logic Validation', () => {
    it('should reject order for non-existent customer', async () => {
      const invalidPayload = {
        customerId: '00000000-0000-0000-0000-000000000000',
        items: [{ productId: '123e4567-e89b-12d3-a456-426614174001', quantity: 1, unitPriceCents: 1999 }],
        shippingAddressId: '123e4567-e89b-12d3-a456-426614174003'
      };

      const response = await request(app)
        .post('/v1/orders')
        .send(invalidPayload)
        .expect(404);

      assert.ok(response.body.error);
      assert.match(response.body.message, /Customer not found/);
    });

    it('should reject order for non-existent product', async () => {
      const invalidPayload = {
        customerId: '123e4567-e89b-12d3-a456-426614174000',
        items: [{ productId: '00000000-0000-0000-0000-000000000000', quantity: 1, unitPriceCents: 1999 }],
        shippingAddressId: '123e4567-e89b-12d3-a456-426614174003'
      };

      const response = await request(app)
        .post('/v1/orders')
        .send(invalidPayload)
        .expect(404);

      assert.ok(response.body.error);
      assert.match(response.body.message, /Product not found/);
    });

    it('should reject order for non-existent shipping address', async () => {
      const invalidPayload = {
        customerId: '123e4567-e89b-12d3-a456-426614174000',
        items: [{ productId: '123e4567-e89b-12d3-a456-426614174001', quantity: 1, unitPriceCents: 1999 }],
        shippingAddressId: '00000000-0000-0000-0000-000000000000'
      };

      const response = await request(app)
        .post('/v1/orders')
        .send(invalidPayload)
        .expect(404);

      assert.ok(response.body.error);
      assert.match(response.body.message, /Shipping address not found/);
    });

    it('should reject order with insufficient inventory', async () => {
      const invalidPayload = {
        customerId: '123e4567-e89b-12d3-a456-426614174000',
        items: [{ productId: '123e4567-e89b-12d3-a456-426614174001', quantity: 999999, unitPriceCents: 1999 }],
        shippingAddressId: '123e4567-e89b-12d3-a456-426614174003'
      };

      const response = await request(app)
        .post('/v1/orders')
        .send(invalidPayload)
        .expect(409);

      assert.ok(response.body.error);
      assert.match(response.body.message, /Insufficient inventory/);
    });
  });

  describe('Authentication & Authorization', () => {
    it('should reject request without authentication token', async () => {
      const response = await request(app)
        .post('/v1/orders')
        .send({
          customerId: '123e4567-e89b-12d3-a456-426614174000',
          items: [{ productId: '123e4567-e89b-12d3-a456-426614174001', quantity: 1, unitPriceCents: 1999 }],
          shippingAddressId: '123e4567-e89b-12d3-a456-426614174003'
        })
        .expect(401);

      assert.ok(response.body.error);
      assert.match(response.body.message, /Authentication required/);
    });

    it('should reject request with invalid authentication token', async () => {
      const response = await request(app)
        .post('/v1/orders')
        .set('Authorization', 'Bearer invalid-token')
        .send({
          customerId: '123e4567-e89b-12d3-a456-426614174000',
          items: [{ productId: '123e4567-e89b-12d3-a456-426614174001', quantity: 1, unitPriceCents: 1999 }],
          shippingAddressId: '123e4567-e89b-12d3-a456-426614174003'
        })
        .expect(401);

      assert.ok(response.body.error);
      assert.match(response.body.message, /Invalid authentication token/);
    });
  });

  describe('Error Response Format', () => {
    it('should return consistent error format for validation errors', async () => {
      const response = await request(app)
        .post('/v1/orders')
        .send({ invalid: 'data' })
        .expect(400);

      assert.ok(response.body.error);
      assert.ok(response.body.message);
      assert.ok(response.body.timestamp);
      assert.strictEqual(response.body.path, '/v1/orders');
      assert.strictEqual(response.body.method, 'POST');
    });
  });
});