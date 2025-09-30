/**
 * Database Seeding System
 * 
 * Provides functionality to seed the database with realistic test data
 * for development and testing purposes.
 */

import type { DatabaseService } from '../services/database.js';
import { RepositoryFactory } from './index.js';

/**
 * Seed data configuration
 */
export interface SeedConfig {
  customers: number;
  products: number;
  categories: number;
  orders: number;
  minOrderItems: number;
  maxOrderItems: number;
  minAddressesPerCustomer: number;
  maxAddressesPerCustomer: number;
}

/**
 * Default seed configuration
 */
export const DEFAULT_SEED_CONFIG: SeedConfig = {
  customers: 50,
  products: 200,
  categories: 10,
  orders: 100,
  minOrderItems: 1,
  maxOrderItems: 5,
  minAddressesPerCustomer: 1,
  maxAddressesPerCustomer: 3
};

/**
 * Sample data generators
 */
export class SeedDataGenerator {
  private firstNames = [
    'James', 'Mary', 'John', 'Patricia', 'Robert', 'Jennifer', 'Michael', 'Linda',
    'William', 'Elizabeth', 'David', 'Barbara', 'Richard', 'Susan', 'Joseph', 'Jessica',
    'Thomas', 'Sarah', 'Christopher', 'Karen', 'Charles', 'Nancy', 'Daniel', 'Lisa',
    'Matthew', 'Betty', 'Anthony', 'Helen', 'Mark', 'Sandra', 'Donald', 'Donna',
    'Steven', 'Carol', 'Paul', 'Ruth', 'Andrew', 'Sharon', 'Joshua', 'Michelle',
    'Kenneth', 'Laura', 'Kevin', 'Sarah', 'Brian', 'Kimberly', 'George', 'Deborah',
    'Timothy', 'Dorothy', 'Ronald', 'Lisa', 'Jason', 'Nancy', 'Edward', 'Karen',
    'Jeffrey', 'Betty', 'Ryan', 'Helen', 'Jacob', 'Sandra', 'Gary', 'Donna'
  ];

  private lastNames = [
    'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis',
    'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Gonzales', 'Wilson', 'Anderson', 'Thomas',
    'Taylor', 'Moore', 'Jackson', 'Martin', 'Lee', 'Perez', 'Thompson', 'White',
    'Harris', 'Sanchez', 'Clark', 'Ramirez', 'Lewis', 'Robinson', 'Walker', 'Young',
    'Allen', 'King', 'Wright', 'Scott', 'Torres', 'Nguyen', 'Hill', 'Flores',
    'Green', 'Adams', 'Nelson', 'Baker', 'Hall', 'Rivera', 'Campbell', 'Mitchell',
    'Carter', 'Roberts', 'Gomez', 'Phillips', 'Evans', 'Turner', 'Diaz', 'Parker'
  ];

  private companies = [
    'Acme Corp', 'Global Industries', 'TechStart Inc', 'Innovation Labs', 'Future Systems',
    'Digital Solutions', 'Smart Technologies', 'Advanced Analytics', 'Cloud Services',
    'Data Dynamics', 'Cyber Security Co', 'Mobile Apps Ltd', 'Web Solutions Inc',
    'Software Systems', 'Tech Innovators', 'Digital Transformation', 'AI Solutions',
    'Blockchain Tech', 'IoT Devices Inc', 'Quantum Computing'
  ];

  private productCategories = [
    { name: 'Electronics', slug: 'electronics' },
    { name: 'Clothing', slug: 'clothing' },
    { name: 'Books', slug: 'books' },
    { name: 'Home & Garden', slug: 'home-garden' },
    { name: 'Sports & Outdoors', slug: 'sports-outdoors' },
    { name: 'Toys & Games', slug: 'toys-games' },
    { name: 'Health & Beauty', slug: 'health-beauty' },
    { name: 'Automotive', slug: 'automotive' },
    { name: 'Food & Beverages', slug: 'food-beverages' },
    { name: 'Office Supplies', slug: 'office-supplies' }
  ];

  private productNames = {
    'electronics': [
      'Smartphone X1', 'Wireless Headphones', 'Laptop Pro', 'Tablet Air', 'Smart Watch',
      '4K Monitor', 'Gaming Keyboard', 'Wireless Mouse', 'USB-C Hub', 'Power Bank',
      'Bluetooth Speaker', 'Webcam HD', 'Gaming Headset', 'External SSD', 'Wireless Charger'
    ],
    'clothing': [
      'Cotton T-Shirt', 'Denim Jeans', 'Winter Jacket', 'Running Shoes', 'Casual Sneakers',
      'Summer Dress', 'Business Shirt', 'Yoga Pants', 'Hoodie', 'Baseball Cap',
      'Leather Jacket', 'Polo Shirt', 'Sweatshirt', 'Cargo Pants', 'Athletic Shorts'
    ],
    'books': [
      'Programming Guide', 'History of Science', 'Cooking Mastery', 'Fiction Novel',
      'Biography Collection', 'Art & Design', 'Business Strategy', 'Self Help',
      'Travel Guide', 'Photography Tips', 'Language Learning', 'Mathematics',
      'Physics Fundamentals', 'Creative Writing', 'Philosophy'
    ],
    'home-garden': [
      'Garden Hose', 'Kitchen Knife Set', 'Coffee Maker', 'Vacuum Cleaner', 'Air Purifier',
      'Plant Pot', 'LED Light Bulbs', 'Storage Container', 'Throw Pillow', 'Picture Frame',
      'Curtain Set', 'Desk Lamp', 'Wall Clock', 'Area Rug', 'Candle Set'
    ]
  };

  private streets = [
    'Main St', 'Oak Ave', 'Pine Rd', 'Elm Dr', 'Maple Way', 'Cedar Ln', 'Park Ave',
    'First St', 'Second St', 'Third St', 'Fourth St', 'Fifth St', 'Broadway',
    'Washington St', 'Lincoln Ave', 'Jefferson Dr', 'Madison Way', 'Monroe Ln'
  ];

  private cities = [
    'New York', 'Los Angeles', 'Chicago', 'Houston', 'Phoenix', 'Philadelphia',
    'San Antonio', 'San Diego', 'Dallas', 'San Jose', 'Austin', 'Jacksonville',
    'Fort Worth', 'Columbus', 'Charlotte', 'San Francisco', 'Indianapolis',
    'Seattle', 'Denver', 'Washington'
  ];

  private states = [
    'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
    'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
    'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
    'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
    'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY'
  ];

  private paymentMethods = ['credit_card', 'debit_card', 'paypal', 'bank_transfer'];

  getProductCategories() {
    return this.productCategories;
  }

  getPaymentMethods() {
    return this.paymentMethods;
  }

  random(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  randomChoice<T>(array: readonly T[]): T {
    if (array.length === 0) {
      throw new Error('Cannot choose from empty array');
    }
    return array[Math.floor(Math.random() * array.length)]!;
  }

  randomEmail(firstName: string, lastName: string): string {
    const domains = ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'aol.com'];
    const variations = [
      `${firstName.toLowerCase()}.${lastName.toLowerCase()}`,
      `${firstName.toLowerCase()}${lastName.toLowerCase()}`,
      `${firstName.toLowerCase()}_${lastName.toLowerCase()}`,
      `${firstName.toLowerCase()}${this.random(10, 999)}`
    ];
    return `${this.randomChoice(variations)}@${this.randomChoice(domains)}`;
  }

  randomPhone(): string {
    return `(${this.random(200, 999)}) ${this.random(200, 999)}-${this.random(1000, 9999)}`;
  }

  randomAddress() {
    return {
      street: `${this.random(100, 9999)} ${this.randomChoice(this.streets)}`,
      city: this.randomChoice(this.cities),
      state: this.randomChoice(this.states),
      postalCode: `${this.random(10000, 99999)}`,
      country: 'US'
    };
  }

  randomProduct(categoryId: string, categorySlug: string) {
    const categoryProducts = this.productNames[categorySlug as keyof typeof this.productNames] || 
                            this.productNames.electronics;
    const baseName = this.randomChoice(categoryProducts);
    const variant = this.random(1, 100);
    const name = `${baseName} ${variant}`;
    
    return {
      name,
      description: `High-quality ${baseName.toLowerCase()} with premium features and excellent performance.`,
      sku: `${categorySlug.toUpperCase()}-${variant.toString().padStart(3, '0')}`,
      price: this.random(999, 99999) / 100, // $9.99 to $999.99
      costPrice: this.random(500, 80000) / 100, // Cost is typically 50-80% of price
      stock: this.random(0, 500),
      categoryId,
      isActive: Math.random() > 0.1 // 90% active
    };
  }

  randomCustomer() {
    const firstName = this.randomChoice(this.firstNames);
    const lastName = this.randomChoice(this.lastNames);
    const isCompany = Math.random() > 0.7; // 30% companies
    
    return {
      firstName,
      lastName,
      email: this.randomEmail(firstName, lastName),
      phone: this.randomPhone(),
      company: isCompany ? this.randomChoice(this.companies) : undefined,
      isActive: Math.random() > 0.05 // 95% active
    };
  }

  randomOrderStatus() {
    const statuses = ['pending', 'processing', 'shipped', 'delivered', 'cancelled'];
    const weights = [0.1, 0.2, 0.3, 0.35, 0.05]; // Most orders are shipped/delivered
    
    const random = Math.random();
    let cumulative = 0;
    
    for (let i = 0; i < statuses.length; i++) {
      cumulative += weights[i]!;
      if (random <= cumulative) {
        return statuses[i]!;
      }
    }
    
    return 'delivered';
  }

  randomDate(daysAgo: number): Date {
    const now = new Date();
    const past = new Date(now.getTime() - (daysAgo * 24 * 60 * 60 * 1000));
    const random = past.getTime() + Math.random() * (now.getTime() - past.getTime());
    return new Date(random);
  }
}

/**
 * Database Seeder
 */
export class DatabaseSeeder {
  private db: DatabaseService;
  private factory: RepositoryFactory;
  private generator: SeedDataGenerator;

  constructor(db: DatabaseService) {
    this.db = db;
    this.factory = new RepositoryFactory(db);
    this.generator = new SeedDataGenerator();
  }

  /**
   * Seed the database with test data
   */
  async seed(config: Partial<SeedConfig> = {}): Promise<void> {
    const fullConfig = { ...DEFAULT_SEED_CONFIG, ...config };
    
    console.log('🌱 Starting database seeding...');
    console.log('📊 Configuration:', fullConfig);

    try {
      // Clear existing data
      await this.clearData();

      // Seed in order of dependencies
      const categories = await this.seedCategories(fullConfig.categories);
      const products = await this.seedProducts(fullConfig.products, categories);
      const customers = await this.seedCustomers(fullConfig.customers);
      await this.seedCustomerAddresses(customers, fullConfig);
      await this.seedOrders(fullConfig.orders, customers, products, fullConfig);

      console.log('✅ Database seeding completed successfully!');
      
    } catch (error) {
      console.error('❌ Database seeding failed:', error);
      throw error;
    }
  }

  /**
   * Clear all data from tables
   */
  async clearData(): Promise<void> {
    console.log('🧹 Clearing existing data...');
    
    const tables = [
      'order_items',
      'orders',
      'addresses',
      'inventory_movements',
      'products',
      'categories',
      'customers'
    ];

    for (const table of tables) {
      await this.db.query(`DELETE FROM ${table}`);
    }
  }

  /**
   * Seed product categories
   */
  async seedCategories(count: number): Promise<any[]> {
    console.log(`📂 Seeding ${count} categories...`);
    
    const productRepo = this.factory.getProductRepository();
    const categories = [];

    for (let i = 0; i < Math.min(count, this.generator.getProductCategories().length); i++) {
      const categoryData = this.generator.getProductCategories()[i]!;
      const category = await productRepo.createCategory({
        name: categoryData.name,
        slug: categoryData.slug,
        description: `Products in the ${categoryData.name.toLowerCase()} category`,
        isActive: true
      });
      categories.push(category);
    }

    console.log(`✅ Created ${categories.length} categories`);
    return categories;
  }

  /**
   * Seed products
   */
  async seedProducts(count: number, categories: any[]): Promise<any[]> {
    console.log(`📦 Seeding ${count} products...`);
    
    const productRepo = this.factory.getProductRepository();
    const products = [];

    for (let i = 0; i < count; i++) {
      const category = this.generator.randomChoice(categories);
      const productData = this.generator.randomProduct(category.id, category.slug);
      
      const product = await productRepo.create(productData);
      products.push(product);

      // Create inventory movement record would be handled by product repository if supported
      // Skip inventory movements for seeding simplicity

      if ((i + 1) % 50 === 0) {
        console.log(`   📦 Created ${i + 1}/${count} products...`);
      }
    }

    console.log(`✅ Created ${products.length} products`);
    return products;
  }

  /**
   * Seed customers
   */
  async seedCustomers(count: number): Promise<any[]> {
    console.log(`👥 Seeding ${count} customers...`);
    
    const customerRepo = this.factory.getCustomerRepository();
    const customers = [];

    for (let i = 0; i < count; i++) {
      const customerData = this.generator.randomCustomer();
      const customer = await customerRepo.create(customerData);
      customers.push(customer);

      if ((i + 1) % 25 === 0) {
        console.log(`   👤 Created ${i + 1}/${count} customers...`);
      }
    }

    console.log(`✅ Created ${customers.length} customers`);
    return customers;
  }

  /**
   * Seed customer addresses
   */
  async seedCustomerAddresses(customers: any[], config: SeedConfig): Promise<void> {
    console.log('🏠 Seeding customer addresses...');
    
    const customerRepo = this.factory.getCustomerRepository();
    let totalAddresses = 0;

    for (const customer of customers) {
      const addressCount = this.generator.random(
        config.minAddressesPerCustomer,
        config.maxAddressesPerCustomer
      );

      for (let i = 0; i < addressCount; i++) {
        const addressData = {
          ...this.generator.randomAddress(),
          type: i === 0 ? 'billing' : (i === 1 ? 'shipping' : 'other'),
          isDefault: i === 0
        };

        await customerRepo.addAddress(customer.id, addressData as any);
        totalAddresses++;
      }
    }

    console.log(`✅ Created ${totalAddresses} addresses`);
  }

  /**
   * Seed orders
   */
  async seedOrders(count: number, customers: any[], products: any[], config: SeedConfig): Promise<void> {
    console.log(`📋 Seeding ${count} orders...`);
    
    const orderRepo = this.factory.getOrderRepository();
    const customerRepo = this.factory.getCustomerRepository();
    
    for (let i = 0; i < count; i++) {
      const customer = this.generator.randomChoice(customers);
      const addresses = await customerRepo.getAddresses(customer.id);
      
      if (addresses.length === 0) continue;
      
      const shippingAddress = this.generator.randomChoice(addresses);
      const billingAddress = addresses.find(a => a.type === 'billing') || shippingAddress;

      // Generate order items
      const itemCount = this.generator.random(config.minOrderItems, config.maxOrderItems);
      const selectedProducts: any[] = [];
      
      for (let j = 0; j < itemCount; j++) {
        const product = this.generator.randomChoice(products);
        if (!selectedProducts.find(p => p.id === product.id)) {
          selectedProducts.push(product);
        }
      }

      // Calculate totals
      let subtotal = 0;
      const orderItems = selectedProducts.map(product => {
        const quantity = this.generator.random(1, 3);
        const unitPrice = product.price;
        subtotal += unitPrice * quantity;
        
        return {
          productId: product.id,
          quantity,
          unitPrice
        };
      });

      const tax = subtotal * 0.08;
      const shipping = subtotal > 50 ? 0 : 9.99;
      const total = subtotal + tax + shipping;

      // Create order
      const orderData: any = {
        customerId: customer.id,
        subtotalAmount: subtotal,
        taxAmount: tax,
        shippingAmount: shipping,
        discountAmount: 0,
        totalAmount: total,
        shippingAddressId: shippingAddress.id,
        billingAddressId: billingAddress.id,
        paymentMethod: this.generator.randomChoice(this.generator.getPaymentMethods()),
        status: this.generator.randomOrderStatus()
      };

      // Set random order date in the past
      const order = await orderRepo.create(orderData);

      // Add order items
      for (const item of orderItems) {
        await orderRepo.addItem(order.id, item);
      }

      // Update order date to simulate historical data
      const orderDate = this.generator.randomDate(90); // Within last 90 days
      await this.db.query(
        'UPDATE orders SET created_at = $1, updated_at = $1 WHERE id = $2',
        [orderDate, order.id]
      );

      if ((i + 1) % 20 === 0) {
        console.log(`   📋 Created ${i + 1}/${count} orders...`);
      }
    }

    console.log(`✅ Created ${count} orders`);
  }

  /**
   * Get seeding statistics
   */
  async getStats(): Promise<any> {
    const stats = await this.db.query(`
      SELECT 
        'customers' as table_name,
        COUNT(*) as count
      FROM customers
      UNION ALL
      SELECT 'categories', COUNT(*) FROM categories
      UNION ALL
      SELECT 'products', COUNT(*) FROM products
      UNION ALL
      SELECT 'addresses', COUNT(*) FROM addresses
      UNION ALL
      SELECT 'orders', COUNT(*) FROM orders
      UNION ALL
      SELECT 'order_items', COUNT(*) FROM order_items
      UNION ALL
      SELECT 'inventory_movements', COUNT(*) FROM inventory_movements
    `);

    const result: Record<string, number> = {};
    for (const row of stats.rows) {
      result[row.table_name] = parseInt(row.count);
    }

    return result;
  }
}

/**
 * Convenience function to seed database
 */
export async function seedDatabase(
  db: DatabaseService,
  config?: Partial<SeedConfig>
): Promise<void> {
  const seeder = new DatabaseSeeder(db);
  await seeder.seed(config);
}