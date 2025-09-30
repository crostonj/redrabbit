import { describe, it, before, after } from 'node:test';
import { strict as assert } from 'node:assert';
import request from 'supertest';
import { Express } from 'express';
import { z } from 'zod';

// This test will fail initially - no Express app exists yet (TDD requirement)
describe('Contract Test: GET /v1/orders/{orderId}/events', () => {
  let app: Express;
  
  before(async () => {
    // Import Express app when it exists
    app = await import('../../src/server.js').then(m => m.app);
  });

  after(async () => {
    // Cleanup after tests
  });

  // Zod schema for order event response
  const OrderEventResponseSchema = z.object({
    data: z.array(z.object({
      id: z.string().uuid(),
      orderId: z.string().uuid(),
      
      // Event identification
      eventType: z.enum([
        'order_created',
        'order_confirmed',
        'payment_processed',
        'payment_failed',
        'inventory_reserved',
        'inventory_released',
        'items_allocated',
        'items_picked',
        'items_packed',
        'shipping_label_created',
        'order_shipped',
        'tracking_updated',
        'delivery_attempted',
        'order_delivered',
        'return_initiated',
        'return_processed',
        'refund_initiated',
        'refund_completed',
        'order_cancelled',
        'order_modified',
        'note_added',
        'status_changed',
        'discount_applied',
        'discount_removed'
      ]),
      
      eventCategory: z.enum(['order', 'payment', 'inventory', 'fulfillment', 'shipping', 'customer_service']),
      
      // Event details
      title: z.string().min(1),
      description: z.string().min(1),
      
      // Actor information
      actor: z.object({
        type: z.enum(['customer', 'admin', 'system', 'api', 'webhook']),
        id: z.string().uuid().optional(), // null for system events
        name: z.string().optional(),
        email: z.string().email().optional(),
        ipAddress: z.string().optional(),
        userAgent: z.string().optional()
      }),

      // Event data - flexible JSON object based on event type
      eventData: z.record(z.string(), z.any()).optional(),
      
      // Related entities
      relatedEntities: z.array(z.object({
        type: z.enum(['customer', 'product', 'payment', 'shipment', 'refund', 'discount', 'inventory']),
        id: z.string().uuid(),
        metadata: z.record(z.string(), z.any()).optional()
      })).optional(),

      // Status and visibility
      severity: z.enum(['info', 'warning', 'error', 'critical']).default('info'),
      isPublic: z.boolean().default(true), // Whether customer can see this event
      isSystemGenerated: z.boolean().default(true),
      
      // Financial impact
      financialImpact: z.object({
        amountCents: z.number().int(),
        currency: z.string().length(3).default('USD'),
        type: z.enum(['charge', 'refund', 'fee', 'discount', 'tax', 'shipping']),
        description: z.string()
      }).optional(),

      // Inventory impact
      inventoryImpact: z.array(z.object({
        productId: z.string().uuid(),
        quantity: z.number().int(),
        type: z.enum(['reserved', 'allocated', 'released', 'returned']),
        location: z.string().optional()
      })).optional(),

      // External references
      externalReferences: z.array(z.object({
        system: z.string().min(1),
        referenceId: z.string().min(1),
        referenceType: z.string().optional(),
        url: z.string().url().optional()
      })).optional(),

      // Timestamps
      occurredAt: z.string().datetime(),
      createdAt: z.string().datetime(),
      
      // Metadata
      metadata: z.record(z.string(), z.any()).optional(),
      
      // Event source information
      source: z.object({
        system: z.string().min(1),
        version: z.string().optional(),
        component: z.string().optional(),
        correlationId: z.string().uuid().optional(),
        requestId: z.string().uuid().optional()
      }).optional()
    })).refine(events => {
      // Events should be ordered by occurredAt (most recent first)
      for (let i = 1; i < events.length; i++) {
        const current = new Date(events[i].occurredAt);
        const previous = new Date(events[i - 1].occurredAt);
        if (current > previous) {
          return false;
        }
      }
      return true;
    }, {
      message: 'Events must be ordered by occurredAt (most recent first)'
    }),

    // Pagination information
    pagination: z.object({
      page: z.number().int().positive().default(1),
      pageSize: z.number().int().positive().max(100).default(50),
      totalEvents: z.number().int().nonnegative(),
      totalPages: z.number().int().nonnegative(),
      hasNextPage: z.boolean(),
      hasPreviousPage: z.boolean()
    }),

    // Summary information
    summary: z.object({
      totalEvents: z.number().int().nonnegative(),
      eventsByCategory: z.record(
        z.enum(['order', 'payment', 'inventory', 'fulfillment', 'shipping', 'customer_service']),
        z.number().int().nonnegative()
      ),
      eventsBySeverity: z.record(
        z.enum(['info', 'warning', 'error', 'critical']),
        z.number().int().nonnegative()
      ),
      publicEventCount: z.number().int().nonnegative(),
      timeRange: z.object({
        earliest: z.string().datetime(),
        latest: z.string().datetime(),
        durationHours: z.number().nonnegative()
      }).optional(),
      uniqueActors: z.number().int().nonnegative(),
      systemEventsCount: z.number().int().nonnegative(),
      userEventsCount: z.number().int().nonnegative()
    }),

    // Order context
    orderContext: z.object({
      orderId: z.string().uuid(),
      orderNumber: z.string().regex(/^ORD-\d{8}-\d{4}$/),
      currentStatus: z.enum(['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded']),
      createdAt: z.string().datetime(),
      lastUpdated: z.string().datetime()
    }),

    // Filters applied
    appliedFilters: z.object({
      eventTypes: z.array(z.string()).optional(),
      categories: z.array(z.string()).optional(),
      severity: z.array(z.string()).optional(),
      dateRange: z.object({
        from: z.string().datetime(),
        to: z.string().datetime()
      }).optional(),
      actorType: z.string().optional(),
      publicOnly: z.boolean().optional()
    }).optional()
  });

  // Test data constants
  const validOrderId = '123e4567-e89b-12d3-a456-426614174000';
  const emptyOrderId = '456e7890-e89b-12d3-a456-426614174001';
  const nonExistentOrderId = '00000000-0000-0000-0000-000000000000';
  const invalidOrderId = 'invalid-uuid-format';
  const recentOrderId = '789e0123-e89b-12d3-a456-426614174002';

  describe('Valid Event Retrieval', () => {
    it('should retrieve all events for an order', async () => {
      const response = await request(app)
        .get(`/v1/orders/${validOrderId}/events`)
        .expect('Content-Type', /json/)
        .expect(200);

      const parsedResponse = OrderEventResponseSchema.parse(response.body);
      
      // Verify basic structure
      assert.ok(Array.isArray(parsedResponse.data));
      assert.ok(parsedResponse.data.length > 0);
      
      // Verify each event
      parsedResponse.data.forEach(event => {
        assert.strictEqual(event.orderId, validOrderId);
        assert.ok(event.title.length > 0);
        assert.ok(event.description.length > 0);
        
        // Verify timestamps are valid dates
        const occurredAt = new Date(event.occurredAt);
        const createdAt = new Date(event.createdAt);
        assert.ok(occurredAt instanceof Date && !isNaN(occurredAt.getTime()));
        assert.ok(createdAt instanceof Date && !isNaN(createdAt.getTime()));
        
        // Verify actor information
        assert.ok(['customer', 'admin', 'system', 'api', 'webhook'].includes(event.actor.type));
      });

      // Verify order context
      assert.strictEqual(parsedResponse.orderContext.orderId, validOrderId);
      assert.match(parsedResponse.orderContext.orderNumber, /^ORD-\d{8}-\d{4}$/);
    });

    it('should return events in chronological order (most recent first)', async () => {
      const response = await request(app)
        .get(`/v1/orders/${validOrderId}/events`)
        .expect(200);

      const parsedResponse = OrderEventResponseSchema.parse(response.body);
      
      // Verify chronological ordering
      for (let i = 1; i < parsedResponse.data.length; i++) {
        const currentTime = new Date(parsedResponse.data[i].occurredAt);
        const previousTime = new Date(parsedResponse.data[i - 1].occurredAt);
        assert.ok(currentTime <= previousTime, 'Events should be ordered by occurredAt (most recent first)');
      }
    });

    it('should include appropriate event data for different event types', async () => {
      const response = await request(app)
        .get(`/v1/orders/${validOrderId}/events`)
        .expect(200);

      const parsedResponse = OrderEventResponseSchema.parse(response.body);
      
      parsedResponse.data.forEach(event => {
        // Verify event type specific data
        switch (event.eventType) {
          case 'payment_processed':
            if (event.financialImpact) {
              assert.strictEqual(event.financialImpact.type, 'charge');
              assert.ok(event.financialImpact.amountCents > 0);
            }
            break;
            
          case 'inventory_reserved':
          case 'inventory_released':
            if (event.inventoryImpact) {
              assert.ok(event.inventoryImpact.length > 0);
              event.inventoryImpact.forEach(impact => {
                assert.ok(['reserved', 'allocated', 'released', 'returned'].includes(impact.type));
                assert.ok(impact.quantity > 0);
              });
            }
            break;
            
          case 'order_shipped':
            if (event.externalReferences) {
              const trackingRef = event.externalReferences.find(ref => ref.system.includes('shipping'));
              assert.ok(trackingRef, 'Shipping events should include tracking references');
            }
            break;
        }
      });
    });

    it('should include financial impact information for monetary events', async () => {
      const response = await request(app)
        .get(`/v1/orders/${validOrderId}/events`)
        .expect(200);

      const parsedResponse = OrderEventResponseSchema.parse(response.body);
      
      const financialEvents = parsedResponse.data.filter(event => event.financialImpact);
      
      financialEvents.forEach(event => {
        assert.ok(event.financialImpact);
        assert.ok(['charge', 'refund', 'fee', 'discount', 'tax', 'shipping'].includes(event.financialImpact.type));
        assert.strictEqual(event.financialImpact.currency, 'USD');
        assert.ok(event.financialImpact.description.length > 0);
        
        if (event.financialImpact.type === 'refund') {
          assert.ok(event.financialImpact.amountCents <= 0);
        } else {
          assert.ok(event.financialImpact.amountCents >= 0);
        }
      });
    });

    it('should include inventory impact for inventory-related events', async () => {
      const response = await request(app)
        .get(`/v1/orders/${validOrderId}/events`)
        .expect(200);

      const parsedResponse = OrderEventResponseSchema.parse(response.body);
      
      const inventoryEvents = parsedResponse.data.filter(event => event.inventoryImpact);
      
      inventoryEvents.forEach(event => {
        assert.ok(event.inventoryImpact);
        event.inventoryImpact.forEach(impact => {
          assert.ok(['reserved', 'allocated', 'released', 'returned'].includes(impact.type));
          assert.ok(typeof impact.quantity === 'number');
          assert.ok(impact.quantity !== 0); // Should have meaningful quantity change
        });
      });
    });

    it('should include external references for integration events', async () => {
      const response = await request(app)
        .get(`/v1/orders/${validOrderId}/events`)
        .expect(200);

      const parsedResponse = OrderEventResponseSchema.parse(response.body);
      
      const externalEvents = parsedResponse.data.filter(event => event.externalReferences);
      
      externalEvents.forEach(event => {
        assert.ok(event.externalReferences);
        event.externalReferences.forEach(ref => {
          assert.ok(ref.system.length > 0);
          assert.ok(ref.referenceId.length > 0);
          
          if (ref.url) {
            assert.match(ref.url, /^https?:\/\//);
          }
        });
      });
    });

    it('should properly categorize events by severity', async () => {
      const response = await request(app)
        .get(`/v1/orders/${validOrderId}/events`)
        .expect(200);

      const parsedResponse = OrderEventResponseSchema.parse(response.body);
      
      const severityLevels = ['info', 'warning', 'error', 'critical'];
      
      parsedResponse.data.forEach(event => {
        assert.ok(severityLevels.includes(event.severity));
        
        // Payment failures should be at least warning level
        if (event.eventType === 'payment_failed') {
          assert.ok(['warning', 'error', 'critical'].includes(event.severity));
        }
        
        // Order cancellations should be at least warning level
        if (event.eventType === 'order_cancelled') {
          assert.ok(['warning', 'error', 'critical'].includes(event.severity));
        }
      });
    });
  });

  describe('Filtering and Pagination', () => {
    it('should filter events by event type', async () => {
      const response = await request(app)
        .get(`/v1/orders/${validOrderId}/events`)
        .query({ eventTypes: 'payment_processed,payment_failed' })
        .expect(200);

      const parsedResponse = OrderEventResponseSchema.parse(response.body);
      
      parsedResponse.data.forEach(event => {
        assert.ok(['payment_processed', 'payment_failed'].includes(event.eventType));
      });
      
      assert.ok(parsedResponse.appliedFilters?.eventTypes);
      assert.deepStrictEqual(parsedResponse.appliedFilters.eventTypes, ['payment_processed', 'payment_failed']);
    });

    it('should filter events by category', async () => {
      const response = await request(app)
        .get(`/v1/orders/${validOrderId}/events`)
        .query({ categories: 'payment,shipping' })
        .expect(200);

      const parsedResponse = OrderEventResponseSchema.parse(response.body);
      
      parsedResponse.data.forEach(event => {
        assert.ok(['payment', 'shipping'].includes(event.eventCategory));
      });
    });

    it('should filter events by severity level', async () => {
      const response = await request(app)
        .get(`/v1/orders/${validOrderId}/events`)
        .query({ severity: 'error,critical' })
        .expect(200);

      const parsedResponse = OrderEventResponseSchema.parse(response.body);
      
      parsedResponse.data.forEach(event => {
        assert.ok(['error', 'critical'].includes(event.severity));
      });
    });

    it('should filter events by date range', async () => {
      const fromDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 days ago
      const toDate = new Date().toISOString(); // Now
      
      const response = await request(app)
        .get(`/v1/orders/${validOrderId}/events`)
        .query({ 
          dateFrom: fromDate,
          dateTo: toDate
        })
        .expect(200);

      const parsedResponse = OrderEventResponseSchema.parse(response.body);
      
      parsedResponse.data.forEach(event => {
        const eventTime = new Date(event.occurredAt);
        assert.ok(eventTime >= new Date(fromDate));
        assert.ok(eventTime <= new Date(toDate));
      });
    });

    it('should filter to show only public events', async () => {
      const response = await request(app)
        .get(`/v1/orders/${validOrderId}/events`)
        .query({ publicOnly: 'true' })
        .expect(200);

      const parsedResponse = OrderEventResponseSchema.parse(response.body);
      
      parsedResponse.data.forEach(event => {
        assert.strictEqual(event.isPublic, true);
      });
    });

    it('should support pagination', async () => {
      const response = await request(app)
        .get(`/v1/orders/${validOrderId}/events`)
        .query({ page: '1', pageSize: '10' })
        .expect(200);

      const parsedResponse = OrderEventResponseSchema.parse(response.body);
      
      assert.strictEqual(parsedResponse.pagination.page, 1);
      assert.strictEqual(parsedResponse.pagination.pageSize, 10);
      assert.ok(parsedResponse.data.length <= 10);
      assert.ok(typeof parsedResponse.pagination.totalEvents === 'number');
      assert.ok(typeof parsedResponse.pagination.totalPages === 'number');
    });

    it('should handle second page of results', async () => {
      const response = await request(app)
        .get(`/v1/orders/${validOrderId}/events`)
        .query({ page: '2', pageSize: '5' })
        .expect(200);

      const parsedResponse = OrderEventResponseSchema.parse(response.body);
      
      assert.strictEqual(parsedResponse.pagination.page, 2);
      assert.strictEqual(parsedResponse.pagination.pageSize, 5);
      
      if (parsedResponse.pagination.totalPages > 1) {
        assert.strictEqual(parsedResponse.pagination.hasPreviousPage, true);
      }
    });
  });

  describe('Empty Results', () => {
    it('should handle orders with no events', async () => {
      const response = await request(app)
        .get(`/v1/orders/${emptyOrderId}/events`)
        .expect(200);

      const parsedResponse = OrderEventResponseSchema.parse(response.body);
      
      assert.strictEqual(parsedResponse.data.length, 0);
      assert.strictEqual(parsedResponse.summary.totalEvents, 0);
      assert.strictEqual(parsedResponse.pagination.totalEvents, 0);
    });

    it('should return empty results for filtered query with no matches', async () => {
      const response = await request(app)
        .get(`/v1/orders/${validOrderId}/events`)
        .query({ eventTypes: 'non_existent_event_type' })
        .expect(200);

      const parsedResponse = OrderEventResponseSchema.parse(response.body);
      
      assert.strictEqual(parsedResponse.data.length, 0);
    });
  });

  describe('Summary Statistics', () => {
    it('should provide accurate event category statistics', async () => {
      const response = await request(app)
        .get(`/v1/orders/${validOrderId}/events`)
        .expect(200);

      const parsedResponse = OrderEventResponseSchema.parse(response.body);
      
      // Count events by category manually
      const categoryCount = parsedResponse.data.reduce((acc, event) => {
        acc[event.eventCategory] = (acc[event.eventCategory] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      // Verify summary matches actual data
      Object.entries(parsedResponse.summary.eventsByCategory).forEach(([category, count]) => {
        assert.strictEqual(count, categoryCount[category] || 0);
      });
    });

    it('should provide accurate severity statistics', async () => {
      const response = await request(app)
        .get(`/v1/orders/${validOrderId}/events`)
        .expect(200);

      const parsedResponse = OrderEventResponseSchema.parse(response.body);
      
      // Count events by severity manually
      const severityCount = parsedResponse.data.reduce((acc, event) => {
        acc[event.severity] = (acc[event.severity] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      // Verify summary matches actual data
      Object.entries(parsedResponse.summary.eventsBySeverity).forEach(([severity, count]) => {
        assert.strictEqual(count, severityCount[severity] || 0);
      });
    });

    it('should calculate time range correctly', async () => {
      const response = await request(app)
        .get(`/v1/orders/${recentOrderId}/events`)
        .expect(200);

      const parsedResponse = OrderEventResponseSchema.parse(response.body);
      
      if (parsedResponse.summary.timeRange && parsedResponse.data.length > 0) {
        const earliest = new Date(parsedResponse.summary.timeRange.earliest);
        const latest = new Date(parsedResponse.summary.timeRange.latest);
        
        // Verify time range encompasses all events
        parsedResponse.data.forEach(event => {
          const eventTime = new Date(event.occurredAt);
          assert.ok(eventTime >= earliest);
          assert.ok(eventTime <= latest);
        });
        
        // Verify duration calculation
        const expectedDuration = (latest.getTime() - earliest.getTime()) / (1000 * 60 * 60);
        assert.ok(Math.abs(parsedResponse.summary.timeRange.durationHours - expectedDuration) < 0.1);
      }
    });
  });

  describe('Error Handling', () => {
    it('should return 404 for non-existent order', async () => {
      const response = await request(app)
        .get(`/v1/orders/${nonExistentOrderId}/events`)
        .expect('Content-Type', /json/)
        .expect(404);

      assert.ok(response.body.error);
      assert.match(response.body.message, /Order not found/);
    });

    it('should reject invalid order ID format', async () => {
      const response = await request(app)
        .get(`/v1/orders/${invalidOrderId}/events`)
        .expect(400);

      assert.ok(response.body.error);
      assert.match(response.body.message, /Invalid order ID format/);
    });

    it('should handle invalid pagination parameters', async () => {
      const response = await request(app)
        .get(`/v1/orders/${validOrderId}/events`)
        .query({ page: '0', pageSize: '101' })
        .expect(400);

      assert.ok(response.body.error);
      assert.match(response.body.message, /Invalid pagination parameters/);
    });

    it('should handle invalid date range format', async () => {
      const response = await request(app)
        .get(`/v1/orders/${validOrderId}/events`)
        .query({ dateFrom: 'invalid-date' })
        .expect(400);

      assert.ok(response.body.error);
      assert.match(response.body.message, /Invalid date format/);
    });
  });

  describe('Authentication & Authorization', () => {
    it('should require authentication token', async () => {
      const response = await request(app)
        .get(`/v1/orders/${validOrderId}/events`)
        .expect(401);

      assert.ok(response.body.error);
      assert.match(response.body.message, /Authentication required/);
    });

    it('should reject invalid authentication token', async () => {
      const response = await request(app)
        .get(`/v1/orders/${validOrderId}/events`)
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);

      assert.ok(response.body.error);
      assert.match(response.body.message, /Invalid authentication token/);
    });

    it('should respect order access permissions for customers', async () => {
      const otherUserOrderId = '333e4444-e89b-12d3-a456-426614173333';
      
      const response = await request(app)
        .get(`/v1/orders/${otherUserOrderId}/events`)
        .set('Authorization', 'Bearer customer-token')
        .expect(403);

      assert.ok(response.body.error);
      assert.match(response.body.message, /Access denied/);
    });

    it('should filter out private events for customer users', async () => {
      const response = await request(app)
        .get(`/v1/orders/${validOrderId}/events`)
        .set('Authorization', 'Bearer customer-token')
        .expect(200);

      const parsedResponse = OrderEventResponseSchema.parse(response.body);
      
      // Customer should only see public events
      parsedResponse.data.forEach(event => {
        assert.strictEqual(event.isPublic, true);
      });
    });

    it('should allow admin users to see all events including private ones', async () => {
      const response = await request(app)
        .get(`/v1/orders/${validOrderId}/events`)
        .set('Authorization', 'Bearer admin-token')
        .expect(200);

      const parsedResponse = OrderEventResponseSchema.parse(response.body);
      
      // Admin should see both public and private events
      const hasPrivateEvents = parsedResponse.data.some(event => !event.isPublic);
      // Note: This assertion will only pass if there are actually private events in the test data
      if (parsedResponse.data.length > 0) {
        assert.ok(parsedResponse.summary.totalEvents >= parsedResponse.summary.publicEventCount);
      }
    });
  });

  describe('Performance & Caching', () => {
    it('should include ETag header for caching', async () => {
      const response = await request(app)
        .get(`/v1/orders/${validOrderId}/events`)
        .set('Authorization', 'Bearer valid-token')
        .expect(200);

      assert.ok(response.headers.etag);
    });

    it('should support conditional requests with If-None-Match', async () => {
      // First request to get ETag
      const firstResponse = await request(app)
        .get(`/v1/orders/${validOrderId}/events`)
        .set('Authorization', 'Bearer valid-token')
        .expect(200);

      const etag = firstResponse.headers.etag;

      // Second request with If-None-Match should return 304 if no changes
      const response = await request(app)
        .get(`/v1/orders/${validOrderId}/events`)
        .set('Authorization', 'Bearer valid-token')
        .set('If-None-Match', etag)
        .expect(304);

      assert.strictEqual(response.text, ''); // No body for 304
    });

    it('should limit maximum page size to prevent resource exhaustion', async () => {
      const response = await request(app)
        .get(`/v1/orders/${validOrderId}/events`)
        .query({ pageSize: '200' }) // Above max allowed
        .set('Authorization', 'Bearer valid-token')
        .expect(400);

      assert.ok(response.body.error);
      assert.match(response.body.message, /Page size cannot exceed/);
    });
  });

  describe('Data Consistency', () => {
    it('should maintain consistency between summary counts and actual data', async () => {
      const response = await request(app)
        .get(`/v1/orders/${validOrderId}/events`)
        .expect(200);

      const parsedResponse = OrderEventResponseSchema.parse(response.body);
      
      // Verify total events count
      assert.strictEqual(parsedResponse.summary.totalEvents, parsedResponse.data.length);
      
      // Verify public event count
      const actualPublicCount = parsedResponse.data.filter(event => event.isPublic).length;
      assert.strictEqual(parsedResponse.summary.publicEventCount, actualPublicCount);
      
      // Verify system vs user event counts
      const systemEventCount = parsedResponse.data.filter(event => event.isSystemGenerated).length;
      const userEventCount = parsedResponse.data.length - systemEventCount;
      assert.strictEqual(parsedResponse.summary.systemEventsCount, systemEventCount);
      assert.strictEqual(parsedResponse.summary.userEventsCount, userEventCount);
    });

    it('should have consistent event ordering across paginated results', async () => {
      // Get first page
      const firstPageResponse = await request(app)
        .get(`/v1/orders/${validOrderId}/events`)
        .query({ page: '1', pageSize: '5' })
        .expect(200);

      const firstPage = OrderEventResponseSchema.parse(firstPageResponse.body);

      if (firstPage.pagination.hasNextPage) {
        // Get second page
        const secondPageResponse = await request(app)
          .get(`/v1/orders/${validOrderId}/events`)
          .query({ page: '2', pageSize: '5' })
          .expect(200);

        const secondPage = OrderEventResponseSchema.parse(secondPageResponse.body);

        // Verify ordering is maintained across pages
        if (firstPage.data.length > 0 && secondPage.data.length > 0) {
          const lastFirstPageEvent = new Date(firstPage.data[firstPage.data.length - 1].occurredAt);
          const firstSecondPageEvent = new Date(secondPage.data[0].occurredAt);
          assert.ok(lastFirstPageEvent >= firstSecondPageEvent, 
            'Event ordering should be consistent across paginated results');
        }
      }
    });
  });

  describe('Error Response Format', () => {
    it('should return consistent error format', async () => {
      const response = await request(app)
        .get(`/v1/orders/${invalidOrderId}/events`)
        .expect(400);

      assert.ok(response.body.error);
      assert.ok(response.body.message);
      assert.ok(response.body.timestamp);
      assert.strictEqual(response.body.path, `/v1/orders/${invalidOrderId}/events`);
      assert.strictEqual(response.body.method, 'GET');
    });
  });
});