import type { PoolClient } from 'pg';
import { z } from 'zod';
import { DatabaseService } from './database.js';
import { 
  OrderSchema, 
  CreateOrderSchema, 
  UpdateOrderSchema,
  OrderValidator,
  OrderStatus,
  type Order,
  type OrderLineItem
} from '../models/order.js';
import { validateOrderData, formatValidationError } from '../utils/validation.js';

/**
 * Order Service - Business Logic Layer
 * 
 * Handles all order-related business operations including:
 * - Order creation and validation
 * - Order lifecycle management  
 * - Order queries and reporting
 * - Integration with inventory and payment systems
 */

export interface CreateOrderRequest {
  customerId: string;
  customerEmail: string;
  items: Array<{
    productId: string;
    productName: string;
    productSku?: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
    taxAmount?: number;
    discountAmount?: number;
  }>;
  shippingAddress: {
    street: string;
    city: string;
    state: string;
    zipCode: string;
    country: string;
  };
  billingAddress: {
    street: string;
    city: string;
    state: string;
    zipCode: string;
    country: string;
  };
  subtotalAmount: number;
  taxAmount?: number;
  shippingAmount?: number;
  discountAmount?: number;
  totalAmount: number;
  paymentMethod: 'credit_card' | 'debit_card' | 'bank_transfer' | 'paypal';
  notes?: string;
}

export interface UpdateOrderRequest {
  status?: OrderStatus;
  notes?: string;
  shippingAddress?: {
    street: string;
    city: string;
    state: string;
    zipCode: string;
    country: string;
  };
  billingAddress?: {
    street: string;
    city: string;
    state: string;
    zipCode: string;
    country: string;
  };
}

export interface OrderSearchOptions {
  customerId?: string;
  status?: OrderStatus;
  dateFrom?: Date;
  dateTo?: Date;
  limit?: number;
  offset?: number;
}

export class OrderService {
  private db: DatabaseService;
  private validator: OrderValidator;

  constructor(databaseService: DatabaseService) {
    this.db = databaseService;
    this.validator = new OrderValidator();
  }

  /**
   * Create a new order with full validation and inventory checks
   */
  async createOrder(orderData: CreateOrderRequest): Promise<{ success: true; data: Order } | { success: false; error: string; details?: any }> {
    try {
      // Generate order ID and add defaults
      const orderWithDefaults = {
        id: `ord_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        ...orderData,
        status: 'pending' as const,
        paymentStatus: 'pending' as const,
        taxAmount: orderData.taxAmount || 0,
        shippingAmount: orderData.shippingAmount || 0,
        discountAmount: orderData.discountAmount || 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      // Validate the complete order
      const validation = OrderSchema.safeParse(orderWithDefaults);
      if (!validation.success) {
        return {
          success: false,
          error: 'Order validation failed',
          details: formatValidationError(validation.error)
        };
      }

      const validatedOrder = validation.data;

      // Use database transaction for atomicity
      const result = await this.db.withTransaction(async (client) => {
        // Check inventory availability
        for (const item of validatedOrder.items) {
          const inventoryCheck = await client.query(
            'SELECT quantity_available FROM inventory WHERE product_id = $1',
            [item.productId]
          );

          if (inventoryCheck.rows.length === 0) {
            throw new Error(`Product ${item.productId} not found in inventory`);
          }

          const available = inventoryCheck.rows[0].quantity_available;
          if (available < item.quantity) {
            throw new Error(`Insufficient inventory for product ${item.productId}. Available: ${available}, Requested: ${item.quantity}`);
          }
        }

        // Create order record
        const orderInsert = await client.query(`
          INSERT INTO orders (
            id, customer_id, customer_email, status, payment_status, payment_method,
            subtotal_amount, tax_amount, shipping_amount, discount_amount, total_amount,
            shipping_address, billing_address, notes, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
          RETURNING *
        `, [
          validatedOrder.id,
          validatedOrder.customerId,
          validatedOrder.customerEmail,
          validatedOrder.status,
          validatedOrder.paymentStatus,
          validatedOrder.paymentMethod,
          validatedOrder.subtotalAmount,
          validatedOrder.taxAmount,
          validatedOrder.shippingAmount,
          validatedOrder.discountAmount,
          validatedOrder.totalAmount,
          JSON.stringify(validatedOrder.shippingAddress),
          JSON.stringify(validatedOrder.billingAddress),
          validatedOrder.notes,
          validatedOrder.createdAt,
          validatedOrder.updatedAt
        ]);

        // Create order items
        for (const item of validatedOrder.items) {
          await client.query(`
            INSERT INTO order_items (
              order_id, product_id, product_name, product_sku, quantity, 
              unit_price, total_price, tax_amount, discount_amount
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          `, [
            validatedOrder.id,
            item.productId,
            item.productName,
            item.productSku,
            item.quantity,
            item.unitPrice,
            item.totalPrice,
            item.taxAmount || 0,
            item.discountAmount || 0
          ]);

          // Reserve inventory
          await client.query(
            'UPDATE inventory SET quantity_reserved = quantity_reserved + $1 WHERE product_id = $2',
            [item.quantity, item.productId]
          );
        }

        return orderInsert.rows[0];
      });

      // Convert database result back to Order format
      const createdOrder = await this.formatOrderFromDatabase(result);
      
      return { success: true, data: createdOrder };

    } catch (error) {
      console.error('Error creating order:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
        details: error
      };
    }
  }

  /**
   * Get order by ID with full details
   */
  async getOrderById(orderId: string): Promise<{ success: true; data: Order } | { success: false; error: string }> {
    try {
      const result = await this.db.withConnection(async (client) => {
        // Get order details
        const orderResult = await client.query(
          'SELECT * FROM orders WHERE id = $1',
          [orderId]
        );

        if (orderResult.rows.length === 0) {
          throw new Error(`Order ${orderId} not found`);
        }

        // Get order items
        const itemsResult = await client.query(
          'SELECT * FROM order_items WHERE order_id = $1 ORDER BY id',
          [orderId]
        );

        return {
          order: orderResult.rows[0],
          items: itemsResult.rows
        };
      });

      const order = await this.formatOrderFromDatabase(result.order, result.items);
      return { success: true, data: order };

    } catch (error) {
      console.error('Error getting order:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  /**
   * Update order status and related information
   */
  async updateOrder(orderId: string, updateData: UpdateOrderRequest): Promise<{ success: true; data: Order } | { success: false; error: string }> {
    try {
      const result = await this.db.withTransaction(async (client) => {
        // Verify order exists
        const existingOrder = await client.query(
          'SELECT * FROM orders WHERE id = $1',
          [orderId]
        );

        if (existingOrder.rows.length === 0) {
          throw new Error(`Order ${orderId} not found`);
        }

        // Build update query dynamically
        const updates: string[] = [];
        const values: any[] = [];
        let paramIndex = 1;

        if (updateData.status) {
          updates.push(`status = $${paramIndex++}`);
          values.push(updateData.status);
        }

        if (updateData.notes) {
          updates.push(`notes = $${paramIndex++}`);
          values.push(updateData.notes);
        }

        if (updateData.shippingAddress) {
          updates.push(`shipping_address = $${paramIndex++}`);
          values.push(JSON.stringify(updateData.shippingAddress));
        }

        if (updateData.billingAddress) {
          updates.push(`billing_address = $${paramIndex++}`);
          values.push(JSON.stringify(updateData.billingAddress));
        }

        // Always update the updated_at timestamp
        updates.push(`updated_at = $${paramIndex++}`);
        values.push(new Date().toISOString());

        // Add order ID for WHERE clause
        values.push(orderId);

        const updateQuery = `
          UPDATE orders 
          SET ${updates.join(', ')}
          WHERE id = $${paramIndex}
          RETURNING *
        `;

        const updateResult = await client.query(updateQuery, values);
        return updateResult.rows[0];
      });

      // Get complete order data
      const orderResult = await this.getOrderById(orderId);
      return orderResult;

    } catch (error) {
      console.error('Error updating order:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  /**
   * Search orders with filtering options
   */
  async searchOrders(options: OrderSearchOptions = {}): Promise<{ success: true; data: Order[]; total: number } | { success: false; error: string }> {
    try {
      const { customerId, status, dateFrom, dateTo, limit = 50, offset = 0 } = options;

      const conditions: string[] = [];
      const values: any[] = [];
      let paramIndex = 1;

      if (customerId) {
        conditions.push(`customer_id = $${paramIndex++}`);
        values.push(customerId);
      }

      if (status) {
        conditions.push(`status = $${paramIndex++}`);
        values.push(status);
      }

      if (dateFrom) {
        conditions.push(`created_at >= $${paramIndex++}`);
        values.push(dateFrom.toISOString());
      }

      if (dateTo) {
        conditions.push(`created_at <= $${paramIndex++}`);
        values.push(dateTo.toISOString());
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
      
      const result = await this.db.withConnection(async (client) => {
        // Get total count
        const countQuery = `SELECT COUNT(*) FROM orders ${whereClause}`;
        const countResult = await client.query(countQuery, values);
        const total = parseInt(countResult.rows[0].count);

        // Get orders with pagination
        const ordersQuery = `
          SELECT * FROM orders 
          ${whereClause}
          ORDER BY created_at DESC 
          LIMIT $${paramIndex++} OFFSET $${paramIndex++}
        `;
        
        const ordersResult = await client.query(ordersQuery, [...values, limit, offset]);

        return { orders: ordersResult.rows, total };
      });

      // Format each order
      const orders = await Promise.all(
        result.orders.map(async (orderRow) => {
          const itemsResult = await this.db.withConnection(async (client) => {
            return await client.query(
              'SELECT * FROM order_items WHERE order_id = $1 ORDER BY id',
              [orderRow.id]
            );
          });
          
          return await this.formatOrderFromDatabase(orderRow, itemsResult.rows);
        })
      );

      return { success: true, data: orders, total: result.total };

    } catch (error) {
      console.error('Error searching orders:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  /**
   * Cancel order and release inventory
   */
  async cancelOrder(orderId: string, reason?: string): Promise<{ success: true; data: Order } | { success: false; error: string }> {
    try {
      const result = await this.db.withTransaction(async (client) => {
        // Get order details
        const orderResult = await client.query(
          'SELECT * FROM orders WHERE id = $1',
          [orderId]
        );

        if (orderResult.rows.length === 0) {
          throw new Error(`Order ${orderId} not found`);
        }

        const order = orderResult.rows[0];

        if (['cancelled', 'delivered', 'refunded'].includes(order.status)) {
          throw new Error(`Cannot cancel order with status: ${order.status}`);
        }

        // Release inventory reservations
        const itemsResult = await client.query(
          'SELECT * FROM order_items WHERE order_id = $1',
          [orderId]
        );

        for (const item of itemsResult.rows) {
          await client.query(
            'UPDATE inventory SET quantity_reserved = quantity_reserved - $1 WHERE product_id = $2',
            [item.quantity, item.product_id]
          );
        }

        // Update order status
        const notes = reason ? `Cancelled: ${reason}` : order.notes;
        await client.query(
          'UPDATE orders SET status = $1, notes = $2, updated_at = $3 WHERE id = $4',
          ['cancelled', notes, new Date().toISOString(), orderId]
        );

        return orderId;
      });

      // Get updated order
      const orderResult = await this.getOrderById(result);
      return orderResult;

    } catch (error) {
      console.error('Error cancelling order:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  /**
   * Helper method to format database rows into Order objects
   */
  private async formatOrderFromDatabase(orderRow: any, itemsRows?: any[]): Promise<Order> {
    let items = itemsRows;
    
    if (!items) {
      const itemsResult = await this.db.withConnection(async (client) => {
        return await client.query(
          'SELECT * FROM order_items WHERE order_id = $1 ORDER BY id',
          [orderRow.id]
        );
      });
      items = itemsResult.rows;
    }

    const orderItems: OrderLineItem[] = items.map(item => ({
      id: item.id?.toString(),
      productId: item.product_id,
      productName: item.product_name,
      productSku: item.product_sku,
      quantity: item.quantity,
      unitPrice: parseFloat(item.unit_price),
      totalPrice: parseFloat(item.total_price),
      taxAmount: parseFloat(item.tax_amount || '0'),
      discountAmount: parseFloat(item.discount_amount || '0')
    }));

    const order: Order = {
      id: orderRow.id,
      customerId: orderRow.customer_id,
      customerEmail: orderRow.customer_email,
      status: orderRow.status,
      items: orderItems,
      shippingAddress: typeof orderRow.shipping_address === 'string' 
        ? JSON.parse(orderRow.shipping_address) 
        : orderRow.shipping_address,
      billingAddress: typeof orderRow.billing_address === 'string' 
        ? JSON.parse(orderRow.billing_address) 
        : orderRow.billing_address,
      subtotalAmount: parseFloat(orderRow.subtotal_amount),
      taxAmount: parseFloat(orderRow.tax_amount || '0'),
      shippingAmount: parseFloat(orderRow.shipping_amount || '0'),
      discountAmount: parseFloat(orderRow.discount_amount || '0'),
      totalAmount: parseFloat(orderRow.total_amount),
      paymentMethod: orderRow.payment_method,
      paymentStatus: orderRow.payment_status || 'pending',
      paymentId: orderRow.payment_id,
      orderNumber: orderRow.order_number,
      notes: orderRow.notes,
      createdAt: orderRow.created_at,
      updatedAt: orderRow.updated_at,
      shippedAt: orderRow.shipped_at,
      deliveredAt: orderRow.delivered_at
    };

    return order;
  }

  /**
   * Update order status with validation and notes
   */
  async updateOrderStatus(orderId: string, newStatus: OrderStatus, notes?: string): Promise<Order> {
    if (!this.isValidStatusTransition(await this.getOrderStatus(orderId), newStatus)) {
      throw new Error(`Invalid status transition to ${newStatus}`);
    }

    const updateData: UpdateOrderRequest = {
      status: newStatus
    };

    if (notes) {
      updateData.notes = notes;
    }

    const result = await this.updateOrder(orderId, updateData);
    if (!result.success) {
      throw new Error(result.error);
    }

    return result.data;
  }

  /**
   * Calculate order totals from items
   */
  calculateOrderTotals(items: OrderLineItem[]): { subtotal: number; tax: number; discount: number; total: number } {
    const subtotal = items.reduce((sum, item) => sum + item.totalPrice, 0);
    const tax = items.reduce((sum, item) => sum + (item.taxAmount || 0), 0);
    const discount = items.reduce((sum, item) => sum + (item.discountAmount || 0), 0);
    const total = subtotal + tax - discount;

    return {
      subtotal: Math.round(subtotal * 100) / 100,
      tax: Math.round(tax * 100) / 100,
      discount: Math.round(discount * 100) / 100,
      total: Math.round(total * 100) / 100
    };
  }

  /**
   * Validate order status transitions
   */
  isValidStatusTransition(currentStatus: OrderStatus, newStatus: OrderStatus): boolean {
    const validTransitions: Record<OrderStatus, OrderStatus[]> = {
      'pending': ['confirmed', 'cancelled'],
      'confirmed': ['processing', 'shipped', 'cancelled'],
      'processing': ['shipped', 'cancelled'],
      'shipped': ['delivered'],
      'delivered': ['refunded'],
      'cancelled': [],
      'refunded': []
    };

    return validTransitions[currentStatus]?.includes(newStatus) || false;
  }

  /**
   * List orders with pagination and filtering (alias for searchOrders)
   */
  async listOrders(pagination: { limit: number; offset: number }, filters?: Partial<OrderSearchOptions>) {
    return await this.searchOrders({
      ...filters,
      limit: pagination.limit,
      offset: pagination.offset
    });
  }

  /**
   * Validate order items structure and constraints
   */
  validateOrderItems(items: any[]): void {
    if (!Array.isArray(items) || items.length === 0) {
      throw new Error('Order must contain at least one item');
    }

    for (const item of items) {
      if (!item.productId || typeof item.productId !== 'string') {
        throw new Error('Item must have a valid productId');
      }

      if (!item.quantity || typeof item.quantity !== 'number' || item.quantity < 1) {
        throw new Error('Quantity must be at least 1');
      }

      if (!item.unitPrice || typeof item.unitPrice !== 'number' || item.unitPrice <= 0) {
        throw new Error('Unit price must be positive');
      }
    }
  }

  /**
   * Generate unique order ID
   */
  generateOrderId(): string {
    return `ord_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Record order events for audit trail
   */
  async recordOrderEvent(orderId: string, eventType: string, eventData: any): Promise<boolean> {
    try {
      await this.db.withConnection(async (client) => {
        await client.query(`
          INSERT INTO order_events (order_id, event_type, event_data, created_at)
          VALUES ($1, $2, $3, $4)
        `, [orderId, eventType, JSON.stringify(eventData), new Date().toISOString()]);
      });
      
      return true;
    } catch (error) {
      console.error('Error recording order event:', error);
      return false;
    }
  }

  /**
   * Helper to get current order status
   */
  private async getOrderStatus(orderId: string): Promise<OrderStatus> {
    const result = await this.db.withConnection(async (client) => {
      const orderResult = await client.query(
        'SELECT status FROM orders WHERE id = $1',
        [orderId]
      );

      if (orderResult.rows.length === 0) {
        throw new Error(`Order ${orderId} not found`);
      }

      return orderResult.rows[0].status;
    });

    return result;
  }
}

export default OrderService;