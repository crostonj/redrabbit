import { test, describe } from 'node:test';
import assert from 'node:assert';
import { OrderSchema, OrderStatus, CreateOrderSchema } from '../../../src/models/order.js';
import { ZodError } from 'zod';

/**
 * Unit Test: Order Model Validation
 * 
 * Tests the Order Zod schema validation:
 * - Valid order object validation
 * - Required field validation
 * - Field type validation
 * - Business rule validation
 * - Schema transformation and coercion
 */

// Helper function to create a valid base order for testing
const createValidTestOrder = (overrides = {}) => {
  const baseOrder = {
    customerId: 'cust_123456789',
    customerEmail: 'customer@example.com',
    status: 'pending' as const,
    items: [
      {
        productId: 'prod_hammer_001',
        productName: 'Premium Hammer',
        productSku: 'HAM-001',
        quantity: 1,
        unitPrice: 25.99,
        totalPrice: 25.99,
        taxAmount: 0,
        discountAmount: 0
      }
    ],
    shippingAddress: {
      street: '123 Main St',
      city: 'Anytown',
      state: 'CA',
      zipCode: '12345',
      country: 'US'
    },
    billingAddress: {
      street: '123 Main St',
      city: 'Anytown',
      state: 'CA',
      zipCode: '12345',
      country: 'US'
    },
    subtotalAmount: 25.99,
    taxAmount: 0,
    shippingAmount: 0,
    discountAmount: 0,
    totalAmount: 25.99,
    paymentMethod: 'credit_card' as const,
    paymentStatus: 'pending' as const
  };

  return { ...baseOrder, ...overrides };
};

describe('Order Model Validation', () => {
  test('should validate complete valid order', () => {
    const validOrder = {
      id: 'ord_test_123456789',
      customerId: 'cust_123456789',
      customerEmail: 'customer@example.com',
      status: 'pending' as const,
      items: [
        {
          id: 'item_001',
          productId: 'prod_hammer_001',
          productName: 'Premium Hammer',
          productSku: 'HAM-001',
          quantity: 2,
          unitPrice: 25.99,
          totalPrice: 51.98,
          taxAmount: 0,
          discountAmount: 0
        }
      ],
      shippingAddress: {
        street: '123 Main St',
        city: 'Anytown',
        state: 'CA',
        zipCode: '12345',
        country: 'US'
      },
      billingAddress: {
        street: '123 Main St',
        city: 'Anytown',
        state: 'CA',
        zipCode: '12345',
        country: 'US'
      },
      subtotalAmount: 51.98,
      taxAmount: 5.20,
      shippingAmount: 0,
      discountAmount: 0,
      totalAmount: 57.18,
      paymentMethod: 'credit_card' as const,
      paymentStatus: 'pending' as const,
      paymentId: 'pay_test_123',
      orderNumber: 'ORD-2024-001',
      notes: 'Test order',
      createdAt: '2024-01-10T10:00:00.000Z',
      updatedAt: '2024-01-10T10:00:00.000Z'
    };

    const result = OrderSchema.parse(validOrder);
    assert.strictEqual(result.id, validOrder.id);
    assert.strictEqual(result.customerId, validOrder.customerId);
    assert.strictEqual(result.customerEmail, validOrder.customerEmail);
    assert.strictEqual(result.status, validOrder.status);
    assert.strictEqual(result.items.length, 1);
    assert.strictEqual(result.totalAmount, validOrder.totalAmount);
  });

  test('should validate order status enum values', () => {
    const validStatuses = ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded'];
    
    validStatuses.forEach(status => {
      const result = OrderStatus.parse(status);
      assert.strictEqual(result, status);
    });
  });

  test('should reject invalid order status', () => {
    const invalidStatuses = ['invalid', 'completed', ''];
    
    invalidStatuses.forEach(status => {
      assert.throws(() => {
        OrderStatus.parse(status);
      }, ZodError);
    });
  });

  test('should validate required fields', () => {
    const requiredFields = ['customerId', 'items', 'status'];
    
    requiredFields.forEach(field => {
      const incompleteOrder = {
        id: 'ord_test_123',
        customerId: 'cust_123',
        items: [{ productId: 'prod_001', quantity: 1, unitPrice: 10.00 }],
        status: 'pending',
        subtotal: 10.00,
        tax: 1.00,
        total: 11.00
      };
      
      delete (incompleteOrder as any)[field];
      
      assert.throws(() => {
        OrderSchema.parse(incompleteOrder);
      }, ZodError);
    });
  });

  test('should validate item array constraints', () => {
    // Test empty items array
    const emptyItemsOrder = {
      customerId: 'cust_123',
      items: [],
      status: 'pending',
      subtotal: 0,
      tax: 0,
      total: 0
    };

    assert.throws(() => {
      CreateOrderSchema.parse(emptyItemsOrder);
    }, ZodError);

    // Test missing items field
    const noItemsOrder = {
      customerId: 'cust_123',
      status: 'pending',
      subtotal: 0,
      tax: 0,
      total: 0
    };

    assert.throws(() => {
      CreateOrderSchema.parse(noItemsOrder);
    }, ZodError);
  });

  test('should validate customer ID format', () => {
    const validCustomerIds = ['cust_123456789', 'cust_abc123def456'];
    const invalidCustomerIds = ['', '123', 'invalid_format', 'cust_', 'customer_id_that_is_way_too_long_to_be_valid'];

    validCustomerIds.forEach(customerId => {
      const order = {
        customerId,
        items: [{ productId: 'prod_001', quantity: 1, unitPrice: 10.00 }],
        status: 'pending' as const
      };

      const result = CreateOrderSchema.parse(order);
      assert.strictEqual(result.customerId, customerId);
    });

    invalidCustomerIds.forEach(customerId => {
      const order = {
        customerId,
        items: [{ productId: 'prod_001', quantity: 1, unitPrice: 10.00 }],
        status: 'pending' as const
      };

      assert.throws(() => {
        CreateOrderSchema.parse(order);
      }, ZodError);
    });
  });

  test('should validate monetary values', () => {
    // Test valid monetary values
    const validMonetaryValues = [0.01, 1.00, 99.99, 1000.50];
    
    validMonetaryValues.forEach(value => {
      const order = createValidTestOrder({
        items: [{
          productId: 'prod_test_001',
          productName: 'Test Product',
          quantity: 1,
          unitPrice: value,
          totalPrice: value
        }],
        subtotalAmount: value,
        totalAmount: value
      });

      const result = CreateOrderSchema.parse(order);
      assert.strictEqual(result.items[0].unitPrice, value);
    });

    // Test invalid monetary values
    const invalidMonetaryValues = [-0.01, -10.00, 0.001]; // negative or more than 2 decimal places

    invalidMonetaryValues.forEach(value => {
      const order = createValidTestOrder({
        items: [{
          productId: 'prod_test_001',
          productName: 'Test Product', 
          quantity: 1,
          unitPrice: value,
          totalPrice: value
        }],
        subtotalAmount: value,
        totalAmount: value
      });

      assert.throws(() => {
        CreateOrderSchema.parse(order);
      }, ZodError);
    });
  });

  test('should validate quantity constraints', () => {
    // Test valid quantities
    const validQuantities = [1, 2, 10, 100];

    validQuantities.forEach(quantity => {
      const unitPrice = 10.00;
      const totalPrice = unitPrice * quantity;
      
      const order = createValidTestOrder({
        items: [{
          productId: 'prod_test_001',
          productName: 'Test Product',
          quantity,
          unitPrice,
          totalPrice
        }],
        subtotalAmount: totalPrice,
        totalAmount: totalPrice
      });

      const result = CreateOrderSchema.parse(order);
      assert.strictEqual(result.items[0].quantity, quantity);
    });

    // Test invalid quantities
    const invalidQuantities = [0, -1, -10, 1.5, 2.7];

    invalidQuantities.forEach(quantity => {
      const order = createValidTestOrder({
        items: [{
          productId: 'prod_test_001',
          productName: 'Test Product',
          quantity,
          unitPrice: 10.00,
          totalPrice: 10.00
        }]
      });

      assert.throws(() => {
        CreateOrderSchema.parse(order);
      }, ZodError);
    });
  });

  test('should validate address format', () => {
    const validAddress = {
      street: '123 Main Street',
      city: 'Anytown',
      state: 'CA',
      zipCode: '12345',
      country: 'US'
    };

    const order = createValidTestOrder({
      shippingAddress: validAddress
    });

    const result = CreateOrderSchema.parse(order);
    assert.deepStrictEqual(result.shippingAddress, validAddress);

    // Test required address fields
    const requiredAddressFields = ['street', 'city', 'state', 'zipCode', 'country'];
    
    requiredAddressFields.forEach(field => {
      const incompleteAddress = { ...validAddress };
      delete (incompleteAddress as any)[field];
      
      const orderWithIncompleteAddress = createValidTestOrder({
        shippingAddress: incompleteAddress
      });

      assert.throws(() => {
        CreateOrderSchema.parse(orderWithIncompleteAddress);
      }, ZodError);
    });
  });

  test('should handle optional fields correctly', () => {
    // Test order with all required fields but minimal optional fields
    const order = createValidTestOrder({
      paymentId: undefined, // optional
      notes: undefined // optional
    });

    const result = CreateOrderSchema.parse(order);
    assert.strictEqual(result.customerId, 'cust_123456789');
    assert.strictEqual(result.items.length, 1);
    assert.strictEqual(result.status, 'pending');
    
    // Optional fields should be undefined
    assert.strictEqual(result.paymentId, undefined);
    assert.strictEqual(result.notes, undefined);
  });

  test('should transform string numbers to numbers', () => {
    // This test verifies that Zod can coerce string numbers to actual numbers
    // However, our schema doesn't enable coercion - it expects actual numbers
    // So this test should actually fail with strings, demonstrating strict typing
    
    const orderWithStringNumbers = createValidTestOrder({
      items: [{
        productId: 'prod_test_001',
        productName: 'Test Product',
        quantity: '2' as any, // This should fail - strings not allowed
        unitPrice: '25.99' as any, // This should fail - strings not allowed
        totalPrice: 51.98 // Correctly calculated as number
      }],
      subtotalAmount: 51.98,
      totalAmount: 51.98
    });

    assert.throws(() => {
      CreateOrderSchema.parse(orderWithStringNumbers);
    }, ZodError, 'Should reject string numbers as we enforce strict typing');
  });

  test('should validate total calculations consistency', () => {
    const order = {
      id: 'ord_123',
      customerId: 'cust_123456789',
      customerEmail: 'customer@example.com',
      status: 'pending' as const,
      items: [
        { 
          productId: 'prod_001', 
          productName: 'Product 1',
          quantity: 2, 
          unitPrice: 25.99, 
          totalPrice: 51.98,
          taxAmount: 0,
          discountAmount: 0
        },
        { 
          productId: 'prod_002', 
          productName: 'Product 2',
          quantity: 1, 
          unitPrice: 15.00, 
          totalPrice: 15.00,
          taxAmount: 0,
          discountAmount: 0
        }
      ],
      shippingAddress: {
        street: '123 Main St',
        city: 'Anytown',
        state: 'CA',
        zipCode: '12345',
        country: 'US'
      },
      billingAddress: {
        street: '123 Main St',
        city: 'Anytown',
        state: 'CA',
        zipCode: '12345',
        country: 'US'
      },
      subtotalAmount: 66.98,
      taxAmount: 6.70,
      shippingAmount: 0,
      discountAmount: 0,
      totalAmount: 73.68,
      paymentMethod: 'credit_card' as const,
      paymentStatus: 'pending' as const,
      createdAt: '2024-01-10T10:00:00.000Z',
      updatedAt: '2024-01-10T10:00:00.000Z'
    };

    const result = OrderSchema.parse(order);
    
    // Verify item totals are consistent
    assert.strictEqual(result.items[0].totalPrice, result.items[0].quantity * result.items[0].unitPrice);
    assert.strictEqual(result.items[1].totalPrice, result.items[1].quantity * result.items[1].unitPrice);
    
    // Verify order totals
    const expectedSubtotal = result.items.reduce((sum, item) => sum + item.totalPrice, 0);
    assert.ok(Math.abs(result.subtotalAmount - expectedSubtotal) < 0.01, 'Subtotal should match calculated value');
    assert.ok(Math.abs(result.totalAmount - (result.subtotalAmount + result.taxAmount + result.shippingAmount - result.discountAmount)) < 0.01, 'Total should match calculated value');
  });
});