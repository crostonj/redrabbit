import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { CustomerRepository } from '../../src/repositories/customer.js';
import { type CreateCustomerData, type UpdateCustomerData, type CreateAddressData, AddressType, type Address } from '../../src/repositories/interfaces.js';
import { NotFoundError } from '../../src/repositories/base.js';

/**
 * Simplified mock for the database service to avoid hanging and simplify tests.
 * This version uses a queue for query responses.
 */
class SimpleMockDatabase {
  queryResponses: any[] = [];
  queries: { sql: string, params: any[] }[] = [];
  
  // Adds a response to the queue for the next query
  setNextResponse(response: any, rowCount?: number) {
    const count = rowCount !== undefined ? rowCount : (Array.isArray(response) ? response.length : 0);
    this.queryResponses.push({ rows: response, rowCount: count });
  }

  // The query method that the repository will call
  async query(sql: string, params: any[] = []) {
    this.queries.push({ sql, params });
    
    if (this.queryResponses.length > 0) {
      return this.queryResponses.shift();
    }
    
    return { rows: [], rowCount: 0 };
  }

  // Special method for transactions
  async withTransaction(callback: (client: any) => Promise<any>) {
    // The 'client' here is just the mock database itself,
    // allowing repository methods to call `client.query`.
    return callback(this);
  }
}

describe('CustomerRepository Simplified Tests', () => {
  let mockDb: SimpleMockDatabase;
  let customerRepo: CustomerRepository;

  beforeEach(() => {
    mockDb = new SimpleMockDatabase();
    customerRepo = new CustomerRepository(mockDb as any);
  });

  test('create - successfully creates a new customer', async () => {
    const createData: CreateCustomerData = {
      email: 'john.doe@example.com',
      firstName: 'John',
      lastName: 'Doe',
    };

    const newCustomer = { id: 'cust_123', ...createData };

    // Mock for the existence check (customer does not exist)
    mockDb.setNextResponse([]);
    // Mock for the INSERT query
    mockDb.setNextResponse([newCustomer]);

    const result = await customerRepo.create(createData);

    assert.ok(result, 'Create should return a result');
    assert.strictEqual(result.email, 'john.doe@example.com');
    assert.strictEqual(mockDb.queries.length, 2);
    assert.match(mockDb.queries[0].sql, /SELECT/i);
    assert.match(mockDb.queries[1].sql, /INSERT/i);
  });

  test('findById - returns customer when found', async () => {
    const customerId = 'cust_123';
    const customerData = { id: customerId, email: 'found@example.com' };
    mockDb.setNextResponse([customerData]);

    const result = await customerRepo.findById(customerId);

    assert.ok(result);
    assert.strictEqual(result.id, customerId);
  });

  test('findById - returns null when not found', async () => {
    mockDb.setNextResponse([]);
    const result = await customerRepo.findById('cust_not_found');
    assert.strictEqual(result, null);
  });

  test('update - successfully updates a customer', async () => {
    const customerId = 'cust_123';
    const updateData: UpdateCustomerData = { firstName: 'Jane' };
    const updatedCustomer = { id: customerId, first_name: 'Jane' }; // Use snake_case for mock DB row
    mockDb.setNextResponse([updatedCustomer]);

    const result = await customerRepo.update(customerId, updateData);

    assert.ok(result);
    assert.strictEqual(result.firstName, 'Jane');
    assert.match(mockDb.queries[0].sql, /UPDATE/i);
  });

  test('delete - returns true on successful deletion', async () => {
    const customerId = 'cust_123';
    // Mock a successful deletion (rowCount = 1)
    mockDb.setNextResponse([], 1);

    const result = await customerRepo.delete(customerId);

    assert.strictEqual(result, true);
    assert.match(mockDb.queries[0].sql, /DELETE/i);
  });

  test('addAddress - should throw NotFoundError if customer does not exist', async () => {
    const addressData: CreateAddressData = {
      type: AddressType.SHIPPING,
      street1: '123 Main St',
      city: 'Anytown',
      state: 'CA',
      zipCode: '12345',
      country: 'US',
    };

    // Mock for the customer existence check inside the transaction
    mockDb.setNextResponse([]);

    await assert.rejects(
      customerRepo.addAddress('cust_not_found', addressData),
      (err: any) => {
        assert(err instanceof NotFoundError);
        assert.strictEqual(err.message, 'Customer with ID cust_not_found not found');
        return true;
      }
    );
  });

  test('addAddress - successfully adds an address', async () => {
    const customerId = 'cust_123';
    const addressData: CreateAddressData = {
      street1: '123 Main St',
      city: 'Anytown',
      state: 'CA',
      zipCode: '12345',
      country: 'US',
      type: AddressType.SHIPPING,
    };

    const newAddressId = 'addr_abc';
    const addressRow = {
      address_id: newAddressId,
      customer_id: customerId,
      address_line_1: addressData.street1,
      address_line_2: null,
      city: addressData.city,
      state: addressData.state,
      zip_code: addressData.zipCode,
      country: addressData.country,
      address_type: addressData.type,
      is_default: false,
      created_at: new Date(),
      updated_at: new Date(),
    };
    
    // Mock for the customer existence check
    mockDb.setNextResponse([{ id: customerId }]);
    // Mock for the address insertion
    mockDb.setNextResponse([addressRow]);

    const result = await customerRepo.addAddress(customerId, addressData);

    assert.ok(result);
    assert.strictEqual(result.id, newAddressId);
    assert.strictEqual(result.street1, addressData.street1);
  });

  test('delete - successfully deletes a customer', async () => {
    const customerId = 'cust_123';
    // Mock a successful deletion (rowCount = 1)
    mockDb.setNextResponse([], 1);

    const result = await customerRepo.delete(customerId);

    assert.strictEqual(result, true);
    assert.match(mockDb.queries[0].sql, /DELETE/i);
  });
});