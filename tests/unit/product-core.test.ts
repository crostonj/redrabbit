/**
 * Product Repository Core Tests
 * 
 * Testing the actual methods available in ProductRepository
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { ProductRepository } from '../../src/repositories/product.js';
import type { 
  CreateProductData, 
  UpdateProductData,
  CreateCategoryData,
  PaginationOptions,
  SearchOptions
} from '../../src/repositories/interfaces.js';
import { 
  MockDatabaseService, 
  MockQueryResult, 
  TestDataGenerator
} from './utils/database-mocks.js';

describe('ProductRepository - Core Tests', () => {
  let mockDb: MockDatabaseService;
  let productRepo: ProductRepository;

  function setupTest() {
    mockDb = new MockDatabaseService();
    productRepo = new ProductRepository(mockDb as any);
    mockDb.clear();
  }

  test('create - successfully creates a product', async () => {
    setupTest();
    
    const createData: CreateProductData = {
      sku: 'TEST-001',
      name: 'Test Product',
      description: 'A test product',
      categoryId: 'cat_12345678901234567890',
      price: 29.99,
      costPrice: 15.50,
      stock: 100
    };

    const mockRow = TestDataGenerator.productRow({
      sku: 'TEST-001',
      name: 'Test Product',
      price: '29.99',
      cost_price: '15.50',
      stock: '100'
    });

    // Mock SKU existence check (should return empty)
    mockDb.mockQueryPattern(/^select \* from products.*where sku = \$1/i, MockQueryResult.empty());
    // Mock the insert query
    mockDb.mockQueryPattern(/^insert into products/i, MockQueryResult.single(mockRow));

    const result = await productRepo.create(createData);
    
    assert.equal(result.sku, 'TEST-001');
    assert.equal(result.name, 'Test Product');
    assert.equal(result.price, 29.99);
    
    console.log('✅ Product create test passed');
  });

  test('findBySku - returns product when found', async () => {
    setupTest();
    
    const sku = 'TEST-001';
    const mockRow = TestDataGenerator.productRow({ sku });

    mockDb.mockQueryPattern(/^select \* from products.*where sku = \$1/i, 
      MockQueryResult.single(mockRow));

    const result = await productRepo.findBySku(sku);

    assert(result !== null);
    assert.equal(result.sku, sku);
    
    console.log('✅ Product findBySku test passed');
  });

  test('findBySku - returns null when not found', async () => {
    setupTest();
    
    const sku = 'NONEXISTENT';
    
    mockDb.mockQueryPattern(/^select \* from products.*where sku = \$1/i, 
      MockQueryResult.empty());

    const result = await productRepo.findBySku(sku);

    assert.equal(result, null);
    
    console.log('✅ Product findBySku null test passed');
  });

  test('findByCategory - returns products in category', async () => {
    setupTest();
    
    const categoryId = 'cat_12345678901234567890';
    const mockRows = [
      TestDataGenerator.productRow({ category_id: categoryId, name: 'Product A' }),
      TestDataGenerator.productRow({ category_id: categoryId, name: 'Product B' })
    ];

    // Mock the main query
    mockDb.mockQueryPattern(/^select \* from products.*category_id = \$1/i, 
      MockQueryResult.multiple(mockRows));
    
    // Mock the count query
    mockDb.mockQueryPattern(/^select count\(\*\) from products/i, 
      MockQueryResult.count(2));

    const options: PaginationOptions = { page: 1, limit: 10 };
    const result = await productRepo.findByCategory(categoryId, options);

    assert.equal(result.data.length, 2);
    assert.equal(result.total, 2);
    assert.equal(result.data[0].categoryId, categoryId);
    
    console.log('✅ Product findByCategory test passed');
  });

  test('findFeatured - returns featured products', async () => {
    setupTest();
    
    const limit = 5;
    const mockProducts = [
      TestDataGenerator.productRow({ name: 'Featured A', is_featured: true }),
      TestDataGenerator.productRow({ name: 'Featured B', is_featured: true })
    ];

    mockDb.mockQueryPattern(/where is_featured = true.*limit/i, MockQueryResult.multiple(mockProducts));

    const result = await productRepo.findFeatured(limit);

    assert.equal(result.length, 2);
    assert.equal(result[0].isFeatured, true);
    
    console.log('✅ Product findFeatured test passed');
  });

  test('getLowStockProducts - returns products below threshold', async () => {
    setupTest();
    
    const threshold = 10;
    const mockProducts = [
      TestDataGenerator.productRow({ name: 'Low Stock A', stock: '2', min_stock: '5' }),
      TestDataGenerator.productRow({ name: 'Low Stock B', stock: '1', min_stock: '10' })
    ];

    // More specific pattern for low stock query
    mockDb.mockQueryPattern(/^select \* from products.*where.*stock.*order by/i, MockQueryResult.multiple(mockProducts));

    const result = await productRepo.getLowStockProducts(threshold);

    assert.equal(result.length, 2);
    assert(result[0].stock < threshold);
    
    console.log('✅ Product getLowStockProducts test passed');
  });

  test('checkStock - returns current stock level', async () => {
    setupTest();
    
    const productId = 'prod_12345678901234567890';
    
    mockDb.mockQueryPattern(/^select stock from products.*where id = \$1/i, 
      MockQueryResult.single({ stock: '25' }));

    const result = await productRepo.checkStock(productId);

    assert.equal(result, 25);
    
    console.log('✅ Product checkStock test passed');
  });

  test('updateStock - updates product stock with reason', async () => {
    setupTest();
    
    const productId = 'prod_12345678901234567890';
    const quantity = 50;
    const reason = 'Restock';

    // Mock finding the current product
    const currentProduct = TestDataGenerator.productRow({ id: productId, stock: '100' });
    mockDb.mockQueryPattern(/^select \* from products.*where id = \$1/i, 
      MockQueryResult.single(currentProduct));

    // Mock stock update
    const updatedProduct = TestDataGenerator.productRow({ id: productId, stock: '150' });
    mockDb.mockQueryPattern(/^update products.*set stock/i, MockQueryResult.single(updatedProduct));

    // Mock inventory movement insert
    const movementRow = TestDataGenerator.inventoryMovementRow({
      product_id: productId,
      quantity: quantity,
      reason
    });
    mockDb.mockQueryPattern(/^insert into inventory_movements/i, MockQueryResult.single(movementRow));

    const result = await productRepo.updateStock(productId, quantity, reason);

    assert(result !== null);
    assert.equal(result.stock, 150);
    
    console.log('✅ Product updateStock test passed');
  });

  test('createCategory - creates new category', async () => {
    setupTest();
    
    const createData: CreateCategoryData = {
      name: 'Electronics',
      description: 'Electronic devices',
      slug: 'electronics'
    };

    const mockRow = TestDataGenerator.categoryRow({
      name: 'Electronics',
      description: 'Electronic devices',
      slug: 'electronics'
    });

    // Mock slug uniqueness check
    mockDb.mockQueryPattern(/^select \* from categories.*where slug = \$1/i, MockQueryResult.empty());
    // Mock the insert query
    mockDb.mockQueryPattern(/^insert into categories/i, MockQueryResult.single(mockRow));

    const result = await productRepo.createCategory(createData);

    assert.equal(result.name, 'Electronics');
    assert.equal(result.slug, 'electronics');
    
    console.log('✅ Category create test passed');
  });

  test('getCategories - returns all categories', async () => {
    setupTest();
    
    const mockCategories = [
      TestDataGenerator.categoryRow({ name: 'Electronics' }),
      TestDataGenerator.categoryRow({ name: 'Clothing' })
    ];

    // More specific pattern for categories query  
    mockDb.mockQueryPattern(/^select \* from categories.*order by/i, 
      MockQueryResult.multiple(mockCategories));

    const result = await productRepo.getCategories();

    assert.equal(result.length, 2);
    assert.equal(result[0].name, 'Electronics');
    
    console.log('✅ Category getCategories test passed');
  });

  console.log('🧪 Product repository core tests completed!');
});