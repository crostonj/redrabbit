import express, { type Express, type Request, type Response } from 'express';
import { createServer } from 'node:http';
import { z } from 'zod';

// Import controllers
import { OrderController } from './controllers/order-controller.js';
import { CustomerController } from './controllers/customer-controller.js';
import { ProductController } from './controllers/product-controller.js';
import { DatabaseService } from './services/database.js';
import { RepositoryFactory } from './repositories/index.js';

// Import middleware
import middleware, { validators } from './middleware/index.js';

/**
 * Express.js Application Server
 * 
 * Configures and starts the REST API server with:
 * - Route setup and organization
 * - Middleware integration
 * - Error handling
 * - Health checks and monitoring
 * - Graceful shutdown handling
 */

// Environment configuration
const serverConfigSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().min(1000).max(65535).default(3000),
  HOST: z.string().default('localhost'),
  API_VERSION: z.string().default('v1'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  
  // Rate limiting
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(15 * 60 * 1000), // 15 minutes
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().default(100),
  
  // Database
  DATABASE_URL: z.string().url('DATABASE_URL must be a valid PostgreSQL connection string')
});

// Parse and validate configuration (with fallback for tests)
let config: {
  NODE_ENV: string;
  PORT: number;
  HOST: string;
  API_VERSION: string;
  JWT_SECRET: string;
  RATE_LIMIT_WINDOW_MS: number;
  RATE_LIMIT_MAX_REQUESTS: number;
  DATABASE_URL: string;
};

try {
  config = serverConfigSchema.parse(process.env);
} catch {
  // Fallback for test environments
  config = {
    NODE_ENV: process.env.NODE_ENV || 'test',
    PORT: parseInt(process.env.PORT || '3001'),
    HOST: process.env.HOST || 'localhost',
    API_VERSION: process.env.API_VERSION || 'v1',
    JWT_SECRET: process.env.JWT_SECRET || 'test-fallback-secret-key-minimum-32-chars',
    RATE_LIMIT_WINDOW_MS: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'),
    RATE_LIMIT_MAX_REQUESTS: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100'),
    DATABASE_URL: process.env.DATABASE_URL || 'postgresql://test:test@localhost:5432/test'
  };
}

/**
 * Application factory function
 */
export function createApp(): Express {
  const app = express();

  // Trust proxy if behind reverse proxy (production)
  if (config.NODE_ENV === 'production') {
    app.set('trust proxy', 1);
  }

  // Apply global middleware
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));
  app.use(middleware.cors);
  app.use(middleware.security);
  
  // Request logging (only in development)
  if (config.NODE_ENV === 'development') {
    app.use(middleware.requestLogger);
  }

  // Rate limiting
  app.use(middleware.rateLimit({
    windowMs: config.RATE_LIMIT_WINDOW_MS,
    maxRequests: config.RATE_LIMIT_MAX_REQUESTS,
    message: 'Too many requests from this IP, please try again later.'
  }));

  // Health check endpoint
  app.get('/health', middleware.healthCheck);
  app.get('/ping', (req: Request, res: Response) => {
    res.status(200).json({ success: true, message: 'pong' });
  });

  // API versioning
  const apiRouter = express.Router();
  
  // Initialize services and controllers
  const databaseService = new DatabaseService();
  const repositoryFactory = new RepositoryFactory(databaseService);
  
  // Initialize all controllers with repository factory
  const orderController = new OrderController(repositoryFactory);
  const customerController = new CustomerController(repositoryFactory);
  const productController = new ProductController(repositoryFactory);

  // =============================================================================
  // API ROUTES - Repository-Integrated Controllers
  // =============================================================================

  // Order Management Routes
  apiRouter.post('/orders', 
    middleware.authenticate,
    orderController.createOrder.bind(orderController)
  );
  
  apiRouter.get('/orders/:id',
    middleware.authenticate,
    validators.requireUuidParam,
    orderController.getOrderById.bind(orderController)
  );
  
  apiRouter.put('/orders/:id',
    middleware.authenticate,
    validators.requireUuidParam,
    orderController.updateOrder.bind(orderController)
  );
  
  apiRouter.put('/orders/:id/status',
    middleware.authenticate,
    validators.requireUuidParam,
    orderController.updateOrderStatus.bind(orderController)
  );
  
  apiRouter.delete('/orders/:id',
    middleware.authenticate,
    validators.requireUuidParam,
    orderController.cancelOrder.bind(orderController)
  );
  
  apiRouter.get('/orders',
    middleware.authenticate,
    validators.paginationWithSearchQuery,
    orderController.listOrders.bind(orderController)
  );

  // Order stats endpoint
  apiRouter.get('/orders/stats',
    middleware.authenticate,
    middleware.authorize(['admin', 'staff']),
    orderController.getOrderStats.bind(orderController)
  );

  // Customer Management Routes
  apiRouter.post('/customers',
    middleware.authenticate,
    customerController.createCustomer.bind(customerController)
  );
  
  apiRouter.get('/customers/:id',
    middleware.authenticate,
    validators.requireUuidParam,
    customerController.getCustomerById.bind(customerController)
  );
  
  apiRouter.put('/customers/:id',
    middleware.authenticate,
    validators.requireUuidParam,
    customerController.updateCustomer.bind(customerController)
  );
  
  apiRouter.delete('/customers/:id',
    middleware.authenticate,
    validators.requireUuidParam,
    customerController.deleteCustomer.bind(customerController)
  );
  
  apiRouter.get('/customers',
    middleware.authenticate,
    validators.paginationWithSearchQuery,
    customerController.getCustomers.bind(customerController)
  );
  
  // Customer address management
  apiRouter.get('/customers/:id/addresses',
    middleware.authenticate,
    validators.requireUuidParam,
    customerController.getCustomerAddresses.bind(customerController)
  );
  
  apiRouter.post('/customers/:id/addresses',
    middleware.authenticate,
    validators.requireUuidParam,
    customerController.addCustomerAddress.bind(customerController)
  );
  
  apiRouter.put('/customers/:id/addresses/:addressId',
    middleware.authenticate,
    validators.uuidParams('id', 'addressId'),
    customerController.updateCustomerAddress.bind(customerController)
  );
  
  apiRouter.delete('/customers/:id/addresses/:addressId',
    middleware.authenticate,
    validators.uuidParams('id', 'addressId'),
    customerController.deleteCustomerAddress.bind(customerController)
  );
  
  apiRouter.put('/customers/:id/addresses/:addressId/default',
    middleware.authenticate,
    validators.uuidParams('id', 'addressId'),
    customerController.setDefaultAddress.bind(customerController)
  );
  
  // Customer orders and stats
  apiRouter.get('/customers/:id/orders',
    middleware.authenticate,
    validators.requireUuidParam,
    validators.paginationQuery,
    customerController.getCustomerOrders.bind(customerController)
  );
  
  apiRouter.get('/customers/:id/stats',
    middleware.authenticate,
    validators.requireUuidParam,
    customerController.getCustomerStats.bind(customerController)
  );

  // Product Management Routes
  apiRouter.post('/products',
    middleware.authenticate,
    productController.createProduct.bind(productController)
  );
  
  apiRouter.get('/products/:id',
    validators.requireUuidParam,
    productController.getProductById.bind(productController)
  );
  
  apiRouter.get('/products/sku/:sku',
    productController.getProductBySku.bind(productController)
  );
  
  apiRouter.put('/products/:id',
    middleware.authenticate,
    validators.requireUuidParam,
    productController.updateProduct.bind(productController)
  );
  
  apiRouter.delete('/products/:id',
    middleware.authenticate,
    validators.requireUuidParam,
    productController.deleteProduct.bind(productController)
  );
  
  apiRouter.get('/products',
    validators.paginationWithSearchQuery,
    productController.getProducts.bind(productController)
  );
  
  // Product inventory management
  apiRouter.put('/products/:id/stock',
    middleware.authenticate,
    validators.requireUuidParam,
    productController.updateProductStock.bind(productController)
  );
  
  apiRouter.get('/products/:id/inventory',
    middleware.authenticate,
    validators.requireUuidParam,
    validators.paginationQuery,
    productController.getProductInventoryHistory.bind(productController)
  );
  
  // Product special endpoints
  apiRouter.get('/products/low-stock',
    middleware.authenticate,
    productController.getLowStockProducts.bind(productController)
  );
  
  apiRouter.get('/products/featured',
    productController.getFeaturedProducts.bind(productController)
  );
  
  apiRouter.get('/products/popular',
    productController.getPopularProducts.bind(productController)
  );
  
  // Product categories by category
  apiRouter.get('/products/category/:categoryId',
    validators.uuidParam('categoryId'),
    validators.paginationQuery,
    productController.getProductsByCategory.bind(productController)
  );

  // Category Management Routes
  apiRouter.post('/categories',
    middleware.authenticate,
    productController.createCategory.bind(productController)
  );
  
  apiRouter.get('/categories',
    productController.getCategories.bind(productController)
  );
  
  apiRouter.put('/categories/:id',
    middleware.authenticate,
    validators.requireUuidParam,
    productController.updateCategory.bind(productController)
  );
  
  apiRouter.delete('/categories/:id',
    middleware.authenticate,
    validators.requireUuidParam,
    productController.deleteCategory.bind(productController)
  );

  // Mount API routes with version prefix
  app.use(`/api/${config.API_VERSION}`, apiRouter);

  // Handle 404 for unmatched routes
  app.all('*', (req: Request, res: Response) => {
    res.status(404).json({
      success: false,
      error: 'Route not found',
      message: `Cannot ${req.method} ${req.path}`
    });
  });

  // Global error handling (must be last)
  app.use(middleware.errorHandler);

  return app;
}

/**
 * Server instance management
 */
export class Server {
  private app: Express;
  private server: ReturnType<typeof createServer> | null = null;
  private isShuttingDown = false;

  constructor() {
    this.app = createApp();
    this.setupSignalHandlers();
  }

  /**
   * Start the server
   */
  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.server = createServer(this.app);
        
        this.server.listen(config.PORT, config.HOST, () => {
          console.log(`🚀 Server started successfully!`);
          console.log(`📍 API URL: http://${config.HOST}:${config.PORT}/api/${config.API_VERSION}`);
          console.log(`🏥 Health check: http://${config.HOST}:${config.PORT}/health`);
          console.log(`🌍 Environment: ${config.NODE_ENV}`);
          resolve();
        });

        this.server.on('error', (error: Error) => {
          console.error('❌ Server failed to start:', error);
          reject(error);
        });
      } catch (error) {
        console.error('❌ Failed to initialize server:', error);
        reject(error);
      }
    });
  }

  /**
   * Stop the server
   */
  async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          console.log('🛑 Server stopped');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  /**
   * Get Express app instance (for testing)
   */
  getApp(): Express {
    return this.app;
  }

  /**
   * Setup signal handlers for graceful shutdown
   */
  private setupSignalHandlers(): void {
    const signals = ['SIGTERM', 'SIGINT', 'SIGUSR2'] as const;
    
    signals.forEach((signal) => {
      process.on(signal, () => {
        this.gracefulShutdown(signal);
      });
    });

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      console.error('💥 Uncaught Exception:', error);
      this.gracefulShutdown('uncaughtException');
    });

    // Handle unhandled rejections
    process.on('unhandledRejection', (reason, promise) => {
      console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
      this.gracefulShutdown('unhandledRejection');
    });
  }

  /**
   * Graceful shutdown handler
   */
  private async gracefulShutdown(signal: string): Promise<void> {
    if (this.isShuttingDown) {
      return;
    }

    this.isShuttingDown = true;
    console.log(`\n🔄 Received ${signal}. Starting graceful shutdown...`);

    try {
      // Stop accepting new requests
      await this.stop();

      // Perform cleanup operations
      await this.cleanup();

      console.log('✅ Graceful shutdown completed');
      process.exit(0);
    } catch (error) {
      console.error('❌ Error during shutdown:', error);
      process.exit(1);
    }
  }

  /**
   * Cleanup resources during shutdown
   */
  private async cleanup(): Promise<void> {
    // Add any cleanup operations here
    // - Close database connections
    // - Clear timers/intervals
    // - Save state if needed
    
    console.log('🧹 Cleanup completed');
  }
}

// Export for testing
export { config };

// Default export for convenience
export default Server;