/**
 * Database Mocking Utilities
 * 
 * Provides comprehensive mocking capabilities for testing repository layers
 * without requiring actual database connections. Includes query result mocking,
 * transaction handling, and error simulation.
 */

import type { QueryResult, QueryResultRow } from 'pg';

/**
 * Mock database result builder
 */
export class MockQueryResult<T extends QueryResultRow = any> implements QueryResult<T> {
  rows: T[];
  command: string;
  rowCount: number | null;
  oid: number;
  fields: any[];

  constructor(rows: T[] = []) {
    this.rows = rows;
    this.command = 'SELECT';
    this.rowCount = rows.length;
    this.oid = 0;
    this.fields = [];
  }

  static empty<T extends QueryResultRow>(): MockQueryResult<T> {
    return new MockQueryResult<T>([]);
  }

  static single<T extends QueryResultRow>(row: T): MockQueryResult<T> {
    return new MockQueryResult<T>([row]);
  }

  static multiple<T extends QueryResultRow>(rows: T[]): MockQueryResult<T> {
    return new MockQueryResult<T>(rows);
  }

  static count(count: number): MockQueryResult<{ count: string }> {
    return new MockQueryResult([{ count: count.toString() }]);
  }
}

/**
 * Database service mock with comprehensive query tracking
 */
export class MockDatabaseService {
  private queryMocks: Map<string, MockQueryResult | Promise<any>> = new Map();
  private queryHistory: Array<{ query: string; params: any[] }> = [];
  private transactionActive = false;

  /**
   * Mock a specific query with expected result
   */
  mockQuery(query: string, result: MockQueryResult): void {
    this.queryMocks.set(this.normalizeQuery(query), result);
  }

  /**
   * Mock query by pattern matching
   */
  mockQueryPattern(pattern: RegExp, result: MockQueryResult | Promise<any>): void {
    // Ensure pattern has case-insensitive flag
    const flags = pattern.flags.includes('i') ? pattern.flags : pattern.flags + 'i';
    const caseInsensitivePattern = new RegExp(pattern.source, flags);
    this.queryMocks.set(`pattern:${caseInsensitivePattern.source}`, result);
  }

  /**
   * Get query execution history
   */
  getQueryHistory(): Array<{ query: string; params: any[] }> {
    return [...this.queryHistory];
  }

  /**
   * Get the last executed query
   */
  getLastQuery(): { query: string; params: any[] } | null {
    return this.queryHistory[this.queryHistory.length - 1] || null;
  }

  /**
   * Check if a query was executed
   */
  wasQueryExecuted(query: string): boolean {
    const normalized = this.normalizeQuery(query);
    return this.queryHistory.some(entry => this.normalizeQuery(entry.query) === normalized);
  }

  /**
   * Check if a query pattern was executed
   */
  wasQueryPatternExecuted(pattern: RegExp): boolean {
    return this.queryHistory.some(entry => pattern.test(entry.query));
  }

  /**
   * Clear query history and mocks
   */
  clear(): void {
    this.queryHistory = [];
    this.queryMocks.clear();
    this.transactionActive = false;
  }

  /**
   * Mock query method
   */
  async query(query: string, params: any[] = []): Promise<MockQueryResult> {
    this.queryHistory.push({ query, params });

    const normalized = this.normalizeQuery(query);
    
    // Check for exact match
    if (this.queryMocks.has(normalized)) {
      const result = this.queryMocks.get(normalized)!;
      // If it's a promise (likely a rejection), await it
      if (result instanceof Promise) {
        return await result;
      }
      return result;
    }

    // Check for pattern match
    const entries = Array.from(this.queryMocks.entries());
    for (const [key, result] of entries) {
      if (key.startsWith('pattern:')) {
        const pattern = new RegExp(key.substring(8), 'i');
        if (pattern.test(query) || pattern.test(normalized)) {
          // If it's a promise (likely a rejection), await it
          if (result instanceof Promise) {
            return await result;
          }
          return result;
        }
      }
    }

    // Default empty result
    return MockQueryResult.empty();
  }

  /**
   * Mock transaction methods
   */
  async withTransaction<T>(callback: (client: any) => Promise<T>): Promise<T> {
    this.transactionActive = true;
    try {
      const result = await callback(this);
      return result;
    } finally {
      this.transactionActive = false;
    }
  }

  async withConnection<T>(callback: (client: any) => Promise<T>): Promise<T> {
    return await callback(this);
  }
  /**
   * Check if transaction is active
   */
  isInTransaction(): boolean {
    return this.transactionActive;
  }

  /**
   * Normalize query for comparison (remove extra whitespace, etc.)
   */
  private normalizeQuery(query: string): string {
    return query
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }
}

/**
 * Sample data generators for testing
 */
export class TestDataGenerator {
  /**
   * Generate customer database row
   */
  static customerRow(overrides: Partial<any> = {}): any {
    return {
      id: 'cust_12345678901234567890',
      email: 'test@example.com',
      first_name: 'John',
      last_name: 'Doe',
      phone: '+1-555-123-4567',
      date_of_birth: '1990-01-15',
      metadata: { source: 'test' },
      created_at: '2023-01-15T10:00:00Z',
      updated_at: '2023-01-15T10:00:00Z',
      deleted_at: null,
      ...overrides
    };
  }

  /**
   * Generate product database row
   */
  static productRow(overrides: Partial<any> = {}): any {
    return {
      id: 'prod_12345678901234567890',
      name: 'Test Product',
      description: 'A test product for unit testing',
      sku: 'TEST-SKU-001',
      price: '29.99', // Keep as string like database
      cost_price: '15.00',
      stock: '100',
      min_stock: '10',
      max_stock: '1000',
      category_id: 'cat_12345678901234567890',
      weight: null,
      dimensions: null,
      images: [],
      tags: ['test'],
      is_active: true,
      is_featured: false,
      metadata: { test: true },
      created_at: '2023-01-15T10:00:00Z',
      updated_at: '2023-01-15T10:00:00Z',
      deleted_at: null,
      ...overrides
    };
  }

  /**
   * Generate order database row
   */
  static orderRow(overrides: Partial<any> = {}): any {
    return {
      id: 'ord_12345678901234567890',
      customer_id: 'cust_12345678901234567890',
      status: 'pending',
      subtotal_amount: 2999,
      tax_amount: 240,
      shipping_amount: 500,
      total_amount: 3739,
      currency: 'USD',
      shipping_address_id: 'addr_12345678901234567890',
      billing_address_id: 'addr_12345678901234567890',
      payment_method: 'credit_card',
      notes: null,
      created_at: '2023-01-15T10:00:00Z',
      updated_at: '2023-01-15T10:00:00Z',
      deleted_at: null,
      ...overrides
    };
  }

  /**
   * Generate address database row
   */
  static addressRow(overrides: Partial<any> = {}): any {
    return {
      id: 'addr_12345678901234567890',
      customer_id: 'cust_12345678901234567890',
      type: 'shipping',
      street1: '123 Main Street',
      street2: null,
      city: 'New York',
      state: 'NY',
      zip_code: '10001',
      country: 'US',
      is_default: true,
      created_at: '2023-01-15T10:00:00Z',
      updated_at: '2023-01-15T10:00:00Z',
      ...overrides
    };
  }

  /**
   * Generate multiple rows with variations
   */
  static multipleRows<T>(generator: (overrides?: Partial<any>) => T, count: number, baseOverrides: Partial<any> = {}): T[] {
    return Array.from({ length: count }, (_, index) => 
      generator({ 
        ...baseOverrides,
        id: `${baseOverrides.id || 'test'}_${index.toString().padStart(20, '0')}`,
      })
    );
  }

  /**
   * Generate a category database row
   */
  static categoryRow(overrides: any = {}): any {
    return {
      id: overrides.id || 'cat_12345678901234567890',
      name: overrides.name || 'Test Category',
      description: overrides.description || 'A test category',
      slug: overrides.slug || 'test-category',
      parent_id: overrides.parent_id || null,
      is_active: overrides.is_active ?? true,
      metadata: overrides.metadata || {},
      created_at: overrides.created_at || new Date('2023-01-15T10:00:00Z'),
      updated_at: overrides.updated_at || new Date('2023-01-15T10:00:00Z'),
      deleted_at: overrides.deleted_at || null
    };
  }

  /**
   * Generate an inventory movement database row
   */
  static inventoryMovementRow(overrides: any = {}): any {
    return {
      id: overrides.id || 'mov_12345678901234567890',
      product_id: overrides.product_id || 'prod_12345678901234567890',
      type: overrides.type || 'adjustment',
      quantity: overrides.quantity || 1,
      previous_stock: overrides.previous_stock || 100,
      new_stock: overrides.new_stock || 101,
      reference_type: overrides.reference_type || null,
      reference_id: overrides.reference_id || null,
      reason: overrides.reason || 'Test movement',
      metadata: overrides.metadata || {},
      created_at: overrides.created_at || new Date('2023-01-15T10:00:00Z')
    };
  }

  /**
   * Generate paginated result structure
   */
  static paginatedResult<T>(data: T[], page: number = 1, limit: number = 10, total?: number): {
    data: T[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  } {
    const actualTotal = total ?? data.length;
    const totalPages = Math.ceil(actualTotal / limit);
    
    return {
      data,
      total: actualTotal,
      page,
      limit,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1
    };
  }
}

/**
 * Error simulation utilities
 */
export class MockDatabaseError extends Error {
  code: string;
  
  constructor(message: string, code: string = 'MOCK_ERROR') {
    super(message);
    this.name = 'MockDatabaseError';
    this.code = code;
  }

  static uniqueViolation(constraint: string): MockDatabaseError {
    return new MockDatabaseError(
      `duplicate key value violates unique constraint "${constraint}"`,
      '23505'
    );
  }

  static foreignKeyViolation(constraint: string): MockDatabaseError {
    return new MockDatabaseError(
      `insert or update on table violates foreign key constraint "${constraint}"`,
      '23503'
    );
  }

  static notNullViolation(column: string): MockDatabaseError {
    return new MockDatabaseError(
      `null value in column "${column}" violates not-null constraint`,
      '23502'
    );
  }

  static connectionError(): MockDatabaseError {
    return new MockDatabaseError(
      'connection terminated',
      'ECONNRESET'
    );
  }
}

/**
 * Assertion helpers for repository testing
 */
export class RepositoryTestAssertions {
  /**
   * Assert that a query was executed with specific parameters
   */
  static assertQueryExecuted(
    mockDb: MockDatabaseService, 
    expectedQuery: string, 
    expectedParams?: any[]
  ): void {
    const history = mockDb.getQueryHistory();
    const normalized = expectedQuery.replace(/\s+/g, ' ').trim().toLowerCase();
    
    const found = history.find(entry => 
      entry.query.replace(/\s+/g, ' ').trim().toLowerCase() === normalized
    );
    
    if (!found) {
      throw new Error(
        `Expected query not found: ${expectedQuery}\n` +
        `Executed queries: ${history.map(h => h.query).join(', ')}`
      );
    }
    
    if (expectedParams && JSON.stringify(found.params) !== JSON.stringify(expectedParams)) {
      throw new Error(
        `Query parameters mismatch.\n` +
        `Expected: ${JSON.stringify(expectedParams)}\n` +
        `Actual: ${JSON.stringify(found.params)}`
      );
    }
  }

  /**
   * Assert that a query pattern was executed
   */
  static assertQueryPatternExecuted(
    mockDb: MockDatabaseService, 
    pattern: RegExp
  ): void {
    if (!mockDb.wasQueryPatternExecuted(pattern)) {
      const history = mockDb.getQueryHistory();
      throw new Error(
        `Expected query pattern not found: ${pattern}\n` +
        `Executed queries: ${history.map(h => h.query).join(', ')}`
      );
    }
  }

  /**
   * Assert query count
   */
  static assertQueryCount(
    mockDb: MockDatabaseService, 
    expectedCount: number
  ): void {
    const actualCount = mockDb.getQueryHistory().length;
    if (actualCount !== expectedCount) {
      throw new Error(
        `Expected ${expectedCount} queries, but ${actualCount} were executed`
      );
    }
  }
}

console.log('🔧 Database mocking utilities loaded successfully!');