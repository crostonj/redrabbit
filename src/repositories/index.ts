/**
 * Repository Layer - Data Access Layer
 * 
 * Main entry point for all repository classes and interfaces.
 * Provides dependency injection and service composition for data access.
 */

// Export all interfaces
export * from './interfaces.js';

// Export base repository classes
export * from './base.js';

// Export repository implementations
export { CustomerRepository } from './customer.js';
export { ProductRepository } from './product.js';
export { OrderRepository } from './order.js';

// Repository factory for dependency injection
import { DatabaseService } from '../services/database.js';
import { CustomerRepository } from './customer.js';
import { ProductRepository } from './product.js';
import { OrderRepository } from './order.js';

/**
 * Repository Factory
 * 
 * Creates and manages repository instances with proper dependency injection.
 * Provides a centralized way to access all repositories with shared database service.
 */
export class RepositoryFactory {
  private db: DatabaseService;
  private customerRepo?: CustomerRepository;
  private productRepo?: ProductRepository;
  private orderRepo?: OrderRepository;

  constructor(db: DatabaseService) {
    this.db = db;
  }

  /**
   * Get CustomerRepository instance (singleton)
   */
  getCustomerRepository(): CustomerRepository {
    if (!this.customerRepo) {
      this.customerRepo = new CustomerRepository(this.db);
    }
    return this.customerRepo;
  }

  /**
   * Get ProductRepository instance (singleton)
   */
  getProductRepository(): ProductRepository {
    if (!this.productRepo) {
      this.productRepo = new ProductRepository(this.db);
    }
    return this.productRepo;
  }

  /**
   * Get OrderRepository instance (singleton)
   */
  getOrderRepository(): OrderRepository {
    if (!this.orderRepo) {
      this.orderRepo = new OrderRepository(this.db);
    }
    return this.orderRepo;
  }

  /**
   * Get all repositories as an object
   */
  getAllRepositories() {
    return {
      customers: this.getCustomerRepository(),
      products: this.getProductRepository(),
      orders: this.getOrderRepository()
    };
  }

  /**
   * Health check for all repositories
   */
  async healthCheck(): Promise<boolean> {
    try {
      return await this.db.healthCheck();
    } catch (error) {
      console.error('Repository health check failed:', error);
      return false;
    }
  }

  /**
   * Close all database connections
   */
  async close(): Promise<void> {
    await this.db.close();
  }
}

/**
 * Repository Service
 * 
 * High-level service that combines multiple repositories for complex operations.
 * Provides transaction support across multiple repositories.
 */
export class RepositoryService {
  private factory: RepositoryFactory;
  private db: DatabaseService;

  constructor(factory: RepositoryFactory) {
    this.factory = factory;
    this.db = factory['db']; // Access private property
  }

  /**
   * Get repository factory
   */
  getFactory(): RepositoryFactory {
    return this.factory;
  }

  /**
   * Execute multiple repository operations in a single transaction
   */
  async withTransaction<T>(
    callback: (repos: {
      customers: CustomerRepository;
      products: ProductRepository;
      orders: OrderRepository;
    }) => Promise<T>
  ): Promise<T> {
    return this.db.withTransaction(async () => {
      const repos = this.factory.getAllRepositories();
      return callback(repos);
    });
  }

  /**
   * Create a complete order with customer validation and inventory checks
   */
  async createOrderWithValidation(orderData: {
    customerId: string;
    items: Array<{
      productId: string;
      quantity: number;
      unitPrice: number;
    }>;
    shippingAddressId: string;
    billingAddressId: string;
    paymentMethod?: string;
    notes?: string;
  }) {
    return this.withTransaction(async (repos) => {
      // Validate customer exists
      const customer = await repos.customers.findById(orderData.customerId);
      if (!customer) {
        throw new Error(`Customer ${orderData.customerId} not found`);
      }

      // Validate addresses belong to customer
      const addresses = await repos.customers.getAddresses(orderData.customerId);
      const shippingAddress = addresses.find(addr => addr.id === orderData.shippingAddressId);
      const billingAddress = addresses.find(addr => addr.id === orderData.billingAddressId);
      
      if (!shippingAddress) {
        throw new Error('Invalid shipping address');
      }
      if (!billingAddress) {
        throw new Error('Invalid billing address');
      }

      // Validate products and check inventory
      let subtotal = 0;
      for (const item of orderData.items) {
        const product = await repos.products.findById(item.productId);
        if (!product) {
          throw new Error(`Product ${item.productId} not found`);
        }
        if (!product.isActive) {
          throw new Error(`Product ${product.name} is not available`);
        }
        if (product.stock < item.quantity) {
          throw new Error(`Insufficient stock for ${product.name}. Available: ${product.stock}, Requested: ${item.quantity}`);
        }
        subtotal += item.unitPrice * item.quantity;
      }

      // Calculate totals (simplified)
      const tax = subtotal * 0.08;
      const shipping = subtotal > 50 ? 0 : 9.99;
      const total = subtotal + tax + shipping;

      // Create order
      const orderCreateData: any = {
        customerId: orderData.customerId,
        subtotalAmount: subtotal,
        taxAmount: tax,
        shippingAmount: shipping,
        discountAmount: 0,
        totalAmount: total,
        shippingAddressId: orderData.shippingAddressId,
        billingAddressId: orderData.billingAddressId,
        paymentMethod: orderData.paymentMethod as any
      };

      // Only add notes if provided
      if (orderData.notes) {
        orderCreateData.notes = orderData.notes;
      }

      const order = await repos.orders.create(orderCreateData);

      // Add order items (this will also update inventory)
      for (const item of orderData.items) {
        await repos.orders.addItem(order.id, {
          productId: item.productId,
          quantity: item.quantity,
          unitPrice: item.unitPrice
        });
      }

      return order;
    });
  }

  /**
   * Get comprehensive order details with customer and product information
   */
  async getOrderDetails(orderId: string) {
    const repos = this.factory.getAllRepositories();
    
    const order = await repos.orders.findById(orderId);
    if (!order) {
      return null;
    }

    // Get customer details
    const customer = await repos.customers.findById(order.customerId);
    
    // Get addresses
    const addresses = customer ? await repos.customers.getAddresses(customer.id) : [];
    const shippingAddress = addresses.find(addr => addr.id === order.shippingAddressId);
    const billingAddress = addresses.find(addr => addr.id === order.billingAddressId);
    
    // Get order items with product details
    const orderItems = await repos.orders.getItems(orderId);
    const itemsWithProducts = await Promise.all(
      orderItems.map(async (item) => {
        const product = await repos.products.findById(item.productId);
        return {
          ...item,
          product: product ? {
            name: product.name,
            sku: product.sku,
            price: product.price
          } : null
        };
      })
    );

    return {
      order,
      customer,
      shippingAddress,
      billingAddress,
      items: itemsWithProducts
    };
  }

  /**
   * Search products with category information
   */
  async searchProductsWithCategories(options: any) {
    const repos = this.factory.getAllRepositories();
    
    const products = await repos.products.search(options);
    const categories = await repos.products.getCategories();
    
    // Map category names to products
    const productsWithCategories = products.data.map(product => {
      const category = categories.find(cat => cat.id === product.categoryId);
      return {
        ...product,
        category: category ? {
          name: category.name,
          slug: category.slug
        } : null
      };
    });

    return {
      ...products,
      data: productsWithCategories,
      categories
    };
  }

  /**
   * Get dashboard analytics
   */
  async getDashboardAnalytics() {
    const repos = this.factory.getAllRepositories();
    
    // Get recent orders
    const recentOrders = await repos.orders.findAll({ page: 1, limit: 10, sortBy: 'created_at', sortOrder: 'desc' });
    
    // Get order statistics for last 30 days
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const orderStats = await repos.orders.getOrderStats(thirtyDaysAgo, new Date());
    
    // Get low stock products
    const lowStockProducts = await repos.products.getLowStockProducts();
    
    // Get popular products
    const popularProducts = await repos.products.getPopularProducts(10);
    
    // Get top customers
    const topCustomers = await repos.customers.getTopCustomers(10);

    return {
      recentOrders: recentOrders.data,
      orderStats,
      lowStockProducts,
      popularProducts,
      topCustomers
    };
  }
}

/**
 * Global repository factory instance
 * Can be initialized once and reused throughout the application
 */
let globalFactory: RepositoryFactory | null = null;

/**
 * Initialize global repository factory
 */
export function initializeRepositories(db: DatabaseService): RepositoryFactory {
  if (!globalFactory) {
    globalFactory = new RepositoryFactory(db);
  }
  return globalFactory;
}

/**
 * Get global repository factory (must be initialized first)
 */
export function getRepositories(): RepositoryFactory {
  if (!globalFactory) {
    throw new Error('Repositories not initialized. Call initializeRepositories() first.');
  }
  return globalFactory;
}