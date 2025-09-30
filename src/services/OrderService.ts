/**
 * Order Service
 * Business logic layer for order management, validation, and lifecycle operations
 * 
 * Handles order creation, updates, cancellation, and status transitions
 * with proper business rule enforcement and integration with other services
 */

import { OrderRepository } from '../repositories/OrderRepository.js';
import { CustomerRepository } from '../repositories/CustomerRepository.js';
import { ProductRepository } from '../repositories/ProductRepository.js';
import type { 
  Order, 
  CreateOrderRequest as OrderCreateRequest, 
  UpdateOrderRequest as OrderUpdateRequest, 
  OrderStatus, 
  OrderLineItem,
  Address
} from '../models/order.js';
import type { Customer } from '../models/Customer.js';
import type { Product } from '../models/Product.js';

/**
 * Order Creation Request (Business Logic Interface)
 */
export interface CreateOrderRequest {
  customerId: string;
  customerEmail: string;
  items: {
    productId: string;
    quantity: number;
    unitPrice?: number; // Override price if provided
  }[];
  shippingAddress: Address;
  billingAddress?: Address;
  paymentMethod: 'credit_card' | 'debit_card' | 'bank_transfer' | 'paypal';
  notes?: string;
}

/**
 * Order Update Request (Business Logic Interface)
 */
export interface UpdateOrderRequest {
  status?: OrderStatus;
  paymentStatus?: 'pending' | 'completed' | 'failed' | 'refunded';
  paymentId?: string;
  notes?: string;
}

/**
 * Order Validation Result
 */
export interface OrderValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  suggestedChanges?: {
    items?: {
      productId: string;
      availableQuantity: number;
      suggestedQuantity: number;
    }[];
    estimatedDeliveryDate?: Date;
  };
}

/**
 * Order Processing Result
 */
export interface OrderProcessingResult {
  success: boolean;
  order?: Order;
  error?: string;
  validationResult?: OrderValidationResult;
}

/**
 * Business Logic Errors
 */
export class OrderServiceError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: Record<string, any>
  ) {
    super(message);
    this.name = 'OrderServiceError';
  }
}

export class InsufficientInventoryError extends OrderServiceError {
  constructor(productId: string, requested: number, available: number) {
    super(
      `Insufficient inventory for product ${productId}. Requested: ${requested}, Available: ${available}`,
      'INSUFFICIENT_INVENTORY',
      { productId, requested, available }
    );
  }
}

export class InvalidOrderStatusError extends OrderServiceError {
  constructor(currentStatus: OrderStatus, requestedStatus: OrderStatus) {
    super(
      `Cannot transition from ${currentStatus} to ${requestedStatus}`,
      'INVALID_STATUS_TRANSITION',
      { currentStatus, requestedStatus }
    );
  }
}

export class CustomerNotFoundError extends OrderServiceError {
  constructor(customerId: string) {
    super(
      `Customer not found: ${customerId}`,
      'CUSTOMER_NOT_FOUND',
      { customerId }
    );
  }
}

/**
 * Order Service Implementation
 */
export class OrderService {
  
  /**
   * Create a new order with full validation and inventory checking
   */
  static async createOrder(request: CreateOrderRequest, userId?: string): Promise<OrderProcessingResult> {
    try {
      // Validate customer exists
      const customer = await CustomerRepository.findById(request.customerId);
      if (!customer) {
        throw new CustomerNotFoundError(request.customerId);
      }

      // Validate and process order items
      const validationResult = await this.validateOrderItems(request.items);
      if (!validationResult.isValid) {
        return {
          success: false,
          error: 'Order validation failed',
          validationResult
        };
      }

      // Calculate order totals
      const { lineItems, totals } = await this.calculateOrderTotals(request.items);

      // Create order data matching the model structure
      const orderData: OrderCreateRequest = {
        customerId: request.customerId,
        customerEmail: request.customerEmail,
        status: 'pending',
        items: lineItems,
        shippingAddress: request.shippingAddress,
        billingAddress: request.billingAddress || request.shippingAddress,
        subtotalAmount: totals.subtotalAmount,
        taxAmount: totals.taxAmount,
        shippingAmount: totals.shippingAmount,
        discountAmount: totals.discountAmount,
        totalAmount: totals.totalAmount,
        paymentMethod: request.paymentMethod,
        paymentStatus: 'pending',
        notes: request.notes
      };

      // Create order in database
      const order = await OrderRepository.create(orderData);

      // Log order creation event
      if (order.id) {
        await this.logOrderEvent(order.id, 'order_created', {
          createdBy: userId,
          itemCount: lineItems.length,
          totalAmount: totals.totalAmount
        });
      }

      return {
        success: true,
        order,
        validationResult
      };

    } catch (error) {
      if (error instanceof OrderServiceError) {
        return {
          success: false,
          error: error.message,
          validationResult: {
            isValid: false,
            errors: [error.message],
            warnings: []
          }
        };
      }
      throw error;
    }
  }

  /**
   * Update an existing order
   */
  static async updateOrder(
    orderId: string, 
    request: UpdateOrderRequest, 
    userId?: string
  ): Promise<OrderProcessingResult> {
    try {
      // Get current order
      const currentOrder = await OrderRepository.findById(orderId);
      if (!currentOrder) {
        return {
          success: false,
          error: 'Order not found'
        };
      }

      // Validate order can be updated
      if (!this.canUpdateOrder(currentOrder.status)) {
        throw new InvalidOrderStatusError(currentOrder.status, currentOrder.status);
      }

      // Build update data
      const updateData: OrderUpdateRequest = {
        status: request.status,
        paymentStatus: request.paymentStatus,
        paymentId: request.paymentId,
        notes: request.notes
      };

      // Add status-specific timestamps
      if (request.status === 'shipped') {
        updateData.shippedAt = new Date().toISOString();
      } else if (request.status === 'delivered') {
        updateData.deliveredAt = new Date().toISOString();
      }

      // Update order
      const updatedOrder = await OrderRepository.update(orderId, updateData);
      if (!updatedOrder) {
        return {
          success: false,
          error: 'Failed to update order'
        };
      }

      // Log update event
      await this.logOrderEvent(orderId, 'order_updated', {
        updatedBy: userId,
        changes: this.getChangesSummary(currentOrder, updateData)
      });

      return {
        success: true,
        order: updatedOrder
      };

    } catch (error) {
      if (error instanceof OrderServiceError) {
        return {
          success: false,
          error: error.message
        };
      }
      throw error;
    }
  }

  /**
   * Cancel an order
   */
  static async cancelOrder(orderId: string, reason?: string, userId?: string): Promise<OrderProcessingResult> {
    try {
      const order = await OrderRepository.findById(orderId);
      if (!order) {
        return {
          success: false,
          error: 'Order not found'
        };
      }

      // Validate order can be cancelled
      if (!this.canCancelOrder(order.status)) {
        throw new InvalidOrderStatusError(order.status, 'cancelled');
      }

      // Update order status
      const updateData: OrderUpdateRequest = {
        status: 'cancelled',
        notes: reason ? `${order.notes || ''}\nCancellation reason: ${reason}`.trim() : order.notes
      };

      const cancelledOrder = await OrderRepository.update(orderId, updateData);
      if (!cancelledOrder) {
        return {
          success: false,
          error: 'Failed to cancel order'
        };
      }

      // Log cancellation event
      await this.logOrderEvent(orderId, 'order_cancelled', {
        cancelledBy: userId,
        reason: reason || 'No reason provided'
      });

      return {
        success: true,
        order: cancelledOrder
      };

    } catch (error) {
      if (error instanceof OrderServiceError) {
        return {
          success: false,
          error: error.message
        };
      }
      throw error;
    }
  }

  /**
   * Update order status with validation
   */
  static async updateOrderStatus(
    orderId: string, 
    newStatus: OrderStatus, 
    userId?: string,
    notes?: string
  ): Promise<OrderProcessingResult> {
    try {
      const order = await OrderRepository.findById(orderId);
      if (!order) {
        return {
          success: false,
          error: 'Order not found'
        };
      }

      // Validate status transition
      if (!this.isValidStatusTransition(order.status, newStatus)) {
        throw new InvalidOrderStatusError(order.status, newStatus);
      }

      // Build update data based on status
      const updateData: OrderUpdateRequest = {
        status: newStatus,
        notes: notes ? `${order.notes || ''}\n${notes}`.trim() : order.notes
      };

      // Add status-specific timestamps
      switch (newStatus) {
        case 'shipped':
          updateData.shippedAt = new Date().toISOString();
          break;
        case 'delivered':
          updateData.deliveredAt = new Date().toISOString();
          break;
      }

      const updatedOrder = await OrderRepository.update(orderId, updateData);
      if (!updatedOrder) {
        return {
          success: false,
          error: 'Failed to update order status'
        };
      }

      // Log status change event
      await this.logOrderEvent(orderId, 'status_changed', {
        previousStatus: order.status,
        newStatus,
        changedBy: userId,
        notes
      });

      return {
        success: true,
        order: updatedOrder
      };

    } catch (error) {
      if (error instanceof OrderServiceError) {
        return {
          success: false,
          error: error.message
        };
      }
      throw error;
    }
  }

  /**
   * Get order with full details
   */
  static async getOrderDetails(orderId: string): Promise<Order | null> {
    return OrderRepository.findById(orderId);
  }

  /**
   * Find orders with filtering
   */
  static async findOrders(filters: any = {}): Promise<{ orders: Order[]; total: number }> {
    const result = await OrderRepository.find(filters);
    return {
      orders: result.orders,
      total: result.total
    };
  }

  // Private helper methods

  /**
   * Validate order items against inventory
   */
  private static async validateOrderItems(items: CreateOrderRequest['items']): Promise<OrderValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    const suggestedChanges: any = { items: [] };

    for (const item of items) {
      // Check product exists
      const product = await ProductRepository.findById(item.productId);
      if (!product) {
        errors.push(`Product not found: ${item.productId}`);
        continue;
      }

      // Check product status
      if (product.status !== 'active') {
        errors.push(`Product ${product.name} is not available for purchase (status: ${product.status})`);
        continue;
      }

      // Check inventory if tracked
      if (product.inventoryManagement === 'tracked') {
        if (product.availableStock < item.quantity) {
          if (product.availableStock === 0) {
            errors.push(`Product ${product.name} is out of stock`);
          } else {
            errors.push(`Insufficient stock for ${product.name}. Requested: ${item.quantity}, Available: ${product.availableStock}`);
            suggestedChanges.items.push({
              productId: item.productId,
              availableQuantity: product.availableStock,
              suggestedQuantity: product.availableStock
            });
          }
        } else if (product.availableStock < item.quantity * 2) {
          warnings.push(`Low stock warning for ${product.name}. Available: ${product.availableStock}`);
        }
      }

      // Validate quantity
      if (item.quantity <= 0) {
        errors.push(`Invalid quantity for ${product.name}. Quantity must be greater than 0`);
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      suggestedChanges: suggestedChanges.items.length > 0 ? suggestedChanges : undefined
    };
  }

  /**
   * Calculate order totals including tax and shipping
   */
  private static async calculateOrderTotals(items: CreateOrderRequest['items']): Promise<{
    lineItems: OrderLineItem[];
    totals: {
      subtotalAmount: number;
      taxAmount: number;
      shippingAmount: number;
      discountAmount: number;
      totalAmount: number;
    };
  }> {
    const lineItems: OrderLineItem[] = [];
    let subtotalAmount = 0;

    for (const item of items) {
      const product = await ProductRepository.findById(item.productId);
      if (!product) {
        throw new OrderServiceError(`Product not found: ${item.productId}`, 'PRODUCT_NOT_FOUND');
      }

      // Convert cents to dollars for order model
      const unitPrice = item.unitPrice || (product.retailPriceCents / 100);
      const totalPrice = unitPrice * item.quantity;

      lineItems.push({
        productId: item.productId,
        productName: product.name,
        productSku: product.sku,
        quantity: item.quantity,
        unitPrice,
        totalPrice,
        taxAmount: 0, // Will be calculated below
        discountAmount: 0
      });

      subtotalAmount += totalPrice;
    }

    // Calculate tax (simplified - 8.5% for now)
    const taxRate = 0.085;
    const taxAmount = Math.round(subtotalAmount * taxRate * 100) / 100;

    // Calculate shipping (simplified - flat rate for now)
    const shippingAmount = subtotalAmount > 50 ? 0 : 9.99; // Free shipping over $50

    // No discounts for now
    const discountAmount = 0;

    const totalAmount = subtotalAmount + taxAmount + shippingAmount - discountAmount;

    return {
      lineItems,
      totals: {
        subtotalAmount,
        taxAmount,
        shippingAmount,
        discountAmount,
        totalAmount
      }
    };
  }

  /**
   * Check if order can be updated
   */
  private static canUpdateOrder(status: OrderStatus): boolean {
    return ['pending', 'confirmed'].includes(status);
  }

  /**
   * Check if order can be cancelled
   */
  private static canCancelOrder(status: OrderStatus): boolean {
    return ['pending', 'confirmed'].includes(status);
  }

  /**
   * Validate status transitions
   */
  private static isValidStatusTransition(currentStatus: OrderStatus, newStatus: OrderStatus): boolean {
    const validTransitions: Record<OrderStatus, OrderStatus[]> = {
      'pending': ['confirmed', 'cancelled'],
      'confirmed': ['processing', 'cancelled'],
      'processing': ['shipped', 'cancelled'],
      'shipped': ['delivered'],
      'delivered': ['refunded'],
      'cancelled': [],
      'refunded': []
    };

    return validTransitions[currentStatus]?.includes(newStatus) || false;
  }

  /**
   * Get summary of changes for logging
   */
  private static getChangesSummary(original: Order, updates: OrderUpdateRequest): Record<string, any> {
    const changes: Record<string, any> = {};
    
    if (updates.notes && updates.notes !== original.notes) {
      changes.notes = { from: original.notes, to: updates.notes };
    }
    
    if (updates.status && updates.status !== original.status) {
      changes.status = { from: original.status, to: updates.status };
    }

    if (updates.paymentStatus && updates.paymentStatus !== original.paymentStatus) {
      changes.paymentStatus = { from: original.paymentStatus, to: updates.paymentStatus };
    }
    
    return changes;
  }

  /**
   * Log order events for audit trail
   */
  private static async logOrderEvent(
    orderId: string, 
    eventType: string, 
    data: Record<string, any>
  ): Promise<void> {
    // This would integrate with OrderEvent repository when available
    console.log(`Order Event: ${orderId} - ${eventType}`, data);
    
    // TODO: Implement proper event logging
    // await OrderEventRepository.create({
    //   orderId,
    //   eventType,
    //   eventData: data,
    //   createdAt: new Date()
    // });
  }
}