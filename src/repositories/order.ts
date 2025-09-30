import type { PoolClient } from 'pg';
import { BaseRepositoryImpl, NotFoundError, ConflictError, ValidationError } from './base.js';
import type {
  Order,
  CreateOrderData,
  UpdateOrderData,
  OrderRepository as IOrderRepository,
  OrderItem,
  CreateOrderItemData,
  UpdateOrderItemData,
  OrderTotals,
  DailySalesData,
  OrderStats,
  RevenueData,
  PaginationOptions,
  PaginatedResult
} from './interfaces.js';
import { OrderStatus, Currency } from './interfaces.js';
import { DatabaseService } from '../services/database.js';

/**
 * Order Repository Implementation
 * 
 * Handles all database operations for orders and order items.
 * Provides complex order management, status transitions, and analytics.
 */
export class OrderRepository extends BaseRepositoryImpl<Order, CreateOrderData, UpdateOrderData> implements IOrderRepository {
  constructor(db: DatabaseService) {
    super(db, 'orders');
  }

  /**
   * Map database row to Order entity
   */
  protected mapRowToEntity(row: any): Order {
    return {
      id: row.id,
      customerId: row.customer_id,
      status: row.status,
      subtotalAmount: parseFloat(row.subtotal_amount),
      taxAmount: parseFloat(row.tax_amount || '0'),
      shippingAmount: parseFloat(row.shipping_amount || '0'),
      discountAmount: parseFloat(row.discount_amount || '0'),
      totalAmount: parseFloat(row.total_amount),
      currency: row.currency || Currency.USD,
      shippingAddressId: row.shipping_address_id,
      billingAddressId: row.billing_address_id,
      metadata: row.metadata || {},
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      ...(row.payment_method && { paymentMethod: row.payment_method }),
      ...(row.notes && { notes: row.notes }),
      ...(row.tracking_number && { trackingNumber: row.tracking_number }),
      ...(row.shipped_at && { shippedAt: new Date(row.shipped_at) }),
      ...(row.delivered_at && { deliveredAt: new Date(row.delivered_at) }),
      ...(row.cancelled_at && { cancelledAt: new Date(row.cancelled_at) }),
      ...(row.cancellation_reason && { cancellationReason: row.cancellation_reason })
    };
  }

  /**
   * Map create data to database columns
   */
  protected mapCreateDataToColumns(data: CreateOrderData): Record<string, any> {
    return {
      id: `ord_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      customer_id: data.customerId,
      status: data.status || OrderStatus.PENDING,
      subtotal_amount: data.subtotalAmount,
      tax_amount: data.taxAmount || 0,
      shipping_amount: data.shippingAmount || 0,
      discount_amount: data.discountAmount || 0,
      total_amount: data.totalAmount,
      currency: data.currency || Currency.USD,
      shipping_address_id: data.shippingAddressId,
      billing_address_id: data.billingAddressId,
      payment_method: data.paymentMethod,
      notes: data.notes,
      metadata: data.metadata || {}
    };
  }

  /**
   * Map update data to database columns
   */
  protected mapUpdateDataToColumns(data: UpdateOrderData): Record<string, any> {
    const columns: Record<string, any> = {};
    
    if (data.status !== undefined) columns.status = data.status;
    if (data.subtotalAmount !== undefined) columns.subtotal_amount = data.subtotalAmount;
    if (data.taxAmount !== undefined) columns.tax_amount = data.taxAmount;
    if (data.shippingAmount !== undefined) columns.shipping_amount = data.shippingAmount;
    if (data.discountAmount !== undefined) columns.discount_amount = data.discountAmount;
    if (data.totalAmount !== undefined) columns.total_amount = data.totalAmount;
    if (data.notes !== undefined) columns.notes = data.notes;
    if (data.trackingNumber !== undefined) columns.tracking_number = data.trackingNumber;
    if (data.shippedAt !== undefined) columns.shipped_at = data.shippedAt;
    if (data.deliveredAt !== undefined) columns.delivered_at = data.deliveredAt;
    if (data.cancelledAt !== undefined) columns.cancelled_at = data.cancelledAt;
    if (data.cancellationReason !== undefined) columns.cancellation_reason = data.cancellationReason;
    if (data.metadata !== undefined) columns.metadata = data.metadata;
    
    return columns;
  }

  /**
   * Find orders by customer ID
   */
  async findByCustomerId(customerId: string, options?: PaginationOptions): Promise<PaginatedResult<Order>> {
    const baseQuery = `SELECT * FROM ${this.tableName}`;
    const whereClause = 'customer_id = $1';
    const params = [customerId];

    return this.executePaginatedQuery(
      baseQuery,
      options,
      whereClause,
      params,
      (row) => this.mapRowToEntity(row)
    );
  }

  // Legacy/test adapter: alias expected by tests
  async findByCustomer(customerId: string, options?: PaginationOptions) {
    return this.findByCustomerId(customerId, options);
  }

  /**
   * Find orders by status
   */
  async findByStatus(status: OrderStatus | OrderStatus[], options?: PaginationOptions): Promise<PaginatedResult<Order>> {
    const baseQuery = `SELECT * FROM ${this.tableName}`;
    const isArray = Array.isArray(status);
    const whereClause = isArray ? 'status = ANY($1)' : 'status = $1';
    const params = [status] as any[];

    return this.executePaginatedQuery(
      baseQuery,
      options,
      whereClause,
      params,
      (row) => this.mapRowToEntity(row)
    );
  }

  /**
   * Find orders by date range
   */
  async findByDateRange(startDate: Date, endDate: Date, options?: PaginationOptions): Promise<PaginatedResult<Order>> {
    const baseQuery = `SELECT * FROM ${this.tableName}`;
    const whereClause = 'created_at BETWEEN $1 AND $2';
    const params = [startDate, endDate];

    return this.executePaginatedQuery(
      baseQuery,
      options,
      whereClause,
      params,
      (row) => this.mapRowToEntity(row)
    );
  }

  /**
   * Update order status with validation
   */
  async updateStatus(orderId: string, status: OrderStatus, notes?: string): Promise<Order | null> {
    return this.withTransaction(async (client: PoolClient) => {
      // Get current order
      const currentOrder = await client.query(
        'SELECT * FROM orders WHERE id = $1',
        [orderId]
      );
      
      if (currentOrder.rows.length === 0) {
        throw new NotFoundError('Order', orderId);
      }
      
      const currentStatus = currentOrder.rows[0].status;
      
      // Validate status transition
      if (!this.isValidStatusTransition(currentStatus, status)) {
        throw new ValidationError(
          `Invalid status transition from ${currentStatus} to ${status}`,
          'status',
          status
        );
      }
      
      const updateData: Record<string, any> = {
        status,
        updated_at: 'CURRENT_TIMESTAMP'
      };
      
      // Set timestamp fields based on status
      if (status === OrderStatus.SHIPPED) {
        updateData.shipped_at = 'CURRENT_TIMESTAMP';
      } else if (status === OrderStatus.DELIVERED) {
        updateData.delivered_at = 'CURRENT_TIMESTAMP';
      } else if (status === OrderStatus.CANCELLED) {
        updateData.cancelled_at = 'CURRENT_TIMESTAMP';
        if (notes) {
          updateData.cancellation_reason = notes;
        }
      }
      
      if (notes && status !== OrderStatus.CANCELLED) {
        updateData.notes = notes;
      }
      
      const setClause = Object.keys(updateData).map((key, index) => 
        updateData[key] === 'CURRENT_TIMESTAMP' ? 
        `${key} = CURRENT_TIMESTAMP` : 
        `${key} = $${index + 1}`
      );
      
      const params = Object.values(updateData).filter(val => val !== 'CURRENT_TIMESTAMP');
      params.push(orderId);
      
      const query = `
        UPDATE orders 
        SET ${setClause.join(', ')}
        WHERE id = $${params.length}
        RETURNING *
      `;
      
      const result = await client.query(query, params);
      return result.rows.length > 0 ? this.mapRowToEntity(result.rows[0]) : null;
    });
  }

  /**
   * Add item to order
   */
  async addItem(orderId: string, item: CreateOrderItemData): Promise<OrderItem> {
    return this.withTransaction(async (client: PoolClient) => {
      // Verify order exists and is modifiable
      const order = await client.query(
        'SELECT status FROM orders WHERE id = $1',
        [orderId]
      );
      
      if (order.rows.length === 0) {
        throw new NotFoundError('Order', orderId);
      }
      
      if (!this.isOrderModifiable(order.rows[0].status)) {
        throw new ValidationError('Order cannot be modified in current status', 'status', order.rows[0].status);
      }
      
      // Check product exists and has sufficient stock
      const product = await client.query(
        'SELECT stock FROM products WHERE id = $1 AND is_active = true AND deleted_at IS NULL',
        [item.productId]
      );
      
      if (product.rows.length === 0) {
        throw new NotFoundError('Product', item.productId);
      }
      
      const availableStock = parseInt(product.rows[0].stock);
      if (availableStock < item.quantity) {
        throw new ConflictError(`Insufficient stock. Available: ${availableStock}, Requested: ${item.quantity}`);
      }
      
      // Calculate total price
      const totalPrice = item.unitPrice * item.quantity;
      
      // Add order item
      const itemData = {
        id: `oi_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        order_id: orderId,
        product_id: item.productId,
        quantity: item.quantity,
        unit_price: item.unitPrice,
        total_price: totalPrice
      };
      
      const insertQuery = `
        INSERT INTO order_items (id, order_id, product_id, quantity, unit_price, total_price)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *
      `;
      
      const result = await client.query(insertQuery, Object.values(itemData));
      
      // Update product stock
      await client.query(
        'UPDATE products SET stock = stock - $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        [item.quantity, item.productId]
      );
      
      // Recalculate order totals
      await this.recalculateOrderTotals(client, orderId);
      
      return this.mapRowToOrderItem(result.rows[0]);
    });
  }

  /**
   * Update order item
   */
  async updateItem(orderId: string, itemId: string, item: UpdateOrderItemData): Promise<OrderItem | null> {
    return this.withTransaction(async (client: PoolClient) => {
      // Verify order is modifiable
      const order = await client.query(
        'SELECT status FROM orders WHERE id = $1',
        [orderId]
      );
      
      if (order.rows.length === 0) {
        throw new NotFoundError('Order', orderId);
      }
      
      if (!this.isOrderModifiable(order.rows[0].status)) {
        throw new ValidationError('Order cannot be modified in current status', 'status', order.rows[0].status);
      }
      
      // Get current order item
      const currentItem = await client.query(
        'SELECT * FROM order_items WHERE id = $1 AND order_id = $2',
        [itemId, orderId]
      );
      
      if (currentItem.rows.length === 0) {
        return null;
      }
      
      const currentQuantity = parseInt(currentItem.rows[0].quantity);
      const newQuantity = item.quantity ?? currentQuantity;
      const newUnitPrice = item.unitPrice ?? parseFloat(currentItem.rows[0].unit_price);
      const quantityDiff = newQuantity - currentQuantity;
      
      // Check stock if quantity is increasing
      if (quantityDiff > 0) {
        const product = await client.query(
          'SELECT stock FROM products WHERE id = $1',
          [currentItem.rows[0].product_id]
        );
        
        if (product.rows.length === 0 || parseInt(product.rows[0].stock) < quantityDiff) {
          throw new ConflictError(`Insufficient stock for quantity increase`);
        }
      }
      
      // Update order item
      const updateQuery = `
        UPDATE order_items 
        SET quantity = $1, unit_price = $2, total_price = $3, updated_at = CURRENT_TIMESTAMP
        WHERE id = $4 AND order_id = $5
        RETURNING *
      `;
      
      const totalPrice = newQuantity * newUnitPrice;
      const result = await client.query(updateQuery, [
        newQuantity,
        newUnitPrice,
        totalPrice,
        itemId,
        orderId
      ]);
      
      // Update product stock
      if (quantityDiff !== 0) {
        await client.query(
          'UPDATE products SET stock = stock - $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
          [quantityDiff, currentItem.rows[0].product_id]
        );
      }
      
      // Recalculate order totals
      await this.recalculateOrderTotals(client, orderId);
      
      return result.rows.length > 0 ? this.mapRowToOrderItem(result.rows[0]) : null;
    });
  }

  /**
   * Remove item from order
   */
  async removeItem(orderId: string, itemId: string): Promise<boolean> {
    return this.withTransaction(async (client: PoolClient) => {
      // Verify order is modifiable
      const order = await client.query(
        'SELECT status FROM orders WHERE id = $1',
        [orderId]
      );
      
      if (order.rows.length === 0) {
        throw new NotFoundError('Order', orderId);
      }
      
      if (!this.isOrderModifiable(order.rows[0].status)) {
        throw new ValidationError('Order cannot be modified in current status', 'status', order.rows[0].status);
      }
      
      // Get order item to restore stock
      const orderItem = await client.query(
        'SELECT product_id, quantity FROM order_items WHERE id = $1 AND order_id = $2',
        [itemId, orderId]
      );
      
      if (orderItem.rows.length === 0) {
        return false;
      }
      
      // Delete order item
      const deleteResult = await client.query(
        'DELETE FROM order_items WHERE id = $1 AND order_id = $2',
        [itemId, orderId]
      );
      
      // Restore product stock
      await client.query(
        'UPDATE products SET stock = stock + $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        [orderItem.rows[0].quantity, orderItem.rows[0].product_id]
      );
      
      // Recalculate order totals
      await this.recalculateOrderTotals(client, orderId);
      
      return (deleteResult.rowCount ?? 0) > 0;
    });
  }

  /**
   * Get order items
   */
  async getItems(orderId: string): Promise<OrderItem[]> {
    const query = `
      SELECT * FROM order_items
      WHERE order_id = $1
      ORDER BY created_at ASC
    `;
    const result = await this.db.query(query, [orderId]);
    
    return result.rows.map(row => this.mapRowToOrderItem(row));
  }

  /**
   * Calculate order totals
   */
  async calculateTotals(orderId: string): Promise<OrderTotals> {
    const query = `
      SELECT 
        COALESCE(SUM(total_price), 0) as subtotal_amount,
        COALESCE(SUM(total_price) * 0.08, 0) as tax_amount,
        COALESCE(CASE WHEN SUM(total_price) > 50 THEN 0 ELSE 5 END, 0) as shipping_amount,
        0 as discount_amount,
        COALESCE(SUM(total_price) * 1.08 + CASE WHEN SUM(total_price) > 50 THEN 0 ELSE 5 END, 0) as total_amount
      FROM order_items 
      WHERE order_id = $1
    `;
    const result = await this.db.query(query, [orderId]);

    return {
      subtotal: parseFloat(result.rows[0].subtotal_amount),
      tax: parseFloat(result.rows[0].tax_amount),
      shipping: parseFloat(result.rows[0].shipping_amount),
      discount: parseFloat(result.rows[0].discount_amount),
      total: parseFloat(result.rows[0].total_amount)
    };
  }

  /**
   * Recalculate and update order totals
   */
  async recalculateTotals(orderId: string): Promise<Order | null> {
    return this.withTransaction(async (client: PoolClient) => {
      await this.recalculateOrderTotals(client, orderId);
      
      const result = await client.query('SELECT * FROM orders WHERE id = $1', [orderId]);
      return result.rows.length > 0 ? this.mapRowToEntity(result.rows[0]) : null;
    });
  }

  /**
   * Mark order as shipped
   */
  async markAsShipped(orderId: string, trackingNumber?: string): Promise<Order | null> {
    const updateData: Record<string, any> = {
      status: OrderStatus.SHIPPED,
      shipped_at: new Date()
    };
    
    if (trackingNumber) {
      updateData.tracking_number = trackingNumber;
    }
    
    return this.update(orderId, updateData);
  }

  /**
   * Mark order as delivered
   */
  async markAsDelivered(orderId: string, deliveredAt?: Date): Promise<Order | null> {
    return this.update(orderId, {
      status: OrderStatus.DELIVERED,
      deliveredAt: deliveredAt || new Date()
    });
  }

  /**
   * Mark order as cancelled
   */
  async markAsCancelled(orderId: string, reason: string): Promise<Order | null> {
    return this.withTransaction(async (client: PoolClient) => {
      // Restore stock for all order items
      const items = await client.query(
        'SELECT product_id, quantity FROM order_items WHERE order_id = $1',
        [orderId]
      );
      
      for (const item of items.rows) {
        await client.query(
          'UPDATE products SET stock = stock + $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
          [item.quantity, item.product_id]
        );
      }
      
      // Update order status
      const result = await client.query(`
        UPDATE orders 
        SET status = $1, cancelled_at = CURRENT_TIMESTAMP, cancellation_reason = $2, updated_at = CURRENT_TIMESTAMP
        WHERE id = $3
        RETURNING *
      `, [OrderStatus.CANCELLED, reason, orderId]);
      
      return result.rows.length > 0 ? this.mapRowToEntity(result.rows[0]) : null;
    });
  }

  /**
   * Get daily sales data
   */
  async getDailySales(startDate: Date, endDate: Date): Promise<DailySalesData[]> {
    const query = `
      SELECT 
        DATE(created_at) as date,
        COUNT(*) as order_count,
        COALESCE(SUM(total_amount), 0) as total_revenue,
        COALESCE(AVG(total_amount), 0) as average_order_value
      FROM orders
      WHERE created_at BETWEEN $1 AND $2
      AND status NOT IN ('cancelled')
      GROUP BY DATE(created_at)
      ORDER BY date ASC
    `;
    
    const result = await this.db.query(query, [startDate, endDate]);
    
    return result.rows.map(row => ({
      date: new Date(row.date),
      orderCount: parseInt(row.order_count),
      totalRevenue: parseFloat(row.total_revenue),
      averageOrderValue: parseFloat(row.average_order_value)
    }));
  }

  /**
   * Get order statistics
   */
  async getOrderStats(startDate?: Date, endDate?: Date): Promise<OrderStats> {
    let query = `
      SELECT 
        COUNT(*) as total_orders,
        COALESCE(SUM(total_amount), 0) as total_revenue,
        COALESCE(AVG(total_amount), 0) as average_order_value,
        status,
        COUNT(*) OVER (PARTITION BY status) as status_count
      FROM orders
      WHERE status NOT IN ('cancelled')
    `;
    
    const params: any[] = [];
    
    if (startDate && endDate) {
      query += ` AND created_at BETWEEN $1 AND $2`;
      params.push(startDate, endDate);
    }
    
    query += ` GROUP BY status`;
    
    const result = await this.db.query(query, params);
    
    const ordersByStatus: Record<OrderStatus, number> = {} as Record<OrderStatus, number>;
    let totalOrders = 0;
    let totalRevenue = 0;
    
    for (const row of result.rows) {
      ordersByStatus[row.status as OrderStatus] = parseInt(row.status_count);
      totalOrders += parseInt(row.status_count);
      totalRevenue += parseFloat(row.total_revenue);
    }
    
    return {
      totalOrders,
      totalRevenue,
      averageOrderValue: totalOrders > 0 ? totalRevenue / totalOrders : 0,
      ordersByStatus
    };
  }

  /**
   * Get revenue data by period
   */
  async getRevenueByPeriod(period: 'day' | 'week' | 'month' | 'year'): Promise<RevenueData[]> {
    const dateFormat = {
      day: 'YYYY-MM-DD',
      week: 'YYYY-WW',
      month: 'YYYY-MM',
      year: 'YYYY'
    }[period];
    
    const query = `
      SELECT 
        TO_CHAR(created_at, '${dateFormat}') as period,
        COALESCE(SUM(total_amount), 0) as revenue,
        COUNT(*) as order_count
      FROM orders
      WHERE status NOT IN ('cancelled')
      GROUP BY TO_CHAR(created_at, '${dateFormat}')
      ORDER BY period DESC
      LIMIT 30
    `;
    
    const result = await this.db.query(query);
    
    return result.rows.map(row => ({
      period: row.period,
      revenue: parseFloat(row.revenue),
      orderCount: parseInt(row.order_count)
    }));
  }

  /**
   * Check if status transition is valid
   */
  private isValidStatusTransition(from: OrderStatus, to: OrderStatus): boolean {
    const validTransitions: Record<OrderStatus, OrderStatus[]> = {
      [OrderStatus.PENDING]: [OrderStatus.CONFIRMED, OrderStatus.CANCELLED],
      [OrderStatus.CONFIRMED]: [OrderStatus.PROCESSING, OrderStatus.CANCELLED],
      [OrderStatus.PROCESSING]: [OrderStatus.SHIPPED, OrderStatus.CANCELLED],
      [OrderStatus.SHIPPED]: [OrderStatus.DELIVERED, OrderStatus.RETURNED],
      [OrderStatus.DELIVERED]: [OrderStatus.RETURNED],
      [OrderStatus.CANCELLED]: [],
      [OrderStatus.RETURNED]: []
    };
    
    return validTransitions[from]?.includes(to) ?? false;
  }

  /**
   * Check if order can be modified
   */
  private isOrderModifiable(status: OrderStatus): boolean {
    return [OrderStatus.PENDING, OrderStatus.CONFIRMED].includes(status);
  }

  /**
   * Recalculate order totals (internal helper)
   */
  private async recalculateOrderTotals(client: PoolClient, orderId: string): Promise<void> {
    const totals = await this.calculateTotals(orderId);
    
    await client.query(`
      UPDATE orders 
      SET subtotal_amount = $1, tax_amount = $2, shipping_amount = $3, 
          discount_amount = $4, total_amount = $5, updated_at = CURRENT_TIMESTAMP
      WHERE id = $6
    `, [totals.subtotal, totals.tax, totals.shipping, totals.discount, totals.total, orderId]);
  }

  /**
   * Map database row to OrderItem entity
   */
  private mapRowToOrderItem(row: any): OrderItem {
    return {
      id: row.id,
      orderId: row.order_id,
      productId: row.product_id,
      quantity: parseInt(row.quantity),
      unitPrice: parseFloat(row.unit_price),
      totalPrice: parseFloat(row.total_price),
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at)
    };
  }
}