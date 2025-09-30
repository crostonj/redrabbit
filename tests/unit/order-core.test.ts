/**
 * Order Repository Core Tests
 * 
 * Testing the core order repository functionality
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

    // Mock the insert query
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

    // Mock finding the order first
    const currentOrder = TestDataGenerator.orderRow({ id: orderId, status: 'pending' });
    mockDb.mockQueryPattern(/^select \* from orders.*where id = \$1/i, 
      MockQueryResult.single(currentOrder));

    // Mock the update
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

  test('findByCustomer - returns customer orders', async () => {
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

    const result = await orderRepo.findByCustomer(customerId);

    assert.equal(result.data.length, 2);
    assert.equal(result.data[0].customerId, customerId);
    
    console.log('✅ Order findByCustomer test passed');
  });

  test('findByStatus - returns orders with specific status', async () => {
    setupTest();
    
    const status = OrderStatus.PENDING;
    const mockOrders = [
      TestDataGenerator.orderRow({ status: 'pending' }),
      TestDataGenerator.orderRow({ status: 'pending' })
    ];

    // Mock the main query
    mockDb.mockQueryPattern(/^select \* from orders.*status = \$1/i, 
      MockQueryResult.multiple(mockOrders));
    
    // Mock the count query
    mockDb.mockQueryPattern(/^select count\(\*\) from orders/i, 
      MockQueryResult.count(2));

    const result = await orderRepo.findByStatus(status);

    assert.equal(result.data.length, 2);
    assert.equal(result.data[0].status, status);
    
    console.log('✅ Order findByStatus test passed');
  });

  test('calculateTotals - calculates order totals', async () => {
    setupTest();
    
    const orderId = 'ord_12345678901234567890';
    const mockTotals = {
      subtotal_amount: '29.99',
      tax_amount: '2.50',  
      shipping_amount: '5.00',
      discount_amount: '0.00',
      total_amount: '37.49'
    };

    mockDb.mockQueryPattern(/^select.*sum.*from order_items.*where order_id = \$1/i, 
      MockQueryResult.single(mockTotals));

  const result = await orderRepo.calculateTotals(orderId);

  // Repository returns { subtotal, tax, shipping, discount, total }
  assert.equal(result.subtotal, 29.99);
  assert.equal(result.tax, 2.50);
  assert.equal(result.total, 37.49);
    
    console.log('✅ Order calculateTotals test passed');
  });

  test('getOrderStats - returns order statistics', async () => {
    setupTest();
    
    // The repository's getOrderStats groups by status and returns rows with:
    // total_orders (per status), total_revenue (per status), average_order_value (per status), status, status_count
    const mockStatsRows = [
      {
        status: 'pending',
        status_count: '12',
        total_orders: '12',
        total_revenue: '567.89',
        average_order_value: '47.32'
      },
      {
        status: 'confirmed',
        status_count: '138',
        total_orders: '138',
        total_revenue: '4000.00',
        average_order_value: '28.99'
      }
    ];

    mockDb.mockQueryPattern(/^select.*count.*sum.*avg.*from orders/i, 
      MockQueryResult.multiple(mockStatsRows));

    const result = await orderRepo.getOrderStats();

    assert.equal(result.totalOrders, 150);
    assert.equal(result.totalRevenue, 4567.89);
    assert.equal(Number(result.averageOrderValue.toFixed(2)), 30.45);
    
    console.log('✅ Order getOrderStats test passed');
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

    // Required query mocks for repository logic sequence
    // 1. Verify order exists & status
    mockDb.mockQueryPattern(/^select status from orders.*where id = \$1/i, 
      MockQueryResult.single({ status: 'pending' } as any));
    // 2. Product stock lookup
    mockDb.mockQueryPattern(/^select stock from products.*id = \$1/i, 
      MockQueryResult.single({ stock: '100' } as any));
    // 3. Insert order item
    mockDb.mockQueryPattern(/^insert into order_items/i, MockQueryResult.single({
      ...mockItem,
      updated_at: mockItem.created_at
    } as any));
    // 4. Update product stock
    mockDb.mockQueryPattern(/^update products set stock = stock -/i, MockQueryResult.empty());
    // 5. Recalculate totals (aggregate over order_items)
    mockDb.mockQueryPattern(/^select\s+coalesce\(sum\(total_price\)/i, MockQueryResult.single({
      subtotal_amount: '31.98',
      tax_amount: '2.56',
      shipping_amount: '5.00',
      discount_amount: '0.00',
      total_amount: '39.54'
    } as any));
    // 6. Update orders with new totals
    mockDb.mockQueryPattern(/^update orders\s+set subtotal_amount = \$1/i, MockQueryResult.empty());

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
        total_price: '31.98'
      },
      {
        id: 'item_2', 
        order_id: orderId,
        product_id: 'prod_2',
        quantity: '1',
        unit_price: '25.00',
        total_price: '25.00'
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

  console.log('🧪 Order repository core tests updated & completed!');
});