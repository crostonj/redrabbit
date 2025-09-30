import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert';
import { OrderService } from '../../../src/services/order-service.js';
import type { CreateOrderRequest } from '../../../src/services/order-service.js';
import { MockDatabaseService, MockQueryResult } from '../utils/database-mocks.js';

/**
 * Unit Test: Order Service
 * 
 * Tests the OrderService business logic in isolation:
 * - Order creation and validation
 * - Order retrieval and filtering
 * - Order status updates and transitions
 * - Business rule enforcement
 * - Error handling and edge cases
 */

describe('Order Service Unit Tests', () => {
  let orderService: OrderService;
  let mockDatabase: MockDatabaseService;

  beforeEach(() => {
    mockDatabase = new MockDatabaseService();
    orderService = new OrderService(mockDatabase as any);
  });

  test('should create valid order', async () => {
    const createRequest: CreateOrderRequest = {
      customerId: 'cust_123456789',
      customerEmail: 'test@example.com',
      items: [
        {
          productId: 'prod_hammer_001',
          productName: 'Professional Hammer',
          productSku: 'HAM-001',
          quantity: 2,
          unitPrice: 25.99,
          totalPrice: 51.98,
          taxAmount: 4.16,
          discountAmount: 0
        }
      ],
      shippingAddress: {
        street: '456 Oak Ave',
        city: 'Springfield',
        state: 'IL',
        zipCode: '12345',
        country: 'US'
      },
      billingAddress: {
        street: '456 Oak Ave',
        city: 'Springfield',
        state: 'IL',
        zipCode: '12345',
        country: 'US'
      },
      subtotalAmount: 51.98,
      taxAmount: 4.16,
      shippingAmount: 5.99,
      discountAmount: 0,
      totalAmount: 62.13,
      paymentMethod: 'credit_card'
    };

    // Mock database responses
    mockDatabase.mockQueryPattern(
      /INSERT INTO orders/i,
      MockQueryResult.single({
        id: 'ord_new_123456789',
        customer_id: 'cust_123456789',
        status: 'pending',
        subtotal: 51.98,
        tax: 4.16,
        total: 62.13,
        created_at: '2024-01-10T10:00:00Z',
        updated_at: '2024-01-10T10:00:00Z'
      })
    );

    const result = await orderService.createOrder(createRequest);
    
    assert.strictEqual(result.success, true);
    if (result.success) {
      assert.strictEqual(result.data.id, 'ord_new_123456789');
      assert.strictEqual(result.data.customerId, 'cust_123456789');
      assert.strictEqual(result.data.status, 'pending');
      assert.strictEqual(result.data.subtotalAmount, 51.98);
      assert.strictEqual(result.data.totalAmount, 62.13);
    }
  });

  test('should validate customer exists before creating order', async () => {
    const createRequest: CreateOrderRequest = {
      customerId: 'cust_nonexistent',
      customerEmail: 'nonexistent@example.com',
      items: [
        {
          productId: 'prod_hammer_001',
          productName: 'Professional Hammer',
          quantity: 1,
          unitPrice: 25.99,
          totalPrice: 25.99,
          taxAmount: 2.08,
          discountAmount: 0
        }
      ],
      shippingAddress: {
        street: '456 Oak Ave',
        city: 'Springfield',
        state: 'IL',
        zipCode: '12345',
        country: 'US'
      },
      billingAddress: {
        street: '456 Oak Ave',
        city: 'Springfield',
        state: 'IL',
        zipCode: '12345',
        country: 'US'
      },
      subtotalAmount: 25.99,
      taxAmount: 2.08,
      shippingAmount: 5.99,
      discountAmount: 0,
      totalAmount: 33.06,
      paymentMethod: 'credit_card'
    };

    // Mock empty customer query result
    mockDatabase.mockQueryPattern(
      /SELECT.*FROM customers/i,
      MockQueryResult.empty()
    );

    const result = await orderService.createOrder(createRequest);
    
    assert.strictEqual(result.success, false);
    if (!result.success) {
      assert.ok(result.error.includes('Customer not found') || result.error.includes('not found'));
    }
  });

  test('should validate product availability before creating order', async () => {
    const createRequest: CreateOrderRequest = {
      customerId: 'cust_123456789',
      customerEmail: 'test@example.com',
      items: [
        {
          productId: 'prod_outofstock',
          productName: 'Out of Stock Item',
          quantity: 5,
          unitPrice: 25.99,
          totalPrice: 129.95,
          taxAmount: 10.40,
          discountAmount: 0
        }
      ],
      shippingAddress: {
        street: '456 Oak Ave',
        city: 'Springfield',
        state: 'IL',
        zipCode: '12345',
        country: 'US'
      },
      billingAddress: {
        street: '456 Oak Ave',
        city: 'Springfield',
        state: 'IL',
        zipCode: '12345',
        country: 'US'
      },
      subtotalAmount: 129.95,
      taxAmount: 10.40,
      shippingAmount: 5.99,
      discountAmount: 0,
      totalAmount: 146.34,
      paymentMethod: 'credit_card'
    };

    // Mock customer exists
    mockDatabase.mockQueryPattern(
      /SELECT.*FROM customers/i,
      MockQueryResult.single({ id: 'cust_123456789' })
    );

    // Mock insufficient inventory
    mockDatabase.mockQueryPattern(
      /SELECT.*FROM products.*inventory/i,
      MockQueryResult.single({ id: 'prod_outofstock', inventory_count: 2 })
    );

    const result = await orderService.createOrder(createRequest);
    
    assert.strictEqual(result.success, false);
    if (!result.success) {
      assert.ok(result.error.includes('Insufficient inventory') || result.error.includes('stock'));
    }
  });

  test('should retrieve order by ID', async () => {
    const orderId = 'ord_test_123456789';

    mockDatabase.mockQueryPattern(
      /SELECT.*FROM orders.*WHERE.*id/i,
      MockQueryResult.single({
        id: orderId,
        customer_id: 'cust_123456789',
        status: 'confirmed',
        subtotal: 99.99,
        tax: 8.00,
        total: 109.99,
        created_at: '2024-01-10T10:00:00Z',
        updated_at: '2024-01-10T10:00:00Z'
      })
    );

    const result = await orderService.getOrderById(orderId);
    
    assert.strictEqual(result.success, true);
    if (result.success) {
      assert.strictEqual(result.data.id, orderId);
      assert.strictEqual(result.data.status, 'confirmed');
      assert.strictEqual(result.data.totalAmount, 109.99);
    }
  });

  test('should return error when order not found', async () => {
    const orderId = 'ord_nonexistent';

    mockDatabase.mockQueryPattern(
      /SELECT.*FROM orders.*WHERE.*id/i,
      MockQueryResult.empty()
    );

    const result = await orderService.getOrderById(orderId);
    
    assert.strictEqual(result.success, false);
    if (!result.success) {
      assert.ok(result.error.includes('not found'));
    }
  });

  test('should update order status with valid transition', async () => {
    const orderId = 'ord_test_status';
    const newStatus = 'confirmed';

    // Mock current order state
    mockDatabase.mockQueryPattern(
      /SELECT.*FROM orders.*WHERE.*id/i,
      MockQueryResult.single({
        id: orderId,
        status: 'pending',
        customer_id: 'cust_123456789',
        customer_email: 'test@example.com',
        subtotal_amount: 100.00,
        tax_amount: 8.00,
        total_amount: 108.00,
        payment_method: 'credit_card',
        shipping_address: JSON.stringify({
          street: '123 Main St',
          city: 'Springfield', 
          state: 'IL',
          zipCode: '12345',
          country: 'US'
        }),
        billing_address: JSON.stringify({
          street: '123 Main St',
          city: 'Springfield',
          state: 'IL', 
          zipCode: '12345',
          country: 'US'
        }),
        created_at: '2024-01-10T10:00:00Z',
        updated_at: '2024-01-10T10:00:00Z'
      })
    );

    // Mock order items
    mockDatabase.mockQueryPattern(
      /SELECT.*FROM order_items/i,
      MockQueryResult.multiple([
        {
          id: 'item_1',
          product_id: 'prod_001',
          product_name: 'Test Product',
          quantity: 1,
          unit_price: 100.00,
          total_price: 100.00,
          tax_amount: 8.00,
          discount_amount: 0
        }
      ])
    );

    // Mock successful update
    mockDatabase.mockQueryPattern(
      /UPDATE orders.*SET.*status/i,
      MockQueryResult.single({
        id: orderId,
        status: newStatus,
        updated_at: '2024-01-10T10:30:00Z'
      })
    );

    const result = await orderService.updateOrderStatus(orderId, newStatus);
    
    assert.strictEqual(result.status, newStatus);
  });

  test('should calculate order totals correctly', () => {
    const items: any[] = [
      {
        productId: 'prod_001',
        productName: 'Test Product 1',
        quantity: 2,
        unitPrice: 15.99,
        totalPrice: 31.98,
        taxAmount: 2.56,
        discountAmount: 0
      },
      {
        productId: 'prod_002',
        productName: 'Test Product 2',
        quantity: 1,
        unitPrice: 29.99,
        totalPrice: 29.99,
        taxAmount: 2.40,
        discountAmount: 5.00
      }
    ];

    const totals = orderService.calculateOrderTotals(items);
    
    assert.strictEqual(totals.subtotal, 61.97);
    assert.strictEqual(totals.tax, 4.96);
    assert.strictEqual(totals.discount, 5.00);
    assert.strictEqual(totals.total, 61.93);
  });

  test('should list orders with pagination', async () => {
    const pagination = { limit: 10, offset: 0 };
    const filters = { status: 'confirmed' as const };

    // Mock count query
    mockDatabase.mockQueryPattern(
      /SELECT COUNT/i,
      MockQueryResult.count(25)
    );

    // Mock data query
    mockDatabase.mockQueryPattern(
      /SELECT.*FROM orders.*LIMIT.*OFFSET/i,
      MockQueryResult.multiple([
        {
          id: 'ord_001',
          customer_id: 'cust_001',
          status: 'confirmed',
          total_amount: 99.99,
          created_at: '2024-01-10T10:00:00Z'
        },
        {
          id: 'ord_002',
          customer_id: 'cust_002',
          status: 'confirmed',
          total_amount: 149.99,
          created_at: '2024-01-10T11:00:00Z'
        }
      ])
    );

    const result = await orderService.listOrders(pagination, filters);
    
    assert.strictEqual(result.success, true);
    if (result.success) {
      assert.strictEqual(result.data.length, 2);
      assert.strictEqual(result.total, 25);
    }
  });

  test('should handle database connection errors gracefully', async () => {
    // Mock database error
    mockDatabase.mockQueryPattern(
      /SELECT.*FROM orders/i,
      Promise.reject(new Error('Connection refused'))
    );

    const result = await orderService.getOrderById('ord_test');
    
    assert.strictEqual(result.success, false);
    if (!result.success) {
      assert.ok(result.error.includes('Connection refused') || result.error.includes('error'));
    }
  });

  test('should record order events', async () => {
    const orderId = 'ord_test_events';
    const eventType = 'status_change';
    const eventData = { from: 'pending', to: 'confirmed', reason: 'Payment processed' };

    mockDatabase.mockQueryPattern(
      /INSERT INTO order_events/i,
      MockQueryResult.single({
        id: 'evt_123',
        order_id: orderId,
        event_type: eventType,
        event_data: eventData,
        created_at: '2024-01-10T10:00:00Z'
      })
    );

    const result = await orderService.recordOrderEvent(orderId, eventType, eventData);
    
    assert.strictEqual(result, true);
  });
});