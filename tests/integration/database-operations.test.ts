import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import { Client } from 'pg';
import { getConfig } from '../../src/config/env.js';
import { DatabaseService } from '../../src/services/database.js';

/**
 * Integration Test: Database Operations
 * 
 * Tests database service integration:
 * - Connection pooling and management
 * - Transaction handling
 * - Data consistency and integrity
 * - Performance under load
 * - Error handling and recovery
 */

// Attempt a lightweight connection probe; if it fails, skip the whole suite gracefully.
let skipSuite = false;
if (process.env.FORCE_SKIP_DB_TESTS === 'true') {
  skipSuite = true;
} else {
  const databaseUrl = process.env.DATABASE_URL || 'postgresql://postgres:password@localhost:5432/orders_test';
  // Top-level await (ESM) probe
  try {
    const probe = new Client({ connectionString: databaseUrl, connectionTimeoutMillis: 500 });
    await probe.connect();
    await probe.end();
  } catch {
    skipSuite = true;
    console.warn('[database-operations.test] Skipping database integration tests (PostgreSQL not reachable). Set FORCE_SKIP_DB_TESTS=false and ensure DB is running to enable.');
  }
}

describe('Database Integration Tests', { skip: skipSuite }, () => {
  let dbClient: Client;
  let dbService: DatabaseService;

  before(async () => {
    const config = getConfig();
    dbClient = new Client({
      connectionString: config.DATABASE_URL.replace('orders_development', 'orders_test')
    });
    await dbClient.connect();
    
    // Initialize database service
    dbService = new DatabaseService();
    await dbService.initialize();

    // Clean up any existing test data
    await cleanupTestData();
  });

  after(async () => {
    await cleanupTestData();
    await dbService.close();
    await dbClient.end();
  });

  async function cleanupTestData() {
    const tables = ['order_events', 'payments', 'inventory_reservations', 'order_line_items', 'orders', 'customers', 'products'];
    for (const table of tables) {
      await dbClient.query(`DELETE FROM ${table} WHERE id LIKE 'db_test_%' OR customer_id LIKE 'db_test_%' OR order_id LIKE 'db_test_%'`);
    }
  }

  test('should handle database connections properly', async () => {
    // Test getting a connection from the pool
    const connection = await dbService.getConnection();
    assert.ok(connection);

    // Test basic query
    const result = await connection.query('SELECT NOW() as current_time');
    assert.strictEqual(result.rows.length, 1);
    assert.ok(result.rows[0].current_time);

    // Test releasing connection back to pool
    await dbService.releaseConnection(connection);
  });

  test('should handle transactions correctly', async () => {
    const testCustomerId = 'db_test_customer_001';
    const testProductId = 'db_test_product_001';
    const testOrderId = 'db_test_order_001';

    try {
      await dbService.withTransaction(async (client) => {
        // Insert customer
        await client.query(
          'INSERT INTO customers (id, name, email, created_at, updated_at) VALUES ($1, $2, $3, NOW(), NOW())',
          [testCustomerId, 'DB Test Customer', 'dbtest@example.com']
        );

        // Insert product
        await client.query(
          'INSERT INTO products (id, name, price, inventory_count, created_at, updated_at) VALUES ($1, $2, $3, $4, NOW(), NOW())',
          [testProductId, 'DB Test Product', 49.99, 100]
        );

        // Insert order
        await client.query(
          'INSERT INTO orders (id, customer_id, status, subtotal, tax, total, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())',
          [testOrderId, testCustomerId, 'pending', 49.99, 5.00, 54.99]
        );

        // Insert order line item
        await client.query(
          'INSERT INTO order_line_items (id, order_id, product_id, quantity, unit_price, total_price, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())',
          ['db_test_item_001', testOrderId, testProductId, 1, 49.99, 49.99]
        );
      });

      // Verify all data was committed
      const customerResult = await dbClient.query('SELECT * FROM customers WHERE id = $1', [testCustomerId]);
      assert.strictEqual(customerResult.rows.length, 1);

      const orderResult = await dbClient.query('SELECT * FROM orders WHERE id = $1', [testOrderId]);
      assert.strictEqual(orderResult.rows.length, 1);

      const itemResult = await dbClient.query('SELECT * FROM order_line_items WHERE order_id = $1', [testOrderId]);
      assert.strictEqual(itemResult.rows.length, 1);

    } catch (error) {
      const e = error as Error;
      assert.fail(`Transaction should have succeeded: ${e.message}`);
    }
  });

  test('should rollback transactions on errors', async () => {
    const testCustomerId = 'db_test_customer_rollback';
    
    try {
      await dbService.withTransaction(async (client) => {
        // Insert customer
        await client.query(
          'INSERT INTO customers (id, name, email, created_at, updated_at) VALUES ($1, $2, $3, NOW(), NOW())',
          [testCustomerId, 'Rollback Test Customer', 'rollback@example.com']
        );

        // This should cause a constraint violation and rollback
        await client.query(
          'INSERT INTO orders (id, customer_id, status, total) VALUES ($1, $2, $3, $4)',
          ['db_test_order_rollback', 'nonexistent_customer', 'pending', 100.00]
        );
      });

      assert.fail('Transaction should have failed');
    } catch (error) {
      const e = error as Error;
      assert.ok(e.message.includes('foreign key') || e.message.includes('constraint'));
    }

    // Verify customer was not inserted (transaction rolled back)
    const customerResult = await dbClient.query('SELECT * FROM customers WHERE id = $1', [testCustomerId]);
    assert.strictEqual(customerResult.rows.length, 0);
  });

  test('should handle concurrent transactions safely', async () => {
    const productId = 'db_test_product_concurrent';
    const initialInventory = 10;

    // Set up test product
    await dbClient.query(
      'INSERT INTO products (id, name, price, inventory_count, created_at, updated_at) VALUES ($1, $2, $3, $4, NOW(), NOW())',
      [productId, 'Concurrent Test Product', 25.00, initialInventory]
    );

    // Simulate concurrent inventory updates
    const concurrentUpdates = Array(5).fill(null).map((_, index) => 
      dbService.withTransaction(async (client) => {
        // Read current inventory
        const result = await client.query(
          'SELECT inventory_count FROM products WHERE id = $1 FOR UPDATE',
          [productId]
        );
        
        const currentInventory = result.rows[0].inventory_count;
        
        if (currentInventory > 0) {
          // Simulate some processing time
          await new Promise(resolve => setTimeout(resolve, 10));
          
          // Update inventory
          await client.query(
            'UPDATE products SET inventory_count = inventory_count - 1, updated_at = NOW() WHERE id = $1',
            [productId]
          );
          
          return currentInventory - 1;
        }
        
        return currentInventory;
      })
    );

    const results = await Promise.all(concurrentUpdates);
    
    // Check final inventory count
    const finalResult = await dbClient.query('SELECT inventory_count FROM products WHERE id = $1', [productId]);
    const finalInventory = finalResult.rows[0].inventory_count;
    
    // Should be reduced by the number of successful transactions
    const successfulUpdates = results.filter(r => r >= 0).length;
    assert.strictEqual(finalInventory, initialInventory - successfulUpdates);
    assert.ok(finalInventory >= 0); // Should never go negative
  });

  test('should handle connection pool exhaustion gracefully', async () => {
    const maxConnections = 5; // Assume small pool for testing
    const promises = [];

    // Try to exhaust the connection pool
    for (let i = 0; i < maxConnections + 2; i++) {
      promises.push(
        dbService.withConnection(async (client) => {
          await client.query('SELECT pg_sleep(0.1)'); // Small delay
          return i;
        })
      );
    }

    // All promises should eventually resolve
    const results = await Promise.all(promises);
    assert.strictEqual(results.length, maxConnections + 2);
  });

  test('should handle database connection failures', async () => {
    // Create a service with invalid connection string
    const badDbService = new DatabaseService({
      connectionString: 'postgresql://invalid:invalid@nonexistent:5432/nonexistent'
    });

    try {
      await badDbService.initialize();
      assert.fail('Should have failed to connect to invalid database');
    } catch (error) {
      const e = error as Error;
      assert.ok(e.message.includes('connect') || e.message.includes('ENOTFOUND'));
    }
  });

  test('should provide proper query result typing', async () => {
    const testProductId = 'db_test_product_typing';
    
    await dbClient.query(
      'INSERT INTO products (id, name, price, inventory_count, created_at, updated_at) VALUES ($1, $2, $3, $4, NOW(), NOW())',
      [testProductId, 'Typing Test Product', 15.99, 25]
    );

    const result = await dbService.withConnection(async (client) => {
      return await client.query(
        'SELECT id, name, price, inventory_count FROM products WHERE id = $1',
        [testProductId]
      );
    });

    assert.strictEqual(result.rows.length, 1);
    
    const product = result.rows[0];
    assert.strictEqual(product.id, testProductId);
    assert.strictEqual(product.name, 'Typing Test Product');
    assert.strictEqual(parseFloat(product.price), 15.99);
    assert.strictEqual(product.inventory_count, 25);
  });

  test('should handle database constraints and validation', async () => {
    // Test unique constraint violation
    const duplicateId = 'db_test_duplicate';
    
    await dbClient.query(
      'INSERT INTO customers (id, name, email, created_at, updated_at) VALUES ($1, $2, $3, NOW(), NOW())',
      [duplicateId, 'First Customer', 'first@example.com']
    );

    try {
      await dbClient.query(
        'INSERT INTO customers (id, name, email, created_at, updated_at) VALUES ($1, $2, $3, NOW(), NOW())',
        [duplicateId, 'Second Customer', 'second@example.com']
      );
      assert.fail('Should have failed due to duplicate key');
    } catch (error) {
      const e = error as Error;
      assert.ok(e.message.includes('duplicate') || e.message.includes('unique'));
    }

    // Test NOT NULL constraint
    try {
      await dbClient.query(
        'INSERT INTO customers (id, created_at, updated_at) VALUES ($1, NOW(), NOW())',
        [null]
      );
      assert.fail('Should have failed due to NULL constraint');
    } catch (error) {
      const e = error as Error;
      assert.ok(e.message.includes('null') || e.message.includes('NOT NULL'));
    }
  });

  test('should maintain referential integrity', async () => {
    const testCustomerId = 'db_test_customer_integrity';
    const testOrderId = 'db_test_order_integrity';

    // Create customer first
    await dbClient.query(
      'INSERT INTO customers (id, name, email, created_at, updated_at) VALUES ($1, $2, $3, NOW(), NOW())',
      [testCustomerId, 'Integrity Test Customer', 'integrity@example.com']
    );

    // Create order referencing the customer
    await dbClient.query(
      'INSERT INTO orders (id, customer_id, status, subtotal, tax, total, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())',
      [testOrderId, testCustomerId, 'pending', 100.00, 10.00, 110.00]
    );

    // Try to delete customer with existing order - should fail
    try {
      await dbClient.query('DELETE FROM customers WHERE id = $1', [testCustomerId]);
      assert.fail('Should have failed due to foreign key constraint');
    } catch (error) {
      const e = error as Error;
      assert.ok(e.message.includes('foreign key') || e.message.includes('constraint'));
    }

    // Verify customer still exists
    const customerResult = await dbClient.query('SELECT * FROM customers WHERE id = $1', [testCustomerId]);
    assert.strictEqual(customerResult.rows.length, 1);
  });

  test('should handle large result sets efficiently', async () => {
    const batchSize = 1000;
    const testProductIds = [];

    // Insert many products
    const insertPromises = [];
    for (let i = 0; i < batchSize; i++) {
      const productId = `db_test_product_batch_${i}`;
      testProductIds.push(productId);
      insertPromises.push(
        dbClient.query(
          'INSERT INTO products (id, name, price, inventory_count, created_at, updated_at) VALUES ($1, $2, $3, $4, NOW(), NOW())',
          [productId, `Batch Product ${i}`, 10.00 + (i * 0.01), 100]
        )
      );
    }

    await Promise.all(insertPromises);

    // Query large result set
    const startTime = Date.now();
    const result = await dbService.withConnection(async (client) => {
      return await client.query(
        'SELECT id, name, price FROM products WHERE id LIKE $1 ORDER BY id LIMIT $2',
        ['db_test_product_batch_%', batchSize]
      );
    });
    const queryTime = Date.now() - startTime;

    assert.strictEqual(result.rows.length, batchSize);
    assert.ok(queryTime < 5000); // Should complete within 5 seconds

    // Verify results are properly ordered
    for (let i = 1; i < result.rows.length; i++) {
      assert.ok(result.rows[i].id >= result.rows[i-1].id);
    }
  });
});