/**
 * Product Repository
 * Data access layer for Product entities with comprehensive CRUD operations and inventory management
 * 
 * Aligned with Product.ts model structure including cent-based pricing,
 * inventory tracking, variants, and comprehensive product lifecycle management
 */

import type { QueryResult } from 'pg';
import { DatabaseService, QueryBuilder, DatabaseUtils, TransactionClient } from '../lib/database.js';
import type { Product, ProductCreate, ProductUpdate, ProductSummary } from '../models/Product.js';

/**
 * Product Search and Filter Options
 */
export interface ProductSearchFilters {
  sku?: string;
  name?: string;
  type?: string[];
  status?: string[];
  categoryId?: string;
  brand?: string;
  manufacturer?: string;
  searchTerm?: string; // Search in name, description, sku, brand
  priceRange?: {
    min: number;
    max: number;
  };
  inventoryManagement?: string[];
  inStock?: boolean;
  lowStock?: boolean;
  isDigital?: boolean;
  isHazardous?: boolean;
  tags?: string[];
}

/**
 * Product List Options
 */
export interface ProductListOptions {
  page?: number;
  limit?: number;
  sortBy?: 'createdAt' | 'updatedAt' | 'name' | 'retailPriceCents' | 'currentStock' | 'totalSales';
  sortOrder?: 'ASC' | 'DESC';
  includeSummaryOnly?: boolean;
}

/**
 * Inventory Update Options
 */
export interface InventoryUpdate {
  currentStock?: number;
  reservedStock?: number;
  adjustment?: number; // Positive or negative adjustment to current stock
  reason?: string;
  updatedBy?: string;
}

/**
 * Comprehensive Product Repository
 * Handles all product-related database operations with full transaction support
 */
export class ProductRepository {
  
  /**
   * Create a new product
   */
  static async create(productData: ProductCreate): Promise<Product> {
    return DatabaseService.transaction(async (tx: TransactionClient) => {
      // Generate product ID
      const productId = `prod_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // Calculate available stock
      const currentStock = productData.currentStock || 0;
      const reservedStock = productData.reservedStock || 0;
      const availableStock = currentStock - reservedStock;
      
      // Insert main product record
      const productQuery = `
        INSERT INTO products (
          id, sku, name, description, short_description, type, status,
          category_id, category_path, brand, manufacturer, manufacturer_part_number,
          retail_price_cents, wholesale_price_cents, contract_price_cents,
          cost_cents, msrp_cents, currency, inventory_management,
          current_stock, reserved_stock, available_stock,
          low_stock_threshold, out_of_stock_threshold, max_stock_level,
          reorder_point, reorder_quantity, lead_time_days,
          weight, dimensions, shipping_weight, shipping_dimensions,
          requires_special_handling, special_handling_instructions,
          is_hazardous, hazard_class, un_number, tax_category, tax_code,
          harmonized_code, is_digital, download_url, download_limit,
          license_key, parent_product_id, variant_attributes,
          config_options, bundle_items, images, slug,
          meta_title, meta_description, keywords, attributes,
          quality_check_required, certifications, country_of_origin,
          primary_vendor_id, vendor_sku, vendor_product_url,
          launch_date, end_of_life_date, discontinue_date,
          is_returnable, return_policy_days, warranty_period_days,
          warranty_description, minimum_age, maximum_age,
          age_verification_required, restricted_states, restricted_countries,
          subscription_info, average_rating, created_at, updated_at,
          created_by, version
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
          $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28,
          $29, $30, $31, $32, $33, $34, $35, $36, $37, $38, $39, $40, $41,
          $42, $43, $44, $45, $46, $47, $48, $49, $50, $51, $52, $53, $54,
          $55, $56, $57, $58, $59, $60, $61, $62, $63, $64, $65, $66, $67,
          $68, $69, $70, $71, $72, $73, $74, $75, $76, $77, $78, NOW(), NOW(),
          $79, 1
        ) RETURNING *`;
      
      const result = await tx.query<Product>(productQuery, [
        productId,
        productData.sku,
        productData.name,
        productData.description,
        productData.shortDescription,
        productData.type,
        productData.status,
        productData.categoryId,
        productData.categoryPath,
        productData.brand,
        productData.manufacturer,
        productData.manufacturerPartNumber,
        productData.retailPriceCents,
        productData.wholesalePriceCents,
        productData.contractPriceCents,
        productData.costCents,
        productData.msrpCents,
        productData.currency,
        productData.inventoryManagement,
        currentStock,
        reservedStock,
        availableStock,
        productData.lowStockThreshold,
        productData.outOfStockThreshold,
        productData.maxStockLevel,
        productData.reorderPoint,
        productData.reorderQuantity,
        productData.leadTimeDays,
        productData.weight,
        JSON.stringify(productData.dimensions),
        productData.shippingWeight,
        JSON.stringify(productData.shippingDimensions),
        productData.requiresSpecialHandling,
        productData.specialHandlingInstructions,
        productData.isHazardous,
        productData.hazardClass,
        productData.unNumber,
        productData.taxCategory,
        productData.taxCode,
        productData.harmonizedCode,
        productData.isDigital,
        productData.downloadUrl,
        productData.downloadLimit,
        productData.licenseKey,
        productData.parentProductId,
        JSON.stringify(productData.variantAttributes),
        JSON.stringify(productData.configOptions),
        JSON.stringify(productData.bundleItems),
        JSON.stringify(productData.images),
        productData.slug,
        productData.metaTitle,
        productData.metaDescription,
        JSON.stringify(productData.keywords),
        JSON.stringify(productData.attributes),
        productData.qualityCheckRequired,
        JSON.stringify(productData.certifications),
        productData.countryOfOrigin,
        productData.primaryVendorId,
        productData.vendorSku,
        productData.vendorProductUrl,
        productData.launchDate,
        productData.endOfLifeDate,
        productData.discontinueDate,
        productData.isReturnable,
        productData.returnPolicyDays,
        productData.warrantyPeriodDays,
        productData.warrantyDescription,
        productData.minimumAge,
        productData.maximumAge,
        productData.ageVerificationRequired,
        JSON.stringify(productData.restrictedStates),
        JSON.stringify(productData.restrictedCountries),
        JSON.stringify(productData.subscriptionInfo),
        productData.averageRating,
        productData.createdBy
      ]);
      
      const product = result.rows[0];
      if (!product) {
        throw new Error('Failed to create product');
      }
      
      return product;
    });
  }

  /**
   * Find product by ID
   */
  static async findById(id: string): Promise<Product | null> {
    const query = `
      SELECT * FROM products 
      WHERE id = $1 AND deleted_at IS NULL`;
    
    const result = await DatabaseService.query<Product>(query, [id]);
    return result.rows[0] || null;
  }

  /**
   * Find product by SKU
   */
  static async findBySku(sku: string): Promise<Product | null> {
    const query = `
      SELECT * FROM products 
      WHERE sku = $1 AND deleted_at IS NULL`;
    
    const result = await DatabaseService.query<Product>(query, [sku]);
    return result.rows[0] || null;
  }

  /**
   * Find products by category
   */
  static async findByCategory(
    categoryId: string,
    options: ProductListOptions = {}
  ): Promise<{ products: Product[] | ProductSummary[]; total: number }> {
    const filters: ProductSearchFilters = { categoryId };
    const result = await this.find(filters, options);
    
    return {
      products: result.products,
      total: result.total
    };
  }

  /**
   * Update product
   */
  static async update(id: string, updateData: ProductUpdate): Promise<Product | null> {
    return DatabaseService.transaction(async (tx: TransactionClient) => {
      // Get current version for optimistic locking
      const currentResult = await tx.query<{ version: number; currentStock: number; reservedStock: number }>(`
        SELECT version, current_stock, reserved_stock FROM products 
        WHERE id = $1 AND deleted_at IS NULL`, [id]);
      
      if (!currentResult.rows[0]) {
        return null;
      }
      
      const { version: currentVersion, currentStock, reservedStock } = currentResult.rows[0];
      
      // Build dynamic update query
      const updates: string[] = [];
      const values: any[] = [];
      let paramCount = 1;

      // Map update fields to database columns
      const fieldMap: Record<string, string> = {
        sku: 'sku',
        name: 'name',
        description: 'description',
        shortDescription: 'short_description',
        type: 'type',
        status: 'status',
        categoryId: 'category_id',
        categoryPath: 'category_path',
        brand: 'brand',
        manufacturer: 'manufacturer',
        manufacturerPartNumber: 'manufacturer_part_number',
        retailPriceCents: 'retail_price_cents',
        wholesalePriceCents: 'wholesale_price_cents',
        contractPriceCents: 'contract_price_cents',
        costCents: 'cost_cents',
        msrpCents: 'msrp_cents',
        currency: 'currency',
        inventoryManagement: 'inventory_management',
        lowStockThreshold: 'low_stock_threshold',
        outOfStockThreshold: 'out_of_stock_threshold',
        maxStockLevel: 'max_stock_level',
        reorderPoint: 'reorder_point',
        reorderQuantity: 'reorder_quantity',
        leadTimeDays: 'lead_time_days',
        weight: 'weight',
        shippingWeight: 'shipping_weight',
        requiresSpecialHandling: 'requires_special_handling',
        specialHandlingInstructions: 'special_handling_instructions',
        isHazardous: 'is_hazardous',
        hazardClass: 'hazard_class',
        unNumber: 'un_number',
        taxCategory: 'tax_category',
        taxCode: 'tax_code',
        harmonizedCode: 'harmonized_code',
        isDigital: 'is_digital',
        downloadUrl: 'download_url',
        downloadLimit: 'download_limit',
        licenseKey: 'license_key',
        slug: 'slug',
        metaTitle: 'meta_title',
        metaDescription: 'meta_description',
        qualityCheckRequired: 'quality_check_required',
        countryOfOrigin: 'country_of_origin',
        primaryVendorId: 'primary_vendor_id',
        vendorSku: 'vendor_sku',
        vendorProductUrl: 'vendor_product_url',
        launchDate: 'launch_date',
        endOfLifeDate: 'end_of_life_date',
        discontinueDate: 'discontinue_date',
        isReturnable: 'is_returnable',
        returnPolicyDays: 'return_policy_days',
        warrantyPeriodDays: 'warranty_period_days',
        warrantyDescription: 'warranty_description',
        minimumAge: 'minimum_age',
        maximumAge: 'maximum_age',
        ageVerificationRequired: 'age_verification_required',
        averageRating: 'average_rating'
      };

      // Handle simple field updates
      for (const [field, dbColumn] of Object.entries(fieldMap)) {
        if (updateData[field as keyof ProductUpdate] !== undefined) {
          updates.push(`${dbColumn} = $${paramCount++}`);
          values.push(updateData[field as keyof ProductUpdate]);
        }
      }

      // Handle JSON fields separately
      const jsonFields = {
        dimensions: 'dimensions',
        shippingDimensions: 'shipping_dimensions',
        variantAttributes: 'variant_attributes',
        configOptions: 'config_options',
        bundleItems: 'bundle_items',
        images: 'images',
        keywords: 'keywords',
        attributes: 'attributes',
        certifications: 'certifications',
        restrictedStates: 'restricted_states',
        restrictedCountries: 'restricted_countries',
        subscriptionInfo: 'subscription_info'
      };

      for (const [field, dbColumn] of Object.entries(jsonFields)) {
        if (updateData[field as keyof ProductUpdate] !== undefined) {
          updates.push(`${dbColumn} = $${paramCount++}`);
          values.push(JSON.stringify(updateData[field as keyof ProductUpdate]));
        }
      }

      // Handle stock updates if provided
      if (updateData.currentStock !== undefined || updateData.reservedStock !== undefined) {
        const newCurrentStock = updateData.currentStock ?? currentStock;
        const newReservedStock = updateData.reservedStock ?? reservedStock;
        const newAvailableStock = newCurrentStock - newReservedStock;

        if (updateData.currentStock !== undefined) {
          updates.push(`current_stock = $${paramCount++}`);
          values.push(newCurrentStock);
        }

        if (updateData.reservedStock !== undefined) {
          updates.push(`reserved_stock = $${paramCount++}`);
          values.push(newReservedStock);
        }

        updates.push(`available_stock = $${paramCount++}`);
        values.push(newAvailableStock);
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
        UPDATE products 
        SET ${updates.join(', ')}
        WHERE id = $${paramCount} AND version = $${paramCount + 1} AND deleted_at IS NULL
        RETURNING *`;

      const result = await tx.query<Product>(query, values);
      return result.rows[0] || null;
    });
  }

  /**
   * Update inventory levels
   */
  static async updateInventory(id: string, inventoryUpdate: InventoryUpdate): Promise<Product | null> {
    return DatabaseService.transaction(async (tx: TransactionClient) => {
      // Get current inventory levels
      const currentResult = await tx.query<{ currentStock: number; reservedStock: number }>(`
        SELECT current_stock, reserved_stock FROM products 
        WHERE id = $1 AND deleted_at IS NULL`, [id]);
      
      if (!currentResult.rows[0]) {
        return null;
      }
      
      const { currentStock, reservedStock } = currentResult.rows[0];
      
      let newCurrentStock = currentStock;
      let newReservedStock = reservedStock;

      // Apply inventory changes
      if (inventoryUpdate.currentStock !== undefined) {
        newCurrentStock = inventoryUpdate.currentStock;
      } else if (inventoryUpdate.adjustment !== undefined) {
        newCurrentStock = currentStock + inventoryUpdate.adjustment;
      }

      if (inventoryUpdate.reservedStock !== undefined) {
        newReservedStock = inventoryUpdate.reservedStock;
      }

      // Ensure we don't go negative
      newCurrentStock = Math.max(0, newCurrentStock);
      newReservedStock = Math.max(0, Math.min(newReservedStock, newCurrentStock));
      
      const newAvailableStock = newCurrentStock - newReservedStock;

      // Update the product
      const query = `
        UPDATE products 
        SET 
          current_stock = $2,
          reserved_stock = $3,
          available_stock = $4,
          updated_at = NOW(),
          version = version + 1,
          last_modified_by = $5
        WHERE id = $1 AND deleted_at IS NULL
        RETURNING *`;

      const result = await tx.query<Product>(query, [
        id,
        newCurrentStock,
        newReservedStock,
        newAvailableStock,
        inventoryUpdate.updatedBy
      ]);

      // Log inventory change if reason provided
      if (inventoryUpdate.reason && result.rows[0]) {
        await tx.query(`
          INSERT INTO inventory_logs (
            product_id, previous_stock, new_stock, adjustment, reason,
            updated_by, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, NOW())`, [
          id,
          currentStock,
          newCurrentStock,
          inventoryUpdate.adjustment || (newCurrentStock - currentStock),
          inventoryUpdate.reason,
          inventoryUpdate.updatedBy
        ]);
      }

      return result.rows[0] || null;
    });
  }

  /**
   * Find products with advanced filtering and pagination
   */
  static async find(
    filters: ProductSearchFilters = {},
    options: ProductListOptions = {}
  ): Promise<{ products: Product[] | ProductSummary[]; total: number; page: number; limit: number }> {
    const {
      page = 1,
      limit = 20,
      sortBy = 'createdAt',
      sortOrder = 'DESC',
      includeSummaryOnly = false
    } = options;

    const selectFields = includeSummaryOnly
      ? [
          'id', 'sku', 'name', 'short_description', 'status', 'type',
          'retail_price_cents', 'current_stock', 'available_stock',
          'inventory_management', 'images', 'created_at', 'updated_at'
        ]
      : ['*'];

    const queryBuilder = new QueryBuilder()
      .select(selectFields)
      .from('products')
      .where('deleted_at IS NULL');

    const countBuilder = new QueryBuilder()
      .select(['COUNT(*) as count'])
      .from('products')
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
    
    const [productsResult, countResult] = await Promise.all([
      DatabaseService.query<Product | ProductSummary>(queryBuilt.query, queryBuilt.params),
      DatabaseService.query<{ count: string }>(countBuilt.query, countBuilt.params)
    ]);

    const products = productsResult.rows;
    const total = parseInt(countResult.rows[0]?.count || '0');

    return {
      products,
      total,
      page,
      limit
    };
  }

  /**
   * Search products by term
   */
  static async search(
    searchTerm: string,
    options: ProductListOptions = {}
  ): Promise<{ products: ProductSummary[]; total: number }> {
    const filters: ProductSearchFilters = { searchTerm };
    const result = await this.find(filters, { ...options, includeSummaryOnly: true });
    
    return {
      products: result.products as ProductSummary[],
      total: result.total
    };
  }

  /**
   * Get products that need reordering
   */
  static async findProductsNeedingReorder(): Promise<Product[]> {
    const query = `
      SELECT * FROM products 
      WHERE 
        deleted_at IS NULL AND
        inventory_management = 'tracked' AND
        reorder_point IS NOT NULL AND
        available_stock <= reorder_point AND
        status = 'active'
      ORDER BY available_stock ASC`;

    const result = await DatabaseService.query<Product>(query);
    return result.rows;
  }

  /**
   * Get low stock products
   */
  static async findLowStockProducts(): Promise<Product[]> {
    const query = `
      SELECT * FROM products 
      WHERE 
        deleted_at IS NULL AND
        inventory_management = 'tracked' AND
        available_stock <= low_stock_threshold AND
        available_stock > out_of_stock_threshold AND
        status = 'active'
      ORDER BY available_stock ASC`;

    const result = await DatabaseService.query<Product>(query);
    return result.rows;
  }

  /**
   * Get out of stock products
   */
  static async findOutOfStockProducts(): Promise<Product[]> {
    const query = `
      SELECT * FROM products 
      WHERE 
        deleted_at IS NULL AND
        inventory_management = 'tracked' AND
        available_stock <= out_of_stock_threshold AND
        status = 'active'
      ORDER BY name ASC`;

    const result = await DatabaseService.query<Product>(query);
    return result.rows;
  }

  /**
   * Update product sales statistics
   */
  static async updateSalesStats(
    productId: string,
    quantitySold: number,
    saleAmount: number
  ): Promise<Product | null> {
    return DatabaseService.transaction(async (tx: TransactionClient) => {
      const query = `
        UPDATE products 
        SET 
          total_sales = total_sales + $2,
          total_revenue_cents = total_revenue_cents + $3,
          updated_at = NOW(),
          version = version + 1
        WHERE id = $1 AND deleted_at IS NULL
        RETURNING *`;

      const result = await tx.query<Product>(query, [productId, quantitySold, saleAmount]);
      return result.rows[0] || null;
    });
  }

  /**
   * Soft delete product
   */
  static async delete(id: string, deletedBy?: string): Promise<boolean> {
    const query = `
      UPDATE products 
      SET deleted_at = NOW(), deleted_by = $2, updated_at = NOW()
      WHERE id = $1 AND deleted_at IS NULL`;
    
    const result = await DatabaseService.query(query, [id, deletedBy]);
    return result.rowCount! > 0;
  }

  /**
   * Get product statistics
   */
  static async getStats(): Promise<{
    totalProducts: number;
    activeProducts: number;
    outOfStockProducts: number;
    lowStockProducts: number;
    needReorderProducts: number;
    totalInventoryValue: number;
  }> {
    const query = `
      SELECT 
        COUNT(*) as total_products,
        COUNT(CASE WHEN status = 'active' THEN 1 END) as active_products,
        COUNT(CASE WHEN inventory_management = 'tracked' AND available_stock <= out_of_stock_threshold THEN 1 END) as out_of_stock_products,
        COUNT(CASE WHEN inventory_management = 'tracked' AND available_stock <= low_stock_threshold AND available_stock > out_of_stock_threshold THEN 1 END) as low_stock_products,
        COUNT(CASE WHEN inventory_management = 'tracked' AND reorder_point IS NOT NULL AND available_stock <= reorder_point THEN 1 END) as need_reorder_products,
        COALESCE(SUM(CASE WHEN cost_cents IS NOT NULL THEN current_stock * cost_cents ELSE 0 END), 0) as total_inventory_value
      FROM products 
      WHERE deleted_at IS NULL`;

    const result = await DatabaseService.query(query);
    const stats = result.rows[0];

    return {
      totalProducts: parseInt(stats.total_products),
      activeProducts: parseInt(stats.active_products),
      outOfStockProducts: parseInt(stats.out_of_stock_products),
      lowStockProducts: parseInt(stats.low_stock_products),
      needReorderProducts: parseInt(stats.need_reorder_products),
      totalInventoryValue: parseFloat(stats.total_inventory_value)
    };
  }

  // Private helper methods

  /**
   * Apply search filters to query builder
   */
  private static applyFilters(queryBuilder: QueryBuilder, filters: ProductSearchFilters): void {
    const {
      sku,
      name,
      type,
      status,
      categoryId,
      brand,
      manufacturer,
      searchTerm,
      priceRange,
      inventoryManagement,
      inStock,
      lowStock,
      isDigital,
      isHazardous
    } = filters;

    if (sku) {
      queryBuilder.where('sku = ?', [sku]);
    }

    if (name) {
      queryBuilder.where('name ILIKE ?', [`%${name}%`]);
    }

    if (type && type.length > 0) {
      const placeholders = type.map(() => '?').join(',');
      queryBuilder.where(`type IN (${placeholders})`, type);
    }

    if (status && status.length > 0) {
      const placeholders = status.map(() => '?').join(',');
      queryBuilder.where(`status IN (${placeholders})`, status);
    }

    if (categoryId) {
      queryBuilder.where('category_id = ?', [categoryId]);
    }

    if (brand) {
      queryBuilder.where('brand ILIKE ?', [`%${brand}%`]);
    }

    if (manufacturer) {
      queryBuilder.where('manufacturer ILIKE ?', [`%${manufacturer}%`]);
    }

    if (inventoryManagement && inventoryManagement.length > 0) {
      const placeholders = inventoryManagement.map(() => '?').join(',');
      queryBuilder.where(`inventory_management IN (${placeholders})`, inventoryManagement);
    }

    if (searchTerm) {
      queryBuilder.where(`(
        name ILIKE ? OR 
        description ILIKE ? OR 
        short_description ILIKE ? OR
        sku ILIKE ? OR 
        brand ILIKE ? OR
        manufacturer ILIKE ?
      )`, Array(6).fill(`%${searchTerm}%`));
    }

    if (priceRange) {
      queryBuilder
        .where('retail_price_cents >= ?', [priceRange.min])
        .where('retail_price_cents <= ?', [priceRange.max]);
    }

    if (inStock !== undefined) {
      if (inStock) {
        queryBuilder.where('(inventory_management != \'tracked\' OR available_stock > 0)');
      } else {
        queryBuilder.where('inventory_management = \'tracked\' AND available_stock <= 0');
      }
    }

    if (lowStock === true) {
      queryBuilder.where('inventory_management = \'tracked\' AND available_stock <= low_stock_threshold');
    }

    if (isDigital !== undefined) {
      queryBuilder.where('is_digital = ?', [isDigital]);
    }

    if (isHazardous !== undefined) {
      queryBuilder.where('is_hazardous = ?', [isHazardous]);
    }
  }
}