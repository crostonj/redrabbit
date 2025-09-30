import { describe, it, before, after, beforeEach } from 'node:test';
import { strict as assert } from 'node:assert';
import { Express } from 'express';
import { z } from 'zod';

// This test will fail initially - no webhook services exist yet (TDD requirement)
describe('Integration Test: Webhook Delivery with Retry Mechanisms', () => {
  let app: Express;
  let mockDatabase: any;
  let mockWebhookService: any;
  let mockNotificationService: any;
  let mockEventBus: any;
  let mockHttpServer: any; // Mock webhook endpoint server
  let testWebhookEndpoints: any[];
  
  before(async () => {
    // TODO: Import Express app and services when they exist
    // app = await import('../../src/server.js').then(m => m.app);
    // mockWebhookService = await import('../../src/services/WebhookService.js');
    throw new Error('Webhook services not implemented yet - this test MUST fail initially (TDD)');
  });

  beforeEach(async () => {
    // Reset all mocks and test environment before each test
    await resetTestEnvironment();
    await setupWebhookTestData();
    await startMockWebhookServer();
  });

  after(async () => {
    // Cleanup after all tests
    await stopMockWebhookServer();
    await cleanupTestEnvironment();
  });

  // Zod schema for webhook operations
  const WebhookEventSchema = z.object({
    id: z.string().uuid(),
    type: z.enum([
      'order.created',
      'order.updated', 
      'order.cancelled',
      'order.completed',
      'payment.processed',
      'payment.failed',
      'inventory.reserved',
      'inventory.released',
      'shipment.created',
      'shipment.delivered'
    ]),
    data: z.record(z.any()),
    timestamp: z.string().datetime(),
    version: z.string().default('1.0'),
    idempotencyKey: z.string().uuid(),
    source: z.string().default('order-service'),
    metadata: z.object({
      orderId: z.string().uuid().optional(),
      customerId: z.string().uuid().optional(),
      correlationId: z.string().uuid().optional(),
      environment: z.enum(['development', 'staging', 'production', 'test']).default('test')
    }).optional()
  });

  const WebhookDeliverySchema = z.object({
    id: z.string().uuid(),
    eventId: z.string().uuid(),
    endpointId: z.string().uuid(),
    url: z.string().url(),
    method: z.enum(['POST', 'PUT', 'PATCH']).default('POST'),
    headers: z.record(z.string()),
    payload: z.string(), // JSON string
    status: z.enum(['pending', 'in_progress', 'delivered', 'failed', 'cancelled']),
    attempts: z.number().int().nonnegative().default(0),
    maxAttempts: z.number().int().positive().default(5),
    nextAttemptAt: z.string().datetime().optional(),
    lastAttemptAt: z.string().datetime().optional(),
    responseStatus: z.number().int().optional(),
    responseBody: z.string().optional(),
    responseHeaders: z.record(z.string()).optional(),
    createdAt: z.string().datetime(),
    deliveredAt: z.string().datetime().optional(),
    failedAt: z.string().datetime().optional(),
    errorMessage: z.string().optional(),
    timeout: z.number().int().positive().default(30000), // 30 seconds
    retryBackoff: z.enum(['linear', 'exponential', 'fixed']).default('exponential')
  });

  const WebhookEndpointSchema = z.object({
    id: z.string().uuid(),
    customerId: z.string().uuid().optional(), // Optional for system endpoints
    url: z.string().url(),
    method: z.enum(['POST', 'PUT', 'PATCH']).default('POST'),
    eventTypes: z.array(z.string()),
    headers: z.record(z.string()).optional(),
    secret: z.string().optional(), // For signature verification
    isActive: z.boolean().default(true),
    maxRetries: z.number().int().nonnegative().default(5),
    timeout: z.number().int().positive().default(30000),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    lastDeliveryAt: z.string().datetime().optional(),
    successfulDeliveries: z.number().int().nonnegative().default(0),
    failedDeliveries: z.number().int().nonnegative().default(0)
  });

  // Test data setup
  const testCustomer = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    email: 'webhook.test@example.com',
    name: 'Webhook Test Customer'
  };

  const testOrder = {
    id: '789e0123-e89b-12d3-a456-426614174001',
    customerId: testCustomer.id,
    status: 'confirmed',
    totalAmount: 12500, // $125.00
    items: [
      {
        productId: '456e7890-e89b-12d3-a456-426614174002',
        name: 'Test Product',
        quantity: 2,
        unitPriceCents: 5000,
        totalPriceCents: 10000
      }
    ]
  };

  // Helper functions
  async function resetTestEnvironment() {
    // Reset webhook delivery queue
    // Clear event log
    // Reset mock servers
    testWebhookEndpoints = [];
  }

  async function cleanupTestEnvironment() {
    // Clean up test data
    // Close connections
  }

  async function setupWebhookTestData() {
    // Insert test customer
    await mockDatabase.customers.insert(testCustomer);
    
    // Insert test order
    await mockDatabase.orders.insert(testOrder);
    
    // Setup test webhook endpoints
    testWebhookEndpoints = [
      {
        id: 'endpoint-001',
        customerId: testCustomer.id,
        url: 'http://localhost:3001/webhooks/order-events',
        method: 'POST',
        eventTypes: ['order.created', 'order.updated', 'order.completed'],
        secret: 'test-webhook-secret-123',
        isActive: true,
        maxRetries: 3,
        timeout: 15000
      },
      {
        id: 'endpoint-002',
        customerId: testCustomer.id,
        url: 'http://localhost:3001/webhooks/payment-events',
        method: 'POST',
        eventTypes: ['payment.processed', 'payment.failed'],
        secret: 'test-payment-secret-456',
        isActive: true,
        maxRetries: 5,
        timeout: 20000
      },
      {
        id: 'endpoint-003',
        customerId: testCustomer.id,
        url: 'http://localhost:3002/inventory-updates', // Different server (will fail)
        method: 'PUT',
        eventTypes: ['inventory.reserved', 'inventory.released'],
        isActive: true,
        maxRetries: 2,
        timeout: 10000
      }
    ];

    // Register endpoints in mock database
    for (const endpoint of testWebhookEndpoints) {
      await mockDatabase.webhookEndpoints.insert(endpoint);
    }
  }

  async function startMockWebhookServer() {
    // Start mock HTTP server to simulate webhook endpoints
    mockHttpServer = {
      port: 3001,
      receivedWebhooks: [],
      responses: new Map(), // url -> {status, body, headers, delay}
      
      // Configure response for specific URL
      setResponse: (url: string, response: any) => {
        mockHttpServer.responses.set(url, response);
      },
      
      // Get received webhooks
      getReceivedWebhooks: () => mockHttpServer.receivedWebhooks,
      
      // Clear received webhooks
      clearReceivedWebhooks: () => {
        mockHttpServer.receivedWebhooks = [];
      },
      
      // Simulate server response
      simulateRequest: async (url: string, payload: any, headers: any) => {
        const response = mockHttpServer.responses.get(url);
        
        // Record the webhook
        mockHttpServer.receivedWebhooks.push({
          url,
          payload,
          headers,
          timestamp: new Date().toISOString()
        });
        
        // Simulate network delay
        if (response?.delay) {
          await new Promise(resolve => setTimeout(resolve, response.delay));
        }
        
        // Return configured response or default success
        return response || { status: 200, body: 'OK', headers: {} };
      }
    };
    
    // Configure default successful responses
    mockHttpServer.setResponse('http://localhost:3001/webhooks/order-events', {
      status: 200,
      body: JSON.stringify({ received: true }),
      headers: { 'Content-Type': 'application/json' }
    });
    
    mockHttpServer.setResponse('http://localhost:3001/webhooks/payment-events', {
      status: 200,
      body: JSON.stringify({ received: true }),
      headers: { 'Content-Type': 'application/json' }
    });
  }

  async function stopMockWebhookServer() {
    // Cleanup mock server
    if (mockHttpServer) {
      mockHttpServer = null;
    }
  }

  async function createTestEvent(type: string, data: any, metadata?: any) {
    const event = {
      id: `event_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type,
      data,
      timestamp: new Date().toISOString(),
      version: '1.0',
      idempotencyKey: `idem_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      source: 'order-service',
      metadata: {
        orderId: testOrder.id,
        customerId: testCustomer.id,
        correlationId: `corr_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        environment: 'test' as const,
        ...metadata
      }
    };

    // Validate event
    const validatedEvent = WebhookEventSchema.parse(event);
    
    // Store event in mock database
    await mockDatabase.webhookEvents.insert(validatedEvent);
    
    return validatedEvent;
  }

  async function verifyWebhookDelivery(eventId: string, endpointId: string, expectedStatus: string) {
    const delivery = await mockDatabase.webhookDeliveries.findByEventAndEndpoint(eventId, endpointId);
    assert.ok(delivery, `Webhook delivery should exist for event ${eventId} and endpoint ${endpointId}`);
    
    const validatedDelivery = WebhookDeliverySchema.parse(delivery);
    assert.strictEqual(validatedDelivery.status, expectedStatus);
    
    return validatedDelivery;
  }

  async function waitForWebhookDelivery(eventId: string, endpointId: string, maxWaitMs: number = 5000) {
    const startTime = Date.now();
    
    while (Date.now() - startTime < maxWaitMs) {
      const delivery = await mockDatabase.webhookDeliveries.findByEventAndEndpoint(eventId, endpointId);
      if (delivery && delivery.status !== 'pending' && delivery.status !== 'in_progress') {
        return delivery;
      }
      await new Promise(resolve => setTimeout(resolve, 100)); // Wait 100ms
    }
    
    throw new Error(`Webhook delivery timeout after ${maxWaitMs}ms`);
  }

  describe('Successful Webhook Deliveries', () => {
    it('should deliver webhook for order creation event', async () => {
      // Create order creation event
      const event = await createTestEvent('order.created', {
        orderId: testOrder.id,
        customerId: testOrder.customerId,
        status: testOrder.status,
        totalAmount: testOrder.totalAmount,
        items: testOrder.items
      });

      // Trigger webhook delivery
      const deliveryResults = await mockWebhookService.deliverWebhooks(event);
      
      // Should have attempted delivery to order events endpoint
      const orderEndpoint = testWebhookEndpoints.find(e => e.eventTypes.includes('order.created'));
      assert.ok(orderEndpoint);
      
      // Verify delivery was created and successful
      const delivery = await verifyWebhookDelivery(event.id, orderEndpoint.id, 'delivered');
      
      // Verify delivery details
      assert.strictEqual(delivery.url, orderEndpoint.url);
      assert.strictEqual(delivery.method, 'POST');
      assert.strictEqual(delivery.responseStatus, 200);
      assert.ok(delivery.deliveredAt);
      assert.strictEqual(delivery.attempts, 1);
      
      // Verify payload structure
      const payload = JSON.parse(delivery.payload);
      assert.strictEqual(payload.type, 'order.created');
      assert.strictEqual(payload.data.orderId, testOrder.id);
      assert.ok(payload.timestamp);
      assert.ok(payload.idempotencyKey);
      
      // Verify signature header is present (if secret configured)
      if (orderEndpoint.secret) {
        assert.ok(delivery.headers['X-Webhook-Signature']);
      }
      
      // Verify webhook was actually received by mock server
      const receivedWebhooks = mockHttpServer.getReceivedWebhooks();
      const matchingWebhook = receivedWebhooks.find((w: any) => 
        w.url === orderEndpoint.url && 
        JSON.parse(w.payload).data.orderId === testOrder.id
      );
      assert.ok(matchingWebhook, 'Mock server should have received webhook');
    });

    it('should deliver webhooks to multiple endpoints for same event', async () => {
      // Create payment processed event (matches two endpoints)
      const event = await createTestEvent('payment.processed', {
        orderId: testOrder.id,
        paymentId: 'payment_123',
        amount: testOrder.totalAmount,
        currency: 'USD',
        processor: 'stripe'
      });

      // Trigger webhook delivery
      await mockWebhookService.deliverWebhooks(event);
      
      // Should deliver to payment events endpoint only
      const paymentEndpoint = testWebhookEndpoints.find(e => e.eventTypes.includes('payment.processed'));
      assert.ok(paymentEndpoint);
      
      // Wait for delivery completion
      const delivery = await waitForWebhookDelivery(event.id, paymentEndpoint.id);
      
      // Verify successful delivery
      const validatedDelivery = WebhookDeliverySchema.parse(delivery);
      assert.strictEqual(validatedDelivery.status, 'delivered');
      assert.strictEqual(validatedDelivery.responseStatus, 200);
      
      // Verify no delivery to other endpoints
      const orderEndpoint = testWebhookEndpoints.find(e => e.id === 'endpoint-001');
      const orderDelivery = await mockDatabase.webhookDeliveries.findByEventAndEndpoint(event.id, orderEndpoint!.id);
      assert.strictEqual(orderDelivery, null, 'Should not deliver to endpoints not matching event type');
    });

    it('should include proper webhook headers and signature', async () => {
      const event = await createTestEvent('order.updated', {
        orderId: testOrder.id,
        status: 'processing',
        updatedAt: new Date().toISOString()
      });

      await mockWebhookService.deliverWebhooks(event);
      
      const orderEndpoint = testWebhookEndpoints.find(e => e.eventTypes.includes('order.updated'));
      const delivery = await waitForWebhookDelivery(event.id, orderEndpoint!.id);
      
      // Verify standard headers are included
      assert.strictEqual(delivery.headers['Content-Type'], 'application/json');
      assert.ok(delivery.headers['User-Agent']);
      assert.ok(delivery.headers['X-Webhook-Id']);
      assert.ok(delivery.headers['X-Webhook-Timestamp']);
      assert.ok(delivery.headers['X-Webhook-Event-Type']);
      
      // Verify signature header (HMAC-SHA256)
      if (orderEndpoint!.secret) {
        assert.ok(delivery.headers['X-Webhook-Signature']);
        assert.match(delivery.headers['X-Webhook-Signature'], /^sha256=/);
        
        // Verify signature is valid
        const expectedSignature = await mockWebhookService.generateSignature(
          delivery.payload,
          orderEndpoint!.secret
        );
        assert.strictEqual(delivery.headers['X-Webhook-Signature'], expectedSignature);
      }
      
      // Verify custom headers from endpoint configuration
      if (orderEndpoint!.headers) {
        Object.entries(orderEndpoint!.headers).forEach(([key, value]) => {
          assert.strictEqual(delivery.headers[key], value);
        });
      }
    });

    it('should handle different HTTP methods correctly', async () => {
      // Test PUT method for inventory endpoint
      const event = await createTestEvent('inventory.reserved', {
        orderId: testOrder.id,
        items: testOrder.items.map(item => ({
          productId: item.productId,
          quantity: item.quantity,
          reservedAt: new Date().toISOString()
        }))
      });

      // Configure mock server to expect PUT request
      const inventoryEndpoint = testWebhookEndpoints.find(e => e.method === 'PUT');
      mockHttpServer.setResponse(inventoryEndpoint!.url, {
        status: 201,
        body: JSON.stringify({ updated: true }),
        headers: { 'Content-Type': 'application/json' }
      });

      await mockWebhookService.deliverWebhooks(event);
      
      const delivery = await waitForWebhookDelivery(event.id, inventoryEndpoint!.id);
      
      // Verify PUT method was used
      assert.strictEqual(delivery.method, 'PUT');
      assert.strictEqual(delivery.responseStatus, 201);
      
      // Verify mock server received PUT request
      const receivedWebhooks = mockHttpServer.getReceivedWebhooks();
      const matchingWebhook = receivedWebhooks.find((w: any) => w.url === inventoryEndpoint!.url);
      assert.ok(matchingWebhook, 'Should have received webhook with PUT method');
    });
  });

  describe('Webhook Retry Mechanisms', () => {
    beforeEach(() => {
      // Configure endpoints to initially fail
      mockHttpServer.setResponse('http://localhost:3001/webhooks/order-events', {
        status: 500,
        body: 'Internal Server Error',
        headers: {}
      });
    });

    it('should retry failed webhook deliveries with exponential backoff', async () => {
      const event = await createTestEvent('order.created', {
        orderId: testOrder.id,
        customerId: testOrder.customerId
      });

      const orderEndpoint = testWebhookEndpoints.find(e => e.eventTypes.includes('order.created'));
      
      // Start delivery (will initially fail)
      await mockWebhookService.deliverWebhooks(event);
      
      // Verify first attempt failed
      let delivery = await waitForWebhookDelivery(event.id, orderEndpoint!.id);
      assert.strictEqual(delivery.status, 'failed');
      assert.strictEqual(delivery.attempts, 1);
      assert.strictEqual(delivery.responseStatus, 500);
      assert.ok(delivery.nextAttemptAt);
      
      // Configure server to succeed on retry
      mockHttpServer.setResponse('http://localhost:3001/webhooks/order-events', {
        status: 200,
        body: 'OK',
        headers: {}
      });
      
      // Simulate retry processing
      const retryDelay = new Date(delivery.nextAttemptAt).getTime() - Date.now();
      await new Promise(resolve => setTimeout(resolve, Math.max(retryDelay, 0) + 100));
      
      // Process retries
      const retryResults = await mockWebhookService.processRetries();
      
      // Verify retry succeeded
      delivery = await mockDatabase.webhookDeliveries.findByEventAndEndpoint(event.id, orderEndpoint!.id);
      assert.strictEqual(delivery.status, 'delivered');
      assert.strictEqual(delivery.attempts, 2);
      assert.strictEqual(delivery.responseStatus, 200);
      assert.ok(delivery.deliveredAt);
      
      // Verify exponential backoff was applied
      const firstRetryDelay = retryDelay;
      assert.ok(firstRetryDelay >= 1000, 'First retry should wait at least 1 second');
      assert.ok(firstRetryDelay <= 5000, 'First retry should not wait more than 5 seconds');
    });

    it('should stop retrying after max attempts reached', async () => {
      const event = await createTestEvent('order.created', { orderId: testOrder.id });
      const orderEndpoint = testWebhookEndpoints.find(e => e.eventTypes.includes('order.created'));
      
      // Ensure server always fails
      mockHttpServer.setResponse('http://localhost:3001/webhooks/order-events', {
        status: 503,
        body: 'Service Unavailable',
        headers: {}
      });

      // Start initial delivery
      await mockWebhookService.deliverWebhooks(event);
      
      // Process all retry attempts
      const maxAttempts = orderEndpoint!.maxRetries + 1; // Initial + retries
      
      for (let attempt = 1; attempt < maxAttempts; attempt++) {
        const delivery = await mockDatabase.webhookDeliveries.findByEventAndEndpoint(event.id, orderEndpoint!.id);
        
        if (delivery.nextAttemptAt && delivery.attempts < maxAttempts) {
          // Wait for retry time
          const retryDelay = new Date(delivery.nextAttemptAt).getTime() - Date.now();
          await new Promise(resolve => setTimeout(resolve, Math.max(retryDelay, 0) + 100));
          
          // Process retry
          await mockWebhookService.processRetries();
        }
      }
      
      // Verify final state
      const finalDelivery = await mockDatabase.webhookDeliveries.findByEventAndEndpoint(event.id, orderEndpoint!.id);
      assert.strictEqual(finalDelivery.status, 'failed');
      assert.strictEqual(finalDelivery.attempts, maxAttempts);
      assert.ok(finalDelivery.failedAt);
      assert.strictEqual(finalDelivery.nextAttemptAt, null, 'Should not schedule more retries after max attempts');
      
      // Verify error message is recorded
      assert.ok(finalDelivery.errorMessage);
      assert.match(finalDelivery.errorMessage, /max.*attempts|retry.*limit/i);
    });

    it('should handle different retry strategies', async () => {
      // Test linear backoff strategy
      const event = await createTestEvent('inventory.reserved', { orderId: testOrder.id });
      
      // Update inventory endpoint to use linear backoff
      const inventoryEndpoint = testWebhookEndpoints.find(e => e.eventTypes.includes('inventory.reserved'));
      await mockDatabase.webhookEndpoints.update(inventoryEndpoint!.id, {
        retryBackoff: 'linear'
      });
      
      // Configure to fail initially
      mockHttpServer.setResponse(inventoryEndpoint!.url, {
        status: 502,
        body: 'Bad Gateway',
        headers: {}
      });

      await mockWebhookService.deliverWebhooks(event);
      
      // Get first retry time
      let delivery = await waitForWebhookDelivery(event.id, inventoryEndpoint!.id);
      const firstRetryTime = new Date(delivery.nextAttemptAt!).getTime() - Date.now();
      
      // Process first retry
      await new Promise(resolve => setTimeout(resolve, firstRetryTime + 100));
      await mockWebhookService.processRetries();
      
      // Get second retry time
      delivery = await mockDatabase.webhookDeliveries.findByEventAndEndpoint(event.id, inventoryEndpoint!.id);
      const secondRetryTime = new Date(delivery.nextAttemptAt!).getTime() - Date.now();
      
      // With linear backoff, intervals should be similar (not exponential)
      const retryRatio = secondRetryTime / firstRetryTime;
      assert.ok(retryRatio >= 0.8 && retryRatio <= 2.0, 'Linear backoff should have consistent intervals');
      
      // Test fixed backoff
      await mockDatabase.webhookEndpoints.update(inventoryEndpoint!.id, {
        retryBackoff: 'fixed'
      });
      
      // Create another event to test fixed backoff
      const event2 = await createTestEvent('inventory.released', { orderId: testOrder.id });
      await mockWebhookService.deliverWebhooks(event2);
      
      const fixedDelivery = await waitForWebhookDelivery(event2.id, inventoryEndpoint!.id);
      const fixedRetryTime = new Date(fixedDelivery.nextAttemptAt!).getTime() - Date.now();
      
      // Fixed backoff should use a consistent interval
      assert.ok(fixedRetryTime >= 2000 && fixedRetryTime <= 4000, 'Fixed backoff should use consistent interval');
    });

    it('should handle temporary network timeouts and retry', async () => {
      const event = await createTestEvent('payment.failed', {
        orderId: testOrder.id,
        paymentId: 'payment_failed_123',
        error: 'Card declined'
      });

      const paymentEndpoint = testWebhookEndpoints.find(e => e.eventTypes.includes('payment.failed'));
      
      // Configure server to simulate timeout (delay longer than endpoint timeout)
      mockHttpServer.setResponse('http://localhost:3001/webhooks/payment-events', {
        status: 200,
        body: 'OK',
        headers: {},
        delay: paymentEndpoint!.timeout + 1000 // Longer than timeout
      });

      await mockWebhookService.deliverWebhooks(event);
      
      // Verify initial delivery timed out
      let delivery = await waitForWebhookDelivery(event.id, paymentEndpoint!.id);
      assert.strictEqual(delivery.status, 'failed');
      assert.match(delivery.errorMessage!, /timeout|timed.*out/i);
      
      // Remove delay for retry
      mockHttpServer.setResponse('http://localhost:3001/webhooks/payment-events', {
        status: 200,
        body: 'OK',
        headers: {}
      });
      
      // Process retry
      const retryDelay = new Date(delivery.nextAttemptAt!).getTime() - Date.now();
      await new Promise(resolve => setTimeout(resolve, Math.max(retryDelay, 0) + 100));
      await mockWebhookService.processRetries();
      
      // Verify retry succeeded
      delivery = await mockDatabase.webhookDeliveries.findByEventAndEndpoint(event.id, paymentEndpoint!.id);
      assert.strictEqual(delivery.status, 'delivered');
      assert.strictEqual(delivery.attempts, 2);
      assert.ok(delivery.deliveredAt);
    });
  });

  describe('Webhook Failure Handling', () => {
    it('should handle endpoint not found errors gracefully', async () => {
      const event = await createTestEvent('order.completed', { orderId: testOrder.id });
      
      // Configure 404 response
      mockHttpServer.setResponse('http://localhost:3001/webhooks/order-events', {
        status: 404,
        body: 'Not Found',
        headers: {}
      });

      await mockWebhookService.deliverWebhooks(event);
      
      const orderEndpoint = testWebhookEndpoints.find(e => e.eventTypes.includes('order.completed'));
      const delivery = await waitForWebhookDelivery(event.id, orderEndpoint!.id);
      
      // Should mark as failed without retries for 404
      assert.strictEqual(delivery.status, 'failed');
      assert.strictEqual(delivery.attempts, 1);
      assert.strictEqual(delivery.responseStatus, 404);
      assert.strictEqual(delivery.nextAttemptAt, null, 'Should not retry 404 errors');
      assert.ok(delivery.failedAt);
      
      // Verify error categorization
      assert.match(delivery.errorMessage!, /not.*found|endpoint.*unavailable/i);
    });

    it('should handle malformed response data appropriately', async () => {
      const event = await createTestEvent('order.updated', { orderId: testOrder.id });
      
      // Configure response with invalid JSON
      mockHttpServer.setResponse('http://localhost:3001/webhooks/order-events', {
        status: 200,
        body: 'Invalid JSON Response {broken',
        headers: { 'Content-Type': 'application/json' }
      });

      await mockWebhookService.deliverWebhooks(event);
      
      const orderEndpoint = testWebhookEndpoints.find(e => e.eventTypes.includes('order.updated'));
      const delivery = await waitForWebhookDelivery(event.id, orderEndpoint!.id);
      
      // Should still be considered delivered if status is 2xx
      assert.strictEqual(delivery.status, 'delivered');
      assert.strictEqual(delivery.responseStatus, 200);
      assert.ok(delivery.deliveredAt);
      
      // Should record the response body even if malformed
      assert.strictEqual(delivery.responseBody, 'Invalid JSON Response {broken');
    });

    it('should disable endpoints after consecutive failures', async () => {
      const event = await createTestEvent('order.created', { orderId: testOrder.id });
      
      const orderEndpoint = testWebhookEndpoints.find(e => e.eventTypes.includes('order.created'));
      
      // Configure to always fail
      mockHttpServer.setResponse('http://localhost:3001/webhooks/order-events', {
        status: 500,
        body: 'Server Error',
        headers: {}
      });

      // Create multiple events to trigger consecutive failures
      const events = [];
      for (let i = 0; i < 10; i++) {
        const evt = await createTestEvent('order.created', {
          orderId: `order_${i}`,
          customerId: testCustomer.id
        });
        events.push(evt);
        await mockWebhookService.deliverWebhooks(evt);
      }
      
      // Process all retries for each event
      for (let attempt = 0; attempt < orderEndpoint!.maxRetries; attempt++) {
        await new Promise(resolve => setTimeout(resolve, 2000)); // Wait for retry interval
        await mockWebhookService.processRetries();
      }
      
      // Verify endpoint is disabled after consecutive failures
      const updatedEndpoint = await mockDatabase.webhookEndpoints.findById(orderEndpoint!.id);
      assert.strictEqual(updatedEndpoint.isActive, false, 'Endpoint should be disabled after consecutive failures');
      
      // Verify failure metrics
      assert.ok(updatedEndpoint.failedDeliveries >= 10);
      assert.strictEqual(updatedEndpoint.successfulDeliveries, 0);
      
      // Create new event - should not attempt delivery to disabled endpoint
      const newEvent = await createTestEvent('order.created', { orderId: 'final_test_order' });
      await mockWebhookService.deliverWebhooks(newEvent);
      
      const deliveries = await mockDatabase.webhookDeliveries.findByEventId(newEvent.id);
      const disabledEndpointDelivery = deliveries.find((d: any) => d.endpointId === orderEndpoint!.id);
      assert.strictEqual(disabledEndpointDelivery, undefined, 'Should not create deliveries for disabled endpoints');
    });

    it('should handle DNS and connection errors', async () => {
      // Create endpoint with invalid URL
      const invalidEndpoint = {
        id: 'invalid-endpoint',
        customerId: testCustomer.id,
        url: 'http://nonexistent-domain-12345.com/webhook',
        method: 'POST' as const,
        eventTypes: ['order.created'],
        isActive: true,
        maxRetries: 2,
        timeout: 5000
      };
      
      await mockDatabase.webhookEndpoints.insert(invalidEndpoint);
      
      const event = await createTestEvent('order.created', { orderId: testOrder.id });
      
      // Configure mock to simulate DNS/connection error
      mockHttpServer.simulateConnectionError = true;
      
      await mockWebhookService.deliverWebhooks(event);
      
      const delivery = await waitForWebhookDelivery(event.id, invalidEndpoint.id);
      
      // Verify connection error handling
      assert.strictEqual(delivery.status, 'failed');
      assert.ok(delivery.errorMessage);
      assert.match(delivery.errorMessage, /connection.*failed|dns.*error|network.*error/i);
      assert.strictEqual(delivery.responseStatus, null, 'Should not have response status for connection errors');
      assert.ok(delivery.nextAttemptAt, 'Should retry connection errors');
    });
  });

  describe('Webhook Performance and Concurrency', () => {
    it('should handle concurrent webhook deliveries efficiently', async () => {
      const concurrentEvents = 20;
      const events = [];
      
      // Create multiple concurrent events
      for (let i = 0; i < concurrentEvents; i++) {
        const event = await createTestEvent('order.created', {
          orderId: `concurrent_order_${i}`,
          customerId: testCustomer.id,
          amount: 1000 + i
        });
        events.push(event);
      }
      
      const startTime = Date.now();
      
      // Deliver all webhooks concurrently
      const deliveryPromises = events.map(event => mockWebhookService.deliverWebhooks(event));
      await Promise.all(deliveryPromises);
      
      const duration = Date.now() - startTime;
      
      // Verify all deliveries completed within reasonable time
      assert.ok(duration < 10000, `Concurrent deliveries took ${duration}ms, should complete under 10 seconds`);
      
      // Verify all deliveries were successful
      const orderEndpoint = testWebhookEndpoints.find(e => e.eventTypes.includes('order.created'));
      
      for (const event of events) {
        const delivery = await mockDatabase.webhookDeliveries.findByEventAndEndpoint(event.id, orderEndpoint!.id);
        assert.strictEqual(delivery.status, 'delivered', `Delivery for event ${event.id} should be successful`);
        assert.strictEqual(delivery.responseStatus, 200);
      }
      
      // Verify mock server received all webhooks
      const receivedWebhooks = mockHttpServer.getReceivedWebhooks();
      assert.strictEqual(receivedWebhooks.length, concurrentEvents, 'Should receive all concurrent webhooks');
    });

    it('should respect rate limits and queue deliveries', async () => {
      // Configure webhook service with rate limiting
      await mockWebhookService.configureRateLimit({
        maxConcurrent: 5,
        perSecondLimit: 10,
        burstLimit: 15
      });
      
      const highVolumeEvents = 30;
      const events = [];
      
      // Create many events quickly
      for (let i = 0; i < highVolumeEvents; i++) {
        const event = await createTestEvent('order.updated', {
          orderId: `rate_limit_order_${i}`,
          status: 'processing'
        });
        events.push(event);
      }
      
      const startTime = Date.now();
      
      // Deliver all at once (should be rate limited)
      const deliveryPromises = events.map(event => mockWebhookService.deliverWebhooks(event));
      await Promise.all(deliveryPromises);
      
      const duration = Date.now() - startTime;
      
      // Should take longer due to rate limiting
      assert.ok(duration >= 2000, 'Rate limiting should slow down high-volume deliveries');
      
      // Verify deliveries were queued and processed
      const orderEndpoint = testWebhookEndpoints.find(e => e.eventTypes.includes('order.updated'));
      
      let completedDeliveries = 0;
      for (const event of events) {
        const delivery = await mockDatabase.webhookDeliveries.findByEventAndEndpoint(event.id, orderEndpoint!.id);
        if (delivery.status === 'delivered') {
          completedDeliveries++;
        }
      }
      
      assert.ok(completedDeliveries >= highVolumeEvents * 0.8, 'At least 80% of deliveries should complete');
    });

    it('should maintain delivery order for sequential events', async () => {
      const sequentialEvents = [];
      
      // Create sequential order events
      for (let i = 0; i < 5; i++) {
        const event = await createTestEvent('order.updated', {
          orderId: testOrder.id,
          status: `status_${i}`,
          sequence: i,
          timestamp: new Date(Date.now() + i * 1000).toISOString()
        });
        sequentialEvents.push(event);
      }
      
      // Deliver events with guaranteed ordering
      for (const event of sequentialEvents) {
        await mockWebhookService.deliverWebhooks(event);
        await new Promise(resolve => setTimeout(resolve, 100)); // Small delay between deliveries
      }
      
      // Verify delivery order matches event order
      const receivedWebhooks = mockHttpServer.getReceivedWebhooks()
        .filter((w: any) => w.url.includes('order-events'))
        .sort((a: any, b: any) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
      
      assert.strictEqual(receivedWebhooks.length, sequentialEvents.length);
      
      for (let i = 0; i < sequentialEvents.length; i++) {
        const receivedPayload = JSON.parse(receivedWebhooks[i].payload);
        assert.strictEqual(receivedPayload.data.sequence, i, `Event ${i} should be delivered in order`);
      }
    });
  });

  describe('Webhook Security and Validation', () => {
    it('should generate and verify webhook signatures correctly', async () => {
      const event = await createTestEvent('order.completed', {
        orderId: testOrder.id,
        completedAt: new Date().toISOString()
      });

      await mockWebhookService.deliverWebhooks(event);
      
      const orderEndpoint = testWebhookEndpoints.find(e => e.eventTypes.includes('order.completed'));
      const delivery = await waitForWebhookDelivery(event.id, orderEndpoint!.id);
      
      // Extract signature from headers
      const signature = delivery.headers['X-Webhook-Signature'];
      assert.ok(signature);
      assert.match(signature, /^sha256=/);
      
      // Verify signature manually
      const expectedSignature = await mockWebhookService.generateSignature(
        delivery.payload,
        orderEndpoint!.secret!
      );
      assert.strictEqual(signature, expectedSignature);
      
      // Verify signature validation method
      const isValid = await mockWebhookService.verifySignature(
        delivery.payload,
        signature,
        orderEndpoint!.secret!
      );
      assert.strictEqual(isValid, true);
      
      // Test invalid signature detection
      const invalidSignature = 'sha256=invalid_signature_hash';
      const isInvalid = await mockWebhookService.verifySignature(
        delivery.payload,
        invalidSignature,
        orderEndpoint!.secret!
      );
      assert.strictEqual(isInvalid, false);
    });

    it('should prevent replay attacks with timestamp validation', async () => {
      const event = await createTestEvent('payment.processed', {
        orderId: testOrder.id,
        paymentId: 'payment_secure_123'
      });

      await mockWebhookService.deliverWebhooks(event);
      
      const paymentEndpoint = testWebhookEndpoints.find(e => e.eventTypes.includes('payment.processed'));
      const delivery = await waitForWebhookDelivery(event.id, paymentEndpoint!.id);
      
      // Verify timestamp header is present and recent
      const timestampHeader = delivery.headers['X-Webhook-Timestamp'];
      assert.ok(timestampHeader);
      
      const timestamp = parseInt(timestampHeader);
      const now = Math.floor(Date.now() / 1000);
      const timeDiff = Math.abs(now - timestamp);
      
      assert.ok(timeDiff < 60, 'Timestamp should be recent (within 60 seconds)');
      
      // Test timestamp validation
      const isValidTimestamp = await mockWebhookService.validateTimestamp(timestamp, 300); // 5 minute tolerance
      assert.strictEqual(isValidTimestamp, true);
      
      // Test old timestamp rejection
      const oldTimestamp = now - 3600; // 1 hour ago
      const isOldTimestamp = await mockWebhookService.validateTimestamp(oldTimestamp, 300);
      assert.strictEqual(isOldTimestamp, false);
    });

    it('should sanitize and validate webhook payloads', async () => {
      // Create event with potentially problematic data
      const event = await createTestEvent('order.created', {
        orderId: testOrder.id,
        customerNote: '<script>alert("xss")</script>',
        metadata: {
          userInput: '"; DROP TABLE orders; --',
          specialChars: 'üñíç∅dé & symbols!@#$%^&*()',
          largeText: 'x'.repeat(10000)
        }
      });

      await mockWebhookService.deliverWebhooks(event);
      
      const orderEndpoint = testWebhookEndpoints.find(e => e.eventTypes.includes('order.created'));
      const delivery = await waitForWebhookDelivery(event.id, orderEndpoint!.id);
      
      // Verify payload was sanitized
      const payload = JSON.parse(delivery.payload);
      
      // Check that script tags are escaped or removed
      assert.ok(!payload.data.customerNote.includes('<script>'), 'Script tags should be sanitized');
      
      // Verify SQL injection attempts are handled
      assert.ok(payload.data.metadata.userInput, 'Data should be preserved but safe');
      
      // Verify special characters are properly encoded
      const receivedWebhook = mockHttpServer.getReceivedWebhooks()
        .find((w: any) => JSON.parse(w.payload).data.orderId === testOrder.id);
      
      assert.ok(receivedWebhook);
      
      // Payload should be valid JSON
      assert.doesNotThrow(() => JSON.parse(receivedWebhook.payload), 'Payload should be valid JSON');
      
      // Large text should be truncated or handled appropriately
      const parsedPayload = JSON.parse(receivedWebhook.payload);
      assert.ok(parsedPayload.data.metadata.largeText.length <= 5000, 'Large text should be truncated');
    });

    it('should enforce webhook endpoint authentication', async () => {
      // Configure endpoint that requires authentication
      const authenticatedEndpoint = {
        id: 'auth-endpoint',
        customerId: testCustomer.id,
        url: 'http://localhost:3001/webhooks/authenticated',
        method: 'POST' as const,
        eventTypes: ['order.created'],
        headers: {
          'Authorization': 'Bearer webhook-auth-token-123'
        },
        secret: 'auth-secret-456',
        isActive: true,
        maxRetries: 3,
        timeout: 15000
      };
      
      await mockDatabase.webhookEndpoints.insert(authenticatedEndpoint);
      
      // Configure mock server to verify authentication
      mockHttpServer.setResponse('http://localhost:3001/webhooks/authenticated', {
        status: 200,
        body: JSON.stringify({ authenticated: true }),
        headers: {},
        validateAuth: (headers: any) => {
          return headers['Authorization'] === 'Bearer webhook-auth-token-123';
        }
      });
      
      const event = await createTestEvent('order.created', { orderId: testOrder.id });
      await mockWebhookService.deliverWebhooks(event);
      
      const delivery = await waitForWebhookDelivery(event.id, authenticatedEndpoint.id);
      
      // Verify authentication header was included
      assert.strictEqual(delivery.headers['Authorization'], 'Bearer webhook-auth-token-123');
      
      // Verify delivery was successful
      assert.strictEqual(delivery.status, 'delivered');
      assert.strictEqual(delivery.responseStatus, 200);
      
      // Verify mock server received authenticated request
      const receivedWebhook = mockHttpServer.getReceivedWebhooks()
        .find((w: any) => w.url === authenticatedEndpoint.url);
      
      assert.ok(receivedWebhook);
      assert.strictEqual(receivedWebhook.headers['Authorization'], 'Bearer webhook-auth-token-123');
    });
  });
});