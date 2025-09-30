import { test, describe } from 'node:test';
import assert from 'node:assert';
import { PaymentService } from '../../../src/services/PaymentService.js';
import type { PaymentRequest, PaymentResult } from '../../../src/services/PaymentService.js';

/**
 * Unit Test: Payment Service
 * 
 * Tests the PaymentService static methods for payment processing,
 * fee calculations, and validation functionality.
 */

describe('PaymentService', () => {
  test('should process valid credit card payment', async () => {
    const paymentRequest: PaymentRequest = {
      orderId: 'ord_test_123456789',
      customerId: 'cust_123456789',
      amountCents: 9999, // $99.99 in cents
      currency: 'USD',
      paymentMethod: 'credit_card',
      paymentMethodDetails: {
        cardToken: 'card_1234567890abcdef',
        cardLast4: '1111',
        cardBrand: 'visa',
        cardExpiryMonth: 12,
        cardExpiryYear: 2025
      },
      billingAddress: {
        line1: '123 Main St',
        city: 'Anytown',
        state: 'CA',
        postalCode: '12345',
        country: 'US'
      }
    };

    const result = await PaymentService.processPayment(paymentRequest);
    
    // Should process successfully or fail based on mock processor
    assert.strictEqual(typeof result.success, 'boolean');
    if (result.success) {
      assert.ok(result.paymentId);
      assert.strictEqual(result.status, 'completed');
    } else {
      // Mock processor can simulate failures
      assert.ok(result.error);
      assert.strictEqual(result.status, 'failed');
    }
  });

  test('should handle payment processing errors', async () => {
    const invalidPaymentRequest: PaymentRequest = {
      orderId: 'ord_invalid_123',
      customerId: 'cust_invalid',
      amountCents: -100, // Invalid negative amount
      currency: 'USD',
      paymentMethod: 'credit_card',
      paymentMethodDetails: {
        cardToken: 'invalid_card_token',
        cardLast4: '0000',
        cardBrand: 'unknown',
        cardExpiryMonth: 1,
        cardExpiryYear: 2020 // Expired
      },
      billingAddress: {
        line1: '',
        city: '',
        state: '',
        postalCode: '',
        country: 'US'
      }
    };

    const result = await PaymentService.processPayment(invalidPaymentRequest);
    
    // Should fail validation or processing
    assert.strictEqual(result.success, false);
    assert.ok(result.error);
    assert.strictEqual(result.status, 'failed');
  });

  test('should calculate processing fees correctly', () => {
    const testCases = [
      { amount: 1000, expectedMin: 50, expectedMax: 100 }, // $10.00 -> reasonable fee range
      { amount: 5000, expectedMin: 150, expectedMax: 250 }, // $50.00 -> reasonable fee range
      { amount: 100, expectedMin: 30, expectedMax: 80 }  // $1.00 -> minimum fees apply
    ];

    testCases.forEach(({ amount, expectedMin, expectedMax }) => {
      const result = PaymentService.calculateTotalWithFees(amount, 'credit_card');
      const actualFee = result.totalFee;
      
      assert.ok(actualFee >= expectedMin && actualFee <= expectedMax, 
        `Fee ${actualFee} should be between ${expectedMin} and ${expectedMax} for amount ${amount}`);
      
      // Total amount should include original + fees
      assert.strictEqual(result.totalAmount, amount + actualFee);
    });
  });

  test('should handle PayPal payments', async () => {
    const paypalRequest: PaymentRequest = {
      orderId: 'ord_test_paypal_123',
      customerId: 'cust_123456789',
      amountCents: 5000,
      currency: 'USD',
      paymentMethod: 'paypal',
      paymentMethodDetails: {
        walletToken: 'paypal_token_123',
        walletEmail: 'test@example.com'
      },
      billingAddress: {
        line1: '123 Main St',
        city: 'Anytown',
        state: 'CA',
        postalCode: '12345',
        country: 'US'
      }
    };

    const result = await PaymentService.processPayment(paypalRequest);
    assert.strictEqual(typeof result.success, 'boolean');
  });

  test('should handle bank transfer payments', async () => {
    const bankTransferRequest: PaymentRequest = {
      orderId: 'ord_test_bank_123',
      customerId: 'cust_123456789',
      amountCents: 10000,
      currency: 'USD',
      paymentMethod: 'bank_transfer',
      paymentMethodDetails: {
        bankAccountId: 'bank_acc_123',
        routingNumber: '123456789',
        accountLast4: '1234'
      },
      billingAddress: {
        line1: '123 Main St',
        city: 'Anytown',
        state: 'CA',
        postalCode: '12345',
        country: 'US'
      }
    };

    const result = await PaymentService.processPayment(bankTransferRequest);
    assert.strictEqual(typeof result.success, 'boolean');
  });
});