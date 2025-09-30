import type { PoolClient } from 'pg';
import { BaseRepositoryImpl, NotFoundError, ConflictError } from './base.js';
import type {
  Product,
  CreateProductData,
  UpdateProductData,
  ProductRepository as IProductRepository,
  Category,
  CreateCategoryData,
  UpdateCategoryData,
  InventoryMovement,
  ProductStats,
  PaginationOptions,
  PaginatedResult,
  SearchOptions,
  CategoryRow
} from './interfaces.js';
import { InventoryMovementType } from './interfaces.js';
import { DatabaseService } from '../services/database.js';

/**
 * Product Repository Implementation
 * 
 * Handles all database operations for products, categories, and inventory management.
 * Provides CRUD operations, search functionality, and inventory tracking.
 */
export class ProductRepository extends BaseRepositoryImpl<Product, CreateProductData, UpdateProductData> implements IProductRepository {
  constructor(db: DatabaseService) {
    super(db, 'products');
  }

  /**
   * Map database row to Product entity
   */
  protected mapRowToEntity(row: any): Product {
    return {
      id: row.id,
      sku: row.sku,
      name: row.name,
      description: row.description || undefined,
      categoryId: row.category_id,
      price: parseFloat(row.price),
      costPrice: parseFloat(row.cost_price),
      stock: parseInt(row.stock),
      minStock: parseInt(row.min_stock),
      maxStock: parseInt(row.max_stock),
      images: row.images || [],
      tags: row.tags || [],
      isActive: row.is_active,
      isFeatured: row.is_featured,
      metadata: row.metadata || {},
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      deletedAt: row.deleted_at ? new Date(row.deleted_at) : undefined,
      ...(row.weight && { weight: parseFloat(row.weight) }),
      ...(row.dimensions && { dimensions: row.dimensions })
    };
  }

  /**
   * Map create data to database columns
   */
  protected mapCreateDataToColumns(data: CreateProductData): Record<string, any> {
    return {
      id: `prod_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      sku: data.sku,
      name: data.name,
      description: data.description,
      category_id: data.categoryId,
      price: data.price,
      cost_price: data.costPrice,
      stock: data.stock,
      min_stock: data.minStock || 0,
      max_stock: data.maxStock || 1000,
      weight: data.weight,
      dimensions: data.dimensions,
      images: data.images || [],
      tags: data.tags || [],
      is_active: data.isActive ?? true,
      is_featured: data.isFeatured ?? false,
      metadata: data.metadata || {}
    };
  }

  /**
   * Map update data to database columns
   */
  protected mapUpdateDataToColumns(data: UpdateProductData): Record<string, any> {
    const columns: Record<string, any> = {};
    
    if (data.sku !== undefined) columns.sku = data.sku;
    if (data.name !== undefined) columns.name = data.name;
    if (data.description !== undefined) columns.description = data.description;
    if (data.categoryId !== undefined) columns.category_id = data.categoryId;
    if (data.price !== undefined) columns.price = data.price;
    if (data.costPrice !== undefined) columns.cost_price = data.costPrice;
    if (data.stock !== undefined) columns.stock = data.stock;
    if (data.minStock !== undefined) columns.min_stock = data.minStock;
    if (data.maxStock !== undefined) columns.max_stock = data.maxStock;
    if (data.weight !== undefined) columns.weight = data.weight;
    if (data.dimensions !== undefined) columns.dimensions = data.dimensions;
    if (data.images !== undefined) columns.images = data.images;
    if (data.tags !== undefined) columns.tags = data.tags;
    if (data.isActive !== undefined) columns.is_active = data.isActive;
    if (data.isFeatured !== undefined) columns.is_featured = data.isFeatured;
    if (data.metadata !== undefined) columns.metadata = data.metadata;
    
    return columns;
  }

  /**
   * Find product by SKU
   */
  async findBySku(sku: string): Promise<Product | null> {
    const query = `
      SELECT * FROM ${this.tableName} 
      WHERE sku = $1 AND deleted_at IS NULL
    `;
    const result = await this.db.query(query, [sku]);
    
    return result.rows.length > 0 ? this.mapRowToEntity(result.rows[0]) : null;
  }

  /**
   * Find products by category
   */
  async findByCategory(categoryId: string, options?: PaginationOptions): Promise<PaginatedResult<Product>> {
    const baseQuery = `SELECT * FROM ${this.tableName}`;
    const whereClause = 'category_id = $1 AND deleted_at IS NULL';
    const params = [categoryId];

    return this.executePaginatedQuery(
      baseQuery,
      options,
      whereClause,
      params,
      (row) => this.mapRowToEntity(row)
    );
  }

  /**
   * Search products with filtering and full-text search
   */
  async search(options: SearchOptions): Promise<PaginatedResult<Product>> {
    const { query: searchQuery, filters = {} } = options;
    
    let baseQuery = `SELECT * FROM ${this.tableName}`;
    let whereConditions: string[] = ['deleted_at IS NULL'];
    let params: any[] = [];
    
    // Add search query with full-text search
    if (searchQuery && searchQuery.trim()) {
      const searchCondition = `(
        name ILIKE $${params.length + 1} OR 
        description ILIKE $${params.length + 1} OR 
        sku ILIKE $${params.length + 1} OR
        $${params.length + 1} = ANY(tags)
      )`;
      whereConditions.push(searchCondition);
      params.push(`%${searchQuery.trim()}%`);
    }
    
    // Add filters
    Object.keys(filters).forEach(key => {
      if (filters[key] !== undefined && filters[key] !== null) {
        const dbColumn = this.mapFilterKeyToColumn(key);
        
        if (key === 'priceRange' && Array.isArray(filters[key]) && filters[key].length === 2) {
          whereConditions.push(`price BETWEEN $${params.length + 1} AND $${params.length + 2}`);
          params.push(filters[key][0], filters[key][1]);
        } else if (key === 'inStock' && filters[key] === true) {
          whereConditions.push('stock > 0');
        } else if (key === 'isActive' || key === 'isFeatured') {
          whereConditions.push(`${dbColumn} = $${params.length + 1}`);
          params.push(filters[key]);
        } else {
          whereConditions.push(`${dbColumn} = $${params.length + 1}`);
          params.push(filters[key]);
        }
      }
    });
    
  const whereClause = whereConditions.join(' AND ');
    
    // Ensure stable ordering for tests
    return this.executePaginatedQuery(
      baseQuery + ' ORDER BY name ASC',
      options,
      whereClause,
      params,
      (row) => this.mapRowToEntity(row)
    );
  }

  /**
   * Find featured products
   */
  async findFeatured(limit: number): Promise<Product[]> {
    const query = `
      SELECT * FROM ${this.tableName} 
      WHERE is_featured = true AND is_active = true AND deleted_at IS NULL
      ORDER BY created_at DESC
      LIMIT $1
    `;
    const result = await this.db.query(query, [limit]);
    
    return result.rows.map(row => this.mapRowToEntity(row));
  }

  /**
   * Update product stock with inventory tracking
   */
  async updateStock(productId: string, quantity: number, reason: string): Promise<Product | null> {
    return this.withTransaction(async (client: PoolClient) => {
      // Get current product
      const product = await client.query(
        'SELECT * FROM products WHERE id = $1 AND deleted_at IS NULL',
        [productId]
      );
      
      if (product.rows.length === 0) {
        throw new NotFoundError('Product', productId);
      }
      
      const currentStock = parseInt(product.rows[0].stock);
      const newStock = currentStock + quantity;
      
      // Check for negative stock
      if (newStock < 0) {
        throw new ConflictError(`Insufficient stock. Current: ${currentStock}, Requested: ${Math.abs(quantity)}`);
      }
      
      // Update product stock
      const updateResult = await client.query(
        'UPDATE products SET stock = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *',
        [newStock, productId]
      );
      
      // Record inventory movement
      const movementType = quantity > 0 ? InventoryMovementType.IN : InventoryMovementType.OUT;
      await client.query(`
        INSERT INTO inventory_movements (id, product_id, type, quantity, reason, created_at)
        VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
      `, [
        `inv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        productId,
        movementType,
        Math.abs(quantity),
        reason
      ]);
      
      return this.mapRowToEntity(updateResult.rows[0]);
    });
  }

  /**
   * Check current stock level
   */
  async checkStock(productId: string): Promise<number> {
    const query = 'SELECT stock FROM products WHERE id = $1 AND deleted_at IS NULL';
    const result = await this.db.query(query, [productId]);
    
    if (result.rows.length === 0) {
      throw new NotFoundError('Product', productId);
    }
    
    return parseInt(result.rows[0].stock);
  }

  /**
   * Get products with low stock
   */
  async getLowStockProducts(threshold?: number): Promise<Product[]> {
    const query = `
      SELECT * FROM ${this.tableName} 
      WHERE stock <= COALESCE($1, min_stock) 
      AND is_active = true 
      AND deleted_at IS NULL
      ORDER BY stock ASC, name ASC
      LIMIT COALESCE($2, 100)
    `;
    const result = await this.db.query(query, [threshold ?? null, 100]);
    
    return result.rows.map(row => this.mapRowToEntity(row));
  }

  /**
   * Get inventory movement history for a product
   */
  async getInventoryHistory(productId: string, options?: PaginationOptions): Promise<PaginatedResult<InventoryMovement>> {
    const baseQuery = 'SELECT * FROM inventory_movements';
    const whereClause = 'product_id = $1';
    const params = [productId];

    return this.executePaginatedQuery(
      baseQuery,
      options,
      whereClause,
      params,
      (row) => this.mapRowToInventoryMovement(row)
    );
  }

  // --- Legacy/Test adapter methods expected by unit tests ---

  /** Adjust stock by a delta and record an inventory movement. */
  async adjustStock(productId: string, adjustment: number, reason: string): Promise<Product> {
    return this.withTransaction(async (client: PoolClient) => {
      const product = await client.query('SELECT * FROM products WHERE id = $1 AND deleted_at IS NULL', [productId]);
      if (product.rows.length === 0) throw new NotFoundError('Product', productId);
      const currentStock = parseInt(product.rows[0].stock);
      const newStock = currentStock + adjustment;
      if (newStock < 0) throw new ConflictError(`Insufficient stock. Current: ${currentStock}, Requested: ${Math.abs(adjustment)}`);
      const update = await client.query('UPDATE products SET stock = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *', [newStock, productId]);
      await client.query(
        'INSERT INTO inventory_movements (id, product_id, type, quantity, reason, created_at) VALUES ($1,$2,$3,$4,$5,CURRENT_TIMESTAMP)',
        [
          `inv_${Date.now()}_${Math.random().toString(36).substr(2,9)}`,
          productId,
          adjustment >= 0 ? InventoryMovementType.ADJUSTMENT : InventoryMovementType.ADJUSTMENT,
          Math.abs(adjustment),
          reason
        ]
      );
      return this.mapRowToEntity(update.rows[0]);
    });
  }

  /** Reserve stock for a reference (e.g., order). */
  async reserveStock(productId: string, quantity: number, referenceType: string, referenceId: string): Promise<boolean> {
    return this.withTransaction(async (client: PoolClient) => {
      const product = await client.query('SELECT * FROM products WHERE id = $1 AND deleted_at IS NULL', [productId]);
      if (!product.rows.length) throw new NotFoundError('Product', productId);
      const current = parseInt(product.rows[0].stock);
      if (current < quantity) throw new ConflictError('Insufficient stock');
      const update = await client.query('UPDATE products SET stock = stock - $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *', [quantity, productId]);
      await client.query(
        'INSERT INTO inventory_movements (id, product_id, type, quantity, reference_type, reference_id, created_at) VALUES ($1,$2,$3,$4,$5,$6,CURRENT_TIMESTAMP)',
        [
          `inv_${Date.now()}_${Math.random().toString(36).substr(2,9)}`,
          productId,
          InventoryMovementType.RESERVATION,
          -quantity,
          referenceType,
          referenceId
        ]
      );
      return (update.rowCount ?? 0) > 0;
    });
  }

  /** Release reserved stock back to available. */
  async releaseStock(productId: string, quantity: number, referenceType: string, referenceId: string): Promise<boolean> {
    return this.withTransaction(async (client: PoolClient) => {
      const update = await client.query('UPDATE products SET stock = stock + $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *', [quantity, productId]);
      await client.query(
        'INSERT INTO inventory_movements (id, product_id, type, quantity, reference_type, reference_id, created_at) VALUES ($1,$2,$3,$4,$5,$6,CURRENT_TIMESTAMP)',
        [
          `inv_${Date.now()}_${Math.random().toString(36).substr(2,9)}`,
          productId,
          InventoryMovementType.RELEASE,
          quantity,
          referenceType,
          referenceId
        ]
      );
      return (update.rowCount ?? 0) > 0;
    });
  }

  /** Get raw inventory movements as simple array (non-paginated) for tests. */
  async getInventoryMovements(productId: string): Promise<InventoryMovement[]> {
    const result = await this.db.query('SELECT * FROM inventory_movements WHERE product_id = $1 ORDER BY created_at DESC', [productId]);
    return result.rows.map(row => this.mapRowToInventoryMovement(row));
  }

  /** Find all active categories (legacy name used in tests). */
  async findCategories(): Promise<Category[]> {
    const result = await this.db.query('SELECT * FROM categories WHERE deleted_at IS NULL ORDER BY name ASC');

    const rows: CategoryRow[] = result.rows;
    return rows.map((row: CategoryRow) => this.mapRowToCategory(row));
  }

  /**
   * Get all categories
   */
  async getCategories(): Promise<Category[]> {
    const query = `
      SELECT * FROM categories 
      WHERE is_active = true 
      ORDER BY name ASC
    `;
    const result = await this.db.query(query);


    const rows: CategoryRow[] = result.rows;
    return rows.map((row: CategoryRow) => this.mapRowToCategory(row));
  }

  /**
   * Create new category
   */
  async createCategory(category: CreateCategoryData): Promise<Category> {
    // Check for duplicate slug
    const existingCategory = await this.db.query(
      'SELECT id FROM categories WHERE slug = $1',
      [category.slug]
    );
    
    if (existingCategory.rows.length > 0) {
      throw new ConflictError(`Category with slug ${category.slug} already exists`);
    }

    const categoryData = {
      id: `cat_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name: category.name,
      description: category.description,
      parent_id: category.parentId,
      slug: category.slug,
      is_active: category.isActive ?? true
    };

    const { query, params } = this.buildInsertQuery(categoryData);
    const result = await this.db.query(query.replace(this.tableName, 'categories'), params);
    
    return this.mapRowToCategory(result.rows[0]);
  }

  /**
   * Update category
   */
  async updateCategory(categoryId: string, category: UpdateCategoryData): Promise<Category | null> {
    const columns: Record<string, any> = {};
    
    if (category.name !== undefined) columns.name = category.name;
    if (category.description !== undefined) columns.description = category.description;
    if (category.parentId !== undefined) columns.parent_id = category.parentId;
    if (category.slug !== undefined) columns.slug = category.slug;
    if (category.isActive !== undefined) columns.is_active = category.isActive;
    
    if (Object.keys(columns).length === 0) {
      const result = await this.db.query('SELECT * FROM categories WHERE id = $1', [categoryId]);
      return result.rows.length > 0 ? this.mapRowToCategory(result.rows[0]) : null;
    }

    // Check for slug conflict if updating slug
    if (category.slug) {
      const existingCategory = await this.db.query(
        'SELECT id FROM categories WHERE slug = $1 AND id != $2',
        [category.slug, categoryId]
      );
      
      if (existingCategory.rows.length > 0) {
        throw new ConflictError(`Category with slug ${category.slug} already exists`);
      }
    }

    const { query, params } = this.buildUpdateQuery(categoryId, columns);
    const result = await this.db.query(query.replace(this.tableName, 'categories'), params);
    
    return result.rows.length > 0 ? this.mapRowToCategory(result.rows[0]) : null;
  }

  /**
   * Delete category
   */
  async deleteCategory(categoryId: string): Promise<boolean> {
    return this.withTransaction(async (client: PoolClient) => {
      // Check if category has products
      const productsInCategory = await client.query(
        'SELECT COUNT(*) FROM products WHERE category_id = $1 AND deleted_at IS NULL',
        [categoryId]
      );
      
      if (parseInt(productsInCategory.rows[0].count) > 0) {
        throw new ConflictError('Cannot delete category with existing products');
      }
      
      // Check if category has subcategories
      const subcategories = await client.query(
        'SELECT COUNT(*) FROM categories WHERE parent_id = $1 AND is_active = true',
        [categoryId]
      );
      
      if (parseInt(subcategories.rows[0].count) > 0) {
        throw new ConflictError('Cannot delete category with subcategories');
      }
      
      const result = await client.query('DELETE FROM categories WHERE id = $1', [categoryId]);
      return (result.rowCount ?? 0) > 0;
    });
  }

  /**
   * Get popular products by sales volume
   */
  async getPopularProducts(limit: number): Promise<Product[]> {
    const query = `
      SELECT p.*, COALESCE(SUM(oi.quantity), 0) as total_sold
      FROM products p
      LEFT JOIN order_items oi ON p.id = oi.product_id
      LEFT JOIN orders o ON oi.order_id = o.id AND o.status NOT IN ('cancelled')
      WHERE p.is_active = true AND p.deleted_at IS NULL
      GROUP BY p.id
      ORDER BY total_sold DESC, p.name ASC
      LIMIT $1
    `;
    const result = await this.db.query(query, [limit]);
    
    interface PopularProductRow {
      id: string;
      sku: string;
      name: string;
      description?: string;
      category_id: string;
      price: string | number;
      cost_price: string | number;
      stock: string | number;
      min_stock: string | number;
      max_stock: string | number;
      images?: any[];
      tags?: string[];
      is_active: boolean;
      is_featured: boolean;
      metadata?: Record<string, any>;
      created_at: string | Date;
      updated_at: string | Date;
      deleted_at?: string | Date | null;
      weight?: string | number;
      dimensions?: any;
      total_sold: string | number;
    }

    const rows: PopularProductRow[] = result.rows;
    return rows.map((row: PopularProductRow) => this.mapRowToEntity(row));
  }

  /**
   * Get product statistics
   */
  async getProductStats(productId: string): Promise<ProductStats> {
    const query = `
      SELECT 
        COALESCE(SUM(oi.quantity), 0) as total_sold,
        COALESCE(SUM(oi.total_price), 0) as total_revenue
      FROM order_items oi
      JOIN orders o ON oi.order_id = o.id
      WHERE oi.product_id = $1 AND o.status NOT IN ('cancelled')
    `;
    
    const result = await this.db.query(query, [productId]);
    const row = result.rows[0] || { total_sold: '0', total_revenue: '0', avg_rating: '0', review_count: '0' };
    return {
      totalSold: parseInt(row.total_sold),
      totalRevenue: parseFloat(row.total_revenue),
      averageRating: row.avg_rating !== undefined && row.avg_rating !== null ? parseFloat(row.avg_rating) : 0,
      reviewCount: row.review_count !== undefined && row.review_count !== null ? parseInt(row.review_count) : 0
    };
  }

  /**
   * Override create to check for duplicate SKU
   */
  async create(data: CreateProductData): Promise<Product> {
    // Check for existing SKU
    const existingProduct = await this.findBySku(data.sku);
    if (existingProduct) {
      throw new ConflictError(`Product with SKU ${data.sku} already exists`);
    }

    return super.create(data);
  }

  /**
   * Map filter keys to database columns
   */
  private mapFilterKeyToColumn(key: string): string {
    const mapping: Record<string, string> = {
      categoryId: 'category_id',
      costPrice: 'cost_price',
      minStock: 'min_stock',
      maxStock: 'max_stock',
      isActive: 'is_active',
      isFeatured: 'is_featured'
    };
    return mapping[key] || key;
  }

  /**
   * Map database row to Category entity
   */
  private mapRowToCategory(row: any): Category {
    return {
      id: row.id,
      name: row.name,
      description: row.description || undefined,
      parentId: row.parent_id || undefined,
      slug: row.slug,
      isActive: row.is_active,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at)
    };
  }

  /**
   * Map database row to InventoryMovement entity
   */
  private mapRowToInventoryMovement(row: any): InventoryMovement {
    return {
      id: row.id,
      productId: row.product_id,
      type: row.type,
      quantity: parseInt(row.quantity),
      reason: row.reason,
      reference: row.reference || undefined,
      createdAt: new Date(row.created_at)
    };
  }
}