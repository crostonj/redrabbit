import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { ProductRepository } from '../../src/repositories/product.js';
import type { CreateProductData } from '../../src/repositories/interfaces.js';

/**
 * Simplified mock for the database service to avoid hanging.
 * This version uses a queue for query responses.
 */
class SimpleMockDatabase {
  queryResponses: any[] = [];
  lastQuery: string = '';
  lastParams: any[] = [];

  // Adds a response to the queue for the next query
  setNextResponse(response: any) {
    this.queryResponses.push({ rows: response, rowCount: Array.isArray(response) ? response.length : 0 });
  }

  // The query method that the repository will call
  async query(sql: string, params: any[] = []) {
    this.lastQuery = sql;
    this.lastParams = params;
    
    // If a response is in the queue, return it
    if (this.queryResponses.length > 0) {
      const response = this.queryResponses.shift(); // Dequeue the next response
      return response;
    }
    
    // Default empty response to prevent hanging
    return { rows: [], rowCount: 0 };
  }
}

describe('ProductRepository Simplified Tests', () => {
  let mockDb: SimpleMockDatabase;
  let productRepo: ProductRepository;

  beforeEach(() => {
    mockDb = new SimpleMockDatabase();
    productRepo = new ProductRepository(mockDb as any);
  });

  test('create - should create a product without hanging', async () => {
    const createData: CreateProductData = {
      sku: 'SIMPLE-001',
      name: 'Simple Product',
      description: 'A product for a simple test',
      categoryId: 'cat_simple',
      price: 10.00,
      costPrice: 5.00,
      stock: 50
    };

    // Mock for the SKU check (returns nothing, so the product doesn't exist)
    mockDb.setNextResponse([]);
    
    // Mock for the INSERT query
    const newProduct = { id: 'prod_simple_123', ...createData };
    mockDb.setNextResponse([newProduct]);

    const result = await productRepo.create(createData);

    // Basic assertion to confirm the method completed
    assert.ok(result, 'Create method should return a result');
    assert.strictEqual(result.sku, 'SIMPLE-001');
  });

  test('findBySku - should find a product without hanging', async () => {
    const sku = 'SIMPLE-001';
    const productData = { id: 'prod_simple_123', sku, name: 'Simple Product' };
    
    mockDb.setNextResponse([productData]);

    const result = await productRepo.findBySku(sku);

    assert.ok(result, 'findBySku should return a result');
    assert.strictEqual(result.sku, sku);
  });

  test('update - should update a product without hanging', async () => {
    const productId = 'prod_simple_123';
    const updateData = { name: 'Updated Simple Product' };
    
    const updatedProduct = { id: productId, ...updateData };
    mockDb.setNextResponse([updatedProduct]);

    const result = await productRepo.update(productId, updateData);

    assert.ok(result, 'Update should return a result');
    assert.strictEqual(result.name, 'Updated Simple Product');
  });

  test('delete - should delete a product without hanging', async () => {
    const productId = 'prod_simple_123';
    
    // Mock a successful deletion (rowCount = 1)
    mockDb.setNextResponse([]); // The query returns nothing
    // Manually adjust the rowCount for the dequeued response
    mockDb.queryResponses[0] = { rows: [], rowCount: 1 };


    const result = await productRepo.delete(productId);

    assert.strictEqual(result, true, 'Delete should return true for success');
  });
});