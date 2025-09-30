/**
 * Order Repository
 * Data access layer for Order entities with CRUD operations and order lifecycle management
 * 
 * Aligned with existing order.ts model structure using decimal pricing and items array
 */

import type { QueryResult } from 'pg';
import { DatabaseService, QueryBuilder, DatabaseUtils, TransactionClient } from '../lib/database.js';
import type { Order, CreateOrderRequest, UpdateOrderRequest, OrderListQuery, OrderStats, OrderLineItem } from '../models/order.js';

// Database representation of OrderLineItem includes orderId
type OrderLineItemDB = OrderLineItem & { orderId: string };

/**
 * Comprehensive Order Repository
 * Handles all order-related database operations with full transaction support
 */
export class OrderRepository {
  
  /**
   * Create a new order with line items
   * Uses transaction to ensure data consistency
   */
  static async create(orderData: CreateOrderRequest): Promise<Order> {
    return DatabaseService.transaction(async (tx: TransactionClient) => {
      // Generate order ID and number
      const orderId = `ord_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const orderNumber = `ORD-${Date.now().toString().slice(-6)}-${Math.random().toString(36).substr(2, 4).toUpperCase()}`;
      
      // Insert main order record
      const orderQuery = `
        INSERT INTO orders (
          id, order_number, customer_id, customer_email, status,
          subtotal_amount, tax_amount, shipping_amount, discount_amount, total_amount,
          payment_method, payment_status, payment_id,
          shipping_address, billing_address, notes,
          created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
          $11, $12, $13, $14, $15, $16, NOW(), NOW()
        ) RETURNING *`;
      
      const orderResult = await tx.query<Omit<Order, 'items'>>(orderQuery, [
        orderId,
        orderNumber,
        orderData.customerId,
        orderData.customerEmail,
        orderData.status,
        orderData.subtotalAmount,
        orderData.taxAmount,
        orderData.shippingAmount,
        orderData.discountAmount,
        orderData.totalAmount,
        orderData.paymentMethod,
        orderData.paymentStatus,
        orderData.paymentId,
        JSON.stringify(orderData.shippingAddress),
        JSON.stringify(orderData.billingAddress),
        orderData.notes
      ]);
      
      const orderRecord = orderResult.rows[0];
      if (!orderRecord) {
        throw new Error('Failed to create order');
      }
      
      // Insert order line items
      const lineItemPromises = orderData.items.map(async (item) => {
        const itemId = `item_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const itemQuery = `
          INSERT INTO order_line_items (
            id, order_id, product_id, product_name, product_sku,
            quantity, unit_price, total_price, tax_amount, discount_amount,
            created_at, updated_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW()
          ) RETURNING *`;
        
        return tx.query<OrderLineItemDB>(itemQuery, [
          itemId,
          orderId,
          item.productId,
          item.productName,
          item.productSku,
          item.quantity,
          item.unitPrice,
          item.totalPrice,
          item.taxAmount,
          item.discountAmount
        ]);
      });
      
      const lineItemResults = await Promise.all(lineItemPromises);
      const lineItemsDB = lineItemResults.map(result => result.rows[0]).filter((item): item is OrderLineItemDB => item !== undefined);
      
      // Convert database items to model items (remove orderId)
      const lineItems: OrderLineItem[] = lineItemsDB.map(({ orderId, ...item }) => item);
      
      const order: Order = {
        ...orderRecord,
        items: lineItems
      };
      
      return order;
    });
  }

  /**
   * Retrieve order by ID with line items
   */
  static async findById(id: string): Promise<Order | null> {
    const query = `
      SELECT * FROM orders 
      WHERE id = $1 AND deleted_at IS NULL`;
    
    const result = await DatabaseService.query<Omit<Order, 'items'>>(query, [id]);
    const orderRecord = result.rows[0];
    
    if (!orderRecord) {
      return null;
    }
    
    // Fetch line items
    const items = await this.getOrderLineItems(id);
    
    const order: Order = {
      ...orderRecord,
      items
    };
    
    return order;
  }

  /**
   * Update order
   */
  static async update(id: string, updateData: UpdateOrderRequest): Promise<Order | null> {
    return DatabaseService.transaction(async (tx: TransactionClient) => {
      const updates: string[] = [];
      const values: any[] = [];
      let paramCount = 1;

      // Build dynamic update query
      if (updateData.status !== undefined) {
        updates.push(`status = $${paramCount++}`);
        values.push(updateData.status);
      }
      
      if (updateData.paymentStatus !== undefined) {
        updates.push(`payment_status = $${paramCount++}`);
        values.push(updateData.paymentStatus);
      }
      
      if (updateData.paymentId !== undefined) {
        updates.push(`payment_id = $${paramCount++}`);
        values.push(updateData.paymentId);
      }
      
      if (updateData.notes !== undefined) {
        updates.push(`notes = $${paramCount++}`);
        values.push(updateData.notes);
      }
      
      if (updateData.shippedAt !== undefined) {
        updates.push(`shipped_at = $${paramCount++}`);
        values.push(updateData.shippedAt);
      }
      
      if (updateData.deliveredAt !== undefined) {
        updates.push(`delivered_at = $${paramCount++}`);
        values.push(updateData.deliveredAt);
      }

      if (updates.length === 0) {
        return this.findById(id);
      }

      updates.push(`updated_at = NOW()`);
      values.push(id);

      const query = `
        UPDATE orders 
        SET ${updates.join(', ')}
        WHERE id = $${paramCount} AND deleted_at IS NULL
        RETURNING *`;

      const result = await tx.query<Omit<Order, 'items'>>(query, values);
      const orderRecord = result.rows[0];
      
      if (!orderRecord) {
        return null;
      }

      // Fetch line items
      const items = await this.getOrderLineItems(id);
      
      const order: Order = {
        ...orderRecord,
        items
      };
      
      return order;
    });
  }

  /**
   * Find orders with filtering and pagination
   */
  static async find(options: Partial<OrderListQuery> = {}): Promise<{ orders: Order[]; total: number; page: number; limit: number }> {
    const {
      customerId,
      status,
      paymentStatus,
      fromDate,
      toDate,
      page = 1,
      limit = 20,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = options;

    const queryBuilder = new QueryBuilder()
      .select(['*'])
      .from('orders')
      .where('deleted_at IS NULL');

    const countBuilder = new QueryBuilder()
      .select(['COUNT(*) as count'])
      .from('orders')
      .where('deleted_at IS NULL');

    // Apply filters
    if (customerId) {
      queryBuilder.where('customer_id = ?', [customerId]);
      countBuilder.where('customer_id = ?', [customerId]);
    }

    if (status) {
      queryBuilder.where('status = ?', [status]);
      countBuilder.where('status = ?', [status]);
    }

    if (paymentStatus) {
      queryBuilder.where('payment_status = ?', [paymentStatus]);
      countBuilder.where('payment_status = ?', [paymentStatus]);
    }

    if (fromDate) {
      queryBuilder.where('created_at >= ?', [fromDate]);
      countBuilder.where('created_at >= ?', [fromDate]);
    }

    if (toDate) {
      queryBuilder.where('created_at <= ?', [toDate]);
      countBuilder.where('created_at <= ?', [toDate]);
    }

    // Apply sorting and pagination
    const validSortColumns = ['created_at', 'updated_at', 'total_amount'];
    const sortColumn = validSortColumns.includes(sortBy) ? sortBy : 'created_at';
    queryBuilder.orderBy(sortColumn, sortOrder.toUpperCase() as 'ASC' | 'DESC');

    const offset = (page - 1) * limit;
    queryBuilder.limit(limit).offset(offset);

    // Execute queries
    const queryBuilt = queryBuilder.build();
    const countBuilt = countBuilder.build();
    
    const [ordersResult, countResult] = await Promise.all([
      DatabaseService.query<Omit<Order, 'items'>>(queryBuilt.query, queryBuilt.params),
      DatabaseService.query<{ count: string }>(countBuilt.query, countBuilt.params)
    ]);

    const orderRecords = ordersResult.rows;
    const total = parseInt(countResult.rows[0]?.count || '0');

    // Fetch line items for all orders
    const orders: Order[] = [];
    if (orderRecords.length > 0) {
      const orderIds = orderRecords.map(order => order.id).filter((id): id is string => id !== undefined);
      const itemsMap = await this.getOrderLineItemsMap(orderIds);
      
      orderRecords.forEach(orderRecord => {
        if (orderRecord.id) {
          const order: Order = {
            ...orderRecord,
            items: itemsMap[orderRecord.id] || []
          };
          orders.push(order);
        }
      });
    }

    return {
      orders,
      total,
      page,
      limit
    };
  }

  /**
   * Delete order (soft delete)
   */
  static async delete(id: string): Promise<boolean> {
    const query = `
      UPDATE orders 
      SET deleted_at = NOW(), updated_at = NOW()
      WHERE id = $1 AND deleted_at IS NULL`;
    
    const result = await DatabaseService.query(query, [id]);
    return result.rowCount! > 0;
  }

  /**
   * Get order statistics
   */
  static async getStats(customerId?: string): Promise<OrderStats> {
    const whereClause = customerId 
      ? 'WHERE customer_id = $1 AND deleted_at IS NULL'
      : 'WHERE deleted_at IS NULL';
    
    const params = customerId ? [customerId] : [];

    const statsQuery = `
      SELECT 
        COUNT(*) as total_orders,
        COALESCE(SUM(total_amount), 0) as total_revenue,
        COALESCE(AVG(total_amount), 0) as average_order_value,
        json_object_agg(status, status_count) as status_counts,
        json_object_agg(payment_status, payment_status_count) as payment_status_counts
      FROM (
        SELECT 
          status,
          payment_status,
          COUNT(*) OVER (PARTITION BY status) as status_count,
          COUNT(*) OVER (PARTITION BY payment_status) as payment_status_count
        FROM orders
        ${whereClause}
      ) grouped`;

    const result = await DatabaseService.query(statsQuery, params);
    const stats = result.rows[0];

    return {
      totalOrders: parseInt(stats.total_orders),
      totalRevenue: parseFloat(stats.total_revenue),
      averageOrderValue: parseFloat(stats.average_order_value),
      statusCounts: stats.status_counts || {},
      paymentStatusCounts: stats.payment_status_counts || {}
    };
  }

  /**
   * Get order line items for a specific order
   */
  private static async getOrderLineItems(orderId: string): Promise<OrderLineItem[]> {
    const query = `
      SELECT * FROM order_line_items 
      WHERE order_id = $1 
      ORDER BY created_at ASC`;
    
    const result = await DatabaseService.query<OrderLineItemDB>(query, [orderId]);
    // Convert database items to model items (remove orderId)
    return result.rows.map(({ orderId, ...item }) => item);
  }

  /**
   * Get order line items for multiple orders (optimized batch query)
   */
  private static async getOrderLineItemsMap(orderIds: string[]): Promise<Record<string, OrderLineItem[]>> {
    if (orderIds.length === 0) return {};

    const placeholders = orderIds.map((_, index) => `$${index + 1}`).join(',');
    const query = `
      SELECT * FROM order_line_items 
      WHERE order_id IN (${placeholders})
      ORDER BY order_id, created_at ASC`;

    const result = await DatabaseService.query<OrderLineItemDB>(query, orderIds);

    const itemsMap: Record<string, OrderLineItem[]> = {};
    result.rows.forEach(item => {
      if (item.orderId) {
        if (!itemsMap[item.orderId]) {
          itemsMap[item.orderId] = [];
        }
        // Convert database item to model item (remove orderId)
        const { orderId, ...modelItem } = item;
        itemsMap[item.orderId]!.push(modelItem);
      }
    });

    return itemsMap;
  }
}