/**
 * Simplified Customer Repository Tests
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { CustomerRepository } from '../../src/repositories/customer.js';
import type { CreateCustomerData } from '../../src/repositories/interfaces.js';
import { 
  MockDatabaseService, 
  MockQueryResult, 
  TestDataGenerator
} from './utils/database-mocks.js';

describe('CustomerRepository - Core Tests', () => {
  let mockDb: MockDatabaseService;
  let customerRepo: CustomerRepository;

  function setupTest() {
    mockDb = new MockDatabaseService();
    customerRepo = new CustomerRepository(mockDb as any);
    mockDb.clear();
  }

  test('create - successfully creates a customer', async () => {
    setupTest();
    
    const createData: CreateCustomerData = {
      email: 'test@example.com',
      firstName: 'Test',
      lastName: 'User'
    };

    const mockRow = TestDataGenerator.customerRow({
      email: 'test@example.com',
      first_name: 'Test',
      last_name: 'User'
    });

    // Mock the existence check (should return empty)
    mockDb.mockQueryPattern(/^select \* from customers.*where email/i, MockQueryResult.empty());
    // Mock the insert query
    mockDb.mockQueryPattern(/^insert into customers/i, MockQueryResult.single(mockRow));

    const result = await customerRepo.create(createData);
    
    assert.equal(result.email, 'test@example.com');
    assert.equal(result.firstName, 'Test');
    assert.equal(result.lastName, 'User');
    
    console.log('✅ Customer create test passed');
  });

  test('findById - returns customer when found', async () => {
    setupTest();
    
    const customerId = 'cust_12345678901234567890';
    const mockRow = TestDataGenerator.customerRow({ id: customerId });

    mockDb.mockQueryPattern(/^select \* from customers.*where id = \$1/i, 
      MockQueryResult.single(mockRow));

    const result = await customerRepo.findById(customerId);

    assert(result !== null);
    assert.equal(result.id, customerId);
    
    console.log('✅ Customer findById test passed');
  });

  test('findById - returns null when not found', async () => {
    setupTest();
    
    const customerId = 'nonexistent_id';
    
    mockDb.mockQueryPattern(/^select \* from customers.*where id = \$1/i, 
      MockQueryResult.empty());

    const result = await customerRepo.findById(customerId);

    assert.equal(result, null);
    
    console.log('✅ Customer findById null test passed');
  });

  test('exists - returns true when customer exists', async () => {
    setupTest();
    
    const customerId = 'cust_12345678901234567890';
    
    mockDb.mockQueryPattern(/^select 1 from customers.*where id = \$1/i, 
      MockQueryResult.single({ exists: 1 }));

    const result = await customerRepo.exists(customerId);

    assert.equal(result, true);
    
    console.log('✅ Customer exists true test passed');
  });

  test('exists - returns false when customer does not exist', async () => {
    setupTest();
    
    const customerId = 'nonexistent_id';
    
    mockDb.mockQueryPattern(/^select 1 from customers.*where id = \$1/i, 
      MockQueryResult.empty());

    const result = await customerRepo.exists(customerId);

    assert.equal(result, false);
    
    console.log('✅ Customer exists false test passed');
  });

  console.log('🧪 Core customer repository tests completed!');
});