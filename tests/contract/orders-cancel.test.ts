import { describe, it, before, after } from 'node:test';
import { strict as assert } from 'node:assert';
import request from 'supertest';
import { Express } from 'express';
import { z } from 'zod';

// This test will fail initially - no Express app exists yet (TDD requirement)
describe('Contract Test: POST /v1/orders/{orderId}/cancel', () => {
  let app: Express;

  
  before(async () => {
    // Import Express app when it exists
    app = await import('../../src/server.js').then(m => m.app);
  });

  after(async () => {
    // Cleanup after tests
  });

  // Zod schema for order cancellation request
  const CancelOrderRequestSchema = z.object({
    reason: z.enum([
      'customer_request',
      'inventory_unavailable',
      'payment_failed',
      'fraud_detected',
      'duplicate_order',
      'address_undeliverable',
      'other'
    ]),
    reasonDetails: z.string().max(500).optional(),
    refundAmount: z.number().int().nonnegative().optional(), // Partial refunds
    notifyCustomer: z.boolean().default(true),
    internalNotes: z.string().max(1000).optional()
  });

  // Zod schema for order cancellation response
  const CancelOrderResponseSchema = z.object({
    id: z.string().uuid(),
    orderNumber: z.string().regex(/^ORD-\d{8}-\d{4}$/),
    status: z.literal('cancelled'),
    cancelledAt: z.string().datetime(),
    cancellationReason: z.enum([
      'customer_request',
      'inventory_unavailable', 
      'payment_failed',
      'fraud_detected',
      'duplicate_order',
      'address_undeliverable',
      'other'
    ]),
    reasonDetails: z.string().optional(),
    
    // Financial details
    refund: z.object({
      status: z.enum(['pending', 'processing', 'completed', 'failed']),
      amountCents: z.number().int().nonnegative(),
      currency: z.string().length(3).default('USD'),
      refundId: z.string().optional(),
      estimatedProcessingDays: z.number().int().min(1).max(10).optional(),
      refundMethod: z.enum(['original_payment', 'store_credit', 'manual_check']).default('original_payment')
    }).optional(),
    
    // Inventory handling
    inventory: z.object({
      itemsReleased: z.array(z.object({
        productId: z.string().uuid(),
        quantity: z.number().int().positive(),
        releasedAt: z.string().datetime()
      })).optional(),
      reservationsCleared: z.boolean().default(true)
    }),
    
    // Notification status
    customerNotified: z.boolean(),
    notificationSentAt: z.string().datetime().optional(),
    
    // Related order information
    replacementOrder: z.object({
      id: z.string().uuid(),
      orderNumber: z.string().regex(/^ORD-\d{8}-\d{4}$/),
      createdAt: z.string().datetime()
    }).optional(),
    
    updatedAt: z.string().datetime(),
    cancelledBy: z.string() // User ID who initiated cancellation
  });

  // Test data constants
  const validOrderId = '123e4567-e89b-12d3-a456-426614174000';
  const processingOrderId = '456e7890-e89b-12d3-a456-426614174001';
  const shippedOrderId = '789e0123-e89b-12d3-a456-426614174002';
  const alreadyCancelledOrderId = '111e1111-e89b-12d3-a456-426614171111';
  const nonExistentOrderId = '00000000-0000-0000-0000-000000000000';
  const invalidOrderId = 'invalid-uuid-format';

  describe('Valid Order Cancellation', () => {
    it('should cancel pending order with customer request', async () => {
      const cancellationPayload = {
        reason: 'customer_request' as const,
        reasonDetails: 'Customer changed mind about purchase',
        notifyCustomer: true
      };

      const response = await request(app)
        .post(`/v1/orders/${validOrderId}/cancel`)
        .send(cancellationPayload)
        .expect('Content-Type', /json/)
        .expect(200);

      const parsedResponse = CancelOrderResponseSchema.parse(response.body);
      
      assert.strictEqual(parsedResponse.id, validOrderId);
      assert.strictEqual(parsedResponse.status, 'cancelled');
      assert.strictEqual(parsedResponse.cancellationReason, 'customer_request');
      assert.strictEqual(parsedResponse.reasonDetails, cancellationPayload.reasonDetails);
      
      // Verify cancellation timestamp
      const cancelledAt = new Date(parsedResponse.cancelledAt);
      const now = new Date();
      assert.ok(now.getTime() - cancelledAt.getTime() < 10000); // Within 10 seconds
      
      // Verify customer notification
      assert.strictEqual(parsedResponse.customerNotified, true);
      assert.ok(parsedResponse.notificationSentAt);
    });

    it('should cancel order with full refund', async () => {
      const cancellationPayload = {
        reason: 'inventory_unavailable' as const,
        reasonDetails: 'Product temporarily out of stock',
        notifyCustomer: true
      };

      const response = await request(app)
        .post(`/v1/orders/${validOrderId}/cancel`)
        .send(cancellationPayload)
        .expect(200);

      const parsedResponse = CancelOrderResponseSchema.parse(response.body);
      
      // Should initiate full refund for paid orders
      if (parsedResponse.refund) {
        assert.ok(['pending', 'processing'].includes(parsedResponse.refund.status));
        assert.ok(parsedResponse.refund.amountCents > 0);
        assert.strictEqual(parsedResponse.refund.currency, 'USD');
        assert.strictEqual(parsedResponse.refund.refundMethod, 'original_payment');
      }
    });

    it('should cancel order with partial refund', async () => {
      const cancellationPayload = {
        reason: 'customer_request' as const,
        refundAmount: 5000, // $50.00 partial refund
        reasonDetails: 'Partial cancellation - keeping some items'
      };

      const response = await request(app)
        .post(`/v1/orders/${validOrderId}/cancel`)
        .send(cancellationPayload)
        .expect(200);

      const parsedResponse = CancelOrderResponseSchema.parse(response.body);
      
      if (parsedResponse.refund) {
        assert.strictEqual(parsedResponse.refund.amountCents, 5000);
      }
    });

    it('should handle inventory release for cancelled order', async () => {
      const cancellationPayload = {
        reason: 'duplicate_order' as const,
        reasonDetails: 'Duplicate order detected'
      };

      const response = await request(app)
        .post(`/v1/orders/${processingOrderId}/cancel`)
        .send(cancellationPayload)
        .expect(200);

      const parsedResponse = CancelOrderResponseSchema.parse(response.body);
      
      // Verify inventory handling
      assert.strictEqual(parsedResponse.inventory.reservationsCleared, true);
      
      if (parsedResponse.inventory.itemsReleased) {
        parsedResponse.inventory.itemsReleased.forEach(item => {
          assert.ok(item.productId);
          assert.ok(item.quantity > 0);
          
          const releasedAt = new Date(item.releasedAt);
          assert.ok(releasedAt instanceof Date && !isNaN(releasedAt.getTime()));
        });
      }
    });

    it('should cancel order without customer notification', async () => {
      const cancellationPayload = {
        reason: 'fraud_detected' as const,
        notifyCustomer: false,
        internalNotes: 'Fraudulent activity detected - do not notify customer'
      };

      const response = await request(app)
        .post(`/v1/orders/${validOrderId}/cancel`)
        .send(cancellationPayload)
        .expect(200);

      const parsedResponse = CancelOrderResponseSchema.parse(response.body);
      
      assert.strictEqual(parsedResponse.customerNotified, false);
      assert.strictEqual(parsedResponse.notificationSentAt, undefined);
    });

    it('should create replacement order when requested', async () => {
      const cancellationPayload = {
        reason: 'address_undeliverable' as const,
        reasonDetails: 'Address correction needed',
        createReplacement: true // This would be part of the business logic
      };

      const response = await request(app)
        .post(`/v1/orders/${validOrderId}/cancel`)
        .send(cancellationPayload)
        .expect(200);

      const parsedResponse = CancelOrderResponseSchema.parse(response.body);
      
      // If replacement order is created
      if (parsedResponse.replacementOrder) {
        assert.ok(parsedResponse.replacementOrder.id);
        assert.match(parsedResponse.replacementOrder.orderNumber, /^ORD-\d{8}-\d{4}$/);
        
        const createdAt = new Date(parsedResponse.replacementOrder.createdAt);
        assert.ok(createdAt instanceof Date && !isNaN(createdAt.getTime()));
      }
    });
  });

  describe('Business Rule Validation', () => {
    it('should reject cancellation of shipped orders', async () => {
      const cancellationPayload = {
        reason: 'customer_request' as const,
        reasonDetails: 'Trying to cancel shipped order'
      };

      const response = await request(app)
        .post(`/v1/orders/${shippedOrderId}/cancel`)
        .send(cancellationPayload)
        .expect(409); // Conflict

      assert.ok(response.body.error);
      assert.match(response.body.message, /Cannot cancel shipped order/);
    });

    it('should reject cancellation of already cancelled orders', async () => {
      const cancellationPayload = {
        reason: 'customer_request' as const
      };

      const response = await request(app)
        .post(`/v1/orders/${alreadyCancelledOrderId}/cancel`)
        .send(cancellationPayload)
        .expect(409);

      assert.ok(response.body.error);
      assert.match(response.body.message, /Order is already cancelled/);
    });

    it('should reject cancellation of delivered orders', async () => {
      const deliveredOrderId = '222e3333-e89b-12d3-a456-426614172222';
      const cancellationPayload = {
        reason: 'customer_request' as const
      };

      const response = await request(app)
        .post(`/v1/orders/${deliveredOrderId}/cancel`)
        .send(cancellationPayload)
        .expect(409);

      assert.ok(response.body.error);
      assert.match(response.body.message, /Cannot cancel delivered order/);
    });

    it('should validate refund amount against order total', async () => {
      const cancellationPayload = {
        reason: 'customer_request' as const,
        refundAmount: 999999999 // Excessive refund amount
      };

      const response = await request(app)
        .post(`/v1/orders/${validOrderId}/cancel`)
        .send(cancellationPayload)
        .expect(400);

      assert.ok(response.body.error);
      assert.match(response.body.message, /Refund amount exceeds order total/);
    });

    it('should handle payment processing failures during cancellation', async () => {
      // This test would simulate a scenario where refund processing fails
      const cancellationPayload = {
        reason: 'customer_request' as const,
        reasonDetails: 'Test refund processing failure'
      };

      const response = await request(app)
        .post(`/v1/orders/${validOrderId}/cancel`)
        .send(cancellationPayload)
        .expect(200);

      const parsedResponse = CancelOrderResponseSchema.parse(response.body);
      
      // Order should still be cancelled even if refund fails initially
      assert.strictEqual(parsedResponse.status, 'cancelled');
      
      if (parsedResponse.refund) {
        // Refund might be in failed status
        assert.ok(['pending', 'processing', 'failed'].includes(parsedResponse.refund.status));
      }
    });
  });

  describe('Request Validation', () => {
    it('should require cancellation reason', async () => {
      const response = await request(app)
        .post(`/v1/orders/${validOrderId}/cancel`)
        .send({}) // Missing reason
        .expect(400);

      assert.ok(response.body.error);
      assert.match(response.body.message, /Required/);
    });

    it('should reject invalid cancellation reasons', async () => {
      const cancellationPayload = {
        reason: 'invalid_reason' as any
      };

      const response = await request(app)
        .post(`/v1/orders/${validOrderId}/cancel`)
        .send(cancellationPayload)
        .expect(400);

      assert.ok(response.body.error);
      assert.match(response.body.message, /Invalid enum value/);
    });

    it('should validate reason details length', async () => {
      const cancellationPayload = {
        reason: 'other' as const,
        reasonDetails: 'x'.repeat(501) // Exceeds 500 character limit
      };

      const response = await request(app)
        .post(`/v1/orders/${validOrderId}/cancel`)
        .send(cancellationPayload)
        .expect(400);

      assert.ok(response.body.error);
      assert.match(response.body.message, /String must contain at most 500 character/);
    });

    it('should validate internal notes length', async () => {
      const cancellationPayload = {
        reason: 'fraud_detected' as const,
        internalNotes: 'x'.repeat(1001) // Exceeds 1000 character limit
      };

      const response = await request(app)
        .post(`/v1/orders/${validOrderId}/cancel`)
        .send(cancellationPayload)
        .expect(400);

      assert.ok(response.body.error);
      assert.match(response.body.message, /String must contain at most 1000 character/);
    });

    it('should reject invalid order ID format', async () => {
      const cancellationPayload = {
        reason: 'customer_request' as const
      };

      const response = await request(app)
        .post(`/v1/orders/${invalidOrderId}/cancel`)
        .send(cancellationPayload)
        .expect(400);

      assert.ok(response.body.error);
      assert.match(response.body.message, /Invalid order ID format/);
    });

    it('should reject non-existent orders', async () => {
      const cancellationPayload = {
        reason: 'customer_request' as const
      };

      const response = await request(app)
        .post(`/v1/orders/${nonExistentOrderId}/cancel`)
        .send(cancellationPayload)
        .expect(404);

      assert.ok(response.body.error);
      assert.match(response.body.message, /Order not found/);
    });

    it('should validate negative refund amounts', async () => {
      const cancellationPayload = {
        reason: 'customer_request' as const,
        refundAmount: -1000 // Invalid negative amount
      };

      const response = await request(app)
        .post(`/v1/orders/${validOrderId}/cancel`)
        .send(cancellationPayload)
        .expect(400);

      assert.ok(response.body.error);
      assert.match(response.body.message, /Number must be greater than or equal to 0/);
    });
  });

  describe('Authentication & Authorization', () => {
    it('should require authentication token', async () => {
      const cancellationPayload = {
        reason: 'customer_request' as const
      };

      const response = await request(app)
        .post(`/v1/orders/${validOrderId}/cancel`)
        .send(cancellationPayload)
        .expect(401);

      assert.ok(response.body.error);
      assert.match(response.body.message, /Authentication required/);
    });

    it('should reject invalid authentication token', async () => {
      const cancellationPayload = {
        reason: 'customer_request' as const
      };

      const response = await request(app)
        .post(`/v1/orders/${validOrderId}/cancel`)
        .set('Authorization', 'Bearer invalid-token')
        .send(cancellationPayload)
        .expect(401);

      assert.ok(response.body.error);
      assert.match(response.body.message, /Invalid authentication token/);
    });

    it('should restrict cancellation based on user permissions', async () => {
      const otherUserOrderId = '333e4444-e89b-12d3-a456-426614173333';
      const cancellationPayload = {
        reason: 'customer_request' as const
      };

      const response = await request(app)
        .post(`/v1/orders/${otherUserOrderId}/cancel`)
        .set('Authorization', 'Bearer customer-token')
        .send(cancellationPayload)
        .expect(403);

      assert.ok(response.body.error);
      assert.match(response.body.message, /Access denied/);
    });

    it('should allow admin users to cancel any order', async () => {
      const cancellationPayload = {
        reason: 'fraud_detected' as const,
        internalNotes: 'Admin cancellation for fraud'
      };

      const response = await request(app)
        .post(`/v1/orders/${validOrderId}/cancel`)
        .set('Authorization', 'Bearer admin-token')
        .send(cancellationPayload)
        .expect(200);

      const parsedResponse = CancelOrderResponseSchema.parse(response.body);
      assert.strictEqual(parsedResponse.status, 'cancelled');
    });

    it('should restrict internal notes to admin users', async () => {
      const cancellationPayload = {
        reason: 'customer_request' as const,
        internalNotes: 'Customer should not see this'
      };

      const response = await request(app)
        .post(`/v1/orders/${validOrderId}/cancel`)
        .set('Authorization', 'Bearer customer-token')
        .send(cancellationPayload)
        .expect(403);

      assert.ok(response.body.error);
      assert.match(response.body.message, /Insufficient permissions/);
    });

    it('should restrict certain cancellation reasons to admin users', async () => {
      const cancellationPayload = {
        reason: 'fraud_detected' as const
      };

      const response = await request(app)
        .post(`/v1/orders/${validOrderId}/cancel`)
        .set('Authorization', 'Bearer customer-token')
        .send(cancellationPayload)
        .expect(403);

      assert.ok(response.body.error);
      assert.match(response.body.message, /Insufficient permissions for this cancellation reason/);
    });
  });

  describe('Idempotency', () => {
    it('should handle duplicate cancellation requests', async () => {
      const cancellationPayload = {
        reason: 'customer_request' as const,
        reasonDetails: 'First cancellation attempt'
      };

      // First cancellation
      const firstResponse = await request(app)
        .post(`/v1/orders/${validOrderId}/cancel`)
        .set('Idempotency-Key', 'test-cancel-123')
        .send(cancellationPayload)
        .expect(200);

      // Duplicate cancellation with same idempotency key
      const secondResponse = await request(app)
        .post(`/v1/orders/${validOrderId}/cancel`)
        .set('Idempotency-Key', 'test-cancel-123')
        .send(cancellationPayload)
        .expect(200);

      // Should return the same result
      assert.deepStrictEqual(firstResponse.body, secondResponse.body);
    });
  });

  describe('Error Response Format', () => {
    it('should return consistent error format', async () => {
      const response = await request(app)
        .post(`/v1/orders/${invalidOrderId}/cancel`)
        .send({ reason: 'customer_request' })
        .expect(400);

      assert.ok(response.body.error);
      assert.ok(response.body.message);
      assert.ok(response.body.timestamp);
      assert.strictEqual(response.body.path, `/v1/orders/${invalidOrderId}/cancel`);
      assert.strictEqual(response.body.method, 'POST');
    });
  });
});