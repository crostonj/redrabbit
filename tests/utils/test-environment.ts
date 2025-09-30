/**
 * Integration Test Environment Setup
 * 
 * Comprehensive testing utilities for:
 * - Test database setup and teardown
 * - Test data seeding and cleanup
 * - HTTP client configuration
 * - Repository test utilities
 * - Environment isolation
 */

import { DatabaseService } from '../../src/services/database.js';
import { RepositoryFactory } from '../../src/repositories/index.js';
import { MigrationManager } from '../../src/database/migration-manager.js';
import { createServer, type Server } from 'node:http';
import type { Express } from 'express';
import { getConfig } from '../../src/config/env.js';
import type { 
  Customer, 
  Product, 
  Order, 
  OrderItem,
  Category
} from '../../src/repositories/interfaces.js';
import { 
  AddressType,
  PaymentMethod
} from '../../src/repositories/interfaces.js';

/**
 * Test Environment Manager
 * Handles test database lifecycle and data management
 */
export class TestEnvironment {
  private databaseService: DatabaseService;
  private repositoryFactory: RepositoryFactory;
  private migrationManager: MigrationManager;
  private server?: Server;
  
  constructor() {
    this.databaseService = new DatabaseService();
    this.repositoryFactory = new RepositoryFactory(this.databaseService);
    this.migrationManager = new MigrationManager(this.databaseService);
  }

  /**
   * Initialize test environment
   * - Connect to test database
   * - Run migrations
   * - Seed initial test data
   */
  async setup(): Promise<void> {
    try {
      // Initialize database connection
      await this.databaseService.initialize();
      
      // Reset database to clean state
      await this.migrationManager.runMigrations();
      
      // Seed test data
      await this.seedTestData();
      
      console.log('✅ Test environment setup complete');
    } catch (error) {
      console.error('❌ Failed to setup test environment:', error);
      throw error;
    }
  }

  /**
   * Cleanup test environment
   * - Clear test data
   * - Close database connections
   * - Stop test server
   */
  async cleanup(): Promise<void> {
    try {
      // Stop server if running
      if (this.server) {
        await new Promise<void>((resolve, reject) => {
          this.server!.close((err) => {
            if (err) reject(err);
            else resolve();
          });
        });
      }

      // Disconnect from database
      await this.databaseService.close();
      
      console.log('✅ Test environment cleanup complete');
    } catch (error) {
      console.error('❌ Failed to cleanup test environment:', error);
      throw error;
    }
  }

  /**
   * Start test server with Express app
   */
  async startServer(app: Express): Promise<string> {
    const config = getConfig();
    const port = config.PORT + 100; // Use different port for tests
    const host = config.HOST;
    
    return new Promise((resolve, reject) => {
      this.server = createServer(app);
      
      this.server.listen(port, host, () => {
        const baseUrl = `http://${host}:${port}`;
        console.log(`🧪 Test server running at ${baseUrl}`);
        resolve(baseUrl);
      });
      
      this.server.on('error', reject);
    });
  }

  /**
   * Get repository factory for tests
   */
  getRepositoryFactory(): RepositoryFactory {
    return this.repositoryFactory;
  }

  /**
   * Get database service for tests
   */
  getDatabaseService(): DatabaseService {
    return this.databaseService;
  }

  /**
   * Clear all test data (but keep schema)
   */
  async clearTestData(): Promise<void> {
    const client = await this.databaseService.getConnection();
    
    try {
      await client.query('BEGIN');
      
      // Clear in dependency order
      await client.query('DELETE FROM order_items');
      await client.query('DELETE FROM orders');
      await client.query('DELETE FROM customer_addresses');
      await client.query('DELETE FROM customers');
      await client.query('DELETE FROM products');
      await client.query('DELETE FROM product_categories');
      
      // Reset sequences
      await client.query('ALTER SEQUENCE customers_id_seq RESTART WITH 1');
      await client.query('ALTER SEQUENCE product_categories_id_seq RESTART WITH 1');
      await client.query('ALTER SEQUENCE products_id_seq RESTART WITH 1');
      await client.query('ALTER SEQUENCE orders_id_seq RESTART WITH 1');
      await client.query('ALTER SEQUENCE order_items_id_seq RESTART WITH 1');
      await client.query('ALTER SEQUENCE customer_addresses_id_seq RESTART WITH 1');
      
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      this.databaseService.releaseConnection(client);
    }
  }

  /**
   * Seed test data for integration tests
   */
  private async seedTestData(): Promise<TestDataSeed> {
    await this.clearTestData();
    
    const customerRepo = this.repositoryFactory.getCustomerRepository();
    const productRepo = this.repositoryFactory.getProductRepository();
    const orderRepo = this.repositoryFactory.getOrderRepository();

    // Create test categories
    const categories = await Promise.all([
      productRepo.createCategory({
        name: 'Power Tools',
        description: 'Electric and battery-powered tools',
        slug: 'power-tools',
        parentId: undefined
      }),
      productRepo.createCategory({
        name: 'Hand Tools',
        description: 'Manual tools and hardware',
        slug: 'hand-tools',
        parentId: undefined
      }),
      productRepo.createCategory({
        name: 'Building Materials',
        description: 'Construction and building supplies',
        slug: 'building-materials',
        parentId: undefined
      })
    ]);

    // Create test products
    const products = await Promise.all([
      productRepo.create({
        sku: 'TEST-DRILL-001',
        name: 'Test Power Drill',
        description: 'High-performance cordless drill for testing',
        price: 129.99,
        costPrice: 75.00,
        stock: 50,
        categoryId: categories[0].id,
        isActive: true,
        weight: 2.5,
        dimensions: { length: 10, width: 3, height: 8 }
      }),
      productRepo.create({
        sku: 'TEST-HAMMER-002',
        name: 'Test Claw Hammer',
        description: 'Professional grade claw hammer for testing',
        price: 29.99,
        costPrice: 15.00,
        stock: 100,
        categoryId: categories[1].id,
        isActive: true,
        weight: 1.2,
        dimensions: { length: 13, width: 5, height: 1 }
      }),
      productRepo.create({
        sku: 'TEST-WOOD-003',
        name: 'Test 2x4 Lumber',
        description: 'Standard 2x4 lumber piece for testing',
        price: 8.99,
        costPrice: 5.50,
        stock: 200,
        categoryId: categories[2].id,
        isActive: true,
        weight: 5.0,
        dimensions: { length: 96, width: 4, height: 2 }
      })
    ]);

    // Create test customers
    const customers = await Promise.all([
      customerRepo.create({
        email: 'test.customer1@example.com',
        firstName: 'John',
        lastName: 'Doe',
        phone: '+1-555-0101',
        dateOfBirth: new Date('1985-06-15')
      }),
      customerRepo.create({
        email: 'test.customer2@example.com',
        firstName: 'Jane',
        lastName: 'Smith',
        phone: '+1-555-0102',
        dateOfBirth: new Date('1990-03-22')
      }),
      customerRepo.create({
        email: 'test.customer3@example.com',
        firstName: 'Bob',
        lastName: 'Wilson',
        phone: '+1-555-0103',
        dateOfBirth: new Date('1978-11-08')
      })
    ]);

    // Add addresses to test customers
    const addresses = [];
    for (let i = 0; i < customers.length; i++) {
      const address = await customerRepo.addAddress(customers[i].id, {
        type: AddressType.SHIPPING,
        street1: `${123 + i} Test Street`,
        city: 'Test City',
        state: 'TS',
        zipCode: `1234${i}`,
        country: 'US',
        isDefault: true
      });
      addresses.push(address);
    }

    // Create test orders (first create orders, then add items)
    const order1Data = {
      customerId: customers[0].id,
      subtotalAmount: 0, // Will be calculated
      totalAmount: 0, // Will be calculated
      shippingAddressId: addresses[0].id,
      billingAddressId: addresses[0].id,
      paymentMethod: PaymentMethod.CREDIT_CARD,
      notes: 'Test order for integration testing'
    };
    
    const order2Data = {
      customerId: customers[1].id,
      subtotalAmount: 0, // Will be calculated
      totalAmount: 0, // Will be calculated
      shippingAddressId: addresses[1].id,
      billingAddressId: addresses[1].id,
      paymentMethod: PaymentMethod.DEBIT_CARD,
      notes: 'Second test order'
    };
    
    const orders = await Promise.all([
      orderRepo.create(order1Data),
      orderRepo.create(order2Data)
    ]);
    
    // Add items to first order
    await orderRepo.addItem(orders[0].id, {
      productId: products[0].id,
      quantity: 2,
      unitPrice: products[0].price
    });
    await orderRepo.addItem(orders[0].id, {
      productId: products[1].id,
      quantity: 1,
      unitPrice: products[1].price
    });
    
    // Add items to second order
    await orderRepo.addItem(orders[1].id, {
      productId: products[2].id,
      quantity: 5,
      unitPrice: products[2].price
    });
    
    // Recalculate totals for both orders
    await orderRepo.recalculateTotals(orders[0].id);
    await orderRepo.recalculateTotals(orders[1].id);

    return {
      categories,
      products,
      customers,
      addresses,
      orders
    };
  }
}

/**
 * Test data seed interface
 */
export interface TestDataSeed {
  categories: Category[];
  products: Product[];
  customers: Customer[];
  addresses: any[];
  orders: Order[];
}

/**
 * HTTP Test Client
 * Simplified HTTP client for API integration testing
 */
export class TestHttpClient {
  private baseUrl: string;
  
  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/$/, ''); // Remove trailing slash
  }

  /**
   * Make GET request
   */
  async get(path: string, headers: Record<string, string> = {}): Promise<TestResponse> {
    const url = `${this.baseUrl}${path}`;
    
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...headers
        }
      });
      
      const body = await response.text();
      let json = null;
      
      try {
        json = JSON.parse(body);
      } catch {
        // Response is not JSON
      }
      
      return {
        status: response.status,
        headers: Object.fromEntries([...response.headers]),
        body: json || body,
        raw: body
      };
    } catch (error) {
      throw new Error(`GET ${url} failed: ${error}`);
    }
  }

  /**
   * Make POST request
   */
  async post(path: string, data: any = {}, headers: Record<string, string> = {}): Promise<TestResponse> {
    const url = `${this.baseUrl}${path}`;
    
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...headers
        },
        body: JSON.stringify(data)
      });
      
      const body = await response.text();
      let json = null;
      
      try {
        json = JSON.parse(body);
      } catch {
        // Response is not JSON
      }
      
      return {
        status: response.status,
        headers: Object.fromEntries([...response.headers]),
        body: json || body,
        raw: body
      };
    } catch (error) {
      throw new Error(`POST ${url} failed: ${error}`);
    }
  }

  /**
   * Make PUT request
   */
  async put(path: string, data: any = {}, headers: Record<string, string> = {}): Promise<TestResponse> {
    const url = `${this.baseUrl}${path}`;
    
    try {
      const response = await fetch(url, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...headers
        },
        body: JSON.stringify(data)
      });
      
      const body = await response.text();
      let json = null;
      
      try {
        json = JSON.parse(body);
      } catch {
        // Response is not JSON
      }
      
      return {
        status: response.status,
        headers: Object.fromEntries([...response.headers]),
        body: json || body,
        raw: body
      };
    } catch (error) {
      throw new Error(`PUT ${url} failed: ${error}`);
    }
  }

  /**
   * Make DELETE request
   */
  async delete(path: string, headers: Record<string, string> = {}): Promise<TestResponse> {
    const url = `${this.baseUrl}${path}`;
    
    try {
      const response = await fetch(url, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          ...headers
        }
      });
      
      const body = await response.text();
      let json = null;
      
      try {
        json = JSON.parse(body);
      } catch {
        // Response is not JSON
      }
      
      return {
        status: response.status,
        headers: Object.fromEntries([...response.headers]),
        body: json || body,
        raw: body
      };
    } catch (error) {
      throw new Error(`DELETE ${url} failed: ${error}`);
    }
  }
}

/**
 * Test HTTP response interface
 */
export interface TestResponse {
  status: number;
  headers: Record<string, string>;
  body: any;
  raw: string;
}

/**
 * Test assertion helpers
 */
export const testAssertions = {
  /**
   * Assert successful API response
   */
  assertSuccess(response: TestResponse, expectedStatus = 200): void {
    if (response.status !== expectedStatus) {
      throw new Error(
        `Expected status ${expectedStatus}, got ${response.status}. Response: ${response.raw}`
      );
    }
    
    if (response.body && response.body.success !== undefined && !response.body.success) {
      throw new Error(
        `API returned success=false. Response: ${response.raw}`
      );
    }
  },

  /**
   * Assert API error response
   */
  assertError(response: TestResponse, expectedStatus: number, errorMessagePattern?: RegExp): void {
    if (response.status !== expectedStatus) {
      throw new Error(
        `Expected error status ${expectedStatus}, got ${response.status}. Response: ${response.raw}`
      );
    }
    
    if (errorMessagePattern && response.body) {
      const errorMessage = response.body.error || response.body.message || '';
      if (!errorMessagePattern.test(errorMessage)) {
        throw new Error(
          `Error message doesn't match pattern ${errorMessagePattern}. Got: ${errorMessage}`
        );
      }
    }
  },

  /**
   * Assert response contains expected data structure
   */
  assertDataStructure(response: TestResponse, expectedKeys: string[]): void {
    this.assertSuccess(response);
    
    if (!response.body || !response.body.data) {
      throw new Error('Response missing data property');
    }
    
    for (const key of expectedKeys) {
      if (!(key in response.body.data)) {
        throw new Error(`Response data missing expected key: ${key}`);
      }
    }
  },

  /**
   * Assert pagination structure
   */
  assertPagination(response: TestResponse): void {
    this.assertSuccess(response);
    
    if (!response.body || !response.body.pagination) {
      throw new Error('Response missing pagination property');
    }
    
    const required = ['page', 'limit', 'total', 'totalPages'];
    for (const key of required) {
      if (!(key in response.body.pagination)) {
        throw new Error(`Pagination missing required key: ${key}`);
      }
    }
  }
};

/**
 * Global test environment instance
 */
export const testEnv = new TestEnvironment();