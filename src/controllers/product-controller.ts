import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import type { RepositoryFactory } from '../repositories';
import { RepositoryService } from '../repositories';

/**
 * Product Controller - HTTP Request/Response Layer
 * 
 * Handles all HTTP requests for product management:
 * - POST /products - Create new product
 * - GET /products/:id - Get product by ID
 * - PUT /products/:id - Update product
 * - DELETE /products/:id - Delete product
 * - GET /products - List/search products with filtering
 * - GET /products/sku/:sku - Get product by SKU
 * - GET /products/category/:categoryId - Get products by category
 * - PUT /products/:id/stock - Update product stock
 * - GET /products/:id/inventory - Get inventory history
 * - GET /products/low-stock - Get low stock products
 * - POST /categories - Create category
 * - GET /categories - List categories
 * - PUT /categories/:id - Update category
 * - DELETE /categories/:id - Delete category
 */

// Validation schemas for product operations
const CreateProductRequestSchema = z.object({
  sku: z.string().min(1, 'SKU is required').max(50, 'SKU too long').regex(/^[A-Z0-9_-]+$/, 'SKU must contain only uppercase letters, numbers, hyphens and underscores'),
  name: z.string().min(1, 'Product name is required').max(255, 'Product name too long'),
  description: z.string().max(2000, 'Description too long').optional(),
  categoryId: z.string().uuid('Category ID must be a valid UUID'),
  price: z.number().min(0, 'Price must be non-negative').max(999999.99, 'Price too high'),
  costPrice: z.number().min(0, 'Cost price must be non-negative').max(999999.99, 'Cost price too high').optional(),
  stock: z.number().int().min(0, 'Stock must be non-negative').default(0),
  lowStockThreshold: z.number().int().min(0, 'Low stock threshold must be non-negative').default(10),
  weight: z.number().min(0, 'Weight must be non-negative').optional(),
  dimensions: z.object({
    length: z.number().min(0),
    width: z.number().min(0),
    height: z.number().min(0)
  }).optional(),
  isActive: z.boolean().default(true),
  isFeatured: z.boolean().default(false),
  tags: z.array(z.string().max(50)).max(20, 'Too many tags').optional(),
  metadata: z.record(z.any()).optional()
});

const UpdateProductRequestSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(2000).nullable().optional(),
  categoryId: z.string().uuid().optional(),
  price: z.number().min(0).max(999999.99).optional(),
  costPrice: z.number().min(0).max(999999.99).nullable().optional(),
  lowStockThreshold: z.number().int().min(0).optional(),
  weight: z.number().min(0).nullable().optional(),
  dimensions: z.object({
    length: z.number().min(0),
    width: z.number().min(0),
    height: z.number().min(0)
  }).nullable().optional(),
  isActive: z.boolean().optional(),
  isFeatured: z.boolean().optional(),
  tags: z.array(z.string().max(50)).max(20).nullable().optional(),
  metadata: z.record(z.any()).optional()
});

const ProductSearchQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  search: z.string().min(1).optional(),
  categoryId: z.string().uuid().optional(),
  minPrice: z.coerce.number().min(0).optional(),
  maxPrice: z.coerce.number().min(0).optional(),
  inStock: z.coerce.boolean().optional(),
  featured: z.coerce.boolean().optional(),
  active: z.coerce.boolean().optional(),
  sortBy: z.enum(['name', 'price', 'createdAt', 'stock']).optional(),
  sortOrder: z.enum(['asc', 'desc']).optional()
});

const UpdateStockRequestSchema = z.object({
  quantity: z.number().int('Quantity must be an integer'),
  reason: z.string().min(1, 'Reason is required').max(255, 'Reason too long'),
  type: z.enum(['adjustment', 'sale', 'return', 'damaged', 'restock']).default('adjustment')
});

const CreateCategoryRequestSchema = z.object({
  name: z.string().min(1, 'Category name is required').max(100, 'Category name too long'),
  description: z.string().max(500, 'Description too long').optional(),
  parentId: z.string().uuid('Parent ID must be a valid UUID').nullable().optional(),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().min(0).default(0),
  metadata: z.record(z.any()).optional()
});

const UpdateCategoryRequestSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).nullable().optional(),
  parentId: z.string().uuid().nullable().optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().min(0).optional(),
  metadata: z.record(z.any()).optional()
});

/**
 * Format validation error for API response
 */
function formatValidationError(error: z.ZodError): any {
  return error.errors.map(err => ({
    field: err.path.join('.'),
    message: err.message,
    code: err.code
  }));
}

/**
 * ProductController - Repository-powered product management
 */
export class ProductController {
  private repositoryFactory: RepositoryFactory;
  private repositoryService: RepositoryService;

  constructor(repositoryFactory: RepositoryFactory) {
    this.repositoryFactory = repositoryFactory;
    this.repositoryService = new RepositoryService(repositoryFactory);
  }

  /**
   * Create new product
   * POST /products
   */
  async createProduct(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      // Validate request body
      const validation = CreateProductRequestSchema.safeParse(req.body);
      if (!validation.success) {
        res.status(400).json({
          success: false,
          error: 'VALIDATION_ERROR',
          message: 'Invalid request data',
          details: formatValidationError(validation.error)
        });
        return;
      }

      const productData = validation.data;
      const productRepo = this.repositoryFactory.getProductRepository();

      // Check if SKU already exists
      const existingProduct = await productRepo.findBySku(productData.sku);
      if (existingProduct) {
        res.status(409).json({
          success: false,
          error: 'SKU_ALREADY_EXISTS',
          message: `Product with SKU ${productData.sku} already exists`
        });
        return;
      }

      // Verify category exists
      const categories = await productRepo.getCategories();
      const categoryExists = categories.some(cat => cat.id === productData.categoryId);
      if (!categoryExists) {
        res.status(400).json({
          success: false,
          error: 'CATEGORY_NOT_FOUND',
          message: `Category with ID ${productData.categoryId} not found`
        });
        return;
      }

      // Create product
      const createData: any = {
        sku: productData.sku,
        name: productData.name,
        categoryId: productData.categoryId,
        price: productData.price,
        stock: productData.stock,
        lowStockThreshold: productData.lowStockThreshold,
        isActive: productData.isActive,
        isFeatured: productData.isFeatured,
        metadata: productData.metadata || {}
      };

      // Add optional fields only if provided
      if (productData.description) createData.description = productData.description;
      if (productData.costPrice !== undefined) createData.costPrice = productData.costPrice;
      if (productData.weight !== undefined) createData.weight = productData.weight;
      if (productData.dimensions) createData.dimensions = productData.dimensions;
      if (productData.tags) createData.tags = productData.tags;

      const product = await productRepo.create(createData);

      res.status(201).json({
        success: true,
        data: product,
        message: 'Product created successfully'
      });

    } catch (error: any) {
      if (error.message?.includes('duplicate key value')) {
        res.status(409).json({
          success: false,
          error: 'DUPLICATE_PRODUCT',
          message: 'Product with this SKU already exists'
        });
        return;
      }

      next(error);
    }
  }

  /**
   * Get product by ID
   * GET /products/:id
   */
  async getProductById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const productId = req.params.id;
      
      // Validate parameter exists and is string
      if (!productId || typeof productId !== 'string') {
        res.status(400).json({
          success: false,
          error: 'INVALID_PRODUCT_ID',
          message: 'Product ID parameter is required'
        });
        return;
      }
      
      // Validate UUID format
      if (!z.string().uuid().safeParse(productId).success) {
        res.status(400).json({
          success: false,
          error: 'INVALID_PRODUCT_ID',
          message: 'Product ID must be a valid UUID'
        });
        return;
      }

      const productRepo = this.repositoryFactory.getProductRepository();
      const product = await productRepo.findById(productId);

      if (!product) {
        res.status(404).json({
          success: false,
          error: 'PRODUCT_NOT_FOUND',
          message: `Product with ID ${productId} not found`
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: product
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * Get product by SKU
   * GET /products/sku/:sku
   */
  async getProductBySku(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const sku = req.params.sku;
      
      // Validate parameter exists and is string
      if (!sku || typeof sku !== 'string') {
        res.status(400).json({
          success: false,
          error: 'INVALID_SKU',
          message: 'SKU parameter is required'
        });
        return;
      }

      const productRepo = this.repositoryFactory.getProductRepository();
      const product = await productRepo.findBySku(sku);

      if (!product) {
        res.status(404).json({
          success: false,
          error: 'PRODUCT_NOT_FOUND',
          message: `Product with SKU ${sku} not found`
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: product
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * Update product
   * PUT /products/:id
   */
  async updateProduct(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const productId = req.params.id;
      
      // Validate parameter exists and is string
      if (!productId || typeof productId !== 'string') {
        res.status(400).json({
          success: false,
          error: 'INVALID_PRODUCT_ID',
          message: 'Product ID parameter is required'
        });
        return;
      }
      
      // Validate UUID format
      if (!z.string().uuid().safeParse(productId).success) {
        res.status(400).json({
          success: false,
          error: 'INVALID_PRODUCT_ID',
          message: 'Product ID must be a valid UUID'
        });
        return;
      }

      // Validate request body
      const validation = UpdateProductRequestSchema.safeParse(req.body);
      if (!validation.success) {
        res.status(400).json({
          success: false,
          error: 'VALIDATION_ERROR',
          message: 'Invalid request data',
          details: formatValidationError(validation.error)
        });
        return;
      }

      const updateData = validation.data;
      const productRepo = this.repositoryFactory.getProductRepository();

      // Check if product exists
      const existingProduct = await productRepo.findById(productId);
      if (!existingProduct) {
        res.status(404).json({
          success: false,
          error: 'PRODUCT_NOT_FOUND',
          message: `Product with ID ${productId} not found`
        });
        return;
      }

      // Verify category exists if updating
      if (updateData.categoryId) {
        const categories = await productRepo.getCategories();
        const categoryExists = categories.some(cat => cat.id === updateData.categoryId);
        if (!categoryExists) {
          res.status(400).json({
            success: false,
            error: 'CATEGORY_NOT_FOUND',
            message: `Category with ID ${updateData.categoryId} not found`
          });
          return;
        }
      }

      // Prepare update data - only include defined values
      const preparedUpdateData: any = {};
      Object.keys(updateData).forEach(key => {
        const value = (updateData as any)[key];
        if (value !== undefined) {
          preparedUpdateData[key] = value;
        }
      });

      const updatedProduct = await productRepo.update(productId, preparedUpdateData);

      if (!updatedProduct) {
        res.status(404).json({
          success: false,
          error: 'UPDATE_FAILED',
          message: 'Product update failed'
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: updatedProduct,
        message: 'Product updated successfully'
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * Delete product (soft delete)
   * DELETE /products/:id
   */
  async deleteProduct(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const productId = req.params.id;
      
      // Validate parameter exists and is string
      if (!productId || typeof productId !== 'string') {
        res.status(400).json({
          success: false,
          error: 'INVALID_PRODUCT_ID',
          message: 'Product ID parameter is required'
        });
        return;
      }
      
      // Validate UUID format
      if (!z.string().uuid().safeParse(productId).success) {
        res.status(400).json({
          success: false,
          error: 'INVALID_PRODUCT_ID',
          message: 'Product ID must be a valid UUID'
        });
        return;
      }

      const productRepo = this.repositoryFactory.getProductRepository();

      // Check if product exists
      const existingProduct = await productRepo.findById(productId);
      if (!existingProduct) {
        res.status(404).json({
          success: false,
          error: 'PRODUCT_NOT_FOUND',
          message: `Product with ID ${productId} not found`
        });
        return;
      }

      // Get product stats to check if it's safe to delete
      const productStats = await productRepo.getProductStats(productId);
      if (productStats.totalSold > 0) {
        res.status(409).json({
          success: false,
          error: 'CANNOT_DELETE_PRODUCT',
          message: 'Cannot delete product with existing sales. Product will be deactivated instead.',
          details: {
            totalSold: productStats.totalSold,
            totalRevenue: productStats.totalRevenue
          }
        });
        
        // Deactivate instead of delete
        await productRepo.update(productId, { isActive: false });
        
        res.status(200).json({
          success: true,
          message: 'Product deactivated due to existing orders'
        });
        return;
      }

      const deleted = await productRepo.delete(productId);

      if (!deleted) {
        res.status(404).json({
          success: false,
          error: 'DELETE_FAILED',
          message: 'Product deletion failed'
        });
        return;
      }

      res.status(200).json({
        success: true,
        message: 'Product deleted successfully'
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * List/search products with filtering
   * GET /products
   */
  async getProducts(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      // Validate query parameters
      const validation = ProductSearchQuerySchema.safeParse(req.query);
      if (!validation.success) {
        res.status(400).json({
          success: false,
          error: 'VALIDATION_ERROR',
          message: 'Invalid query parameters',
          details: formatValidationError(validation.error)
        });
        return;
      }

      const queryParams = validation.data;
      const productRepo = this.repositoryFactory.getProductRepository();

      // Prepare search options
      const searchOptions: any = {
        page: queryParams.page || 1,
        limit: queryParams.limit || 20,
        sortBy: queryParams.sortBy || 'createdAt',
        sortOrder: queryParams.sortOrder || 'desc'
      };

      // Add search filters
      if (queryParams.search) searchOptions.query = queryParams.search;
      if (queryParams.categoryId) searchOptions.filters = { ...searchOptions.filters, categoryId: queryParams.categoryId };
      if (queryParams.minPrice !== undefined) searchOptions.filters = { ...searchOptions.filters, minPrice: queryParams.minPrice };
      if (queryParams.maxPrice !== undefined) searchOptions.filters = { ...searchOptions.filters, maxPrice: queryParams.maxPrice };
      if (queryParams.inStock !== undefined) searchOptions.filters = { ...searchOptions.filters, inStock: queryParams.inStock };
      if (queryParams.featured !== undefined) searchOptions.filters = { ...searchOptions.filters, featured: queryParams.featured };
      if (queryParams.active !== undefined) searchOptions.filters = { ...searchOptions.filters, active: queryParams.active };

      const result = await productRepo.search(searchOptions);

      res.status(200).json({
        success: true,
        data: result.data,
        pagination: {
          page: result.page,
          limit: result.limit,
          total: result.total,
          totalPages: result.totalPages
        }
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * Get products by category
   * GET /products/category/:categoryId
   */
  async getProductsByCategory(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const categoryId = req.params.categoryId;
      
      // Validate parameter exists and is string
      if (!categoryId || typeof categoryId !== 'string') {
        res.status(400).json({
          success: false,
          error: 'INVALID_CATEGORY_ID',
          message: 'Category ID parameter is required'
        });
        return;
      }
      
      // Validate UUID format
      if (!z.string().uuid().safeParse(categoryId).success) {
        res.status(400).json({
          success: false,
          error: 'INVALID_CATEGORY_ID',
          message: 'Category ID must be a valid UUID'
        });
        return;
      }

      const { page = 1, limit = 20 } = req.query;
      const productRepo = this.repositoryFactory.getProductRepository();

      // Check if category exists
      const categories = await productRepo.getCategories();
      const categoryExists = categories.some(cat => cat.id === categoryId);
      if (!categoryExists) {
        res.status(404).json({
          success: false,
          error: 'CATEGORY_NOT_FOUND',
          message: `Category with ID ${categoryId} not found`
        });
        return;
      }

      const result = await productRepo.findByCategory(categoryId, {
        page: Number(page),
        limit: Number(limit)
      });

      res.status(200).json({
        success: true,
        data: result.data,
        pagination: {
          page: result.page,
          limit: result.limit,
          total: result.total,
          totalPages: result.totalPages
        }
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * Update product stock
   * PUT /products/:id/stock
   */
  async updateProductStock(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const productId = req.params.id;
      
      // Validate parameter exists and is string
      if (!productId || typeof productId !== 'string') {
        res.status(400).json({
          success: false,
          error: 'INVALID_PRODUCT_ID',
          message: 'Product ID parameter is required'
        });
        return;
      }
      
      // Validate UUID format
      if (!z.string().uuid().safeParse(productId).success) {
        res.status(400).json({
          success: false,
          error: 'INVALID_PRODUCT_ID',
          message: 'Product ID must be a valid UUID'
        });
        return;
      }

      // Validate request body
      const validation = UpdateStockRequestSchema.safeParse(req.body);
      if (!validation.success) {
        res.status(400).json({
          success: false,
          error: 'VALIDATION_ERROR',
          message: 'Invalid request data',
          details: formatValidationError(validation.error)
        });
        return;
      }

      const { quantity, reason } = validation.data;
      const productRepo = this.repositoryFactory.getProductRepository();

      // Check if product exists
      const existingProduct = await productRepo.findById(productId);
      if (!existingProduct) {
        res.status(404).json({
          success: false,
          error: 'PRODUCT_NOT_FOUND',
          message: `Product with ID ${productId} not found`
        });
        return;
      }

      // Check if stock update would result in negative stock
      if (existingProduct.stock + quantity < 0) {
        res.status(400).json({
          success: false,
          error: 'INSUFFICIENT_STOCK',
          message: `Cannot reduce stock by ${Math.abs(quantity)}. Current stock: ${existingProduct.stock}`
        });
        return;
      }

      const updatedProduct = await productRepo.updateStock(productId, quantity, reason);

      if (!updatedProduct) {
        res.status(404).json({
          success: false,
          error: 'STOCK_UPDATE_FAILED',
          message: 'Stock update failed'
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: {
          product: updatedProduct,
          stockChange: quantity,
          previousStock: existingProduct.stock,
          newStock: updatedProduct.stock
        },
        message: 'Stock updated successfully'
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * Get product inventory history
   * GET /products/:id/inventory
   */
  async getProductInventoryHistory(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const productId = req.params.id;
      
      // Validate parameter exists and is string
      if (!productId || typeof productId !== 'string') {
        res.status(400).json({
          success: false,
          error: 'INVALID_PRODUCT_ID',
          message: 'Product ID parameter is required'
        });
        return;
      }
      
      // Validate UUID format
      if (!z.string().uuid().safeParse(productId).success) {
        res.status(400).json({
          success: false,
          error: 'INVALID_PRODUCT_ID',
          message: 'Product ID must be a valid UUID'
        });
        return;
      }

      const { page = 1, limit = 20 } = req.query;
      const productRepo = this.repositoryFactory.getProductRepository();

      // Check if product exists
      const product = await productRepo.findById(productId);
      if (!product) {
        res.status(404).json({
          success: false,
          error: 'PRODUCT_NOT_FOUND',
          message: `Product with ID ${productId} not found`
        });
        return;
      }

      const inventoryHistory = await productRepo.getInventoryHistory(productId, {
        page: Number(page),
        limit: Number(limit)
      });

      res.status(200).json({
        success: true,
        data: {
          product: {
            id: product.id,
            sku: product.sku,
            name: product.name,
            currentStock: product.stock
          },
          history: inventoryHistory.data
        },
        pagination: {
          page: inventoryHistory.page,
          limit: inventoryHistory.limit,
          total: inventoryHistory.total,
          totalPages: inventoryHistory.totalPages
        }
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * Get low stock products
   * GET /products/low-stock
   */
  async getLowStockProducts(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { threshold } = req.query;
      const productRepo = this.repositoryFactory.getProductRepository();

      const lowStockProducts = await productRepo.getLowStockProducts(
        threshold ? Number(threshold) : undefined
      );

      res.status(200).json({
        success: true,
        data: lowStockProducts,
        count: lowStockProducts.length,
        message: lowStockProducts.length === 0 ? 'No low stock products found' : undefined
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * Get featured products
   * GET /products/featured
   */
  async getFeaturedProducts(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { limit = 10 } = req.query;
      const productRepo = this.repositoryFactory.getProductRepository();

      const featuredProducts = await productRepo.findFeatured(Number(limit));

      res.status(200).json({
        success: true,
        data: featuredProducts,
        count: featuredProducts.length
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * Get popular products
   * GET /products/popular
   */
  async getPopularProducts(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { limit = 10 } = req.query;
      const productRepo = this.repositoryFactory.getProductRepository();

      const popularProducts = await productRepo.getPopularProducts(Number(limit));

      res.status(200).json({
        success: true,
        data: popularProducts,
        count: popularProducts.length
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * Create category
   * POST /categories
   */
  async createCategory(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      // Validate request body
      const validation = CreateCategoryRequestSchema.safeParse(req.body);
      if (!validation.success) {
        res.status(400).json({
          success: false,
          error: 'VALIDATION_ERROR',
          message: 'Invalid request data',
          details: formatValidationError(validation.error)
        });
        return;
      }

      const categoryData = validation.data;
      const productRepo = this.repositoryFactory.getProductRepository();

      // Check if parent category exists if specified
      if (categoryData.parentId) {
        const categories = await productRepo.getCategories();
        const parentExists = categories.some(cat => cat.id === categoryData.parentId);
        if (!parentExists) {
          res.status(400).json({
            success: false,
            error: 'PARENT_CATEGORY_NOT_FOUND',
            message: `Parent category with ID ${categoryData.parentId} not found`
          });
          return;
        }
      }

      // Prepare create data
      const createData: any = {
        name: categoryData.name,
        isActive: categoryData.isActive,
        sortOrder: categoryData.sortOrder,
        metadata: categoryData.metadata || {}
      };

      // Add optional fields
      if (categoryData.description) createData.description = categoryData.description;
      if (categoryData.parentId) createData.parentId = categoryData.parentId;

      const category = await productRepo.createCategory(createData);

      res.status(201).json({
        success: true,
        data: category,
        message: 'Category created successfully'
      });

    } catch (error: any) {
      if (error.message?.includes('duplicate key value')) {
        res.status(409).json({
          success: false,
          error: 'DUPLICATE_CATEGORY',
          message: 'Category with this name already exists'
        });
        return;
      }

      next(error);
    }
  }

  /**
   * Get all categories
   * GET /categories
   */
  async getCategories(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const productRepo = this.repositoryFactory.getProductRepository();
      const categories = await productRepo.getCategories();

      res.status(200).json({
        success: true,
        data: categories,
        count: categories.length
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * Update category
   * PUT /categories/:id
   */
  async updateCategory(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const categoryId = req.params.id;
      
      // Validate parameter exists and is string
      if (!categoryId || typeof categoryId !== 'string') {
        res.status(400).json({
          success: false,
          error: 'INVALID_CATEGORY_ID',
          message: 'Category ID parameter is required'
        });
        return;
      }
      
      // Validate UUID format
      if (!z.string().uuid().safeParse(categoryId).success) {
        res.status(400).json({
          success: false,
          error: 'INVALID_CATEGORY_ID',
          message: 'Category ID must be a valid UUID'
        });
        return;
      }

      // Validate request body
      const validation = UpdateCategoryRequestSchema.safeParse(req.body);
      if (!validation.success) {
        res.status(400).json({
          success: false,
          error: 'VALIDATION_ERROR',
          message: 'Invalid request data',
          details: formatValidationError(validation.error)
        });
        return;
      }

      const updateData = validation.data;
      const productRepo = this.repositoryFactory.getProductRepository();

      // Check if category exists
      const categories = await productRepo.getCategories();
      const existingCategory = categories.find(cat => cat.id === categoryId);
      if (!existingCategory) {
        res.status(404).json({
          success: false,
          error: 'CATEGORY_NOT_FOUND',
          message: `Category with ID ${categoryId} not found`
        });
        return;
      }

      // Check parent category if specified
      if (updateData.parentId && updateData.parentId !== existingCategory.parentId) {
        const parentExists = categories.some(cat => cat.id === updateData.parentId);
        if (!parentExists) {
          res.status(400).json({
            success: false,
            error: 'PARENT_CATEGORY_NOT_FOUND',
            message: `Parent category with ID ${updateData.parentId} not found`
          });
          return;
        }

        // Prevent circular reference
        if (updateData.parentId === categoryId) {
          res.status(400).json({
            success: false,
            error: 'CIRCULAR_REFERENCE',
            message: 'Category cannot be its own parent'
          });
          return;
        }
      }

      // Prepare update data - only include defined values
      const preparedUpdateData: any = {};
      Object.keys(updateData).forEach(key => {
        const value = (updateData as any)[key];
        if (value !== undefined) {
          preparedUpdateData[key] = value;
        }
      });

      const updatedCategory = await productRepo.updateCategory(categoryId, preparedUpdateData);

      if (!updatedCategory) {
        res.status(404).json({
          success: false,
          error: 'UPDATE_FAILED',
          message: 'Category update failed'
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: updatedCategory,
        message: 'Category updated successfully'
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * Delete category
   * DELETE /categories/:id
   */
  async deleteCategory(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const categoryId = req.params.id;
      
      // Validate parameter exists and is string
      if (!categoryId || typeof categoryId !== 'string') {
        res.status(400).json({
          success: false,
          error: 'INVALID_CATEGORY_ID',
          message: 'Category ID parameter is required'
        });
        return;
      }
      
      // Validate UUID format
      if (!z.string().uuid().safeParse(categoryId).success) {
        res.status(400).json({
          success: false,
          error: 'INVALID_CATEGORY_ID',
          message: 'Category ID must be a valid UUID'
        });
        return;
      }

      const productRepo = this.repositoryFactory.getProductRepository();

      // Check if category exists
      const categories = await productRepo.getCategories();
      const existingCategory = categories.find(cat => cat.id === categoryId);
      if (!existingCategory) {
        res.status(404).json({
          success: false,
          error: 'CATEGORY_NOT_FOUND',
          message: `Category with ID ${categoryId} not found`
        });
        return;
      }

      // Check if category has products
      const categoryProducts = await productRepo.findByCategory(categoryId, { page: 1, limit: 1 });
      if (categoryProducts.total > 0) {
        res.status(409).json({
          success: false,
          error: 'CATEGORY_HAS_PRODUCTS',
          message: `Cannot delete category with ${categoryProducts.total} associated products`
        });
        return;
      }

      // Check if category has child categories
      const childCategories = categories.filter(cat => cat.parentId === categoryId);
      if (childCategories.length > 0) {
        res.status(409).json({
          success: false,
          error: 'CATEGORY_HAS_CHILDREN',
          message: `Cannot delete category with ${childCategories.length} child categories`
        });
        return;
      }

      const deleted = await productRepo.deleteCategory(categoryId);

      if (!deleted) {
        res.status(404).json({
          success: false,
          error: 'DELETE_FAILED',
          message: 'Category deletion failed'
        });
        return;
      }

      res.status(200).json({
        success: true,
        message: 'Category deleted successfully'
      });

    } catch (error) {
      next(error);
    }
  }
}