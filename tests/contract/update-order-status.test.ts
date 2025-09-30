import { test, describe } from 'node:test';
import assert from 'node:assert';
import request from 'supertest';
import { app } from '../../src/server.js';

/**
 * Contract Test: Update Order Status Endpoint
 * 
 * Tests that the PATCH /api/v1/orders/:id/status endpoint:
 * - Updates order status correctly
 * - Validates status transitions
 * - Records status change events
 * - Handles invalid status values
 * - Follows OpenAPI specification exactly
 */

describe('PATCH /api/v1/orders/:id/status - Update Order Status Contract', () => {
  test('should update order status with valid transition', async () => {
    const orderId = 'ord_test_123456789';
    const statusUpdate = {
      status: 'confirmed',
      reason: 'Payment processed successfully'
    };

    const response = await request(app)
      .patch(`/api/v1/orders/${orderId}/status`)
      .set('Authorization', 'Bearer valid_jwt_token')
      .send(statusUpdate)
      .expect(200);

    // Verify response structure
    assert.strictEqual(response.body.id, orderId);
    assert.strictEqual(response.body.status, 'confirmed');
    assert.ok(response.body.updatedAt);
    
    // Verify status change was recorded in events
    assert.ok(Array.isArray(response.body.events));
    const latestEvent = response.body.events[response.body.events.length - 1];
    assert.strictEqual(latestEvent.type, 'status_changed');
    assert.strictEqual(latestEvent.data.newStatus, 'confirmed');
    assert.strictEqual(latestEvent.data.reason, 'Payment processed successfully');
  });

  test('should validate status transition rules', async () => {
    const orderId = 'ord_delivered_order';
    const invalidStatusUpdate = {
      status: 'pending' // Cannot go from delivered back to pending
    };

    const response = await request(app)
      .patch(`/api/v1/orders/${orderId}/status`)
      .set('Authorization', 'Bearer valid_jwt_token')
      .send(invalidStatusUpdate)
      .expect(400);

    assert.strictEqual(response.body.error, 'Invalid Status Transition');
    assert.ok(response.body.message.includes('delivered'));
    assert.ok(response.body.message.includes('pending'));
  });

  test('should reject invalid status values', async () => {
    const orderId = 'ord_test_123456789';
    const invalidStatusUpdate = {
      status: 'invalid_status'
    };

    const response = await request(app)
      .patch(`/api/v1/orders/${orderId}/status`)
      .set('Authorization', 'Bearer valid_jwt_token')
      .send(invalidStatusUpdate)
      .expect(400);

    assert.strictEqual(response.body.error, 'Validation Error');
    assert.ok(response.body.details.includes('status'));
  });

  test('should handle order cancellation with reason', async () => {
    const orderId = 'ord_pending_order';
    const cancellationUpdate = {
      status: 'cancelled',
      reason: 'Customer requested cancellation',
      refundAmount: 59.99
    };

    const response = await request(app)
      .patch(`/api/v1/orders/${orderId}/status`)
      .set('Authorization', 'Bearer valid_jwt_token')
      .send(cancellationUpdate)
      .expect(200);

    assert.strictEqual(response.body.status, 'cancelled');
    
    // Verify cancellation event details
    const cancellationEvent = response.body.events.find((e: any) => e.type === 'status_changed');
    assert.ok(cancellationEvent);
    assert.strictEqual(cancellationEvent.data.reason, 'Customer requested cancellation');
    assert.strictEqual(cancellationEvent.data.refundAmount, 59.99);
  });

  test('should return 404 for non-existent order', async () => {
    const nonExistentId = 'ord_nonexistent_999999';
    const statusUpdate = {
      status: 'confirmed'
    };

    const response = await request(app)
      .patch(`/api/v1/orders/${nonExistentId}/status`)
      .set('Authorization', 'Bearer valid_jwt_token')
      .send(statusUpdate)
      .expect(404);

    assert.strictEqual(response.body.error, 'Order Not Found');
  });

  test('should reject unauthorized requests', async () => {
    const orderId = 'ord_test_123456789';
    const statusUpdate = {
      status: 'confirmed'
    };

    await request(app)
      .patch(`/api/v1/orders/${orderId}/status`)
      .send(statusUpdate)
      .expect(401);
  });

  test('should handle shipping status updates', async () => {
    const orderId = 'ord_confirmed_order';
    const shippingUpdate = {
      status: 'shipped',
      reason: 'Order dispatched via FedEx',
      trackingNumber: 'FDX123456789',
      estimatedDelivery: '2024-01-15'
    };

    const response = await request(app)
      .patch(`/api/v1/orders/${orderId}/status`)
      .set('Authorization', 'Bearer valid_jwt_token')
      .send(shippingUpdate)
      .expect(200);

    assert.strictEqual(response.body.status, 'shipped');
    assert.strictEqual(response.body.trackingNumber, 'FDX123456789');
    
    // Verify shipping event
    const shippingEvent = response.body.events.find((e: any) => e.type === 'status_changed');
    assert.strictEqual(shippingEvent.data.trackingNumber, 'FDX123456789');
    assert.strictEqual(shippingEvent.data.estimatedDelivery, '2024-01-15');
  });

  test('should validate required fields for specific status updates', async () => {
    const orderId = 'ord_confirmed_order';
    const incompleteShippingUpdate = {
      status: 'shipped'
      // Missing trackingNumber which should be required for shipped status
    };

    const response = await request(app)
      .patch(`/api/v1/orders/${orderId}/status`)
      .set('Authorization', 'Bearer valid_jwt_token')
      .send(incompleteShippingUpdate)
      .expect(400);

    assert.strictEqual(response.body.error, 'Validation Error');
    assert.ok(response.body.details.includes('trackingNumber'));
  });
});