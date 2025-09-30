import { z } from 'zod';

/**
 * Payment Model with Zod Validation
 * 
 * Defines payment data structures and validation for the retail microservice.
 */

// Payment method types
export const PaymentMethod = z.enum([
  'credit_card',
  'debit_card',
  'bank_transfer', 
  'paypal',
  'apple_pay',
  'google_pay'
]);

export type PaymentMethod = z.infer<typeof PaymentMethod>;

// Payment status enumeration
export const PaymentStatus = z.enum([
  'pending',
  'processing',
  'completed',
  'failed',
  'cancelled',
  'refunded',
  'partially_refunded'
]);

export type PaymentStatus = z.infer<typeof PaymentStatus>;

// Supported currencies
export const Currency = z.enum(['USD', 'EUR', 'GBP', 'CAD']);
export type Currency = z.infer<typeof Currency>;

// Credit card details schema
export const CreditCardDetailsSchema = z.object({
  cardNumber: z.string().regex(/^\d{13,19}$/, 'Invalid card number format'),
  expiryMonth: z.string().regex(/^(0[1-9]|1[0-2])$/, 'Invalid expiry month'),
  expiryYear: z.string().regex(/^20\d{2}$/, 'Invalid expiry year'),
  cvv: z.string().regex(/^\d{3,4}$/, 'Invalid CVV format'),
  cardholderName: z.string().min(2).max(100).transform(str => 
    str.trim().split(' ').map(word => 
      word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    ).join(' ')
  )
}).refine(
  (card) => {
    // Validate expiry date is in the future
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth() + 1;
    const expiryYear = parseInt(card.expiryYear);
    const expiryMonth = parseInt(card.expiryMonth);
    
    return expiryYear > currentYear || 
           (expiryYear === currentYear && expiryMonth >= currentMonth);
  },
  { message: 'Card has expired' }
).refine(
  (card) => {
    // Luhn algorithm validation for card number
    const digits = card.cardNumber.split('').map(Number);
    let sum = 0;
    let isEven = false;
    
    for (let i = digits.length - 1; i >= 0; i--) {
      let digit = digits[i];
      
      if (digit === undefined) continue; // Skip undefined digits
      
      if (isEven) {
        digit *= 2;
        if (digit > 9) {
          digit -= 9;
        }
      }
      
      sum += digit;
      isEven = !isEven;
    }
    
    return sum % 10 === 0;
  },
  { message: 'Invalid card number' }
);

export type CreditCardDetails = z.infer<typeof CreditCardDetailsSchema>;

// Bank transfer details schema
export const BankTransferDetailsSchema = z.object({
  bankName: z.string().min(2).max(100),
  accountNumber: z.string().regex(/^\d{8,17}$/, 'Invalid account number'),
  routingNumber: z.string().regex(/^\d{9}$/, 'Invalid routing number'),
  accountHolderName: z.string().min(2).max(100)
});

export type BankTransferDetails = z.infer<typeof BankTransferDetailsSchema>;

// PayPal details schema
export const PayPalDetailsSchema = z.object({
  paypalEmail: z.string().email('Invalid PayPal email'),
  paypalTransactionId: z.string().optional()
});

export type PayPalDetails = z.infer<typeof PayPalDetailsSchema>;

// Payment details union type
export const PaymentDetailsSchema = z.union([
  CreditCardDetailsSchema,
  BankTransferDetailsSchema,
  PayPalDetailsSchema
]);

export type PaymentDetails = z.infer<typeof PaymentDetailsSchema>;

// Main payment request schema
export const PaymentRequestSchema = z.object({
  orderId: z.string().regex(/^ord_[a-zA-Z0-9]+$/, 'Invalid order ID format'),
  amount: z.number().min(0.01, 'Amount must be positive').multipleOf(0.01),
  currency: Currency.default('USD'),
  paymentMethod: PaymentMethod,
  paymentDetails: PaymentDetailsSchema,
  description: z.string().max(500).optional(),
  metadata: z.record(z.string()).optional()
});

export type PaymentRequest = z.infer<typeof PaymentRequestSchema>;

// Payment result schema
export const PaymentResultSchema = z.object({
  paymentId: z.string(),
  transactionId: z.string().optional(),
  status: PaymentStatus,
  amount: z.number().multipleOf(0.01),
  currency: Currency,
  processedAt: z.string().datetime(),
  error: z.string().optional(),
  gatewayResponse: z.record(z.unknown()).optional()
});

export type PaymentResult = z.infer<typeof PaymentResultSchema>;

// Payment record schema (for database storage)
export const PaymentSchema = z.object({
  id: z.string().regex(/^pay_[a-zA-Z0-9]+$/, 'Invalid payment ID format'),
  orderId: z.string().regex(/^ord_[a-zA-Z0-9]+$/, 'Invalid order ID format'),
  customerId: z.string().regex(/^cust_[a-zA-Z0-9]+$/, 'Invalid customer ID format'),
  
  // Payment details
  amount: z.number().min(0.01).multipleOf(0.01),
  currency: Currency,
  paymentMethod: PaymentMethod,
  status: PaymentStatus,
  
  // Transaction information
  transactionId: z.string().optional(),
  gatewayTransactionId: z.string().optional(),
  authorizationCode: z.string().optional(),
  
  // Card information (masked)
  cardLast4: z.string().regex(/^\d{4}$/).optional(),
  cardBrand: z.enum(['visa', 'mastercard', 'amex', 'discover', 'unknown']).optional(),
  cardExpiryMonth: z.string().regex(/^(0[1-9]|1[0-2])$/).optional(),
  cardExpiryYear: z.string().regex(/^20\d{2}$/).optional(),
  
  // Processing details
  processingFee: z.number().min(0).multipleOf(0.01).default(0),
  netAmount: z.number().multipleOf(0.01),
  
  // Error information
  errorCode: z.string().optional(),
  errorMessage: z.string().optional(),
  
  // Timestamps
  createdAt: z.string().datetime(),
  processedAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime(),
  
  // Metadata
  description: z.string().max(500).optional(),
  metadata: z.record(z.string()).optional()
});

export type Payment = z.infer<typeof PaymentSchema>;

// Refund request schema
export const RefundRequestSchema = z.object({
  paymentId: z.string().regex(/^pay_[a-zA-Z0-9]+$/, 'Invalid payment ID format'),
  amount: z.number().min(0.01).multipleOf(0.01),
  reason: z.enum([
    'requested_by_customer',
    'duplicate',
    'fraudulent',
    'subscription_cancellation',
    'product_unsatisfactory',
    'order_change',
    'other'
  ]),
  description: z.string().max(500).optional()
});

export type RefundRequest = z.infer<typeof RefundRequestSchema>;

// Refund result schema
export const RefundResultSchema = z.object({
  refundId: z.string(),
  paymentId: z.string(),
  amount: z.number().multipleOf(0.01),
  status: z.enum(['pending', 'completed', 'failed']),
  refundTransactionId: z.string().optional(),
  processedAt: z.string().datetime().optional(),
  error: z.string().optional()
});

export type RefundResult = z.infer<typeof RefundResultSchema>;

/**
 * Payment validation and utility functions
 */
export class PaymentValidator {
  /**
   * Validate payment request data
   */
  static validatePaymentRequest(data: unknown): { success: true; data: PaymentRequest } | { success: false; error: z.ZodError } {
    const result = PaymentRequestSchema.safeParse(data);
    if (result.success) {
      return { success: true, data: result.data };
    }
    return { success: false, error: result.error };
  }

  /**
   * Validate refund request data
   */
  static validateRefundRequest(data: unknown): { success: true; data: RefundRequest } | { success: false; error: z.ZodError } {
    const result = RefundRequestSchema.safeParse(data);
    if (result.success) {
      return { success: true, data: result.data };
    }
    return { success: false, error: result.error };
  }

  /**
   * Detect credit card brand from number
   */
  static detectCardBrand(cardNumber: string): 'visa' | 'mastercard' | 'amex' | 'discover' | 'unknown' {
    const cleaned = cardNumber.replace(/\s/g, '');
    
    if (/^4/.test(cleaned)) return 'visa';
    if (/^5[1-5]/.test(cleaned)) return 'mastercard';
    if (/^3[47]/.test(cleaned)) return 'amex';
    if (/^6(?:011|5)/.test(cleaned)) return 'discover';
    
    return 'unknown';
  }

  /**
   * Validate CVV based on card brand
   */
  static validateCVV(cvv: string, cardBrand: string): boolean {
    if (cardBrand === 'amex') {
      return /^\d{4}$/.test(cvv);
    }
    return /^\d{3}$/.test(cvv);
  }

  /**
   * Mask credit card number for storage
   */
  static maskCardNumber(cardNumber: string): { cardLast4: string; cardBrand: string } {
    const cleaned = cardNumber.replace(/\s/g, '');
    return {
      cardLast4: cleaned.slice(-4),
      cardBrand: this.detectCardBrand(cleaned)
    };
  }

  /**
   * Calculate processing fee
   */
  static calculateProcessingFee(amount: number, paymentMethod: PaymentMethod): number {
    const feeRates = {
      credit_card: 0.029, // 2.9%
      debit_card: 0.025,  // 2.5%
      bank_transfer: 0.005, // 0.5%
      paypal: 0.034,      // 3.4%
      apple_pay: 0.029,   // 2.9%
      google_pay: 0.029   // 2.9%
    };
    
    const baseFee = 0.30; // $0.30 base fee
    const percentageFee = amount * feeRates[paymentMethod];
    
    return Math.round((baseFee + percentageFee) * 100) / 100;
  }

  /**
   * Validate payment amount constraints
   */
  static validateAmount(amount: number): boolean {
    return amount >= 0.01 && amount <= 9999.99 && 
           Number.isFinite(amount) && 
           Math.round(amount * 100) === amount * 100;
  }

  /**
   * Check if payment status transition is valid
   */
  static isValidStatusTransition(currentStatus: PaymentStatus, newStatus: PaymentStatus): boolean {
    const validTransitions: Record<PaymentStatus, PaymentStatus[]> = {
      'pending': ['processing', 'failed', 'cancelled'],
      'processing': ['completed', 'failed'],
      'completed': ['refunded', 'partially_refunded'],
      'failed': ['pending'], // Can retry
      'cancelled': [], // Terminal
      'refunded': [], // Terminal
      'partially_refunded': ['refunded']
    };

    return validTransitions[currentStatus]?.includes(newStatus) ?? false;
  }

  /**
   * Generate payment ID
   */
  static generatePaymentId(): string {
    const timestamp = Date.now().toString();
    const random = Math.random().toString(36).substring(2, 8);
    return `pay_${timestamp}_${random}`;
  }

  /**
   * Generate transaction ID
   */
  static generateTransactionId(): string {
    const timestamp = Date.now().toString();
    const random = Math.random().toString(36).substring(2, 12);
    return `txn_${timestamp}_${random}`;
  }
}