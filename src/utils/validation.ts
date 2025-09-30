import { z, ZodError } from 'zod';
import { OrderValidator } from '../models/order.js';
import { PaymentValidator } from '../models/payment.js';
import type { CreateOrderRequest } from '../models/order.js';
import type { PaymentRequest } from '../models/payment.js';

/**
 * Data Validation Utilities
 * 
 * Centralized validation functions for order and payment data.
 * Used throughout the application for consistent data validation.
 */

/**
 * Validate order data using the Order model validation
 */
export function validateOrderData(data: unknown): { success: true; data: CreateOrderRequest } | { success: false; error: ZodError } {
  return OrderValidator.validateCreateOrder(data);
}

/**
 * Validate payment data using the Payment model validation  
 */
export function validatePaymentData(data: unknown): { success: true; data: PaymentRequest } | { success: false; error: ZodError } {
  return PaymentValidator.validatePaymentRequest(data);
}

/**
 * Email validation schema
 */
export const EmailSchema = z.string().email('Invalid email format');

/**
 * Phone number validation schema (US format)
 */
export const PhoneSchema = z.string().regex(
  /^\+?1?[-.\s]?\(?([0-9]{3})\)?[-.\s]?([0-9]{3})[-.\s]?([0-9]{4})$/,
  'Invalid phone number format'
);

/**
 * Validate email address
 */
export function validateEmail(email: string): boolean {
  const result = EmailSchema.safeParse(email);
  return result.success;
}

/**
 * Validate phone number
 */
export function validatePhone(phone: string): boolean {
  const result = PhoneSchema.safeParse(phone);
  return result.success;
}

/**
 * Sanitize and normalize text input
 */
export function sanitizeText(text: string): string {
  return text.trim().replace(/\s+/g, ' ');
}

/**
 * Validate and normalize postal code
 */
export function validatePostalCode(code: string, country: string = 'US'): boolean {
  const patterns: Record<string, RegExp> = {
    'US': /^\d{5}(-\d{4})?$/,
    'CA': /^[A-Z]\d[A-Z]\s?\d[A-Z]\d$/,
    'GB': /^[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}$/
  };

  const pattern = patterns[country];
  if (!pattern) return true; // Allow unknown countries

  return pattern.test(code.toUpperCase());
}

/**
 * Validate currency amount (positive, max 2 decimal places)
 */
export function validateCurrencyAmount(amount: number): boolean {
  return amount > 0 && 
         Number.isFinite(amount) && 
         Math.round(amount * 100) === amount * 100;
}

/**
 * Format currency amount to 2 decimal places
 */
export function formatCurrency(amount: number): number {
  return Math.round(amount * 100) / 100;
}

/**
 * Validate quantity (positive integer)
 */
export function validateQuantity(quantity: number): boolean {
  return Number.isInteger(quantity) && quantity > 0;
}

/**
 * Validate ID format for various entity types
 */
export function validateId(id: string, type: 'order' | 'customer' | 'product' | 'payment'): boolean {
  const patterns: Record<string, RegExp> = {
    order: /^ord_[a-zA-Z0-9]+$/,
    customer: /^cust_[a-zA-Z0-9]+$/,
    product: /^prod_[a-zA-Z0-9_]+$/,
    payment: /^pay_[a-zA-Z0-9]+$/
  };

  const pattern = patterns[type];
  return pattern ? pattern.test(id) : false;
}

/**
 * Generate validation error response
 */
export function formatValidationError(error: ZodError): {
  error: string;
  code: string;
  details: Array<{
    field: string;
    message: string;
    value?: unknown;
  }>;
} {
  return {
    error: 'Validation failed',
    code: 'VALIDATION_ERROR',
    details: error.errors.map(err => ({
      field: err.path.join('.'),
      message: err.message
    }))
  };
}

/**
 * Common validation schemas for request parameters
 */
export const CommonSchemas = {
  // Pagination parameters
  pagination: z.object({
    page: z.number().int().min(1).default(1),
    limit: z.number().int().min(1).max(100).default(20)
  }),

  // Sorting parameters  
  sorting: z.object({
    sortBy: z.string().min(1).default('createdAt'),
    sortOrder: z.enum(['asc', 'desc']).default('desc')
  }),

  // Date range parameters
  dateRange: z.object({
    fromDate: z.string().datetime().optional(),
    toDate: z.string().datetime().optional()
  }).refine(
    (data) => {
      if (data.fromDate && data.toDate) {
        return new Date(data.fromDate) <= new Date(data.toDate);
      }
      return true;
    },
    { message: 'fromDate must be before toDate' }
  ),

  // Search parameters
  search: z.object({
    query: z.string().min(1).max(100).optional(),
    fields: z.array(z.string()).optional()
  })
};

/**
 * Validate request query parameters
 */
export function validateQueryParams(
  params: unknown, 
  schema: z.ZodSchema
): { success: true; data: any } | { success: false; error: ZodError } {
  const result = schema.safeParse(params);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, error: result.error };
}

/**
 * Validate and transform string to number
 */
export function parseNumber(value: string): number | null {
  const num = parseFloat(value);
  return Number.isFinite(num) ? num : null;
}

/**
 * Validate and transform string to integer
 */
export function parseInt(value: string): number | null {
  const num = Number.parseInt(value, 10);
  return Number.isInteger(num) ? num : null;
}

/**
 * Validate and transform string to boolean
 */
export function parseBoolean(value: string): boolean | null {
  const lower = value.toLowerCase();
  if (['true', '1', 'yes', 'on'].includes(lower)) return true;
  if (['false', '0', 'no', 'off'].includes(lower)) return false;
  return null;
}

/**
 * Validate file upload constraints
 */
export function validateFileUpload(file: {
  size: number;
  mimetype: string;
  filename: string;
}): { valid: boolean; error?: string } {
  const maxSize = 5 * 1024 * 1024; // 5MB
  const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'application/pdf'];
  
  if (file.size > maxSize) {
    return { valid: false, error: 'File size exceeds 5MB limit' };
  }
  
  if (!allowedTypes.includes(file.mimetype)) {
    return { valid: false, error: 'File type not allowed' };
  }
  
  return { valid: true };
}

/**
 * Rate limiting validation
 */
export function validateRateLimit(
  attempts: number, 
  maxAttempts: number, 
  windowMs: number, 
  lastAttempt: number
): { allowed: boolean; resetTime?: number } {
  const now = Date.now();
  const windowStart = now - windowMs;
  
  if (lastAttempt < windowStart) {
    // Window has reset
    return { allowed: true };
  }
  
  if (attempts >= maxAttempts) {
    const resetTime = lastAttempt + windowMs;
    return { allowed: false, resetTime };
  }
  
  return { allowed: true };
}

/**
 * Password strength validation
 */
export function validatePasswordStrength(password: string): {
  valid: boolean;
  score: number;
  feedback: string[];
} {
  const feedback: string[] = [];
  let score = 0;
  
  if (password.length < 8) {
    feedback.push('Password must be at least 8 characters long');
  } else {
    score += 1;
  }
  
  if (!/[a-z]/.test(password)) {
    feedback.push('Password must contain lowercase letters');
  } else {
    score += 1;
  }
  
  if (!/[A-Z]/.test(password)) {
    feedback.push('Password must contain uppercase letters');
  } else {
    score += 1;
  }
  
  if (!/\d/.test(password)) {
    feedback.push('Password must contain numbers');
  } else {
    score += 1;
  }
  
  if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
    feedback.push('Password must contain special characters');
  } else {
    score += 1;
  }
  
  return {
    valid: score >= 4,
    score,
    feedback
  };
}