import { describe, it, before, after } from 'node:test';
import { strict as assert } from 'node:assert';
import request from 'supertest';
import { Express } from 'express';
import { z } from 'zod';

// This test will fail initially - no Express app exists yet (TDD requirement)
describe('Contract Test: GET /v1/orders/{orderId}', () => {
  let app: Express;
  
  before(async () => {
    // Import Express app when it exists
    app = await import('../../src/server.js').then(m => m.app);
  });

  after(async () => {
    // Cleanup after tests
  });

  // Zod schema for path parameter validation
  const OrderIdParamSchema = z.object({
    orderId: z.string().uuid('Order ID must be a valid UUID format')
  });

  // Zod schema for detailed order response
  const OrderDetailResponseSchema = z.object({
    id: z.string().uuid(),
    orderNumber: z.string().regex(/^ORD-\d{8}-\d{4}$/, 'Invalid order number format'),
    status: z.enum(['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded']),
    
    // Customer information
    customer: z.object({
      id: z.string().uuid(),
      name: z.string().min(1),
      email: z.string().email(),
      phone: z.string().optional(),
      type: z.enum(['retail', 'commercial'])
    }),

    // Order financial details
    pricing: z.object({
      subtotalCents: z.number().int().nonnegative(),
      taxCents: z.number().int().nonnegative(),
      shippingCents: z.number().int().nonnegative(),
      discountCents: z.number().int().nonnegative(),
      totalCents: z.number().int().nonnegative(),
      currency: z.string().length(3).default('USD')
    }).refine(data => {
      // Verify total calculation
      const calculatedTotal = data.subtotalCents + data.taxCents + data.shippingCents - data.discountCents;
      return data.totalCents === calculatedTotal;
    }, {
      message: 'Total amount does not match calculated total (subtotal + tax + shipping - discount)'
    }),

    // Line items with full details
    items: z.array(z.object({
      id: z.string().uuid(),
      productId: z.string().uuid(),
      product: z.object({
        name: z.string().min(1),
        sku: z.string().min(1),
        category: z.string().optional(),
        description: z.string().optional(),
        imageUrl: z.string().url().optional()
      }),
      quantity: z.number().int().positive(),
      unitPriceCents: z.number().int().nonnegative(),
      totalPriceCents: z.number().int().nonnegative(),
      discountCents: z.number().int().nonnegative().default(0)
    }).refine(data => {
      // Verify line item total calculation
      const calculatedTotal = (data.quantity * data.unitPriceCents) - data.discountCents;
      return data.totalPriceCents === calculatedTotal;
    }, {
      message: 'Line item total does not match calculated total (quantity * unitPrice - discount)'
    })).min(1, 'Order must contain at least one item'),

    // Shipping address
    shippingAddress: z.object({
      id: z.string().uuid(),
      recipientName: z.string().min(1),
      street: z.string().min(1),
      city: z.string().min(1),
      state: z.string().min(2).max(3),
      postalCode: z.string().regex(/^\d{5}(-\d{4})?$/, 'Invalid US postal code format'),
      country: z.string().length(2).default('US'),
      phone: z.string().optional(),
      instructions: z.string().optional()
    }),

    // Billing address (optional, may be same as shipping)
    billingAddress: z.object({
      id: z.string().uuid(),
      recipientName: z.string().min(1),
      street: z.string().min(1),
      city: z.string().min(1),
      state: z.string().min(2).max(3),
      postalCode: z.string().regex(/^\d{5}(-\d{4})?$/, 'Invalid US postal code format'),
      country: z.string().length(2).default('US'),
      phone: z.string().optional()
    }).optional(),

    // Payment information
    payment: z.object({
      id: z.string().uuid(),
      method: z.enum(['credit_card', 'debit_card', 'bank_transfer', 'paypal']),
      status: z.enum(['pending', 'authorized', 'captured', 'failed', 'refunded']),
      amountCents: z.number().int().nonnegative(),
      currency: z.string().length(3).default('USD'),
      transactionId: z.string().optional(),
      cardLast4: z.string().regex(/^\d{4}$/).optional(),
      cardBrand: z.enum(['visa', 'mastercard', 'amex', 'discover']).optional(),
      paymentDate: z.string().datetime().optional()
    }),

    // Timestamps and metadata
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    confirmedAt: z.string().datetime().optional(),
    shippedAt: z.string().datetime().optional(),
    deliveredAt: z.string().datetime().optional(),
    cancelledAt: z.string().datetime().optional(),

    // Optional fields
    notes: z.string().max(500).optional(),
    internalNotes: z.string().max(1000).optional(),
    trackingNumber: z.string().optional(),
    estimatedDeliveryDate: z.string().datetime().optional(),
    
    // Event history summary
    eventCount: z.number().int().nonnegative(),
    lastEventAt: z.string().datetime().optional(),
    
    // Related order references
    relatedOrders: z.array(z.object({
      id: z.string().uuid(),
      orderNumber: z.string().regex(/^ORD-\d{8}-\d{4}$/),
      relationship: z.enum(['return', 'exchange', 'replacement', 'split']),
      createdAt: z.string().datetime()
    })).optional()
  });

  // Test data constants
  const validOrderId = '123e4567-e89b-12d3-a456-426614174000';
  const nonExistentOrderId = '00000000-0000-0000-0000-000000000000';
  const invalidOrderId = 'invalid-uuid-format';

  describe('Valid Order Retrieval', () => {
    it('should retrieve complete order details with all relationships', async () => {
      const response = await request(app)
        .get(`/v1/orders/${validOrderId}`)
        .expect('Content-Type', /json/)
        .expect(200);

      const parsedOrder = OrderDetailResponseSchema.parse(response.body);
      
      // Verify basic order information
      assert.strictEqual(parsedOrder.id, validOrderId);
      assert.match(parsedOrder.orderNumber, /^ORD-\d{8}-\d{4}$/);
      assert.ok(['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded'].includes(parsedOrder.status));

      // Verify customer information is complete
      assert.ok(parsedOrder.customer.id);
      assert.ok(parsedOrder.customer.name.length > 0);
      assert.match(parsedOrder.customer.email, /^[^\s@]+@[^\s@]+\.[^\s@]+$/);
      assert.ok(['retail', 'commercial'].includes(parsedOrder.customer.type));

      // Verify pricing calculations
      const { pricing } = parsedOrder;
      const calculatedTotal = pricing.subtotalCents + pricing.taxCents + pricing.shippingCents - pricing.discountCents;
      assert.strictEqual(pricing.totalCents, calculatedTotal);
      assert.strictEqual(pricing.currency, 'USD');

      // Verify line items
      assert.ok(parsedOrder.items.length > 0);
      parsedOrder.items.forEach(item => {
        assert.ok(item.product.name.length > 0);
        assert.ok(item.product.sku.length > 0);
        assert.ok(item.quantity > 0);
        assert.ok(item.unitPriceCents >= 0);
        
        // Verify line item calculation
        const calculatedItemTotal = (item.quantity * item.unitPriceCents) - item.discountCents;
        assert.strictEqual(item.totalPriceCents, calculatedItemTotal);
      });

      // Verify addresses
      assert.ok(parsedOrder.shippingAddress.street.length > 0);
      assert.ok(parsedOrder.shippingAddress.city.length > 0);
      assert.match(parsedOrder.shippingAddress.postalCode, /^\d{5}(-\d{4})?$/);
      assert.strictEqual(parsedOrder.shippingAddress.country, 'US');

      // Verify payment information
      assert.ok(['credit_card', 'debit_card', 'bank_transfer', 'paypal'].includes(parsedOrder.payment.method));
      assert.ok(['pending', 'authorized', 'captured', 'failed', 'refunded'].includes(parsedOrder.payment.status));
      assert.strictEqual(parsedOrder.payment.currency, 'USD');

      // Verify timestamps
      const createdAt = new Date(parsedOrder.createdAt);
      const updatedAt = new Date(parsedOrder.updatedAt);
      assert.ok(createdAt instanceof Date && !isNaN(createdAt.getTime()));
      assert.ok(updatedAt instanceof Date && !isNaN(updatedAt.getTime()));
      assert.ok(updatedAt >= createdAt);
    });

    it('should include optional billing address when different from shipping', async () => {
      const response = await request(app)
        .get(`/v1/orders/${validOrderId}`)
        .expect(200);

      const parsedOrder = OrderDetailResponseSchema.parse(response.body);
      
      if (parsedOrder.billingAddress) {
        // Verify billing address structure
        assert.ok(parsedOrder.billingAddress.street.length > 0);
        assert.ok(parsedOrder.billingAddress.city.length > 0);
        assert.match(parsedOrder.billingAddress.postalCode, /^\d{5}(-\d{4})?$/);
        assert.strictEqual(parsedOrder.billingAddress.country, 'US');
      }
    });

    it('should include payment card details when available', async () => {
      const response = await request(app)
        .get(`/v1/orders/${validOrderId}`)
        .expect(200);

      const parsedOrder = OrderDetailResponseSchema.parse(response.body);
      
      if (parsedOrder.payment.method === 'credit_card' || parsedOrder.payment.method === 'debit_card') {
        if (parsedOrder.payment.cardLast4) {
          assert.match(parsedOrder.payment.cardLast4, /^\d{4}$/);
        }
        if (parsedOrder.payment.cardBrand) {
          assert.ok(['visa', 'mastercard', 'amex', 'discover'].includes(parsedOrder.payment.cardBrand));
        }
      }
    });

    it('should include tracking information for shipped orders', async () => {
      // This test assumes we have a shipped order to test
      const shippedOrderId = '456e7890-e89b-12d3-a456-426614174001';
      
      const response = await request(app)
        .get(`/v1/orders/${shippedOrderId}`)
        .expect(200);

      const parsedOrder = OrderDetailResponseSchema.parse(response.body);
      
      if (parsedOrder.status === 'shipped' || parsedOrder.status === 'delivered') {
        assert.ok(parsedOrder.shippedAt);
        // Tracking number might be optional depending on shipping method
        if (parsedOrder.trackingNumber) {
          assert.ok(parsedOrder.trackingNumber.length > 0);
        }
      }
    });

    it('should include related orders when they exist', async () => {
      const response = await request(app)
        .get(`/v1/orders/${validOrderId}`)
        .expect(200);

      const parsedOrder = OrderDetailResponseSchema.parse(response.body);
      
      if (parsedOrder.relatedOrders && parsedOrder.relatedOrders.length > 0) {
        parsedOrder.relatedOrders.forEach(relatedOrder => {
          assert.ok(relatedOrder.id);
          assert.match(relatedOrder.orderNumber, /^ORD-\d{8}-\d{4}$/);
          assert.ok(['return', 'exchange', 'replacement', 'split'].includes(relatedOrder.relationship));
          
          const createdAt = new Date(relatedOrder.createdAt);
          assert.ok(createdAt instanceof Date && !isNaN(createdAt.getTime()));
        });
      }
    });
  });

  describe('Order Not Found', () => {
    it('should return 404 for non-existent order', async () => {
      const response = await request(app)
        .get(`/v1/orders/${nonExistentOrderId}`)
        .expect('Content-Type', /json/)
        .expect(404);

      assert.ok(response.body.error);
      assert.match(response.body.message, /Order not found/);
      assert.strictEqual(response.body.orderId, nonExistentOrderId);
    });

    it('should return 404 for soft-deleted orders', async () => {
      const deletedOrderId = '789e0123-e89b-12d3-a456-426614174002';
      
      const response = await request(app)
        .get(`/v1/orders/${deletedOrderId}`)
        .expect(404);

      assert.ok(response.body.error);
      assert.match(response.body.message, /Order not found/);
    });
  });

  describe('Invalid Order ID Format', () => {
    it('should reject invalid UUID format', async () => {
      const response = await request(app)
        .get(`/v1/orders/${invalidOrderId}`)
        .expect('Content-Type', /json/)
        .expect(400);

      assert.ok(response.body.error);
      assert.match(response.body.message, /Invalid order ID format|Invalid UUID/);
      assert.match(response.body.details, /UUID/);
    });

    it('should reject empty order ID', async () => {
      const response = await request(app)
        .get('/v1/orders/')
        .expect(404); // Should hit route not found, not our handler

      // This tests that the route doesn't match without an ID
    });

    it('should reject order ID with special characters', async () => {
      const invalidIds = [
        'order-123-invalid',
        '123e4567-e89b-12d3-a456-42661417400g', // invalid hex character
        '123e4567-e89b-12d3-a456-42661417400',  // too short
        '123e4567-e89b-12d3-a456-4266141740000' // too long
      ];

      for (const id of invalidIds) {
        const response = await request(app)
          .get(`/v1/orders/${id}`)
          .expect(400);

        assert.ok(response.body.error);
        assert.match(response.body.message, /Invalid order ID format|Invalid UUID/);
      }
    });
  });

  describe('Authentication & Authorization', () => {
    it('should require authentication token', async () => {
      const response = await request(app)
        .get(`/v1/orders/${validOrderId}`)
        .expect(401);

      assert.ok(response.body.error);
      assert.match(response.body.message, /Authentication required/);
    });

    it('should reject invalid authentication token', async () => {
      const response = await request(app)
        .get(`/v1/orders/${validOrderId}`)
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);

      assert.ok(response.body.error);
      assert.match(response.body.message, /Invalid authentication token/);
    });

    it('should respect order access permissions', async () => {
      // Test that users can only access orders they have permission to view
      const restrictedOrderId = '999e8888-e89b-12d3-a456-426614174999';
      
      const response = await request(app)
        .get(`/v1/orders/${restrictedOrderId}`)
        .set('Authorization', 'Bearer limited-access-token')
        .expect(403);

      assert.ok(response.body.error);
      assert.match(response.body.message, /Access denied|Insufficient permissions/);
    });

    it('should allow admin users to access any order', async () => {
      const response = await request(app)
        .get(`/v1/orders/${validOrderId}`)
        .set('Authorization', 'Bearer admin-token')
        .expect(200);

      const parsedOrder = OrderDetailResponseSchema.parse(response.body);
      assert.strictEqual(parsedOrder.id, validOrderId);
    });

    it('should include appropriate data based on user role', async () => {
      // Customer should not see internal notes, admin should see everything
      const customerResponse = await request(app)
        .get(`/v1/orders/${validOrderId}`)
        .set('Authorization', 'Bearer customer-token')
        .expect(200);

      const customerOrder = OrderDetailResponseSchema.parse(customerResponse.body);
      
      // Customer should not see internal notes (if any)
      // This would depend on the actual implementation of role-based filtering
      assert.strictEqual(customerOrder.id, validOrderId);
    });
  });

  describe('Order Status Specific Data', () => {
    it('should include status-specific timestamps', async () => {
      const response = await request(app)
        .get(`/v1/orders/${validOrderId}`)
        .expect(200);

      const parsedOrder = OrderDetailResponseSchema.parse(response.body);
      
      // Verify status-specific timestamps are present when appropriate
      switch (parsedOrder.status) {
        case 'confirmed':
          assert.ok(parsedOrder.confirmedAt, 'Confirmed orders should have confirmedAt timestamp');
          break;
        case 'shipped':
        case 'delivered':
          assert.ok(parsedOrder.shippedAt, 'Shipped orders should have shippedAt timestamp');
          if (parsedOrder.status === 'delivered') {
            assert.ok(parsedOrder.deliveredAt, 'Delivered orders should have deliveredAt timestamp');
          }
          break;
        case 'cancelled':
        case 'refunded':
          assert.ok(parsedOrder.cancelledAt, 'Cancelled orders should have cancelledAt timestamp');
          break;
      }
    });

    it('should include event count and last event timestamp', async () => {
      const response = await request(app)
        .get(`/v1/orders/${validOrderId}`)
        .expect(200);

      const parsedOrder = OrderDetailResponseSchema.parse(response.body);
      
      // Every order should have at least one event (creation)
      assert.ok(parsedOrder.eventCount >= 1);
      
      if (parsedOrder.lastEventAt) {
        const lastEventDate = new Date(parsedOrder.lastEventAt);
        const updatedAtDate = new Date(parsedOrder.updatedAt);
        
        // Last event should be close to or equal to updated timestamp
        assert.ok(lastEventDate instanceof Date && !isNaN(lastEventDate.getTime()));
      }
    });
  });

  describe('Data Consistency Validation', () => {
    it('should have consistent pricing across order and line items', async () => {
      const response = await request(app)
        .get(`/v1/orders/${validOrderId}`)
        .expect(200);

      const parsedOrder = OrderDetailResponseSchema.parse(response.body);
      
      // Calculate subtotal from line items
      const calculatedSubtotal = parsedOrder.items.reduce(
        (sum, item) => sum + item.totalPriceCents, 0
      );
      
      assert.strictEqual(parsedOrder.pricing.subtotalCents, calculatedSubtotal,
        'Order subtotal should match sum of line item totals');
    });

    it('should have payment amount matching order total', async () => {
      const response = await request(app)
        .get(`/v1/orders/${validOrderId}`)
        .expect(200);

      const parsedOrder = OrderDetailResponseSchema.parse(response.body);
      
      // Payment amount should match order total (unless partially refunded)
      if (parsedOrder.payment.status === 'captured' || parsedOrder.payment.status === 'authorized') {
        assert.strictEqual(parsedOrder.payment.amountCents, parsedOrder.pricing.totalCents,
          'Payment amount should match order total');
      }
    });

    it('should have consistent currency across all monetary fields', async () => {
      const response = await request(app)
        .get(`/v1/orders/${validOrderId}`)
        .expect(200);

      const parsedOrder = OrderDetailResponseSchema.parse(response.body);
      
      // All currency fields should be consistent
      assert.strictEqual(parsedOrder.pricing.currency, 'USD');
      assert.strictEqual(parsedOrder.payment.currency, 'USD');
    });
  });

  describe('Error Response Format', () => {
    it('should return consistent error format', async () => {
      const response = await request(app)
        .get(`/v1/orders/${invalidOrderId}`)
        .expect(400);

      assert.ok(response.body.error);
      assert.ok(response.body.message);
      assert.ok(response.body.timestamp);
      assert.strictEqual(response.body.path, `/v1/orders/${invalidOrderId}`);
      assert.strictEqual(response.body.method, 'GET');
    });
  });
});