import type { PoolClient } from 'pg';
import { BaseRepositoryImpl, NotFoundError, ConflictError } from './base.js';
import type {
  Customer,
  CreateCustomerData,
  UpdateCustomerData,
  CustomerRepository as ICustomerRepository,
  Address,
  CreateAddressData,
  UpdateAddressData,
  Order,
  CustomerOrderStats,
  PaginationOptions,
  PaginatedResult,
  SearchOptions
} from './interfaces.js';
import { DatabaseService } from '../services/database.js';

/**
 * Customer Repository Implementation
 * 
 * Handles all database operations for customers and their addresses.
 * Provides CRUD operations, search functionality, and customer analytics.
 */
export class CustomerRepository extends BaseRepositoryImpl<Customer, CreateCustomerData, UpdateCustomerData> implements ICustomerRepository {
  constructor(db: DatabaseService) {
    super(db, 'customers');
  }

  /**
   * Map database row to Customer entity
   */
  protected mapRowToEntity(row: any): Customer {
    return {
      id: row.id,
      email: row.email,
      firstName: row.first_name,
      lastName: row.last_name,
      phone: row.phone || undefined,
      metadata: row.metadata || {},
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      deletedAt: row.deleted_at ? new Date(row.deleted_at) : undefined,
      ...(row.date_of_birth && { dateOfBirth: new Date(row.date_of_birth) })
    };
  }

  /**
   * Map create data to database columns
   */
  protected mapCreateDataToColumns(data: CreateCustomerData): Record<string, any> {
    return {
      id: `cust_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      email: data.email,
      first_name: data.firstName,
      last_name: data.lastName,
      phone: data.phone,
      date_of_birth: data.dateOfBirth,
      metadata: data.metadata || {}
    };
  }

  /**
   * Map update data to database columns
   */
  protected mapUpdateDataToColumns(data: UpdateCustomerData): Record<string, any> {
    const columns: Record<string, any> = {};
    
    if (data.email !== undefined) columns.email = data.email;
    if (data.firstName !== undefined) columns.first_name = data.firstName;
    if (data.lastName !== undefined) columns.last_name = data.lastName;
    if (data.phone !== undefined) columns.phone = data.phone;
    if (data.dateOfBirth !== undefined) columns.date_of_birth = data.dateOfBirth;
    if (data.metadata !== undefined) columns.metadata = data.metadata;
    
    return columns;
  }

  /**
   * Find customer by email address
   */
  async findByEmail(email: string): Promise<Customer | null> {
    const query = `
      SELECT * FROM ${this.tableName} 
      WHERE email = $1 AND deleted_at IS NULL
    `;
    const result = await this.db.query(query, [email]);
    
    return result.rows.length > 0 ? this.mapRowToEntity(result.rows[0]) : null;
  }

  /**
   * Find customer by phone number
   */
  async findByPhone(phone: string): Promise<Customer | null> {
    const query = `
      SELECT * FROM ${this.tableName} 
      WHERE phone = $1 AND deleted_at IS NULL
    `;
    const result = await this.db.query(query, [phone]);
    
    return result.rows.length > 0 ? this.mapRowToEntity(result.rows[0]) : null;
  }

  /**
   * Search customers with filtering and full-text search
   */
  async search(options: SearchOptions): Promise<PaginatedResult<Customer>> {
    const { query: searchQuery, filters = {} } = options;
    
    let baseQuery = `SELECT * FROM ${this.tableName}`;
    let whereConditions: string[] = ['deleted_at IS NULL'];
    let params: any[] = [];
    
    // Add search query
    if (searchQuery && searchQuery.trim()) {
      const searchCondition = `(
        first_name ILIKE $${params.length + 1} OR 
        last_name ILIKE $${params.length + 1} OR 
        email ILIKE $${params.length + 1}
      )`;
      whereConditions.push(searchCondition);
      params.push(`%${searchQuery.trim()}%`);
    }
    
    // Add filters
    Object.keys(filters).forEach(key => {
      if (filters[key] !== undefined && filters[key] !== null) {
        const dbColumn = this.mapFilterKeyToColumn(key);
        whereConditions.push(`${dbColumn} = $${params.length + 1}`);
        params.push(filters[key]);
      }
    });
    
    const whereClause = whereConditions.join(' AND ');
    
    return this.executePaginatedQuery(
      baseQuery,
      options,
      whereClause,
      params,
      (row) => this.mapRowToEntity(row)
    );
  }

  /**
   * Map filter keys to database columns
   */
  private mapFilterKeyToColumn(key: string): string {
    const mapping: Record<string, string> = {
      firstName: 'first_name',
      lastName: 'last_name',
      dateOfBirth: 'date_of_birth'
    };
    return mapping[key] || key;
  }

  /**
   * Add address to customer
   */
  async addAddress(customerId: string, address: CreateAddressData): Promise<Address> {
    // Verify customer exists
    const customerExists = await this.exists(customerId);
    if (!customerExists) {
      throw new NotFoundError('Customer', customerId);
    }

    return this.withTransaction(async (client: PoolClient) => {
      // If this is the default address or customer has no addresses, make it default
      if (address.isDefault) {
        await client.query(
          'UPDATE addresses SET is_default = false WHERE customer_id = $1',
          [customerId]
        );
      } else {
        // Check if customer has any addresses, if not make this the default
        const existingAddresses = await client.query(
          'SELECT COUNT(*) FROM addresses WHERE customer_id = $1',
          [customerId]
        );
        
        if (parseInt(existingAddresses.rows[0].count) === 0) {
          address.isDefault = true;
        }
      }

      const addressData = {
        id: `addr_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        customer_id: customerId,
        type: address.type,
        street1: address.street1,
        street2: address.street2,
        city: address.city,
        state: address.state,
        zip_code: address.zipCode,
        country: address.country,
        is_default: address.isDefault || false
      };

      const query = `
        INSERT INTO addresses (id, customer_id, type, street1, street2, city, state, zip_code, country, is_default)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING *
      `;
      
      const params = Object.values(addressData);
      const result = await client.query(query, params);
      
      return this.mapRowToAddress(result.rows[0]);
    });
  }

  /**
   * Update customer address
   */
  async updateAddress(customerId: string, addressId: string, address: UpdateAddressData): Promise<Address | null> {
    return this.withTransaction(async (client: PoolClient) => {
      // Verify address belongs to customer
      const existingAddress = await client.query(
        'SELECT * FROM addresses WHERE id = $1 AND customer_id = $2',
        [addressId, customerId]
      );
      
      if (existingAddress.rows.length === 0) {
        return null;
      }

      // If setting as default, unset other defaults
      if (address.isDefault) {
        await client.query(
          'UPDATE addresses SET is_default = false WHERE customer_id = $1 AND id != $2',
          [customerId, addressId]
        );
      }

      const updateColumns: string[] = [];
      const params: any[] = [];
      let paramIndex = 1;

      Object.keys(address).forEach(key => {
        if (address[key as keyof UpdateAddressData] !== undefined) {
          const dbColumn = this.mapAddressKeyToColumn(key);
          updateColumns.push(`${dbColumn} = $${paramIndex++}`);
          params.push(address[key as keyof UpdateAddressData]);
        }
      });

      if (updateColumns.length === 0) {
        return this.mapRowToAddress(existingAddress.rows[0]);
      }

      updateColumns.push('updated_at = CURRENT_TIMESTAMP');
      params.push(addressId, customerId);

      const query = `
        UPDATE addresses 
        SET ${updateColumns.join(', ')}
        WHERE id = $${paramIndex++} AND customer_id = $${paramIndex}
        RETURNING *
      `;

      const result = await client.query(query, params);
      return result.rows.length > 0 ? this.mapRowToAddress(result.rows[0]) : null;
    });
  }

  /**
   * Delete customer address
   */
  async deleteAddress(customerId: string, addressId: string): Promise<boolean> {
    return this.withTransaction(async (client: PoolClient) => {
      // Check if address exists and belongs to customer
      const existingAddress = await client.query(
        'SELECT is_default FROM addresses WHERE id = $1 AND customer_id = $2',
        [addressId, customerId]
      );

      if (existingAddress.rows.length === 0) {
        return false;
      }

      const wasDefault = existingAddress.rows[0].is_default;

      // Delete the address
      const deleteResult = await client.query(
        'DELETE FROM addresses WHERE id = $1 AND customer_id = $2',
        [addressId, customerId]
      );

      // If we deleted the default address, set another one as default
      if (wasDefault && (deleteResult.rowCount ?? 0) > 0) {
        await client.query(`
          UPDATE addresses 
          SET is_default = true 
          WHERE customer_id = $1 
          AND id = (
            SELECT id FROM addresses 
            WHERE customer_id = $1 
            ORDER BY created_at ASC 
            LIMIT 1
          )
        `, [customerId]);
      }

      return (deleteResult.rowCount ?? 0) > 0;
    });
  }

  /**
   * Get all addresses for customer
   */
  async getAddresses(customerId: string): Promise<Address[]> {
    const query = `
      SELECT * FROM addresses 
      WHERE customer_id = $1 
      ORDER BY is_default DESC, created_at ASC
    `;
    const result = await this.db.query(query, [customerId]);
    
    return result.rows.map(row => this.mapRowToAddress(row));
  }

  /**
   * Set default address for customer
   */
  async setDefaultAddress(customerId: string, addressId: string): Promise<boolean> {
    return this.withTransaction(async (client: PoolClient) => {
      // Verify address belongs to customer
      const addressExists = await client.query(
        'SELECT 1 FROM addresses WHERE id = $1 AND customer_id = $2',
        [addressId, customerId]
      );

      if (addressExists.rows.length === 0) {
        return false;
      }

      // Unset all default addresses for customer
      await client.query(
        'UPDATE addresses SET is_default = false WHERE customer_id = $1',
        [customerId]
      );

      // Set the specified address as default
      const result = await client.query(
        'UPDATE addresses SET is_default = true WHERE id = $1 AND customer_id = $2',
        [addressId, customerId]
      );

      return (result.rowCount ?? 0) > 0;
    });
  }

  /**
   * Get customer order history
   */
  async getOrderHistory(customerId: string, options?: PaginationOptions): Promise<PaginatedResult<Order>> {
    const baseQuery = `
      SELECT o.*, 
             sa.street1 as shipping_street1, sa.city as shipping_city,
             ba.street1 as billing_street1, ba.city as billing_city
      FROM orders o
      LEFT JOIN addresses sa ON o.shipping_address_id = sa.id
      LEFT JOIN addresses ba ON o.billing_address_id = ba.id
    `;
    const whereClause = 'o.customer_id = $1';
    const params = [customerId];

    return this.executePaginatedQuery(
      baseQuery,
      options,
      whereClause,
      params,
      (row) => this.mapRowToOrder(row)
    );
  }

  /**
   * Get customer order statistics
   */
  async getOrderStats(customerId: string): Promise<CustomerOrderStats> {
    const query = `
      SELECT 
        COUNT(*) as total_orders,
        COALESCE(SUM(total_amount), 0) as total_spent,
        COALESCE(AVG(total_amount), 0) as average_order_value,
        MIN(created_at) as first_order_date,
        MAX(created_at) as last_order_date
      FROM orders 
      WHERE customer_id = $1 AND status != 'cancelled'
    `;
    
    const result = await this.db.query(query, [customerId]);
    const row = result.rows[0];
    
    return {
      totalOrders: parseInt(row.total_orders),
      totalSpent: parseFloat(row.total_spent),
      averageOrderValue: parseFloat(row.average_order_value),
      ...(row.first_order_date && { firstOrderDate: new Date(row.first_order_date) }),
      ...(row.last_order_date && { lastOrderDate: new Date(row.last_order_date) })
    };
  }

  /**
   * Get top customers by total spent
   */
  async getTopCustomers(limit: number): Promise<Customer[]> {
    const query = `
      SELECT c.*, COALESCE(SUM(o.total_amount), 0) as total_spent
      FROM customers c
      LEFT JOIN orders o ON c.id = o.customer_id AND o.status != 'cancelled'
      WHERE c.deleted_at IS NULL
      GROUP BY c.id
      ORDER BY total_spent DESC
      LIMIT $1
    `;
    
    const result = await this.db.query(query, [limit]);
    return result.rows.map(row => this.mapRowToEntity(row));
  }

  /**
   * Override create to check for duplicate email
   */
  async create(data: CreateCustomerData): Promise<Customer> {
    // Check for existing email
    const existingCustomer = await this.findByEmail(data.email);
    if (existingCustomer) {
      throw new ConflictError(`Customer with email ${data.email} already exists`);
    }

    return super.create(data);
  }

  /**
   * Map database row to Address entity
   */
  private mapRowToAddress(row: any): Address {
    return {
      id: row.address_id,
      customerId: row.customer_id,
      type: row.address_type,
      street1: row.address_line_1,
      street2: row.address_line_2,
      city: row.city,
      state: row.state,
      zipCode: row.zip_code,
      country: row.country,
      isDefault: row.is_default,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  /**
   * Map address field keys to database columns
   */
  private mapAddressKeyToColumn(key: string): string {
    const mapping: Record<string, string> = {
      zipCode: 'zip_code',
      isDefault: 'is_default'
    };
    return mapping[key] || key;
  }

  /**
   * Map database row to Order entity (simplified for order history)
   */
  private mapRowToOrder(row: any): Order {
    return {
      id: row.id,
      customerId: row.customer_id,
      status: row.status,
      subtotalAmount: parseFloat(row.subtotal_amount),
      taxAmount: parseFloat(row.tax_amount || '0'),
      shippingAmount: parseFloat(row.shipping_amount || '0'),
      discountAmount: parseFloat(row.discount_amount || '0'),
      totalAmount: parseFloat(row.total_amount),
      currency: row.currency,
      shippingAddressId: row.shipping_address_id,
      billingAddressId: row.billing_address_id,
      paymentMethod: row.payment_method || undefined,
      notes: row.notes || undefined,
      trackingNumber: row.tracking_number || undefined,
      metadata: row.metadata || {},
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      ...(row.shipped_at && { shippedAt: new Date(row.shipped_at) }),
      ...(row.delivered_at && { deliveredAt: new Date(row.delivered_at) }),
      ...(row.cancelled_at && { cancelledAt: new Date(row.cancelled_at) }),
      ...(row.cancellation_reason && { cancellationReason: row.cancellation_reason })
    };
  }
}