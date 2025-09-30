/**
 * Simple debug test for database mocking
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

describe('Debug Database Mocking', () => {
  test('simple mock test', async () => {
    const mockDb = new MockDatabaseService();
    const customerRepo = new CustomerRepository(mockDb as any);

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

    console.log('🎯 Setting up mock for INSERT pattern');
    mockDb.mockQueryPattern(/^insert into customers/i, MockQueryResult.single(mockRow));

    console.log('🚀 Attempting customer creation');
    try {
      const result = await customerRepo.create(createData);
      console.log('✅ Customer created:', result);
      assert.equal(result.email, 'test@example.com');
    } catch (error) {
      console.error('❌ Error during creation:', error);
      throw error;
    }
  });

  console.log('🧪 Database mocking debug test completed!');
});