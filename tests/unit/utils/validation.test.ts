import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert';
import { validateOrderData, validatePaymentData } from '../../../src/utils/validation.js';
import { ZodError } from 'zod';

/**
 * Unit Test: Data Validation Utilities
 * 
 * Tests validation functions for:
 * - Order data validation
 * - Payment data validation
 * - Input sanitization
 * - Error message formatting
 */

describe('Data Validation Utils Unit Tests', () => {
  
  test('should validate complete order data', () => {
    const validOrderData = {
      customerId: 'cust_123456789',
      customerEmail: 'test@example.com',
      items: [
        {
          productId: 'prod_laptop_001',
          productName: 'Gaming Laptop',
          quantity: 1,
          unitPrice: 999.99,
          totalPrice: 999.99
        },
        {
          productId: 'prod_mouse_002',
          productName: 'Wireless Mouse',
          quantity: 2,
          unitPrice: 29.99,
          totalPrice: 59.98
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
      paymentMethod: 'credit_card',
      subtotalAmount: 1059.97,
      totalAmount: 1059.97
    };

    const result = validateOrderData(validOrderData);
    
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.data.customerId, 'cust_123456789');
    assert.strictEqual(result.data.items.length, 2);
    assert.strictEqual(result.data.totalAmount, 1059.97);
  });

  test('should reject order with missing required fields', () => {
    const incompleteOrderData = {
      customerId: 'cust_123456789',
      items: [
        {
          productId: 'prod_laptop_001',
          productName: 'Gaming Laptop',
          quantity: 1
          // unitPrice missing
          // totalPrice missing
        }
      ]
      // customerEmail missing
      // shippingAddress missing
      // billingAddress missing
      // paymentMethod missing
      // subtotalAmount missing
      // totalAmount missing
    };

    const result = validateOrderData(incompleteOrderData);
    
    assert.strictEqual(result.success, false);
    assert.ok(result.error);
    
    if (result.error instanceof ZodError) {
      const errors = result.error.errors;
      const errorPaths = errors.map(e => e.path.join('.'));
      
      assert.ok(errorPaths.includes('items.0.unitPrice'));
      assert.ok(errorPaths.includes('items.0.totalPrice'));
      assert.ok(errorPaths.includes('customerEmail'));
      assert.ok(errorPaths.includes('shippingAddress'));
      assert.ok(errorPaths.includes('billingAddress'));
      assert.ok(errorPaths.includes('paymentMethod'));
      assert.ok(errorPaths.includes('subtotalAmount'));
      assert.ok(errorPaths.includes('totalAmount'));
    }
  });

  test('should validate order item quantities and prices', () => {
    const invalidOrderData = {
      customerId: 'cust_123456789',
      customerEmail: 'test@example.com',
      items: [
        {
          productId: 'prod_laptop_001',
          productName: 'Gaming Laptop',
          quantity: 0, // Invalid: must be positive
          unitPrice: -100, // Invalid: must be positive
          totalPrice: 0 // Will be invalid due to calculation
        },
        {
          productId: 'prod_mouse_002',
          productName: 'Wireless Mouse',
          quantity: 1.5, // Invalid: must be integer
          unitPrice: 29.999, // Invalid: too many decimal places
          totalPrice: 44.9985 // Invalid: too many decimal places
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
      paymentMethod: 'credit_card',
      subtotalAmount: 1059.97,
      totalAmount: 1059.97
    };

    const result = validateOrderData(invalidOrderData);
    
    assert.strictEqual(result.success, false);
    assert.ok(result.error);

    if (result.error instanceof ZodError) {
      const errors = result.error.errors;
      const messages = errors.map(e => e.message);
      
      // Check for quantity validation errors
      assert.ok(errors.some(e => e.path.includes('quantity') && e.message.includes('greater than')));
      
      // Check for price validation errors
      assert.ok(errors.some(e => e.path.includes('unitPrice') && e.message.includes('greater than')));
    }
  });

  test('should validate address format', () => {
    const orderWithInvalidAddress = {
      customerId: 'cust_123456789',
      customerEmail: 'test@example.com',
      items: [{
        productId: 'prod_laptop_001',
        productName: 'Gaming Laptop',
        quantity: 1,
        unitPrice: 999.99,
        totalPrice: 999.99
      }],
      shippingAddress: {
        street: '', // Empty street
        city: 'A', // Too short
        state: 'CALIFORNIA', // Too long (should be 2 characters)
        zipCode: '1234', // Too short
        country: 'USA' // Invalid format (should be 2-letter code)
      },
      billingAddress: {
        street: '123 Main St',
        city: 'Anytown',
        state: 'CA',
        zipCode: '12345',
        country: 'US'
      },
      paymentMethod: 'credit_card',
      subtotalAmount: 999.99,
      totalAmount: 999.99
    };

    const result = validateOrderData(orderWithInvalidAddress);
    
    assert.strictEqual(result.success, false);
    
    if (result.error instanceof ZodError) {
      const errors = result.error.errors;
      const addressErrors = errors.filter(e => 
        e.path.includes('shippingAddress')
      );
      
      assert.ok(addressErrors.length > 0);
      assert.ok(addressErrors.some(e => e.path.includes('street')));
      assert.ok(addressErrors.some(e => e.path.includes('city')));
      assert.ok(addressErrors.some(e => e.path.includes('state')));
      assert.ok(addressErrors.some(e => e.path.includes('zipCode')));
      assert.ok(addressErrors.some(e => e.path.includes('country')));
    }
  });

  test('should validate customer ID format', () => {
    const orderWithInvalidCustomerId = {
      customerId: 'invalid_format', // Should start with 'cust_'
      customerEmail: 'test@example.com',
      items: [{
        productId: 'prod_laptop_001',
        productName: 'Gaming Laptop',
        quantity: 1,
        unitPrice: 999.99,
        totalPrice: 999.99
      }],
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
      paymentMethod: 'credit_card',
      subtotalAmount: 999.99,
      totalAmount: 999.99
    };

    const result = validateOrderData(orderWithInvalidCustomerId);
    
    assert.strictEqual(result.success, false);
    
    if (result.error instanceof ZodError) {
      const customerIdError = result.error.errors.find(e => 
        e.path.includes('customerId')
      );
      assert.ok(customerIdError);
      assert.ok(customerIdError.message.includes('format') || customerIdError.message.includes('pattern'));
    }
  });
});

describe('Payment Validation Utils Unit Tests', () => {

  test('should validate complete payment data', () => {
    const validPaymentData = {
      orderId: 'ord_123456789',
      amount: 99.99,
      currency: 'USD',
      paymentMethod: 'credit_card',
      paymentDetails: {
        cardNumber: '4111111111111111',
        expiryMonth: '12',
        expiryYear: '2025',
        cvv: '123',
        cardholderName: 'john doe'
      }
    };

    const result = validatePaymentData(validPaymentData);
    
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.data.orderId, 'ord_123456789');
    assert.strictEqual(result.data.amount, 99.99);
    assert.strictEqual(result.data.currency, 'USD');
  });

  test('should reject payment with invalid card number', () => {
    const invalidPaymentData = {
      orderId: 'ord_123456789',
      amount: 99.99,
      currency: 'USD',
      paymentMethod: 'credit_card',
      paymentDetails: {
        cardNumber: '1234567890123456', // Invalid card number
        expiryMonth: '12',
        expiryYear: '2025',
        cvv: '123',
        cardholderName: 'John Doe'
      }
    };

    const result = validatePaymentData(invalidPaymentData);
    
    assert.strictEqual(result.success, false);
    
    if (result.error instanceof ZodError) {
      const cardError = result.error.errors.find(e => 
        e.path.includes('cardNumber')
      );
      assert.ok(cardError);
    }
  });

  test('should reject payment with invalid expiry date', () => {
    const pastDate = {
      orderId: 'ord_123456789',
      amount: 99.99,
      currency: 'USD',
      paymentMethod: 'credit_card',
      paymentDetails: {
        cardNumber: '4111111111111111',
        expiryMonth: '01',
        expiryYear: '2020', // Past year
        cvv: '123',
        cardholderName: 'John Doe'
      }
    };

    const result = validatePaymentData(pastDate);
    
    assert.strictEqual(result.success, false);
    
    if (result.error instanceof ZodError) {
      const expiryError = result.error.errors.find(e => 
        e.path.includes('expiryYear') || e.path.includes('expiryMonth')
      );
      assert.ok(expiryError);
    }
  });

  test('should validate payment amount constraints', () => {
    const testCases = [
      {
        description: 'zero amount',
        amount: 0,
        shouldFail: true
      },
      {
        description: 'negative amount',
        amount: -50.00,
        shouldFail: true
      },
      {
        description: 'too many decimal places',
        amount: 99.999,
        shouldFail: true
      },
      {
        description: 'valid small amount',
        amount: 0.01,
        shouldFail: false
      },
      {
        description: 'valid large amount',
        amount: 9999.99,
        shouldFail: false
      }
    ];

    testCases.forEach(({ description, amount, shouldFail }) => {
      const paymentData = {
        orderId: 'ord_123456789',
        amount,
        currency: 'USD',
        paymentMethod: 'credit_card',
        paymentDetails: {
          cardNumber: '4111111111111111',
          expiryMonth: '12',
          expiryYear: '2025',
          cvv: '123',
          cardholderName: 'John Doe'
        }
      };

      const result = validatePaymentData(paymentData);
      
      if (shouldFail) {
        assert.strictEqual(result.success, false, `Should fail for ${description}`);
      } else {
        assert.strictEqual(result.success, true, `Should pass for ${description}`);
      }
    });
  });

  test('should validate supported currencies', () => {
    const supportedCurrencies = ['USD', 'EUR', 'GBP', 'CAD'];
    const unsupportedCurrencies = ['XYZ', 'ABC', 'JPY'];

    supportedCurrencies.forEach(currency => {
      const paymentData = {
        orderId: 'ord_123456789',
        amount: 99.99,
        currency,
        paymentMethod: 'credit_card',
        paymentDetails: {
          cardNumber: '4111111111111111',
          expiryMonth: '12',
          expiryYear: '2025',
          cvv: '123',
          cardholderName: 'John Doe'
        }
      };

      const result = validatePaymentData(paymentData);
      assert.strictEqual(result.success, true, `Should accept currency ${currency}`);
    });

    unsupportedCurrencies.forEach(currency => {
      const paymentData = {
        orderId: 'ord_123456789',
        amount: 99.99,
        currency,
        paymentMethod: 'credit_card',
        paymentDetails: {
          cardNumber: '4111111111111111',
          expiryMonth: '12',
          expiryYear: '2025',
          cvv: '123',
          cardholderName: 'John Doe'
        }
      };

      const result = validatePaymentData(paymentData);
      assert.strictEqual(result.success, false, `Should reject currency ${currency}`);
    });
  });

  test('should validate CVV format based on card type', () => {
    const testCases = [
      {
        cardNumber: '4111111111111111', // Visa
        cvv: '123',
        shouldPass: true
      },
      {
        cardNumber: '4111111111111111', // Visa
        cvv: '12', // Too short
        shouldPass: false
      },
      {
        cardNumber: '4111111111111111', // Visa
        cvv: '1234', // Too long for Visa
        shouldPass: false
      },
      {
        cardNumber: '378282246310005', // Amex
        cvv: '1234', // Correct length for Amex
        shouldPass: true
      },
      {
        cardNumber: '378282246310005', // Amex
        cvv: '123', // Too short for Amex
        shouldPass: false
      }
    ];

    testCases.forEach(({ cardNumber, cvv, shouldPass }) => {
      const paymentData = {
        orderId: 'ord_123456789',
        amount: 99.99,
        currency: 'USD',
        paymentMethod: 'credit_card',
        paymentDetails: {
          cardNumber,
          expiryMonth: '12',
          expiryYear: '2025',
          cvv,
          cardholderName: 'John Doe'
        }
      };

      const result = validatePaymentData(paymentData);
      
      if (shouldPass) {
        assert.strictEqual(result.success, true, `Should accept CVV ${cvv} for card ${cardNumber.slice(-4)}`);
      } else {
        assert.strictEqual(result.success, false, `Should reject CVV ${cvv} for card ${cardNumber.slice(-4)}`);
      }
    });
  });

  test('should sanitize cardholder name', () => {
    const paymentData = {
      orderId: 'ord_123456789',
      amount: 99.99,
      currency: 'USD',
      paymentMethod: 'credit_card',
      paymentDetails: {
        cardNumber: '4111111111111111',
        expiryMonth: '12',
        expiryYear: '2025',
        cvv: '123',
        cardholderName: '  JOHN DOE  ' // Extra spaces and uppercase
      }
    };

    const result = validatePaymentData(paymentData);
    
    assert.strictEqual(result.success, true);
    // Check if it's credit card details by checking for cardholderName property
    if ('cardholderName' in result.data.paymentDetails) {
      assert.strictEqual(result.data.paymentDetails.cardholderName, 'John Doe');
    }
  });

  test('should validate payment method types', () => {
    const validMethods = ['credit_card', 'debit_card', 'bank_transfer', 'paypal'];
    const invalidMethods = ['cash', 'check', 'bitcoin', 'invalid_method'];

    validMethods.forEach(method => {
      const paymentData = {
        orderId: 'ord_123456789',
        amount: 99.99,
        currency: 'USD',
        paymentMethod: method,
        paymentDetails: {
          cardNumber: '4111111111111111',
          expiryMonth: '12',
          expiryYear: '2025',
          cvv: '123',
          cardholderName: 'John Doe'
        }
      };

      const result = validatePaymentData(paymentData);
      assert.strictEqual(result.success, true, `Should accept payment method ${method}`);
    });

    invalidMethods.forEach(method => {
      const paymentData = {
        orderId: 'ord_123456789',
        amount: 99.99,
        currency: 'USD',
        paymentMethod: method,
        paymentDetails: {
          cardNumber: '4111111111111111',
          expiryMonth: '12',
          expiryYear: '2025',
          cvv: '123',
          cardholderName: 'John Doe'
        }
      };

      const result = validatePaymentData(paymentData);
      assert.strictEqual(result.success, false, `Should reject payment method ${method}`);
    });
  });

  test('should validate order ID format in payment', () => {
    const validOrderIds = ['ord_123456789', 'ord_abc123def456'];
    const invalidOrderIds = ['123456789', 'order_123', 'ord_', 'invalid'];

    validOrderIds.forEach(orderId => {
      const paymentData = {
        orderId,
        amount: 99.99,
        currency: 'USD',
        paymentMethod: 'credit_card',
        paymentDetails: {
          cardNumber: '4111111111111111',
          expiryMonth: '12',
          expiryYear: '2025',
          cvv: '123',
          cardholderName: 'John Doe'
        }
      };

      const result = validatePaymentData(paymentData);
      assert.strictEqual(result.success, true, `Should accept order ID ${orderId}`);
    });

    invalidOrderIds.forEach(orderId => {
      const paymentData = {
        orderId,
        amount: 99.99,
        currency: 'USD',
        paymentMethod: 'credit_card',
        paymentDetails: {
          cardNumber: '4111111111111111',
          expiryMonth: '12',
          expiryYear: '2025',
          cvv: '123',
          cardholderName: 'John Doe'
        }
      };

      const result = validatePaymentData(paymentData);
      assert.strictEqual(result.success, false, `Should reject order ID ${orderId}`);
    });
  });
});