/**
 * Payment Service
 * Business logic layer for payment processing, transaction management, and refund handling
 * 
 * Integrates with external payment processors (Stripe, PayPal, etc.) while providing
 * a unified interface for payment operations throughout the system
 */

// Note: Payment model types would be imported here when available
// import type { Payment, PaymentCreate } from '../models/payment.js';

/**
 * Payment Method Types
 */
export type PaymentMethodType = 'credit_card' | 'debit_card' | 'bank_transfer' | 'paypal' | 'apple_pay' | 'google_pay';

/**
 * Payment Status Types
 */
export type PaymentStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled' | 'refunded' | 'partially_refunded';

/**
 * Payment Request Interface
 */
export interface PaymentRequest {
  orderId: string;
  customerId: string;
  amountCents: number;
  currency: string;
  paymentMethod: PaymentMethodType;
  paymentMethodDetails: {
    // Credit/Debit Card
    cardToken?: string;
    cardLast4?: string;
    cardBrand?: string;
    cardExpiryMonth?: number;
    cardExpiryYear?: number;
    
    // Bank Transfer
    bankAccountId?: string;
    routingNumber?: string;
    accountLast4?: string;
    
    // Digital Wallets
    walletToken?: string;
    walletEmail?: string;
  };
  billingAddress: {
    line1: string;
    line2?: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  };
  description?: string;
  metadata?: Record<string, string>;
}

/**
 * Payment Response Interface
 */
export interface PaymentResult {
  success: boolean;
  paymentId?: string;
  transactionId?: string;
  status: PaymentStatus;
  amountPaid?: number;
  processorResponse?: {
    id: string;
    status: string;
    message?: string;
    code?: string;
    network_transaction_id?: string;
  };
  error?: {
    code: string;
    message: string;
    details?: Record<string, any>;
  };
  fees?: {
    processingFeeCents: number;
    networkFeeCents: number;
    totalFeeCents: number;
  };
}

/**
 * Refund Request Interface
 */
export interface RefundRequest {
  paymentId: string;
  amountCents?: number; // Partial refund if specified
  reason: string;
  refundedBy: string;
  metadata?: Record<string, string>;
}

/**
 * Refund Response Interface
 */
export interface RefundResult {
  success: boolean;
  refundId?: string;
  refundedAmountCents?: number;
  status: 'pending' | 'completed' | 'failed';
  error?: {
    code: string;
    message: string;
  };
  processorResponse?: {
    id: string;
    status: string;
    message?: string;
  };
}

/**
 * Payment Processor Interface
 */
export interface PaymentProcessor {
  name: string;
  processPayment(request: PaymentRequest): Promise<PaymentResult>;
  refundPayment(paymentId: string, refundRequest: RefundRequest): Promise<RefundResult>;
  getPaymentStatus(paymentId: string): Promise<{ status: PaymentStatus; details?: any }>;
  validatePaymentMethod(method: PaymentRequest['paymentMethodDetails']): Promise<{ valid: boolean; error?: string }>;
}

/**
 * Payment Service Errors
 */
export class PaymentServiceError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: Record<string, any>
  ) {
    super(message);
    this.name = 'PaymentServiceError';
  }
}

export class InsufficientFundsError extends PaymentServiceError {
  constructor(amountRequested: number, availableAmount?: number) {
    super(
      `Insufficient funds. Requested: $${(amountRequested / 100).toFixed(2)}`,
      'INSUFFICIENT_FUNDS',
      { amountRequested, availableAmount }
    );
  }
}

export class PaymentDeclinedError extends PaymentServiceError {
  constructor(reason: string, processorCode?: string) {
    super(
      `Payment declined: ${reason}`,
      'PAYMENT_DECLINED',
      { reason, processorCode }
    );
  }
}

export class InvalidPaymentMethodError extends PaymentServiceError {
  constructor(reason: string) {
    super(
      `Invalid payment method: ${reason}`,
      'INVALID_PAYMENT_METHOD',
      { reason }
    );
  }
}

/**
 * Mock Stripe Payment Processor
 * In production, this would be replaced with actual Stripe SDK integration
 */
class MockStripeProcessor implements PaymentProcessor {
  name = 'stripe';

  async processPayment(request: PaymentRequest): Promise<PaymentResult> {
    // Simulate processing delay
    await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 2000));

    // Simulate various payment scenarios
    const random = Math.random();
    
    if (random < 0.05) {
      // 5% failure rate
      return {
        success: false,
        status: 'failed',
        error: {
          code: 'card_declined',
          message: 'Your card was declined.'
        }
      };
    }

    if (random < 0.10) {
      // 5% insufficient funds
      return {
        success: false,
        status: 'failed',
        error: {
          code: 'insufficient_funds',
          message: 'Your card has insufficient funds.'
        }
      };
    }

    // Success case
    const transactionId = `txn_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;
    const paymentId = `pay_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;
    
    return {
      success: true,
      paymentId,
      transactionId,
      status: 'completed',
      amountPaid: request.amountCents,
      processorResponse: {
        id: transactionId,
        status: 'succeeded',
        network_transaction_id: `ntwk_${Math.random().toString(36).substr(2, 12)}`
      },
      fees: {
        processingFeeCents: Math.round(request.amountCents * 0.029) + 30, // 2.9% + 30 cents
        networkFeeCents: 15,
        totalFeeCents: Math.round(request.amountCents * 0.029) + 45
      }
    };
  }

  async refundPayment(paymentId: string, refundRequest: RefundRequest): Promise<RefundResult> {
    // Simulate processing delay
    await new Promise(resolve => setTimeout(resolve, 500 + Math.random() * 1000));

    const random = Math.random();
    
    if (random < 0.02) {
      // 2% failure rate
      return {
        success: false,
        status: 'failed',
        error: {
          code: 'refund_failed',
          message: 'The refund could not be processed.'
        }
      };
    }

    const refundId = `ref_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;
    
    return {
      success: true,
      refundId,
      refundedAmountCents: refundRequest.amountCents || 0,
      status: 'completed',
      processorResponse: {
        id: refundId,
        status: 'succeeded'
      }
    };
  }

  async getPaymentStatus(paymentId: string): Promise<{ status: PaymentStatus; details?: any }> {
    // Mock status check
    return {
      status: 'completed',
      details: {
        id: paymentId,
        amount: 1000,
        status: 'succeeded'
      }
    };
  }

  async validatePaymentMethod(method: PaymentRequest['paymentMethodDetails']): Promise<{ valid: boolean; error?: string }> {
    if (!method.cardToken && !method.bankAccountId && !method.walletToken) {
      return { valid: false, error: 'No payment method provided' };
    }

    // Mock validation - card tokens must be at least 10 characters
    if (method.cardToken && method.cardToken.length < 10) {
      return { valid: false, error: 'Invalid card token format' };
    }

    return { valid: true };
  }
}

/**
 * Payment Service Implementation
 */
export class PaymentService {
  private static processors: Map<string, PaymentProcessor> = new Map();
  private static defaultProcessor = 'stripe';

  static {
    // Initialize payment processors
    this.processors.set('stripe', new MockStripeProcessor());
    // Add other processors here (PayPal, Square, etc.)
  }

  /**
   * Process a payment
   */
  static async processPayment(request: PaymentRequest, processorName?: string): Promise<PaymentResult> {
    try {
      const processor = this.getProcessor(processorName);
      
      // Validate request
      await this.validatePaymentRequest(request);
      
      // Validate payment method with processor
      const validation = await processor.validatePaymentMethod(request.paymentMethodDetails);
      if (!validation.valid) {
        throw new InvalidPaymentMethodError(validation.error || 'Invalid payment method');
      }

      // Process payment
      const result = await processor.processPayment(request);
      
      // Handle processor-specific errors
      if (!result.success && result.error) {
        this.handleProcessorError(result.error);
      }

      // Log payment attempt
      await this.logPaymentAttempt(request, result);

      return result;

    } catch (error) {
      if (error instanceof PaymentServiceError) {
        return {
          success: false,
          status: 'failed',
          error: {
            code: error.code,
            message: error.message,
            ...(error.details && { details: error.details })
          }
        };
      }
      
      // Unexpected error
      return {
        success: false,
        status: 'failed',
        error: {
          code: 'PAYMENT_PROCESSING_ERROR',
          message: 'An unexpected error occurred while processing the payment'
        }
      };
    }
  }

  /**
   * Refund a payment
   */
  static async refundPayment(refundRequest: RefundRequest, processorName?: string): Promise<RefundResult> {
    try {
      const processor = this.getProcessor(processorName);
      
      // Validate refund request
      await this.validateRefundRequest(refundRequest);
      
      // Process refund
      const result = await processor.refundPayment(refundRequest.paymentId, refundRequest);
      
      // Log refund attempt
      await this.logRefundAttempt(refundRequest, result);

      return result;

    } catch (error) {
      if (error instanceof PaymentServiceError) {
        return {
          success: false,
          status: 'failed',
          error: {
            code: error.code,
            message: error.message
          }
        };
      }

      return {
        success: false,
        status: 'failed',
        error: {
          code: 'REFUND_PROCESSING_ERROR',
          message: 'An unexpected error occurred while processing the refund'
        }
      };
    }
  }

  /**
   * Get payment status from processor
   */
  static async getPaymentStatus(paymentId: string, processorName?: string): Promise<{ status: PaymentStatus; details?: any }> {
    const processor = this.getProcessor(processorName);
    return processor.getPaymentStatus(paymentId);
  }

  /**
   * Calculate total payment amount including fees
   */
  static calculateTotalWithFees(amountCents: number, paymentMethod: PaymentMethodType): {
    originalAmount: number;
    processingFee: number;
    networkFee: number;
    totalFee: number;
    totalAmount: number;
  } {
    let processingFeeRate = 0.029; // Default 2.9%
    let fixedFee = 30; // 30 cents
    let networkFee = 15; // 15 cents

    // Adjust fees based on payment method
    switch (paymentMethod) {
      case 'debit_card':
        processingFeeRate = 0.054; // 5.4%
        fixedFee = 22;
        break;
      case 'bank_transfer':
        processingFeeRate = 0.008; // 0.8%
        fixedFee = 0;
        networkFee = 0;
        break;
      case 'paypal':
        processingFeeRate = 0.0349; // 3.49%
        fixedFee = 49;
        break;
      case 'apple_pay':
      case 'google_pay':
        processingFeeRate = 0.029; // Same as credit card
        fixedFee = 30;
        networkFee = 10; // Lower network fee
        break;
    }

    const processingFee = Math.round(amountCents * processingFeeRate) + fixedFee;
    const totalFee = processingFee + networkFee;
    const totalAmount = amountCents + totalFee;

    return {
      originalAmount: amountCents,
      processingFee,
      networkFee,
      totalFee,
      totalAmount
    };
  }

  /**
   * Validate supported payment methods
   */
  static isSupportedPaymentMethod(method: PaymentMethodType): boolean {
    const supportedMethods: PaymentMethodType[] = [
      'credit_card',
      'debit_card', 
      'bank_transfer',
      'paypal',
      'apple_pay',
      'google_pay'
    ];
    
    return supportedMethods.includes(method);
  }

  // Private helper methods

  /**
   * Get payment processor instance
   */
  private static getProcessor(processorName?: string): PaymentProcessor {
    const name = processorName || this.defaultProcessor;
    const processor = this.processors.get(name);
    
    if (!processor) {
      throw new PaymentServiceError(
        `Payment processor not found: ${name}`,
        'PROCESSOR_NOT_FOUND',
        { processorName: name }
      );
    }
    
    return processor;
  }

  /**
   * Validate payment request
   */
  private static async validatePaymentRequest(request: PaymentRequest): Promise<void> {
    // Validate required fields
    if (!request.orderId) {
      throw new PaymentServiceError('Order ID is required', 'MISSING_ORDER_ID');
    }

    if (!request.customerId) {
      throw new PaymentServiceError('Customer ID is required', 'MISSING_CUSTOMER_ID');
    }

    if (!request.amountCents || request.amountCents <= 0) {
      throw new PaymentServiceError('Valid payment amount is required', 'INVALID_AMOUNT');
    }

    if (request.amountCents < 50) {
      throw new PaymentServiceError('Payment amount must be at least $0.50', 'AMOUNT_TOO_SMALL');
    }

    if (request.amountCents > 1000000) { // $10,000 limit
      throw new PaymentServiceError('Payment amount exceeds maximum limit', 'AMOUNT_TOO_LARGE');
    }

    if (!this.isSupportedPaymentMethod(request.paymentMethod)) {
      throw new InvalidPaymentMethodError(`Unsupported payment method: ${request.paymentMethod}`);
    }

    // Validate billing address
    if (!request.billingAddress.line1 || !request.billingAddress.city || 
        !request.billingAddress.state || !request.billingAddress.postalCode) {
      throw new PaymentServiceError('Complete billing address is required', 'INCOMPLETE_BILLING_ADDRESS');
    }
  }

  /**
   * Validate refund request
   */
  private static async validateRefundRequest(request: RefundRequest): Promise<void> {
    if (!request.paymentId) {
      throw new PaymentServiceError('Payment ID is required for refund', 'MISSING_PAYMENT_ID');
    }

    if (!request.reason) {
      throw new PaymentServiceError('Refund reason is required', 'MISSING_REFUND_REASON');
    }

    if (request.amountCents && request.amountCents <= 0) {
      throw new PaymentServiceError('Refund amount must be positive', 'INVALID_REFUND_AMOUNT');
    }
  }

  /**
   * Handle processor-specific errors
   */
  private static handleProcessorError(error: PaymentResult['error']): never {
    if (!error) {
      throw new PaymentServiceError('Unknown payment processor error', 'PROCESSOR_ERROR');
    }

    switch (error.code) {
      case 'card_declined':
      case 'payment_declined':
        throw new PaymentDeclinedError(error.message, error.code);
      
      case 'insufficient_funds':
        throw new InsufficientFundsError(0); // Amount not available in processor error
        
      case 'invalid_card':
      case 'expired_card':
      case 'invalid_cvc':
        throw new InvalidPaymentMethodError(error.message);
        
      default:
        throw new PaymentServiceError(
          error.message || 'Payment processing failed',
          error.code || 'PAYMENT_FAILED',
          error.details
        );
    }
  }

  /**
   * Log payment attempt for audit and analysis
   */
  private static async logPaymentAttempt(request: PaymentRequest, result: PaymentResult): Promise<void> {
    const logEntry = {
      timestamp: new Date().toISOString(),
      orderId: request.orderId,
      customerId: request.customerId,
      amountCents: request.amountCents,
      paymentMethod: request.paymentMethod,
      success: result.success,
      status: result.status,
      paymentId: result.paymentId,
      transactionId: result.transactionId,
      errorCode: result.error?.code,
      processingTime: Date.now() // This would be actual processing time in real implementation
    };

    // In production, this would write to a logging service or database
    console.log('Payment Attempt:', logEntry);
  }

  /**
   * Log refund attempt for audit
   */
  private static async logRefundAttempt(request: RefundRequest, result: RefundResult): Promise<void> {
    const logEntry = {
      timestamp: new Date().toISOString(),
      paymentId: request.paymentId,
      refundId: result.refundId,
      amountCents: request.amountCents,
      reason: request.reason,
      refundedBy: request.refundedBy,
      success: result.success,
      status: result.status,
      errorCode: result.error?.code
    };

    console.log('Refund Attempt:', logEntry);
  }
}