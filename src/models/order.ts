import { z } from 'zod';

/**
 * Core Order Model with Zod Validation
 * 
 * Defines the complete data structure and validation rules for orders
 * in the retail microservice system.
 */

// Order status enumeration
export const OrderStatus = z.enum([
  'pending',
  'confirmed', 
  'processing',
  'shipped',
  'delivered',
  'cancelled',
  'refunded'
]);

export type OrderStatus = z.infer<typeof OrderStatus>;

// Address schema for shipping and billing
export const AddressSchema = z.object({
  street: z.string().min(1, 'Street address is required').max(255),
  city: z.string().min(2, 'City must be at least 2 characters').max(100),
  state: z.string().length(2, 'State must be 2-letter code'),
  zipCode: z.string().regex(/^\d{5}(-\d{4})?$/, 'Invalid ZIP code format'),
  country: z.string().length(2, 'Country must be 2-letter ISO code')
});

export type Address = z.infer<typeof AddressSchema>;

// Order line item schema
export const OrderLineItemSchema = z.object({
  id: z.string().optional(), // Set by database
  productId: z.string().regex(/^prod_[a-zA-Z0-9_]+$/, 'Invalid product ID format'),
  productName: z.string().min(1).max(255),
  productSku: z.string().optional(),
  quantity: z.number().int().min(1, 'Quantity must be at least 1').max(999),
  unitPrice: z.number().min(0.01, 'Unit price must be positive').multipleOf(0.01),
  totalPrice: z.number().min(0.01).multipleOf(0.01),
  taxAmount: z.number().min(0).multipleOf(0.01).default(0),
  discountAmount: z.number().min(0).multipleOf(0.01).default(0)
}).refine(
  (item) => Math.abs(item.totalPrice - (item.unitPrice * item.quantity - item.discountAmount + item.taxAmount)) < 0.01,
  { message: 'Total price calculation is incorrect' }
);

export type OrderLineItem = z.infer<typeof OrderLineItemSchema>;

// Base order object schema (without refinements)
const BaseOrderSchema = z.object({
  id: z.string().regex(/^ord_[a-zA-Z0-9_]+$/, 'Invalid order ID format').optional(),
  customerId: z.string().regex(/^cust_[a-zA-Z0-9]+$/, 'Invalid customer ID format'),
  customerEmail: z.string().email('Invalid email format'),
  status: OrderStatus.default('pending'),
  
  // Order items
  items: z.array(OrderLineItemSchema).min(1, 'Order must contain at least one item'),
  
  // Addresses
  shippingAddress: AddressSchema,
  billingAddress: AddressSchema,
  
  // Financial details
  subtotalAmount: z.number().min(0).multipleOf(0.01),
  taxAmount: z.number().min(0).multipleOf(0.01).default(0),
  shippingAmount: z.number().min(0).multipleOf(0.01).default(0),
  discountAmount: z.number().min(0).multipleOf(0.01).default(0),
  totalAmount: z.number().min(0.01, 'Total amount must be positive').multipleOf(0.01),
  
  // Payment information
  paymentMethod: z.enum(['credit_card', 'debit_card', 'bank_transfer', 'paypal']),
  paymentStatus: z.enum(['pending', 'completed', 'failed', 'refunded']).default('pending'),
  paymentId: z.string().optional(),
  
  // Order metadata
  orderNumber: z.string().optional(), // Human-readable order number
  notes: z.string().max(1000).optional(),
  
  // Timestamps
  createdAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional(),
  shippedAt: z.string().datetime().optional(),
  deliveredAt: z.string().datetime().optional()
});

// Main order schema with validation refinements
export const OrderSchema = BaseOrderSchema.refine(
  (order) => {
    // Validate total amount calculation
    const calculatedSubtotal = order.items.reduce((sum, item) => sum + item.totalPrice, 0);
    const calculatedTotal = calculatedSubtotal + order.taxAmount + order.shippingAmount - order.discountAmount;
    
    return Math.abs(order.totalAmount - calculatedTotal) < 0.01 && 
           Math.abs(order.subtotalAmount - calculatedSubtotal) < 0.01;
  },
  { message: 'Order total calculation is incorrect' }
);

export type Order = z.infer<typeof OrderSchema>;

// Schema for creating new orders (without generated fields)
export const CreateOrderSchema = BaseOrderSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  shippedAt: true,
  deliveredAt: true,
  orderNumber: true
}).refine(
  (order) => {
    // Validate total amount calculation for creation
    const calculatedSubtotal = order.items.reduce((sum, item) => sum + item.totalPrice, 0);
    const calculatedTotal = calculatedSubtotal + order.taxAmount + order.shippingAmount - order.discountAmount;
    
    return Math.abs(order.totalAmount - calculatedTotal) < 0.01 && 
           Math.abs(order.subtotalAmount - calculatedSubtotal) < 0.01;
  },
  { message: 'Order total calculation is incorrect' }
);

export type CreateOrderRequest = z.infer<typeof CreateOrderSchema>;

// Schema for updating orders
export const UpdateOrderSchema = BaseOrderSchema.partial().pick({
  status: true,
  paymentStatus: true,
  paymentId: true,
  notes: true,
  shippedAt: true,
  deliveredAt: true
});

export type UpdateOrderRequest = z.infer<typeof UpdateOrderSchema>;

// Schema for order list queries
export const OrderListQuerySchema = z.object({
  customerId: z.string().optional(),
  status: OrderStatus.optional(),
  paymentStatus: z.enum(['pending', 'completed', 'failed', 'refunded']).optional(),
  fromDate: z.string().datetime().optional(),
  toDate: z.string().datetime().optional(),
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(100).default(20),
  sortBy: z.enum(['createdAt', 'updatedAt', 'totalAmount']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc')
});

export type OrderListQuery = z.infer<typeof OrderListQuerySchema>;

// Order statistics schema
export const OrderStatsSchema = z.object({
  totalOrders: z.number().int(),
  totalRevenue: z.number().multipleOf(0.01),
  averageOrderValue: z.number().multipleOf(0.01),
  statusCounts: z.record(OrderStatus, z.number().int()),
  paymentStatusCounts: z.record(z.enum(['pending', 'completed', 'failed', 'refunded']), z.number().int())
});

export type OrderStats = z.infer<typeof OrderStatsSchema>;

/**
 * Utility functions for order validation and manipulation
 */

export class OrderValidator {
  /**
   * Validate order data and return parsed result
   */
  static validateOrder(data: unknown): { success: true; data: Order } | { success: false; error: z.ZodError } {
    const result = OrderSchema.safeParse(data);
    if (result.success) {
      return { success: true, data: result.data };
    }
    return { success: false, error: result.error };
  }

  /**
   * Validate order creation request
   */
  static validateCreateOrder(data: unknown): { success: true; data: CreateOrderRequest } | { success: false; error: z.ZodError } {
    const result = CreateOrderSchema.safeParse(data);
    if (result.success) {
      return { success: true, data: result.data };
    }
    return { success: false, error: result.error };
  }

  /**
   * Validate order update request
   */
  static validateUpdateOrder(data: unknown): { success: true; data: UpdateOrderRequest } | { success: false; error: z.ZodError } {
    const result = UpdateOrderSchema.safeParse(data);
    if (result.success) {
      return { success: true, data: result.data };
    }
    return { success: false, error: result.error };
  }

  /**
   * Check if order status transition is valid
   */
  static isValidStatusTransition(currentStatus: OrderStatus, newStatus: OrderStatus): boolean {
    const validTransitions: Record<OrderStatus, OrderStatus[]> = {
      'pending': ['confirmed', 'cancelled'],
      'confirmed': ['processing', 'cancelled'],
      'processing': ['shipped', 'cancelled'],
      'shipped': ['delivered'],
      'delivered': ['refunded'],
      'cancelled': [], // Terminal status
      'refunded': []   // Terminal status
    };

    return validTransitions[currentStatus]?.includes(newStatus) ?? false;
  }

  /**
   * Calculate order totals
   */
  static calculateOrderTotals(items: OrderLineItem[], taxRate: number = 0, shippingAmount: number = 0, discountAmount: number = 0) {
    const subtotalAmount = items.reduce((sum, item) => sum + item.totalPrice, 0);
    const taxAmount = Math.round(subtotalAmount * taxRate * 100) / 100;
    const totalAmount = subtotalAmount + taxAmount + shippingAmount - discountAmount;

    return {
      subtotalAmount: Math.round(subtotalAmount * 100) / 100,
      taxAmount: Math.round(taxAmount * 100) / 100,
      shippingAmount: Math.round(shippingAmount * 100) / 100,
      discountAmount: Math.round(discountAmount * 100) / 100,
      totalAmount: Math.round(totalAmount * 100) / 100
    };
  }

  /**
   * Generate human-readable order number
   */
  static generateOrderNumber(orderId: string): string {
    // Extract numeric part from order ID and format as order number
    const numericPart = orderId.replace(/^ord_/, '');
    const timestamp = Date.now().toString().slice(-6);
    return `ORD-${timestamp}-${numericPart.toUpperCase().slice(0, 6)}`;
  }

  /**
   * Check if order can be cancelled
   */
  static canBeCancelled(status: OrderStatus): boolean {
    return ['pending', 'confirmed', 'processing'].includes(status);
  }

  /**
   * Check if order can be refunded
   */
  static canBeRefunded(status: OrderStatus, paymentStatus: string): boolean {
    return status === 'delivered' && paymentStatus === 'completed';
  }
}