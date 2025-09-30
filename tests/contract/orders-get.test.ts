import { describe, it, before, after } from 'node:test';
import { strict as assert } from 'node:assert';
import request from 'supertest';
import { Express } from 'express';
import { z } from 'zod';

// This test will fail initially - no Express app exists yet (TDD requirement)
describe('Contract Test: GET /v1/orders', () => {
  let app: Express;
  
  before(async () => {
    // Import Express app when it exists
    app = await import('../../src/server.js').then(m => m.app);
  });

  after(async () => {
    // Cleanup after tests
  });

  // Zod schema for query parameters validation
  const OrdersQuerySchema = z.object({
    page: z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().positive()).optional(),
    limit: z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().min(1).max(100)).optional(),
    status: z.enum(['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded']).optional(),
    customerId: z.string().uuid().optional(),
    dateFrom: z.string().datetime().optional(),
    dateTo: z.string().datetime().optional(),
    sortBy: z.enum(['createdAt', 'updatedAt', 'totalCents', 'orderNumber']).optional(),
    sortOrder: z.enum(['asc', 'desc']).optional(),
    search: z.string().max(100).optional()
  }).refine(data => {
    // Ensure dateFrom is before dateTo if both are provided
    if (data.dateFrom && data.dateTo) {
      return new Date(data.dateFrom) <= new Date(data.dateTo);
    }
    return true;
  }, {
    message: 'dateFrom must be before or equal to dateTo'
  });

  // Zod schema for paginated orders response
  const OrdersResponseSchema = z.object({
    data: z.array(z.object({
      id: z.string().uuid(),
      orderNumber: z.string().regex(/^ORD-\d{8}-\d{4}$/),
      customerId: z.string().uuid(),
      customerName: z.string().optional(),
      status: z.enum(['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded']),
      totalCents: z.number().int().nonnegative(),
      currency: z.string().length(3),
      itemCount: z.number().int().nonnegative(),
      createdAt: z.string().datetime(),
      updatedAt: z.string().datetime(),
      shippingAddress: z.object({
        city: z.string(),
        state: z.string(),
        country: z.string()
      }).optional()
    })),
    pagination: z.object({
      page: z.number().int().positive(),
      limit: z.number().int().min(1).max(100),
      total: z.number().int().nonnegative(),
      pages: z.number().int().nonnegative(),
      hasNext: z.boolean(),
      hasPrev: z.boolean()
    }),
    filters: z.object({
      status: z.string().optional(),
      customerId: z.string().uuid().optional(),
      dateFrom: z.string().datetime().optional(),
      dateTo: z.string().datetime().optional(),
      search: z.string().optional()
    }).optional(),
    sort: z.object({
      field: z.string(),
      order: z.enum(['asc', 'desc'])
    }).optional()
  });

  describe('Basic Pagination', () => {
    it('should return paginated orders with default pagination', async () => {
      const response = await request(app)
        .get('/v1/orders')
        .expect('Content-Type', /json/)
        .expect(200);

      const parsedResponse = OrdersResponseSchema.parse(response.body);
      
      // Verify default pagination
      assert.strictEqual(parsedResponse.pagination.page, 1);
      assert.strictEqual(parsedResponse.pagination.limit, 20); // Default limit
      assert.ok(parsedResponse.pagination.total >= 0);
      assert.ok(parsedResponse.pagination.pages >= 0);
      
      // Verify data structure
      assert.ok(Array.isArray(parsedResponse.data));
      
      // Verify each order has required fields
      parsedResponse.data.forEach(order => {
        assert.ok(order.id);
        assert.match(order.orderNumber, /^ORD-\d{8}-\d{4}$/);
        assert.ok(order.customerId);
        assert.ok(['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded'].includes(order.status));
        assert.ok(typeof order.totalCents === 'number');
        assert.strictEqual(order.currency, 'USD');
      });
    });

    it('should handle custom page and limit parameters', async () => {
      const response = await request(app)
        .get('/v1/orders')
        .query({ page: '2', limit: '10' })
        .expect(200);

      const parsedResponse = OrdersResponseSchema.parse(response.body);
      assert.strictEqual(parsedResponse.pagination.page, 2);
      assert.strictEqual(parsedResponse.pagination.limit, 10);
      assert.ok(parsedResponse.data.length <= 10);
    });

    it('should handle empty results gracefully', async () => {
      const response = await request(app)
        .get('/v1/orders')
        .query({ page: '999', limit: '50' })
        .expect(200);

      const parsedResponse = OrdersResponseSchema.parse(response.body);
      assert.strictEqual(parsedResponse.data.length, 0);
      assert.strictEqual(parsedResponse.pagination.hasNext, false);
    });
  });

  describe('Filtering by Status', () => {
    it('should filter orders by single status', async () => {
      const response = await request(app)
        .get('/v1/orders')
        .query({ status: 'pending' })
        .expect(200);

      const parsedResponse = OrdersResponseSchema.parse(response.body);
      
      // All returned orders should have pending status
      parsedResponse.data.forEach(order => {
        assert.strictEqual(order.status, 'pending');
      });
      
      // Verify filter is reflected in response
      assert.strictEqual(parsedResponse.filters?.status, 'pending');
    });

    it('should handle all valid status values', async () => {
      const validStatuses = ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded'];
      
      for (const status of validStatuses) {
        const response = await request(app)
          .get('/v1/orders')
          .query({ status })
          .expect(200);

        const parsedResponse = OrdersResponseSchema.parse(response.body);
        
        // All returned orders should match the requested status
        parsedResponse.data.forEach(order => {
          assert.strictEqual(order.status, status);
        });
      }
    });

    it('should reject invalid status values', async () => {
      const response = await request(app)
        .get('/v1/orders')
        .query({ status: 'invalid_status' })
        .expect(400);

      assert.ok(response.body.error);
      assert.match(response.body.message, /Invalid status/);
    });
  });

  describe('Filtering by Customer', () => {
    it('should filter orders by customer ID', async () => {
      const customerId = '123e4567-e89b-12d3-a456-426614174000';
      
      const response = await request(app)
        .get('/v1/orders')
        .query({ customerId })
        .expect(200);

      const parsedResponse = OrdersResponseSchema.parse(response.body);
      
      // All returned orders should belong to the specified customer
      parsedResponse.data.forEach(order => {
        assert.strictEqual(order.customerId, customerId);
      });
      
      // Verify filter is reflected in response
      assert.strictEqual(parsedResponse.filters?.customerId, customerId);
    });

    it('should reject invalid customer ID format', async () => {
      const response = await request(app)
        .get('/v1/orders')
        .query({ customerId: 'invalid-uuid' })
        .expect(400);

      assert.ok(response.body.error);
      assert.match(response.body.message, /Invalid customer ID format/);
    });

    it('should return empty results for non-existent customer', async () => {
      const response = await request(app)
        .get('/v1/orders')
        .query({ customerId: '00000000-0000-0000-0000-000000000000' })
        .expect(200);

      const parsedResponse = OrdersResponseSchema.parse(response.body);
      assert.strictEqual(parsedResponse.data.length, 0);
      assert.strictEqual(parsedResponse.pagination.total, 0);
    });
  });

  describe('Date Range Filtering', () => {
    it('should filter orders by date range', async () => {
      const dateFrom = '2024-01-01T00:00:00.000Z';
      const dateTo = '2024-12-31T23:59:59.999Z';
      
      const response = await request(app)
        .get('/v1/orders')
        .query({ dateFrom, dateTo })
        .expect(200);

      const parsedResponse = OrdersResponseSchema.parse(response.body);
      
      // All returned orders should be within the date range
      parsedResponse.data.forEach(order => {
        const orderDate = new Date(order.createdAt);
        const fromDate = new Date(dateFrom);
        const toDate = new Date(dateTo);
        
        assert.ok(orderDate >= fromDate, `Order date ${orderDate} should be >= ${fromDate}`);
        assert.ok(orderDate <= toDate, `Order date ${orderDate} should be <= ${toDate}`);
      });
    });

    it('should filter orders from specific date onwards', async () => {
      const dateFrom = '2024-06-01T00:00:00.000Z';
      
      const response = await request(app)
        .get('/v1/orders')
        .query({ dateFrom })
        .expect(200);

      const parsedResponse = OrdersResponseSchema.parse(response.body);
      
      parsedResponse.data.forEach(order => {
        const orderDate = new Date(order.createdAt);
        const fromDate = new Date(dateFrom);
        assert.ok(orderDate >= fromDate);
      });
    });

    it('should filter orders up to specific date', async () => {
      const dateTo = '2024-06-01T23:59:59.999Z';
      
      const response = await request(app)
        .get('/v1/orders')
        .query({ dateTo })
        .expect(200);

      const parsedResponse = OrdersResponseSchema.parse(response.body);
      
      parsedResponse.data.forEach(order => {
        const orderDate = new Date(order.createdAt);
        const toDate = new Date(dateTo);
        assert.ok(orderDate <= toDate);
      });
    });

    it('should reject invalid date formats', async () => {
      const response = await request(app)
        .get('/v1/orders')
        .query({ dateFrom: 'invalid-date' })
        .expect(400);

      assert.ok(response.body.error);
      assert.match(response.body.message, /Invalid datetime/);
    });

    it('should reject dateFrom after dateTo', async () => {
      const response = await request(app)
        .get('/v1/orders')
        .query({ 
          dateFrom: '2024-12-01T00:00:00.000Z',
          dateTo: '2024-01-01T00:00:00.000Z'
        })
        .expect(400);

      assert.ok(response.body.error);
      assert.match(response.body.message, /dateFrom must be before or equal to dateTo/);
    });
  });

  describe('Text Search', () => {
    it('should search orders by order number', async () => {
      const response = await request(app)
        .get('/v1/orders')
        .query({ search: 'ORD-20240101' })
        .expect(200);

      const parsedResponse = OrdersResponseSchema.parse(response.body);
      
      // Results should contain the search term in order number or customer name
      parsedResponse.data.forEach(order => {
        const searchTerm = 'ORD-20240101'.toLowerCase();
        const matchesOrderNumber = order.orderNumber.toLowerCase().includes(searchTerm);
        const matchesCustomerName = order.customerName?.toLowerCase().includes(searchTerm) || false;
        
        assert.ok(matchesOrderNumber || matchesCustomerName, 
          `Order ${order.orderNumber} should match search term`);
      });
    });

    it('should search orders by customer name', async () => {
      const response = await request(app)
        .get('/v1/orders')
        .query({ search: 'John Smith' })
        .expect(200);

      const parsedResponse = OrdersResponseSchema.parse(response.body);
      
      parsedResponse.data.forEach(order => {
        if (order.customerName) {
          assert.ok(order.customerName.toLowerCase().includes('john smith') || 
                   order.customerName.toLowerCase().includes('john') ||
                   order.customerName.toLowerCase().includes('smith'));
        }
      });
    });

    it('should handle empty search results', async () => {
      const response = await request(app)
        .get('/v1/orders')
        .query({ search: 'nonexistent_search_term_12345' })
        .expect(200);

      const parsedResponse = OrdersResponseSchema.parse(response.body);
      assert.strictEqual(parsedResponse.data.length, 0);
    });

    it('should reject search terms that are too long', async () => {
      const longSearch = 'a'.repeat(101);
      
      const response = await request(app)
        .get('/v1/orders')
        .query({ search: longSearch })
        .expect(400);

      assert.ok(response.body.error);
      assert.match(response.body.message, /String must contain at most 100 character/);
    });
  });

  describe('Sorting', () => {
    it('should sort orders by creation date (default)', async () => {
      const response = await request(app)
        .get('/v1/orders')
        .expect(200);

      const parsedResponse = OrdersResponseSchema.parse(response.body);
      
      // Default should be sorted by createdAt descending (newest first)
      if (parsedResponse.data.length > 1) {
        for (let i = 1; i < parsedResponse.data.length; i++) {
          const prevDate = new Date(parsedResponse.data[i-1].createdAt);
          const currDate = new Date(parsedResponse.data[i].createdAt);
          assert.ok(prevDate >= currDate, 'Orders should be sorted by createdAt desc by default');
        }
      }
    });

    it('should sort orders by total amount ascending', async () => {
      const response = await request(app)
        .get('/v1/orders')
        .query({ sortBy: 'totalCents', sortOrder: 'asc' })
        .expect(200);

      const parsedResponse = OrdersResponseSchema.parse(response.body);
      
      // Verify sort field is reflected in response
      assert.strictEqual(parsedResponse.sort?.field, 'totalCents');
      assert.strictEqual(parsedResponse.sort?.order, 'asc');
      
      // Verify sorting
      if (parsedResponse.data.length > 1) {
        for (let i = 1; i < parsedResponse.data.length; i++) {
          assert.ok(parsedResponse.data[i-1].totalCents <= parsedResponse.data[i].totalCents);
        }
      }
    });

    it('should sort orders by order number descending', async () => {
      const response = await request(app)
        .get('/v1/orders')
        .query({ sortBy: 'orderNumber', sortOrder: 'desc' })
        .expect(200);

      const parsedResponse = OrdersResponseSchema.parse(response.body);
      
      if (parsedResponse.data.length > 1) {
        for (let i = 1; i < parsedResponse.data.length; i++) {
          assert.ok(parsedResponse.data[i-1].orderNumber >= parsedResponse.data[i].orderNumber);
        }
      }
    });

    it('should reject invalid sort fields', async () => {
      const response = await request(app)
        .get('/v1/orders')
        .query({ sortBy: 'invalidField' })
        .expect(400);

      assert.ok(response.body.error);
      assert.match(response.body.message, /Invalid enum value/);
    });

    it('should reject invalid sort orders', async () => {
      const response = await request(app)
        .get('/v1/orders')
        .query({ sortBy: 'createdAt', sortOrder: 'invalid' })
        .expect(400);

      assert.ok(response.body.error);
      assert.match(response.body.message, /Invalid enum value/);
    });
  });

  describe('Combined Filters', () => {
    it('should combine multiple filters correctly', async () => {
      const customerId = '123e4567-e89b-12d3-a456-426614174000';
      const status = 'confirmed';
      const dateFrom = '2024-01-01T00:00:00.000Z';
      
      const response = await request(app)
        .get('/v1/orders')
        .query({ customerId, status, dateFrom, sortBy: 'createdAt', sortOrder: 'asc' })
        .expect(200);

      const parsedResponse = OrdersResponseSchema.parse(response.body);
      
      // Verify all filters are applied
      parsedResponse.data.forEach(order => {
        assert.strictEqual(order.customerId, customerId);
        assert.strictEqual(order.status, status);
        
        const orderDate = new Date(order.createdAt);
        const fromDate = new Date(dateFrom);
        assert.ok(orderDate >= fromDate);
      });
    });

    it('should handle filter combinations with pagination', async () => {
      const response = await request(app)
        .get('/v1/orders')
        .query({ 
          status: 'shipped',
          page: '1',
          limit: '5',
          sortBy: 'totalCents',
          sortOrder: 'desc'
        })
        .expect(200);

      const parsedResponse = OrdersResponseSchema.parse(response.body);
      
      assert.strictEqual(parsedResponse.pagination.page, 1);
      assert.strictEqual(parsedResponse.pagination.limit, 5);
      assert.ok(parsedResponse.data.length <= 5);
      
      parsedResponse.data.forEach(order => {
        assert.strictEqual(order.status, 'shipped');
      });
    });
  });

  describe('Validation Errors', () => {
    it('should reject invalid page numbers', async () => {
      const response = await request(app)
        .get('/v1/orders')
        .query({ page: '0' })
        .expect(400);

      assert.ok(response.body.error);
      assert.match(response.body.message, /Number must be greater than 0/);
    });

    it('should reject limit values outside allowed range', async () => {
      const response = await request(app)
        .get('/v1/orders')
        .query({ limit: '101' })
        .expect(400);

      assert.ok(response.body.error);
      assert.match(response.body.message, /Number must be less than or equal to 100/);
    });

    it('should reject non-numeric page and limit values', async () => {
      const response = await request(app)
        .get('/v1/orders')
        .query({ page: 'abc', limit: 'xyz' })
        .expect(400);

      assert.ok(response.body.error);
    });
  });

  describe('Authentication & Authorization', () => {
    it('should require authentication token', async () => {
      const response = await request(app)
        .get('/v1/orders')
        .expect(401);

      assert.ok(response.body.error);
      assert.match(response.body.message, /Authentication required/);
    });

    it('should reject invalid authentication token', async () => {
      const response = await request(app)
        .get('/v1/orders')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);

      assert.ok(response.body.error);
      assert.match(response.body.message, /Invalid authentication token/);
    });

    it('should respect user permissions and data access', async () => {
      // This test would verify that users can only see orders they have permission to access
      // Implementation depends on the authorization model
      const response = await request(app)
        .get('/v1/orders')
        .set('Authorization', 'Bearer limited-access-token')
        .expect(200);

      const parsedResponse = OrdersResponseSchema.parse(response.body);
      
      // Verify that only authorized orders are returned
      // This is a placeholder - actual implementation would depend on auth model
      assert.ok(parsedResponse.data.length >= 0);
    });
  });

  describe('Error Response Format', () => {
    it('should return consistent error format for validation errors', async () => {
      const response = await request(app)
        .get('/v1/orders')
        .query({ page: 'invalid' })
        .expect(400);

      assert.ok(response.body.error);
      assert.ok(response.body.message);
      assert.ok(response.body.timestamp);
      assert.strictEqual(response.body.path, '/v1/orders');
      assert.strictEqual(response.body.method, 'GET');
    });
  });
});