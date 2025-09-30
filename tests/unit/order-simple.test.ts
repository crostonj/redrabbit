/**
 * Order Repository Core Tests
 * 
 * Testing essential order repository functionality
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { OrderRepository } from '../../src/repositories/order.js';
import type { 
  CreateOrderData, 
  CreateOrderItemData
} from '../../src/repositories/interfaces.js';
import { OrderStatus, Currency } from '../../src/repositories/interfaces.js';
import { 
  MockDatabaseService, 
  MockQueryResult, 
  TestDataGenerator
} from './utils/database-mocks.js';

describe('OrderRepository - Core Tests', () => {
  let mockDb: MockDatabaseService;
  let orderRepo: OrderRepository;

  function setupTest() {
    mockDb = new MockDatabaseService();
    orderRepo = new OrderRepository(mockDb as any);
    mockDb.clear();
  }

  test('create - successfully creates an order', async () => {
    setupTest();
    
    const createData: CreateOrderData = {
      customerId: 'cust_12345678901234567890',
      subtotalAmount: 29.99,
      totalAmount: 32.49,
      taxAmount: 2.50,
      shippingAddressId: 'addr_12345678901234567890',
      billingAddressId: 'addr_12345678901234567890'
    };

    const mockRow = TestDataGenerator.orderRow({
      customer_id: 'cust_12345678901234567890',
      subtotal_amount: '29.99',
      total_amount: '32.49',
      tax_amount: '2.50'
    });

    mockDb.mockQueryPattern(/^insert into orders/i, MockQueryResult.single(mockRow));

    const result = await orderRepo.create(createData);
    
    assert.equal(result.customerId, 'cust_12345678901234567890');
    assert.equal(result.subtotalAmount, 29.99);
    assert.equal(result.totalAmount, 32.49);
    
    console.log('✅ Order create test passed');
  });

  test('findById - returns order when found', async () => {
    setupTest();
    
    const orderId = 'ord_12345678901234567890';
    const mockRow = TestDataGenerator.orderRow({ id: orderId });

    mockDb.mockQueryPattern(/^select \* from orders.*where id = \$1/i, 
      MockQueryResult.single(mockRow));

    const result = await orderRepo.findById(orderId);

    assert(result !== null);
    assert.equal(result.id, orderId);
    
    console.log('✅ Order findById test passed');
  });

  test('updateStatus - updates order status', async () => {
    setupTest();
    
    const orderId = 'ord_12345678901234567890';
    const newStatus = OrderStatus.CONFIRMED;

    const updatedOrder = TestDataGenerator.orderRow({ 
      id: orderId, 
      status: newStatus 
    });
    mockDb.mockQueryPattern(/^update orders.*set status/i, MockQueryResult.single(updatedOrder));

    const result = await orderRepo.updateStatus(orderId, newStatus);

    assert(result !== null);
    assert.equal(result.status, newStatus);
    
    console.log('✅ Order updateStatus test passed');
  });

  test('findByCustomerId - returns customer orders', async () => {
    setupTest();
    
    const customerId = 'cust_12345678901234567890';
    const mockOrders = [
      TestDataGenerator.orderRow({ customer_id: customerId, status: 'pending' }),
      TestDataGenerator.orderRow({ customer_id: customerId, status: 'confirmed' })
    ];

    // Mock the main query
    mockDb.mockQueryPattern(/^select \* from orders.*customer_id = \$1/i, 
      MockQueryResult.multiple(mockOrders));
    
    // Mock the count query
    mockDb.mockQueryPattern(/^select count\(\*\) from orders/i, 
      MockQueryResult.count(2));

    const result = await orderRepo.findByCustomerId(customerId);

    assert.equal(result.data.length, 2);
    assert.equal(result.data[0].customerId, customerId);
    
    console.log('✅ Order findByCustomerId test passed');
  });

  test('findByStatus - returns orders with specific status', async () => {
    setupTest();
    
    const statuses = [OrderStatus.PENDING];
    const mockOrders = [
      TestDataGenerator.orderRow({ status: 'pending' }),
      TestDataGenerator.orderRow({ status: 'pending' })
    ];

    // Mock the main query
    mockDb.mockQueryPattern(/^select \* from orders.*status = any/i, 
      MockQueryResult.multiple(mockOrders));
    
    // Mock the count query
    mockDb.mockQueryPattern(/^select count\(\*\) from orders/i, 
      MockQueryResult.count(2));

    const result = await orderRepo.findByStatus(statuses);

    assert.equal(result.data.length, 2);
    assert.equal(result.data[0].status, OrderStatus.PENDING);
    
    console.log('✅ Order findByStatus test passed');
  });

  test('addItem - adds item to order', async () => {
    setupTest();
    
    const orderId = 'ord_12345678901234567890';
    const itemData: CreateOrderItemData = {
      productId: 'prod_12345678901234567890',
      quantity: 2,
      unitPrice: 15.99
    };

    const mockItem = {
      id: 'item_12345678901234567890',
      order_id: orderId,
      product_id: 'prod_12345678901234567890',
      quantity: '2',
      unit_price: '15.99',
      total_price: '31.98',
      created_at: '2023-01-15T10:00:00Z'
    };

    mockDb.mockQueryPattern(/^insert into order_items/i, MockQueryResult.single(mockItem));

    const result = await orderRepo.addItem(orderId, itemData);

    assert.equal(result.orderId, orderId);
    assert.equal(result.productId, 'prod_12345678901234567890');
    assert.equal(result.quantity, 2);
    
    console.log('✅ Order addItem test passed');
  });

  test('getItems - returns order items', async () => {
    setupTest();
    
    const orderId = 'ord_12345678901234567890';
    const mockItems = [
      {
        id: 'item_1',
        order_id: orderId,
        product_id: 'prod_1',
        quantity: '2',
        unit_price: '15.99',
        total_price: '31.98',
        created_at: '2023-01-15T10:00:00Z'
      },
      {
        id: 'item_2', 
        order_id: orderId,
        product_id: 'prod_2',
        quantity: '1',
        unit_price: '25.00',
        total_price: '25.00',
        created_at: '2023-01-15T10:00:00Z'
      }
    ];

    mockDb.mockQueryPattern(/^select \* from order_items.*where order_id = \$1/i, 
      MockQueryResult.multiple(mockItems));

    const result = await orderRepo.getItems(orderId);

    assert.equal(result.length, 2);
    assert.equal(result[0].orderId, orderId);
    assert.equal(result[0].quantity, 2);
    
    console.log('✅ Order getItems test passed');
  });

  test('markAsShipped - marks order as shipped', async () => {
    setupTest();
    
    const orderId = 'ord_12345678901234567890';
    const trackingNumber = 'TRACK123456';

    const shippedOrder = TestDataGenerator.orderRow({ 
      id: orderId, 
      status: OrderStatus.SHIPPED,
      tracking_number: trackingNumber
    });
    
    mockDb.mockQueryPattern(/^update orders.*set.*shipped_at/i, MockQueryResult.single(shippedOrder));

    const result = await orderRepo.markAsShipped(orderId, trackingNumber);

    assert(result !== null);
    assert.equal(result.status, OrderStatus.SHIPPED);
    assert.equal(result.trackingNumber, trackingNumber);
    
    console.log('✅ Order markAsShipped test passed');
  });

  test('markAsCancelled - marks order as cancelled', async () => {
    setupTest();
    
    const orderId = 'ord_12345678901234567890';
    const reason = 'Customer requested cancellation';

    const cancelledOrder = TestDataGenerator.orderRow({ 
      id: orderId, 
      status: OrderStatus.CANCELLED,
      cancellation_reason: reason
    });
    
    mockDb.mockQueryPattern(/^update orders.*set.*cancelled_at/i, MockQueryResult.single(cancelledOrder));

    const result = await orderRepo.markAsCancelled(orderId, reason);

    assert(result !== null);
    assert.equal(result.status, OrderStatus.CANCELLED);
    assert.equal(result.cancellationReason, reason);
    
    console.log('✅ Order markAsCancelled test passed');
  });

  console.log('🧪 Order repository core tests completed!');
});