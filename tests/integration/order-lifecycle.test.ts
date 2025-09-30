import { describe, it, before, after, beforeEach } from 'node:test';
import { strict as assert } from 'node:assert';
import { Express } from 'express';
import { z } from 'zod';

// This test will fail initially - no order lifecycle services exist yet (TDD requirement)
describe('Integration Test: Order Status Transitions and Event Logging', () => {
  let app: Express;
  let mockDatabase: any;
  let mockOrderService: any;
  let mockInventoryService: any;
  let mockPaymentService: any;
  let mockWebhookService: any;
  let mockNotificationService: any;
  let mockEventBus: any;
  let mockAuditLogger: any;
  
  before(async () => {
    // TODO: Import Express app and services when they exist
    // app = await import('../../src/server.js').then(m => m.app);
    // mockOrderService = await import('../../src/services/OrderService.js');
    throw new Error('Order lifecycle services not implemented yet - this test MUST fail initially (TDD)');
  });

  beforeEach(async () => {
    // Reset all mocks and test environment before each test
    await resetTestEnvironment();
    await setupOrderLifecycleTestData();
  });

  after(async () => {
    // Cleanup after all tests
    await cleanupTestEnvironment();
  });

  // Zod schema for order lifecycle operations
  const OrderStatusSchema = z.enum([
    'draft',           // Order being created/modified
    'pending',         // Awaiting payment/validation
    'confirmed',       // Payment received, processing begins
    'processing',      // Fulfillment in progress
    'shipped',         // Order dispatched
    'delivered',       // Order received by customer
    'completed',       // Order fulfilled successfully
    'cancelled',       // Order cancelled before fulfillment
    'refunded',        // Order refunded after completion
    'failed',          // Order failed during processing
    'on_hold',         // Order temporarily suspended
    'partially_shipped', // Some items shipped
    'partially_refunded' // Some items refunded
  ]);

  const OrderEventSchema = z.object({
    id: z.string().uuid(),
    orderId: z.string().uuid(),
    type: z.enum([
      'order_created',
      'status_changed',
      'payment_processed',
      'payment_failed',
      'inventory_reserved',
      'inventory_released',
      'fulfillment_started',
      'items_shipped',
      'order_delivered',
      'order_cancelled',
      'refund_issued',
      'note_added',
      'address_updated',
      'items_modified'
    ]),
    previousStatus: OrderStatusSchema.optional(),
    newStatus: OrderStatusSchema.optional(),
    data: z.record(z.any()),
    userId: z.string().uuid().optional(), // Staff member or system
    reason: z.string().optional(),
    timestamp: z.string().datetime(),
    metadata: z.object({
      source: z.string().default('system'),
      correlationId: z.string().uuid().optional(),
      sessionId: z.string().optional(),
      ipAddress: z.string().optional(),
      userAgent: z.string().optional()
    }).optional()
  });

  const OrderAuditTrailSchema = z.object({
    orderId: z.string().uuid(),
    events: z.array(OrderEventSchema).min(1),
    totalEvents: z.number().int().positive(),
    firstEvent: z.string().datetime(),
    lastEvent: z.string().datetime(),
    statusChanges: z.array(z.object({
      from: OrderStatusSchema.optional(),
      to: OrderStatusSchema,
      timestamp: z.string().datetime(),
      reason: z.string().optional(),
      userId: z.string().uuid().optional()
    })),
    timeline: z.array(z.object({
      phase: z.string(),
      startTime: z.string().datetime(),
      endTime: z.string().datetime().optional(),
      duration: z.number().optional(), // milliseconds
      status: z.enum(['active', 'completed', 'failed', 'skipped'])
    }))
  });

  const OrderStateMachineSchema = z.object({
    currentState: OrderStatusSchema,
    allowedTransitions: z.array(OrderStatusSchema),
    requiredConditions: z.record(z.boolean()).optional(),
    blockers: z.array(z.string()).optional(),
    nextAutoTransition: z.object({
      to: OrderStatusSchema,
      after: z.number(), // milliseconds
      condition: z.string()
    }).optional()
  });

  // Test data setup
  const testCustomer = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    email: 'lifecycle.test@example.com',
    name: 'Order Lifecycle Test Customer',
    phone: '+1-555-0123',
    tier: 'premium'
  };

  const testProduct = {
    id: '456e7890-e89b-12d3-a456-426614174001',
    name: 'Lifecycle Test Product',
    sku: 'LTP-001',
    price: 2999, // $29.99
    weight: 500, // grams
    category: 'electronics'
  };

  const testStaffUser = {
    id: '789e0123-e89b-12d3-a456-426614174002',
    email: 'staff@company.com',
    name: 'Test Staff Member',
    role: 'fulfillment_manager'
  };

  // Helper functions
  async function resetTestEnvironment() {
    // Reset all order states
    // Clear event logs
    // Reset mock services
    // Clear audit trails
  }

  async function cleanupTestEnvironment() {
    // Clean up test data
    // Close connections
  }

  async function setupOrderLifecycleTestData() {
    // Insert test customer
    await mockDatabase.customers.insert(testCustomer);
    
    // Insert test product with inventory
    await mockDatabase.products.insert(testProduct);
    await mockInventoryService.initializeStock(testProduct.id, 100);
    
    // Insert test staff user
    await mockDatabase.users.insert(testStaffUser);
  }

  async function createTestOrder(customerId: string, items: any[], initialStatus: string = 'draft') {
    const order = {
      id: `order_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      customerId,
      status: initialStatus,
      items,
      totalAmount: items.reduce((sum, item) => sum + (item.unitPriceCents * item.quantity), 0),
      shippingAddress: {
        street: '123 Test Street',
        city: 'Test City',
        state: 'TC',
        postalCode: '12345',
        country: 'US'
      },
      billingAddress: {
        street: '123 Test Street',
        city: 'Test City',
        state: 'TC',
        postalCode: '12345',
        country: 'US'
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await mockDatabase.orders.insert(order);
    return order;
  }

  async function verifyOrderStatusTransition(
    orderId: string, 
    expectedStatus: string, 
    expectedPreviousStatus?: string
  ) {
    const order = await mockDatabase.orders.findById(orderId);
    assert.strictEqual(order.status, expectedStatus, `Order status should be ${expectedStatus}`);
    
    // Verify status change event was logged
    const events = await mockDatabase.orderEvents.findByOrderId(orderId);
    const statusChangeEvent = events
      .filter((e: any) => e.type === 'status_changed')
      .sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];
    
    assert.ok(statusChangeEvent, 'Status change event should be logged');
    assert.strictEqual(statusChangeEvent.newStatus, expectedStatus);
    
    if (expectedPreviousStatus) {
      assert.strictEqual(statusChangeEvent.previousStatus, expectedPreviousStatus);
    }
    
    return { order, statusChangeEvent };
  }

  async function verifyEventSequence(orderId: string, expectedEventTypes: string[]) {
    const events = await mockDatabase.orderEvents.findByOrderId(orderId);
    const eventTypes = events
      .sort((a: any, b: any) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
      .map((e: any) => e.type);
    
    expectedEventTypes.forEach((expectedType, index) => {
      assert.strictEqual(
        eventTypes[index], 
        expectedType, 
        `Event ${index} should be ${expectedType}, got ${eventTypes[index]}`
      );
    });
    
    return events;
  }

  async function simulateTimeElapse(minutes: number) {
    const elapsed = minutes * 60 * 1000; // Convert to milliseconds
    await mockOrderService.simulateTimePassage(elapsed);
  }

  describe('Order Creation and Initial Status', () => {
    it('should create order with correct initial state and events', async () => {
      const orderData = {
        customerId: testCustomer.id,
        items: [{
          productId: testProduct.id,
          name: testProduct.name,
          quantity: 2,
          unitPriceCents: testProduct.price,
          totalPriceCents: testProduct.price * 2
        }]
      };

      const order = await mockOrderService.createOrder(orderData);
      
      // Verify initial status
      assert.strictEqual(order.status, 'draft');
      assert.ok(order.id);
      assert.ok(order.createdAt);
      
      // Verify order creation event was logged
      const events = await verifyEventSequence(order.id, ['order_created']);
      const creationEvent = events[0];
      
      // Validate creation event
      const validatedEvent = OrderEventSchema.parse(creationEvent);
      assert.strictEqual(validatedEvent.type, 'order_created');
      assert.strictEqual(validatedEvent.orderId, order.id);
      assert.ok(validatedEvent.data.customerId);
      assert.ok(validatedEvent.data.totalAmount);
      assert.ok(Array.isArray(validatedEvent.data.items));
      
      // Verify state machine is initialized
      const stateMachine = await mockOrderService.getOrderStateMachine(order.id);
      const validatedStateMachine = OrderStateMachineSchema.parse(stateMachine);
      assert.strictEqual(validatedStateMachine.currentState, 'draft');
      assert.ok(validatedStateMachine.allowedTransitions.length > 0);
    });

    it('should validate order data and prevent invalid orders', async () => {
      // Test missing required fields
      try {
        await mockOrderService.createOrder({
          customerId: testCustomer.id,
          items: [] // Empty items array
        });
        assert.fail('Should reject order with no items');
      } catch (error) {
        assert.match((error as Error).message, /items.*required|empty.*items/i);
      }

      // Test invalid customer
      try {
        await mockOrderService.createOrder({
          customerId: '00000000-0000-0000-0000-000000000000',
          items: [{ productId: testProduct.id, quantity: 1, unitPriceCents: 2999 }]
        });
        assert.fail('Should reject order with invalid customer');
      } catch (error) {
        assert.match((error as Error).message, /customer.*not.*found/i);
      }

      // Test invalid product
      try {
        await mockOrderService.createOrder({
          customerId: testCustomer.id,
          items: [{ productId: '00000000-0000-0000-0000-000000000000', quantity: 1, unitPriceCents: 2999 }]
        });
        assert.fail('Should reject order with invalid product');
      } catch (error) {
        assert.match((error as Error).message, /product.*not.*found/i);
      }

      // Verify no invalid orders were created
      const allOrders = await mockDatabase.orders.findByCustomerId(testCustomer.id);
      assert.strictEqual(allOrders.length, 0, 'No invalid orders should be created');
    });

    it('should initialize order with proper audit trail', async () => {
      const order = await mockOrderService.createOrder({
        customerId: testCustomer.id,
        items: [{ productId: testProduct.id, quantity: 1, unitPriceCents: testProduct.price }]
      });

      const auditTrail = await mockOrderService.getOrderAuditTrail(order.id);
      const validatedAudit = OrderAuditTrailSchema.parse(auditTrail);
      
      // Verify audit trail structure
      assert.strictEqual(validatedAudit.orderId, order.id);
      assert.strictEqual(validatedAudit.totalEvents, 1);
      assert.strictEqual(validatedAudit.events.length, 1);
      assert.strictEqual(validatedAudit.events[0].type, 'order_created');
      
      // Verify timeline initialization
      assert.ok(validatedAudit.timeline.length >= 1);
      const creationPhase = validatedAudit.timeline.find(t => t.phase === 'creation');
      assert.ok(creationPhase);
      assert.strictEqual(creationPhase.status, 'completed');
      assert.ok(creationPhase.duration);
      assert.ok(creationPhase.duration < 5000); // Should complete quickly
    });
  });

  describe('Order Status Transitions', () => {
    let testOrder: any;

    beforeEach(async () => {
      testOrder = await createTestOrder(testCustomer.id, [{
        productId: testProduct.id,
        name: testProduct.name,
        quantity: 3,
        unitPriceCents: testProduct.price,
        totalPriceCents: testProduct.price * 3
      }]);
    });

    it('should transition from draft to pending with validation', async () => {
      // Transition to pending (customer submits order)
      const transitionResult = await mockOrderService.transitionOrderStatus(
        testOrder.id, 
        'pending',
        'Customer submitted order',
        { source: 'customer_portal', sessionId: 'session_123' }
      );

      // Verify transition succeeded
      assert.strictEqual(transitionResult.success, true);
      assert.strictEqual(transitionResult.newStatus, 'pending');
      
      // Verify order status updated
      await verifyOrderStatusTransition(testOrder.id, 'pending', 'draft');
      
      // Verify inventory was reserved
      const inventoryStatus = await mockInventoryService.getInventoryStatus(testProduct.id);
      assert.strictEqual(inventoryStatus.reservedStock, 3);
      assert.strictEqual(inventoryStatus.availableStock, 97); // 100 - 3
      
      // Verify event sequence
      await verifyEventSequence(testOrder.id, [
        'order_created',
        'inventory_reserved',
        'status_changed'
      ]);

      // Verify state machine updated
      const stateMachine = await mockOrderService.getOrderStateMachine(testOrder.id);
      assert.strictEqual(stateMachine.currentState, 'pending');
      assert.ok(stateMachine.allowedTransitions.includes('confirmed'));
      assert.ok(stateMachine.allowedTransitions.includes('cancelled'));
    });

    it('should transition through complete fulfillment workflow', async () => {
      // 1. Draft -> Pending (customer submission)
      await mockOrderService.transitionOrderStatus(testOrder.id, 'pending', 'Customer submitted');
      
      // 2. Pending -> Confirmed (payment processed)
      const paymentResult = await mockPaymentService.processPayment({
        orderId: testOrder.id,
        amount: testOrder.totalAmount,
        paymentMethodId: 'pm_test_card'
      });
      
      await mockOrderService.transitionOrderStatus(
        testOrder.id, 
        'confirmed', 
        'Payment processed successfully',
        { paymentId: paymentResult.id }
      );
      
      // 3. Confirmed -> Processing (fulfillment starts)
      await mockOrderService.transitionOrderStatus(
        testOrder.id, 
        'processing', 
        'Fulfillment started',
        { userId: testStaffUser.id, facility: 'warehouse_a' }
      );
      
      // 4. Processing -> Shipped (items dispatched)
      const shipmentData = {
        trackingNumber: 'TRACK123456',
        carrier: 'TestShip',
        estimatedDelivery: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString() // 3 days
      };
      
      await mockOrderService.transitionOrderStatus(
        testOrder.id, 
        'shipped', 
        'Order dispatched',
        { userId: testStaffUser.id, shipment: shipmentData }
      );
      
      // 5. Shipped -> Delivered (customer receives)
      await simulateTimeElapse(60); // Simulate 1 hour later
      await mockOrderService.transitionOrderStatus(
        testOrder.id, 
        'delivered', 
        'Package delivered',
        { deliveryConfirmation: 'signature_required', deliveredAt: new Date().toISOString() }
      );
      
      // 6. Delivered -> Completed (final status)
      await simulateTimeElapse(24 * 60); // 24 hours later (auto-transition)
      await mockOrderService.processAutoTransitions();
      
      // Verify final status
      await verifyOrderStatusTransition(testOrder.id, 'completed', 'delivered');
      
      // Verify complete event sequence
      await verifyEventSequence(testOrder.id, [
        'order_created',
        'inventory_reserved',
        'status_changed', // -> pending
        'payment_processed',
        'status_changed', // -> confirmed
        'fulfillment_started',
        'status_changed', // -> processing
        'items_shipped',
        'status_changed', // -> shipped
        'order_delivered',
        'status_changed', // -> delivered
        'status_changed'  // -> completed (auto)
      ]);

      // Verify inventory was properly allocated and deducted
      const finalInventoryStatus = await mockInventoryService.getInventoryStatus(testProduct.id);
      assert.strictEqual(finalInventoryStatus.totalStock, 97); // 100 - 3 sold
      assert.strictEqual(finalInventoryStatus.reservedStock, 0);
      assert.strictEqual(finalInventoryStatus.allocatedStock, 0);
      
      // Verify webhooks were sent for major transitions
      const webhookDeliveries = await mockDatabase.webhookDeliveries.findByOrderId(testOrder.id);
      const webhookEventTypes = webhookDeliveries.map((d: any) => JSON.parse(d.payload).type);
      
      assert.ok(webhookEventTypes.includes('order.confirmed'));
      assert.ok(webhookEventTypes.includes('order.shipped'));
      assert.ok(webhookEventTypes.includes('order.delivered'));
      assert.ok(webhookEventTypes.includes('order.completed'));
    });
  });

  describe('Order Cancellation and Refund Workflows', () => {
    let testOrder: any;

    beforeEach(async () => {
      testOrder = await createTestOrder(testCustomer.id, [{
        productId: testProduct.id,
        name: testProduct.name,
        quantity: 2,
        unitPriceCents: testProduct.price,
        totalPriceCents: testProduct.price * 2
      }], 'confirmed'); // Start with confirmed order
    });

    it('should handle pre-fulfillment cancellation with inventory restoration', async () => {
      // Cancel order before shipping
      const cancellationResult = await mockOrderService.cancelOrder(
        testOrder.id,
        'Customer requested cancellation',
        { userId: testStaffUser.id, refundRequested: true }
      );

      assert.strictEqual(cancellationResult.success, true);
      assert.strictEqual(cancellationResult.refundAmount, testOrder.totalAmount);

      // Verify order status
      await verifyOrderStatusTransition(testOrder.id, 'cancelled', 'confirmed');

      // Verify inventory was released
      const inventoryStatus = await mockInventoryService.getInventoryStatus(testProduct.id);
      assert.strictEqual(inventoryStatus.reservedStock, 0);
      assert.strictEqual(inventoryStatus.availableStock, 100); // Back to original

      // Verify refund was processed
      const refunds = await mockPaymentService.getRefunds(testOrder.id);
      assert.strictEqual(refunds.length, 1);
      assert.strictEqual(refunds[0].amount, testOrder.totalAmount);
      assert.strictEqual(refunds[0].status, 'completed');

      // Verify event sequence
      await verifyEventSequence(testOrder.id, [
        'order_created',
        'inventory_reserved',
        'status_changed', // -> pending
        'payment_processed',
        'status_changed', // -> confirmed
        'order_cancelled',
        'inventory_released',
        'refund_issued',
        'status_changed'  // -> cancelled
      ]);
    });

    it('should handle post-fulfillment partial refund', async () => {
      // First complete the order fulfillment
      await mockOrderService.transitionOrderStatus(testOrder.id, 'shipped', 'Order shipped');
      await mockOrderService.transitionOrderStatus(testOrder.id, 'delivered', 'Order delivered');

      // Issue partial refund (1 item out of 2)
      const partialRefundAmount = testProduct.price; // Refund for 1 item
      const refundResult = await mockOrderService.processPartialRefund(
        testOrder.id,
        partialRefundAmount,
        'One item was defective',
        { userId: testStaffUser.id, itemsAffected: [{ productId: testProduct.id, quantity: 1 }] }
      );

      assert.strictEqual(refundResult.success, true);
      assert.strictEqual(refundResult.refundAmount, partialRefundAmount);

      // Verify order status (should remain delivered, not change to refunded unless fully refunded)
      const order = await mockDatabase.orders.findById(testOrder.id);
      assert.strictEqual(order.status, 'delivered'); // Or 'partially_refunded' if that status exists

      // Verify partial refund was recorded
      const refunds = await mockPaymentService.getRefunds(testOrder.id);
      const totalRefunded = refunds.reduce((sum: number, r: any) => sum + r.amount, 0);
      assert.strictEqual(totalRefunded, partialRefundAmount);

      // Verify refund event was logged
      const events = await mockDatabase.orderEvents.findByOrderId(testOrder.id);
      const refundEvent = events.find((e: any) => e.type === 'refund_issued');
      assert.ok(refundEvent);
      assert.strictEqual(refundEvent.data.amount, partialRefundAmount);
      assert.strictEqual(refundEvent.data.reason, 'One item was defective');
    });

    it('should prevent invalid cancellations', async () => {
      // Try to cancel a delivered order (should fail or require special permissions)
      await mockOrderService.transitionOrderStatus(testOrder.id, 'delivered', 'Order delivered');

      try {
        await mockOrderService.cancelOrder(
          testOrder.id,
          'Late cancellation attempt',
          { userId: 'regular_user_id' }
        );
        assert.fail('Should prevent cancellation of delivered order');
      } catch (error) {
        assert.match((error as Error).message, /cannot.*cancel.*delivered/i);
      }

      // Try to cancel with insufficient permissions
      try {
        await mockOrderService.cancelOrder(
          testOrder.id,
          'Unauthorized cancellation',
          { userId: null } // No user context
        );
        assert.fail('Should require user authorization for cancellation');
      } catch (error) {
        assert.match((error as Error).message, /authorization.*required/i);
      }

      // Verify order status unchanged
      const order = await mockDatabase.orders.findById(testOrder.id);
      assert.strictEqual(order.status, 'delivered');
    });
  });

  describe('Error Handling and Recovery', () => {
    let testOrder: any;

    beforeEach(async () => {
      testOrder = await createTestOrder(testCustomer.id, [{
        productId: testProduct.id,
        name: testProduct.name,
        quantity: 1,
        unitPriceCents: testProduct.price,
        totalPriceCents: testProduct.price
      }], 'pending');
    });

    it('should handle payment failures gracefully', async () => {
      // Simulate payment failure
      mockPaymentService.setFailureRate(1.0); // Force payment to fail

      const paymentResult = await mockOrderService.processOrderPayment(
        testOrder.id,
        { paymentMethodId: 'pm_fail_card' }
      );

      assert.strictEqual(paymentResult.success, false);
      assert.ok(paymentResult.error);

      // Verify order remains in pending status
      const order = await mockDatabase.orders.findById(testOrder.id);
      assert.strictEqual(order.status, 'pending');

      // Verify payment failure was logged
      const events = await mockDatabase.orderEvents.findByOrderId(testOrder.id);
      const failureEvent = events.find((e: any) => e.type === 'payment_failed');
      assert.ok(failureEvent);
      assert.ok(failureEvent.data.error);

      // Verify inventory reservation remains active (not released on payment failure)
      const inventoryStatus = await mockInventoryService.getInventoryStatus(testProduct.id);
      assert.strictEqual(inventoryStatus.reservedStock, 1);

      // Verify retry mechanism
      const retryResult = await mockOrderService.retryOrderPayment(
        testOrder.id,
        { paymentMethodId: 'pm_valid_card' }
      );
      
      mockPaymentService.setFailureRate(0); // Reset to success
      assert.strictEqual(retryResult.success, true);

      // Verify order progressed after successful retry
      await verifyOrderStatusTransition(testOrder.id, 'confirmed', 'pending');
    });

    it('should handle inventory allocation failures', async () => {
      // Reduce inventory to create shortage
      await mockInventoryService.adjustInventory(testProduct.id, -99); // Leave only 1 item

      // Try to create order for more items than available
      const largeOrder = await createTestOrder(testCustomer.id, [{
        productId: testProduct.id,
        quantity: 5, // More than available
        unitPriceCents: testProduct.price,
        totalPriceCents: testProduct.price * 5
      }], 'draft');

      try {
        await mockOrderService.transitionOrderStatus(largeOrder.id, 'pending', 'Attempting submission');
        assert.fail('Should fail due to insufficient inventory');
      } catch (error) {
        assert.match((error as Error).message, /insufficient.*inventory/i);
      }

      // Verify order status remains draft
      const order = await mockDatabase.orders.findById(largeOrder.id);
      assert.strictEqual(order.status, 'draft');

      // Verify no inventory was reserved
      const inventoryStatus = await mockInventoryService.getInventoryStatus(testProduct.id);
      assert.strictEqual(inventoryStatus.reservedStock, 1); // Only from original test order
    });

    it('should handle webhook delivery failures with retry', async () => {
      // Configure webhook endpoint to fail initially
      mockWebhookService.setWebhookResponse('http://test-webhook.com/orders', {
        status: 500,
        retryCount: 0
      });

      // Progress order to trigger webhooks
      await mockOrderService.transitionOrderStatus(testOrder.id, 'confirmed', 'Payment processed');

      // Verify webhook was attempted and failed
      const webhookAttempts = await mockDatabase.webhookDeliveries.findByOrderId(testOrder.id);
      const failedAttempt = webhookAttempts.find((w: any) => w.status === 'failed');
      assert.ok(failedAttempt);

      // Verify retry was scheduled
      const retryJobs = await mockDatabase.jobQueue.findByType('webhook_retry');
      const orderRetryJob = retryJobs.find((job: any) => job.data.orderId === testOrder.id);
      assert.ok(orderRetryJob);

      // Simulate successful retry
      mockWebhookService.setWebhookResponse('http://test-webhook.com/orders', {
        status: 200,
        retryCount: 1
      });

      await mockWebhookService.processRetries();

      // Verify webhook eventually succeeded
      const finalAttempts = await mockDatabase.webhookDeliveries.findByOrderId(testOrder.id);
      const successfulAttempt = finalAttempts.find((w: any) => w.status === 'delivered');
      assert.ok(successfulAttempt);
      assert.ok(successfulAttempt.retryCount > 0);
    });

    it('should handle system failures during order processing', async () => {
      // Simulate database connection failure during processing
      await mockOrderService.transitionOrderStatus(testOrder.id, 'confirmed', 'Payment processed');
      
      // Inject database failure during shipping update
      mockDatabase.simulateConnectionFailure(true);

      try {
        await mockOrderService.transitionOrderStatus(testOrder.id, 'shipped', 'Attempting to ship');
        assert.fail('Should fail due to database connection');
      } catch (error) {
        assert.match((error as Error).message, /database.*connection/i);
      }

      // Verify order status is not corrupted
      mockDatabase.simulateConnectionFailure(false);
      const order = await mockDatabase.orders.findById(testOrder.id);
      assert.strictEqual(order.status, 'confirmed'); // Should remain in last valid state

      // Verify system can recover and continue processing
      const recoveryResult = await mockOrderService.transitionOrderStatus(
        testOrder.id, 
        'shipped', 
        'Shipping after recovery'
      );
      
      assert.strictEqual(recoveryResult.success, true);
      await verifyOrderStatusTransition(testOrder.id, 'shipped', 'confirmed');
    });
  });

  describe('Concurrent Order Processing', () => {
    it('should handle concurrent orders for same product without overselling', async () => {
      const concurrentOrderCount = 10;
      const ordersPerBatch = 2; // Each order wants 2 items

      // Create multiple concurrent orders
      const orderPromises = Array.from({ length: concurrentOrderCount }, (_, index) => 
        createTestOrder(`customer_${index}`, [{
          productId: testProduct.id,
          quantity: ordersPerBatch,
          unitPriceCents: testProduct.price,
          totalPriceCents: testProduct.price * ordersPerBatch
        }], 'draft')
      );

      const orders = await Promise.all(orderPromises);

      // Concurrently try to transition all orders to pending (which reserves inventory)
      const transitionPromises = orders.map(order => 
        mockOrderService.transitionOrderStatus(order.id, 'pending', 'Concurrent submission')
          .catch((error: Error) => ({ error: error.message, orderId: order.id }))
      );

      const results = await Promise.all(transitionPromises);

      // Count successful and failed transitions
      const successful = results.filter((r: any) => !r.error).length;
      const failed = results.filter((r: any) => r.error).length;

      // Should only allow orders that don't exceed inventory (100 items / 2 per order = 50 max orders)
      // But we tried 10 orders, so all should succeed or some should fail due to inventory
      const maxPossibleOrders = Math.floor(100 / ordersPerBatch); // 50
      assert.ok(successful <= maxPossibleOrders);

      // Verify inventory consistency
      const inventoryStatus = await mockInventoryService.getInventoryStatus(testProduct.id);
      const expectedReserved = successful * ordersPerBatch;
      assert.strictEqual(inventoryStatus.reservedStock, expectedReserved);
      assert.strictEqual(inventoryStatus.availableStock, 100 - expectedReserved);

      // Verify failed orders had proper error messages
      const failedResults = results.filter((r: any) => r.error) as any[];
      failedResults.forEach(result => {
        assert.match(result.error, /insufficient.*inventory/i);
      });
    });

    it('should handle concurrent status transitions for same order', async () => {
      const order = await createTestOrder(testCustomer.id, [{
        productId: testProduct.id,
        quantity: 1,
        unitPriceCents: testProduct.price,
        totalPriceCents: testProduct.price
      }], 'pending');

      // Try to transition to different statuses concurrently (should prevent race conditions)
      const transitionPromises = [
        mockOrderService.transitionOrderStatus(order.id, 'confirmed', 'Payment processed'),
        mockOrderService.transitionOrderStatus(order.id, 'cancelled', 'Customer cancelled'),
        mockOrderService.transitionOrderStatus(order.id, 'on_hold', 'Fraud review')
      ];

      const results = await Promise.allSettled(transitionPromises);

      // Only one transition should succeed
      const successful = results.filter((r: any) => r.status === 'fulfilled').length;
      const failed = results.filter((r: any) => r.status === 'rejected').length;

      assert.strictEqual(successful, 1, 'Only one concurrent transition should succeed');
      assert.strictEqual(failed, 2, 'Other concurrent transitions should fail');

      // Verify final order state is consistent
      const finalOrder = await mockDatabase.orders.findById(order.id);
      assert.ok(['confirmed', 'cancelled', 'on_hold'].includes(finalOrder.status));

      // Verify only valid transition events were recorded
      const events = await mockDatabase.orderEvents.findByOrderId(order.id);
      const statusChangeEvents = events.filter((e: any) => e.type === 'status_changed');
      assert.ok(statusChangeEvents.length >= 1); // At least one successful transition
      
      // All events should have valid state transitions
      statusChangeEvents.forEach((event: any) => {
        assert.ok(event.previousStatus);
        assert.ok(event.newStatus);
        assert.notStrictEqual(event.previousStatus, event.newStatus);
      });
    });
  });

  describe('Performance and Scalability', () => {
    it('should handle order lifecycle operations within performance limits', async () => {
      const performanceOrder = await createTestOrder(testCustomer.id, [{
        productId: testProduct.id,
        quantity: 1,
        unitPriceCents: testProduct.price,
        totalPriceCents: testProduct.price
      }]);

      // Test order creation performance
      const createStartTime = Date.now();
      const bulkOrders = await Promise.all(
        Array.from({ length: 50 }, (_, i) => 
          createTestOrder(`perf_customer_${i}`, [{
            productId: testProduct.id,
            quantity: 1,
            unitPriceCents: testProduct.price,
            totalPriceCents: testProduct.price
          }])
        )
      );
      const createDuration = Date.now() - createStartTime;
      
      assert.ok(createDuration < 5000, `Order creation took ${createDuration}ms, should be < 5000ms`);

      // Test status transition performance
      const transitionStartTime = Date.now();
      await Promise.all(
        bulkOrders.slice(0, 20).map(order => 
          mockOrderService.transitionOrderStatus(order.id, 'pending', 'Performance test')
        )
      );
      const transitionDuration = Date.now() - transitionStartTime;
      
      assert.ok(transitionDuration < 3000, `Status transitions took ${transitionDuration}ms, should be < 3000ms`);

      // Test event querying performance
      const queryStartTime = Date.now();
      const allEvents = await Promise.all(
        bulkOrders.slice(0, 10).map(order => 
          mockDatabase.orderEvents.findByOrderId(order.id)
        )
      );
      const queryDuration = Date.now() - queryStartTime;
      
      assert.ok(queryDuration < 1000, `Event queries took ${queryDuration}ms, should be < 1000ms`);
      assert.ok(allEvents.every(events => events.length > 0), 'All orders should have events');
    });

    it('should maintain audit trail integrity under load', async () => {
      const loadTestOrder = await createTestOrder(testCustomer.id, [{
        productId: testProduct.id,
        quantity: 1,
        unitPriceCents: testProduct.price,
        totalPriceCents: testProduct.price
      }]);

      // Perform rapid status changes
      const statusSequence = ['pending', 'confirmed', 'processing', 'shipped', 'delivered'];
      
      for (const status of statusSequence) {
        await mockOrderService.transitionOrderStatus(
          loadTestOrder.id, 
          status as any, 
          `Automated transition to ${status}`
        );
        
        // Small delay to ensure timestamp ordering
        await new Promise(resolve => setTimeout(resolve, 10));
      }

      // Verify complete audit trail
      const auditTrail = await mockOrderService.getOrderAuditTrail(loadTestOrder.id);
      const validatedAudit = OrderAuditTrailSchema.parse(auditTrail);

      // Verify event count and sequencing
      assert.ok(validatedAudit.totalEvents >= statusSequence.length + 1); // +1 for creation
      assert.strictEqual(validatedAudit.statusChanges.length, statusSequence.length);

      // Verify chronological order
      for (let i = 1; i < validatedAudit.events.length; i++) {
        const prevTimestamp = new Date(validatedAudit.events[i-1].timestamp).getTime();
        const currTimestamp = new Date(validatedAudit.events[i].timestamp).getTime();
        assert.ok(currTimestamp >= prevTimestamp, 'Events should be in chronological order');
      }

      // Verify status transition chain integrity
      for (let i = 1; i < validatedAudit.statusChanges.length; i++) {
        const prevChange = validatedAudit.statusChanges[i-1];
        const currChange = validatedAudit.statusChanges[i];
        assert.strictEqual(
          currChange.from, 
          prevChange.to, 
          'Status transitions should form a valid chain'
        );
      }
    });
  });

  describe('Auto-transitions and Business Rules', () => {
    it('should automatically transition delivered orders to completed', async () => {
      const autoTransitionOrder = await createTestOrder(testCustomer.id, [{
        productId: testProduct.id,
        quantity: 1,
        unitPriceCents: testProduct.price,
        totalPriceCents: testProduct.price
      }]);

      // Progress order to delivered status
      await mockOrderService.transitionOrderStatus(autoTransitionOrder.id, 'pending', 'Customer submitted');
      await mockOrderService.transitionOrderStatus(autoTransitionOrder.id, 'confirmed', 'Payment processed');
      await mockOrderService.transitionOrderStatus(autoTransitionOrder.id, 'processing', 'Fulfillment started');
      await mockOrderService.transitionOrderStatus(autoTransitionOrder.id, 'shipped', 'Order dispatched');
      await mockOrderService.transitionOrderStatus(autoTransitionOrder.id, 'delivered', 'Package delivered');

      // Simulate time passage for auto-completion (e.g., 7 days)
      await simulateTimeElapse(7 * 24 * 60); // 7 days in minutes

      // Trigger auto-transition processing
      const autoTransitionResults = await mockOrderService.processAutoTransitions();

      // Verify order was auto-completed
      const finalOrder = await mockDatabase.orders.findById(autoTransitionOrder.id);
      assert.strictEqual(finalOrder.status, 'completed');

      // Verify auto-transition event was logged
      const events = await mockDatabase.orderEvents.findByOrderId(autoTransitionOrder.id);
      const autoEvent = events.find((e: any) => 
        e.type === 'status_changed' && 
        e.newStatus === 'completed' && 
        e.data.triggerType === 'auto_transition'
      );
      assert.ok(autoEvent, 'Auto-transition event should be logged');
      assert.ok(autoEvent.data.autoTransitionRule);

      // Verify auto-transition was included in results
      const orderAutoTransition = autoTransitionResults.find((r: any) => r.orderId === autoTransitionOrder.id);
      assert.ok(orderAutoTransition);
      assert.strictEqual(orderAutoTransition.fromStatus, 'delivered');
      assert.strictEqual(orderAutoTransition.toStatus, 'completed');
    });

    it('should enforce business rules for status transitions', async () => {
      const businessRuleOrder = await createTestOrder(testCustomer.id, [{
        productId: testProduct.id,
        quantity: 1,
        unitPriceCents: testProduct.price,
        totalPriceCents: testProduct.price
      }]);

      // Test invalid transition (draft -> shipped, skipping payment)
      try {
        await mockOrderService.transitionOrderStatus(
          businessRuleOrder.id, 
          'shipped', 
          'Invalid transition attempt'
        );
        assert.fail('Should prevent invalid status transition');
      } catch (error) {
        assert.match((error as Error).message, /invalid.*transition|business.*rule/i);
      }

      // Test business rule enforcement (must process payment before fulfillment)
      await mockOrderService.transitionOrderStatus(businessRuleOrder.id, 'pending', 'Customer submitted');
      
      try {
        await mockOrderService.transitionOrderStatus(
          businessRuleOrder.id, 
          'processing', 
          'Attempting fulfillment without payment'
        );
        assert.fail('Should require payment before fulfillment');
      } catch (error) {
        assert.match((error as Error).message, /payment.*required/i);
      }

      // Verify order remains in valid state
      const order = await mockDatabase.orders.findById(businessRuleOrder.id);
      assert.strictEqual(order.status, 'pending');

      // Test valid transition sequence
      await mockOrderService.transitionOrderStatus(businessRuleOrder.id, 'confirmed', 'Payment processed');
      await mockOrderService.transitionOrderStatus(businessRuleOrder.id, 'processing', 'Fulfillment can now start');

      // Verify successful transitions
      await verifyOrderStatusTransition(businessRuleOrder.id, 'processing', 'confirmed');
    });

    it('should handle time-based business rules', async () => {
      const timeRuleOrder = await createTestOrder(testCustomer.id, [{
        productId: testProduct.id,
        quantity: 1,
        unitPriceCents: testProduct.price,
        totalPriceCents: testProduct.price
      }]);

      // Progress to pending (starts timer for automatic cancellation if not paid)
      await mockOrderService.transitionOrderStatus(timeRuleOrder.id, 'pending', 'Customer submitted');

      // Check that order has pending payment timeout rule
      const stateMachine = await mockOrderService.getOrderStateMachine(timeRuleOrder.id);
      assert.ok(stateMachine.nextAutoTransition);
      assert.strictEqual(stateMachine.nextAutoTransition.to, 'cancelled');
      assert.ok(stateMachine.nextAutoTransition.after > 0); // Should have timeout value

      // Simulate payment timeout (e.g., 30 minutes)
      await simulateTimeElapse(35); // 35 minutes

      // Process auto-transitions
      await mockOrderService.processAutoTransitions();

      // Verify order was auto-cancelled due to payment timeout
      const timeoutOrder = await mockDatabase.orders.findById(timeRuleOrder.id);
      assert.strictEqual(timeoutOrder.status, 'cancelled');

      // Verify timeout event was logged
      const events = await mockDatabase.orderEvents.findByOrderId(timeRuleOrder.id);
      const timeoutEvent = events.find((e: any) => 
        e.type === 'status_changed' && 
        e.newStatus === 'cancelled' && 
        e.data.reason === 'payment_timeout'
      );
      assert.ok(timeoutEvent, 'Payment timeout event should be logged');

      // Verify inventory was released
      const inventoryStatus = await mockInventoryService.getInventoryStatus(testProduct.id);
      // Note: This test assumes this is the only active reservation
      // In a real test, we'd track the specific reservation
      assert.ok(inventoryStatus.availableStock > 0);
    });
  });
});