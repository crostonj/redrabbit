/**
 * Customer Repository
 * Data access layer for Customer entities with comprehensive CRUD operations and customer management
 * 
 * Aligned with Customer.ts model structure including retail/commercial distinctions,
 * cent-based pricing, and comprehensive customer lifecycle management
 */

import type { QueryResult } from 'pg';
import { DatabaseService, QueryBuilder, DatabaseUtils, TransactionClient } from '../lib/database.js';
import type { Customer, CustomerCreate, CustomerUpdate, CustomerSummary } from '../models/Customer.js';

/**
 * Customer Search and Filter Options
 */
export interface CustomerSearchFilters {
  customerNumber?: string;
  type?: string[];
  status?: string[];
  searchTerm?: string; // Search in name, email, company, customer number
  creditStatus?: string[];
  dateRange?: {
    start: string;
    end: string;
  };
  purchaseAmountRange?: {
    min: number;
    max: number;
  };
  hasOrders?: boolean;
  riskScoreRange?: {
    min: number;
    max: number;
  };
}

/**
 * Customer List Options
 */
export interface CustomerListOptions {
  page?: number;
  limit?: number;
  sortBy?: 'createdAt' | 'updatedAt' | 'lastPurchaseDate' | 'totalPurchaseAmountCents' | 'customerNumber';
  sortOrder?: 'ASC' | 'DESC';
  includeSummaryOnly?: boolean;
}

/**
 * Comprehensive Customer Repository
 * Handles all customer-related database operations with full transaction support
 */
export class CustomerRepository {
  
  /**
   * Create a new customer
   */
  static async create(customerData: CustomerCreate): Promise<Customer> {
    return DatabaseService.transaction(async (tx: TransactionClient) => {
      // Generate customer ID and number
      const customerId = `cust_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const customerNumber = this.generateCustomerNumber(customerData.type);
      
      // Insert main customer record
      const customerQuery = `
        INSERT INTO customers (
          id, customer_number, type, status, first_name, last_name, middle_name,
          title, suffix, date_of_birth, gender, company_name, company_legal_name,
          business_type, industry, dba_name, tax_id_number, tax_exempt,
          tax_exempt_certificate, vat_number, primary_email, secondary_email,
          primary_phone, secondary_phone, mobile_phone, fax_number, website,
          preferred_communication_method, preferred_language, timezone,
          marketing_consent, consent_date, consent_version, unsubscribe_token,
          billing_address_id, shipping_address_id, email_verified, phone_verified,
          two_factor_enabled, credit_status, credit_limit_cents, credit_used_cents,
          credit_available_cents, payment_terms, custom_payment_terms_days,
          current_balance_cents, past_due_balance_cents, customer_segment,
          loyalty_level, loyalty_points, risk_score, account_manager_id,
          referred_by_id, referral_code, external_ids, data_processing_consent,
          data_retention_date, right_to_be_forgotten, birth_country, nationality,
          occupation, income_range, household_size, custom_fields,
          created_at, updated_at, created_by, version
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16,
          $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30,
          $31, $32, $33, $34, $35, $36, $37, $38, $39, $40, $41, $42, $43, $44,
          $45, $46, $47, $48, $49, $50, $51, $52, $53, $54, $55, $56, $57, $58,
          $59, $60, $61, $62, $63, $64, $65, $66, $67, NOW(), NOW(), $68, 1
        ) RETURNING *`;
      
      const result = await tx.query<Customer>(customerQuery, [
        customerId,
        customerNumber,
        customerData.type,
        customerData.status,
        customerData.firstName,
        customerData.lastName,
        customerData.middleName,
        customerData.title,
        customerData.suffix,
        customerData.dateOfBirth,
        customerData.gender,
        customerData.companyName,
        customerData.companyLegalName,
        customerData.businessType,
        customerData.industry,
        customerData.dbaName,
        customerData.taxIdNumber,
        customerData.taxExempt,
        customerData.taxExemptCertificate,
        customerData.vatNumber,
        customerData.primaryEmail,
        customerData.secondaryEmail,
        customerData.primaryPhone,
        customerData.secondaryPhone,
        customerData.mobilePhone,
        customerData.faxNumber,
        customerData.website,
        customerData.preferredCommunicationMethod,
        customerData.preferredLanguage,
        customerData.timezone,
        JSON.stringify(customerData.marketingConsent),
        customerData.consentDate,
        customerData.consentVersion,
        customerData.unsubscribeToken,
        customerData.billingAddressId,
        customerData.shippingAddressId,
        customerData.emailVerified,
        customerData.phoneVerified,
        customerData.twoFactorEnabled,
        customerData.creditStatus,
        customerData.creditLimitCents,
        0, // credit_used_cents - starts at 0
        customerData.creditLimitCents, // credit_available_cents - starts at limit
        customerData.paymentTerms,
        customerData.customPaymentTermsDays,
        0, // current_balance_cents - starts at 0
        0, // past_due_balance_cents - starts at 0
        customerData.customerSegment,
        customerData.loyaltyLevel,
        0, // loyalty_points - starts at 0
        customerData.riskScore,
        customerData.accountManagerId,
        customerData.referredById,
        customerData.referralCode,
        JSON.stringify(customerData.externalIds || {}),
        customerData.dataProcessingConsent,
        customerData.dataRetentionDate,
        customerData.rightToBeforgotten,
        customerData.birthCountry,
        customerData.nationality,
        customerData.occupation,
        customerData.incomeRange,
        customerData.householdSize,
        JSON.stringify(customerData.customFields || {}),
        customerData.createdBy
      ]);
      
      const customer = result.rows[0];
      if (!customer) {
        throw new Error('Failed to create customer');
      }
      
      return customer;
    });
  }

  /**
   * Find customer by ID
   */
  static async findById(id: string): Promise<Customer | null> {
    const query = `
      SELECT * FROM customers 
      WHERE id = $1 AND deleted_at IS NULL`;
    
    const result = await DatabaseService.query<Customer>(query, [id]);
    return result.rows[0] || null;
  }

  /**
   * Find customer by customer number
   */
  static async findByCustomerNumber(customerNumber: string): Promise<Customer | null> {
    const query = `
      SELECT * FROM customers 
      WHERE customer_number = $1 AND deleted_at IS NULL`;
    
    const result = await DatabaseService.query<Customer>(query, [customerNumber]);
    return result.rows[0] || null;
  }

  /**
   * Find customer by email
   */
  static async findByEmail(email: string): Promise<Customer | null> {
    const query = `
      SELECT * FROM customers 
      WHERE (primary_email = $1 OR secondary_email = $1) AND deleted_at IS NULL`;
    
    const result = await DatabaseService.query<Customer>(query, [email]);
    return result.rows[0] || null;
  }

  /**
   * Update customer
   */
  static async update(id: string, updateData: CustomerUpdate): Promise<Customer | null> {
    return DatabaseService.transaction(async (tx: TransactionClient) => {
      // Get current version for optimistic locking
      const currentResult = await tx.query<{ version: number }>(`
        SELECT version FROM customers WHERE id = $1 AND deleted_at IS NULL`, [id]);
      
      if (!currentResult.rows[0]) {
        return null;
      }
      
      const currentVersion = currentResult.rows[0].version;
      
      // Build dynamic update query
      const updates: string[] = [];
      const values: any[] = [];
      let paramCount = 1;

      // Map update fields to database columns
      const fieldMap: Record<string, string> = {
        status: 'status',
        firstName: 'first_name',
        lastName: 'last_name',
        middleName: 'middle_name',
        title: 'title',
        suffix: 'suffix',
        dateOfBirth: 'date_of_birth',
        gender: 'gender',
        companyName: 'company_name',
        companyLegalName: 'company_legal_name',
        businessType: 'business_type',
        industry: 'industry',
        dbaName: 'dba_name',
        taxIdNumber: 'tax_id_number',
        taxExempt: 'tax_exempt',
        taxExemptCertificate: 'tax_exempt_certificate',
        vatNumber: 'vat_number',
        primaryEmail: 'primary_email',
        secondaryEmail: 'secondary_email',
        primaryPhone: 'primary_phone',
        secondaryPhone: 'secondary_phone',
        mobilePhone: 'mobile_phone',
        faxNumber: 'fax_number',
        website: 'website',
        preferredCommunicationMethod: 'preferred_communication_method',
        preferredLanguage: 'preferred_language',
        timezone: 'timezone',
        emailVerified: 'email_verified',
        phoneVerified: 'phone_verified',
        twoFactorEnabled: 'two_factor_enabled',
        creditStatus: 'credit_status',
        creditLimitCents: 'credit_limit_cents',
        paymentTerms: 'payment_terms',
        customPaymentTermsDays: 'custom_payment_terms_days',
        customerSegment: 'customer_segment',
        loyaltyLevel: 'loyalty_level',
        riskScore: 'risk_score',
        accountManagerId: 'account_manager_id',
        referralCode: 'referral_code',
        dataProcessingConsent: 'data_processing_consent',
        dataRetentionDate: 'data_retention_date',
        rightToBeforgotten: 'right_to_be_forgotten',
        birthCountry: 'birth_country',
        nationality: 'nationality',
        occupation: 'occupation',
        incomeRange: 'income_range',
        householdSize: 'household_size'
      };

      // Handle simple field updates
      for (const [field, dbColumn] of Object.entries(fieldMap)) {
        if (updateData[field as keyof CustomerUpdate] !== undefined) {
          updates.push(`${dbColumn} = $${paramCount++}`);
          values.push(updateData[field as keyof CustomerUpdate]);
        }
      }

      // Handle JSON fields separately
      if (updateData.marketingConsent !== undefined) {
        updates.push(`marketing_consent = $${paramCount++}`);
        values.push(JSON.stringify(updateData.marketingConsent));
      }

      if (updateData.externalIds !== undefined) {
        updates.push(`external_ids = $${paramCount++}`);
        values.push(JSON.stringify(updateData.externalIds));
      }

      if (updateData.customFields !== undefined) {
        updates.push(`custom_fields = $${paramCount++}`);
        values.push(JSON.stringify(updateData.customFields));
      }

      if (updates.length === 0) {
        return this.findById(id);
      }

      // Add updated timestamp, version increment, and modifier
      updates.push(`updated_at = NOW()`);
      updates.push(`version = version + 1`);
      if (updateData.lastModifiedBy) {
        updates.push(`last_modified_by = $${paramCount++}`);
        values.push(updateData.lastModifiedBy);
      }

      // Add WHERE conditions
      values.push(id, currentVersion);

      const query = `
        UPDATE customers 
        SET ${updates.join(', ')}
        WHERE id = $${paramCount} AND version = $${paramCount + 1} AND deleted_at IS NULL
        RETURNING *`;

      const result = await tx.query<Customer>(query, values);
      return result.rows[0] || null;
    });
  }

  /**
   * Find customers with advanced filtering and pagination
   */
  static async find(
    filters: CustomerSearchFilters = {},
    options: CustomerListOptions = {}
  ): Promise<{ customers: Customer[] | CustomerSummary[]; total: number; page: number; limit: number }> {
    const {
      page = 1,
      limit = 20,
      sortBy = 'createdAt',
      sortOrder = 'DESC',
      includeSummaryOnly = false
    } = options;

    const selectFields = includeSummaryOnly
      ? [
          'id', 'customer_number', 'type', 'status', 'first_name', 'last_name',
          'company_name', 'primary_email', 'primary_phone', 'total_order_count',
          'total_purchase_amount_cents', 'last_purchase_date', 'credit_status',
          'created_at', 'updated_at'
        ]
      : ['*'];

    const queryBuilder = new QueryBuilder()
      .select(selectFields)
      .from('customers')
      .where('deleted_at IS NULL');

    const countBuilder = new QueryBuilder()
      .select(['COUNT(*) as count'])
      .from('customers')
      .where('deleted_at IS NULL');

    // Apply filters
    this.applyFilters(queryBuilder, filters);
    this.applyFilters(countBuilder, filters);

    // Apply sorting and pagination
    queryBuilder
      .orderBy(sortBy, sortOrder)
      .limit(limit)
      .offset((page - 1) * limit);

    // Execute queries
    const queryBuilt = queryBuilder.build();
    const countBuilt = countBuilder.build();
    
    const [customersResult, countResult] = await Promise.all([
      DatabaseService.query<Customer | CustomerSummary>(queryBuilt.query, queryBuilt.params),
      DatabaseService.query<{ count: string }>(countBuilt.query, countBuilt.params)
    ]);

    const customers = customersResult.rows;
    const total = parseInt(countResult.rows[0]?.count || '0');

    return {
      customers,
      total,
      page,
      limit
    };
  }

  /**
   * Search customers by term (name, email, company, customer number)
   */
  static async search(
    searchTerm: string,
    options: CustomerListOptions = {}
  ): Promise<{ customers: CustomerSummary[]; total: number }> {
    const filters: CustomerSearchFilters = { searchTerm };
    const result = await this.find(filters, { ...options, includeSummaryOnly: true });
    
    return {
      customers: result.customers as CustomerSummary[],
      total: result.total
    };
  }

  /**
   * Get customers by type (retail, commercial, etc.)
   */
  static async findByType(
    type: string,
    options: CustomerListOptions = {}
  ): Promise<{ customers: Customer[]; total: number }> {
    const filters: CustomerSearchFilters = { type: [type] };
    const result = await this.find(filters, options);
    
    return {
      customers: result.customers as Customer[],
      total: result.total
    };
  }

  /**
   * Update customer purchase statistics after order completion
   */
  static async updatePurchaseStats(
    customerId: string,
    orderAmount: number,
    isFirstOrder: boolean = false
  ): Promise<Customer | null> {
    return DatabaseService.transaction(async (tx: TransactionClient) => {
      const query = `
        UPDATE customers 
        SET 
          total_order_count = total_order_count + 1,
          total_purchase_amount_cents = total_purchase_amount_cents + $2,
          average_order_value_cents = CASE 
            WHEN total_order_count + 1 > 0 
            THEN (total_purchase_amount_cents + $2) / (total_order_count + 1)
            ELSE 0
          END,
          last_purchase_date = NOW(),
          first_purchase_date = CASE 
            WHEN $3 THEN NOW() 
            ELSE COALESCE(first_purchase_date, NOW())
          END,
          updated_at = NOW(),
          version = version + 1
        WHERE id = $1 AND deleted_at IS NULL
        RETURNING *`;

      const result = await tx.query<Customer>(query, [customerId, orderAmount, isFirstOrder]);
      return result.rows[0] || null;
    });
  }

  /**
   * Update customer credit information
   */
  static async updateCreditInfo(
    customerId: string,
    creditUsed: number,
    creditLimit?: number
  ): Promise<Customer | null> {
    return DatabaseService.transaction(async (tx: TransactionClient) => {
      const updates: string[] = ['credit_used_cents = $2'];
      const values: any[] = [customerId, creditUsed];
      let paramCount = 3;

      if (creditLimit !== undefined) {
        updates.push(`credit_limit_cents = $${paramCount++}`);
        values.push(creditLimit);
      }

      // Calculate available credit
      const creditLimitValue = creditLimit !== undefined ? '$' + (paramCount - 1) : 'credit_limit_cents';
      updates.push(`credit_available_cents = ${creditLimitValue} - $2`);
      updates.push('updated_at = NOW()');
      updates.push('version = version + 1');

      const query = `
        UPDATE customers 
        SET ${updates.join(', ')}
        WHERE id = $1 AND deleted_at IS NULL
        RETURNING *`;

      const result = await tx.query<Customer>(query, values);
      return result.rows[0] || null;
    });
  }

  /**
   * Soft delete customer
   */
  static async delete(id: string, deletedBy?: string): Promise<boolean> {
    const query = `
      UPDATE customers 
      SET deleted_at = NOW(), deleted_by = $2, updated_at = NOW()
      WHERE id = $1 AND deleted_at IS NULL`;
    
    const result = await DatabaseService.query(query, [id, deletedBy]);
    return result.rowCount! > 0;
  }

  /**
   * Get customer statistics
   */
  static async getStats(): Promise<{
    totalCustomers: number;
    activeCustomers: number;
    retailCustomers: number;
    commercialCustomers: number;
    averageOrderValue: number;
    totalRevenue: number;
  }> {
    const query = `
      SELECT 
        COUNT(*) as total_customers,
        COUNT(CASE WHEN status = 'active' THEN 1 END) as active_customers,
        COUNT(CASE WHEN type = 'retail' THEN 1 END) as retail_customers,
        COUNT(CASE WHEN type IN ('commercial', 'wholesale', 'distributor') THEN 1 END) as commercial_customers,
        COALESCE(AVG(average_order_value_cents), 0) as avg_order_value,
        COALESCE(SUM(total_purchase_amount_cents), 0) as total_revenue
      FROM customers 
      WHERE deleted_at IS NULL`;

    const result = await DatabaseService.query(query);
    const stats = result.rows[0];

    return {
      totalCustomers: parseInt(stats.total_customers),
      activeCustomers: parseInt(stats.active_customers),
      retailCustomers: parseInt(stats.retail_customers),
      commercialCustomers: parseInt(stats.commercial_customers),
      averageOrderValue: parseFloat(stats.avg_order_value),
      totalRevenue: parseFloat(stats.total_revenue)
    };
  }

  // Private helper methods

  /**
   * Apply search filters to query builder
   */
  private static applyFilters(queryBuilder: QueryBuilder, filters: CustomerSearchFilters): void {
    const {
      customerNumber,
      type,
      status,
      searchTerm,
      creditStatus,
      dateRange,
      purchaseAmountRange,
      hasOrders,
      riskScoreRange
    } = filters;

    if (customerNumber) {
      queryBuilder.where('customer_number = ?', [customerNumber]);
    }

    if (type && type.length > 0) {
      const placeholders = type.map(() => '?').join(',');
      queryBuilder.where(`type IN (${placeholders})`, type);
    }

    if (status && status.length > 0) {
      const placeholders = status.map(() => '?').join(',');
      queryBuilder.where(`status IN (${placeholders})`, status);
    }

    if (creditStatus && creditStatus.length > 0) {
      const placeholders = creditStatus.map(() => '?').join(',');
      queryBuilder.where(`credit_status IN (${placeholders})`, creditStatus);
    }

    if (searchTerm) {
      queryBuilder.where(`(
        customer_number ILIKE ? OR 
        first_name ILIKE ? OR 
        last_name ILIKE ? OR 
        company_name ILIKE ? OR 
        primary_email ILIKE ? OR 
        secondary_email ILIKE ?
      )`, Array(6).fill(`%${searchTerm}%`));
    }

    if (dateRange) {
      queryBuilder
        .where('created_at >= ?', [dateRange.start])
        .where('created_at <= ?', [dateRange.end]);
    }

    if (purchaseAmountRange) {
      queryBuilder
        .where('total_purchase_amount_cents >= ?', [purchaseAmountRange.min])
        .where('total_purchase_amount_cents <= ?', [purchaseAmountRange.max]);
    }

    if (hasOrders !== undefined) {
      if (hasOrders) {
        queryBuilder.where('total_order_count > 0');
      } else {
        queryBuilder.where('total_order_count = 0');
      }
    }

    if (riskScoreRange) {
      queryBuilder
        .where('risk_score >= ?', [riskScoreRange.min])
        .where('risk_score <= ?', [riskScoreRange.max]);
    }
  }

  /**
   * Generate unique customer number
   */
  private static generateCustomerNumber(type: string): string {
    const prefix = type === 'retail' ? 'R' : 'C';
    const timestamp = Date.now().toString().slice(-8);
    const random = Math.random().toString(36).substr(2, 4).toUpperCase();
    return `${prefix}${timestamp}${random}`;
  }
}