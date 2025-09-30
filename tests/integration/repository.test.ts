import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert';
import { DatabaseService } from '../../src/services/database.js';
import { RepositoryFactory, RepositoryService } from '../../src/repositories/index.js';
import { AddressType, OrderStatus, PaymentMethod } from '../../src/repositories/interfaces.js';

/**
 * Integration Tests for Repository Layer
 * 
 * Tests the complete repository pattern with real database operations.
 * Requires a test database to be available.
 */

describe('Repository Integration Tests', () => {
  let db: DatabaseService;
  let factory: RepositoryFactory;
  let service: RepositoryService;

  before(async () => {
    // Initialize test database connection
    db = new DatabaseService({
      database: process.env.TEST_DB_NAME || 'retail_orders_test'
    });
    await db.initialize();
    
    factory = new RepositoryFactory(db);
    service = new RepositoryService(factory);
    
    console.log('🔧 Database connected for repository tests');
  });

  after(async () => {
    await db.close();
    console.log('🔧 Database connection closed');
  });

  beforeEach(async () => {
    // Clean up test data before each test
    await db.query('DELETE FROM order_items');
    await db.query('DELETE FROM orders');
    await db.query('DELETE FROM addresses');
    await db.query('DELETE FROM inventory_movements');
    await db.query('DELETE FROM products');
    await db.query('DELETE FROM categories');
    await db.query('DELETE FROM customers');
  });

  describe('Repository Factory', () => {
    it('should create repository instances', () => {
      const customerRepo = factory.getCustomerRepository();
      const productRepo = factory.getProductRepository();
      const orderRepo = factory.getOrderRepository();
      
      assert.ok(customerRepo);
      assert.ok(productRepo);
      assert.ok(orderRepo);
    });

    it('should perform health check', async () => {
      const isHealthy = await factory.healthCheck();
      assert.strictEqual(isHealthy, true);
    });
  });

  describe('Customer Repository', () => {
    it('should create and retrieve customers', async () => {
      const customerRepo = factory.getCustomerRepository();
      
      const customerData = {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john.doe@example.com',
        phone: '(555) 123-4567'
      };
      
      const customer = await customerRepo.create(customerData);
      
      assert.strictEqual(customer.firstName, customerData.firstName);
      assert.strictEqual(customer.lastName, customerData.lastName);
      assert.strictEqual(customer.email, customerData.email);
      assert.ok(customer.id);
      assert.ok(customer.createdAt);
      
      // Test retrieval
      const retrieved = await customerRepo.findById(customer.id);
      assert.ok(retrieved);
      assert.strictEqual(retrieved.email, customerData.email);
    });

    it('should manage customer addresses', async () => {
      const customerRepo = factory.getCustomerRepository();
      
      // Create customer
      const customer = await customerRepo.create({
        firstName: 'Jane',
        lastName: 'Smith',
        email: 'jane.smith@example.com',
        phone: '(555) 987-6543'
      });
      
      // Add address
      const addressData = {
        type: AddressType.BILLING,
        street1: '123 Main St',
        city: 'Anytown',
        state: 'CA',
        zipCode: '12345',
        country: 'US',
        isDefault: true
      };
      
      const address = await customerRepo.addAddress(customer.id, addressData);
      
      assert.strictEqual(address.street1, addressData.street1);
      assert.strictEqual(address.type, AddressType.BILLING);
      assert.strictEqual(address.isDefault, true);
      
      // Get addresses
      const addresses = await customerRepo.getAddresses(customer.id);
      assert.strictEqual(addresses.length, 1);
      assert.strictEqual(addresses[0]!.id, address.id);
    });
  });

  describe('Product Repository', () => {
    it('should manage product categories', async () => {
      const productRepo = factory.getProductRepository();
      
      const categoryData = {
        name: 'Electronics',
        slug: 'electronics',
        description: 'Electronic devices and gadgets',
        isActive: true
      };
      
      const category = await productRepo.createCategory(categoryData);
      
      assert.strictEqual(category.name, categoryData.name);
      assert.strictEqual(category.slug, categoryData.slug);
      assert.ok(category.id);
      
      // Get categories
      const categories = await productRepo.getCategories();
      assert.strictEqual(categories.length, 1);
      assert.strictEqual(categories[0]!.name, 'Electronics');
    });

    it('should create and manage products', async () => {
      const productRepo = factory.getProductRepository();
      
      // Create category first
      const category = await productRepo.createCategory({
        name: 'Tools',
        slug: 'tools',
        description: 'Hand and power tools',
        isActive: true
      });
      
      const productData = {
        name: 'Cordless Drill',
        description: 'Professional grade cordless drill',
        sku: 'DRILL-001',
        price: 129.99,
        costPrice: 89.99,
        stock: 50,
        categoryId: category.id,
        isActive: true
      };
      
      const product = await productRepo.create(productData);
      
      assert.strictEqual(product.name, productData.name);
      assert.strictEqual(product.sku, productData.sku);
      assert.strictEqual(product.price, productData.price);
      assert.strictEqual(product.stock, productData.stock);
      assert.ok(product.id);
      
      // Test retrieval
      const retrieved = await productRepo.findById(product.id);
      assert.ok(retrieved);
      assert.strictEqual(retrieved.name, productData.name);
    });
  });

  describe('Order Repository', () => {
    let customer: any;
    let product: any;
    let address: any;

    beforeEach(async () => {
      // Set up test data
      const customerRepo = factory.getCustomerRepository();
      const productRepo = factory.getProductRepository();
      
      // Create customer
      customer = await customerRepo.create({
        firstName: 'Test',
        lastName: 'Customer',
        email: 'test@example.com',
        phone: '(555) 000-0000'
      });
      
      // Add address
      address = await customerRepo.addAddress(customer.id, {
        type: AddressType.BILLING,
        street1: '123 Test St',
        city: 'Test City',
        state: 'TS',
        zipCode: '12345',
        country: 'US',
        isDefault: true
      });
      
      // Create category and product
      const category = await productRepo.createCategory({
        name: 'Test Category',
        slug: 'test-category',
        description: 'Test category',
        isActive: true
      });
      
      product = await productRepo.create({
        name: 'Test Product',
        description: 'Test product description',
        sku: 'TEST-001',
        price: 99.99,
        costPrice: 49.99,
        stock: 100,
        categoryId: category.id,
        isActive: true
      });
    });

    it('should create and manage orders', async () => {
      const orderRepo = factory.getOrderRepository();
      
      const orderData = {
        customerId: customer.id,
        subtotalAmount: 199.98,
        taxAmount: 16.00,
        shippingAmount: 9.99,
        discountAmount: 0,
        totalAmount: 225.97,
        shippingAddressId: address.id,
        billingAddressId: address.id,
        paymentMethod: PaymentMethod.CREDIT_CARD,
        notes: 'Test order'
      };
      
      const order = await orderRepo.create(orderData);
      
      assert.strictEqual(order.customerId, customer.id);
      assert.strictEqual(order.totalAmount, orderData.totalAmount);
      assert.strictEqual(order.status, OrderStatus.PENDING); // Default status
      assert.ok(order.id);
      
      // Test retrieval
      const retrieved = await orderRepo.findById(order.id);
      assert.ok(retrieved);
      assert.strictEqual(retrieved.totalAmount, orderData.totalAmount);
    });

    it('should manage order items', async () => {
      const orderRepo = factory.getOrderRepository();
      
      // Create order
      const order = await orderRepo.create({
        customerId: customer.id,
        subtotalAmount: 199.98,
        taxAmount: 16.00,
        shippingAmount: 9.99,
        discountAmount: 0,
        totalAmount: 225.97,
        shippingAddressId: address.id,
        billingAddressId: address.id,
        paymentMethod: PaymentMethod.CREDIT_CARD
      });
      
      // Add order item
      const itemData = {
        productId: product.id,
        quantity: 2,
        unitPrice: 99.99
      };
      
      const item = await orderRepo.addItem(order.id, itemData);
      
      assert.strictEqual(item.productId, product.id);
      assert.strictEqual(item.quantity, 2);
      assert.strictEqual(item.unitPrice, 99.99);
      
      // Get order items
      const items = await orderRepo.getItems(order.id);
      assert.strictEqual(items.length, 1);
      assert.strictEqual(items[0]!.id, item.id);
    });

    it('should update order status', async () => {
      const orderRepo = factory.getOrderRepository();
      
      // Create order
      const order = await orderRepo.create({
        customerId: customer.id,
        subtotalAmount: 99.99,
        taxAmount: 8.00,
        shippingAmount: 0,
        discountAmount: 0,
        totalAmount: 107.99,
        shippingAddressId: address.id,
        billingAddressId: address.id,
        paymentMethod: PaymentMethod.PAYPAL
      });
      
      assert.strictEqual(order.status, OrderStatus.PENDING);
      
      // Update status
      const updated = await orderRepo.updateStatus(order.id, OrderStatus.PROCESSING);
      assert.ok(updated);
      assert.strictEqual(updated.status, OrderStatus.PROCESSING);
      
      // Verify update
      const retrieved = await orderRepo.findById(order.id);
      assert.strictEqual(retrieved!.status, OrderStatus.PROCESSING);
    });
  });
});