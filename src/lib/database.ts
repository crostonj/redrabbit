/**
 * Database Utilities
 * Comprehensive database layer with query building, transactions, and type safety
 * 
 * Key Features:
 * - Type-safe query builder with prepared statements
 * - Transaction management with automatic rollback
 * - Connection pooling and health monitoring
 * - Query logging and performance metrics
 * - Retry logic for transient failures
 * - SQL injection prevention
 */

import type { PoolClient, QueryResult, QueryConfig, QueryResultRow } from 'pg';
import { Pool } from 'pg';
import { z } from 'zod';

/**
 * Database Query Types
 */
interface QueryOptions {
  timeout?: number;
  retry?: boolean;
  maxRetries?: number;
  retryDelay?: number;
}

interface QueryMetrics {
  query: string;
  duration: number;
  rowCount: number;
  timestamp: Date;
}

interface TransactionOptions {
  isolationLevel?: 'READ UNCOMMITTED' | 'READ COMMITTED' | 'REPEATABLE READ' | 'SERIALIZABLE';
  readOnly?: boolean;
  deferrable?: boolean;
}

/**
 * Database Error Types
 */
class DatabaseError extends Error {
  constructor(
    message: string,
    public readonly originalError: Error,
    public readonly query?: string,
    public readonly params?: any[]
  ) {
    super(message);
    this.name = 'DatabaseError';
  }
}

class ConnectionError extends DatabaseError {
  constructor(message: string, originalError: Error) {
    super(message, originalError);
    this.name = 'ConnectionError';
  }
}

class QueryTimeoutError extends DatabaseError {
  constructor(message: string, originalError: Error, query?: string) {
    super(message, originalError, query);
    this.name = 'QueryTimeoutError';
  }
}

class TransactionError extends DatabaseError {
  constructor(message: string, originalError: Error) {
    super(message, originalError);
    this.name = 'TransactionError';
  }
}

/**
 * Query Builder for Type-Safe SQL Construction
 */
class QueryBuilder {
  private selectClauses: string[] = [];
  private fromClause: string = '';
  private joinClauses: string[] = [];
  private whereClauses: string[] = [];
  private groupByClauses: string[] = [];
  private havingClauses: string[] = [];
  private orderByClauses: string[] = [];
  private limitClause: string = '';
  private offsetClause: string = '';
  private parameters: any[] = [];
  private paramIndex = 1;

  /**
   * Add SELECT clause
   */
  select(columns: string | string[]): this {
    if (Array.isArray(columns)) {
      this.selectClauses.push(...columns);
    } else {
      this.selectClauses.push(columns);
    }
    return this;
  }

  /**
   * Add FROM clause
   */
  from(table: string): this {
    this.fromClause = table;
    return this;
  }

  /**
   * Add JOIN clause
   */
  join(table: string, condition: string): this {
    this.joinClauses.push(`JOIN ${table} ON ${condition}`);
    return this;
  }

  /**
   * Add LEFT JOIN clause
   */
  leftJoin(table: string, condition: string): this {
    this.joinClauses.push(`LEFT JOIN ${table} ON ${condition}`);
    return this;
  }

  /**
   * Add WHERE clause with parameter binding
   */
  where(condition: string, value?: any): this {
    if (value !== undefined) {
      this.parameters.push(value);
      condition = condition.replace('?', `$${this.paramIndex++}`);
    }
    this.whereClauses.push(condition);
    return this;
  }

  /**
   * Add AND WHERE clause
   */
  andWhere(condition: string, value?: any): this {
    return this.where(condition, value);
  }

  /**
   * Add OR WHERE clause
   */
  orWhere(condition: string, value?: any): this {
    if (value !== undefined) {
      this.parameters.push(value);
      condition = condition.replace('?', `$${this.paramIndex++}`);
    }
    
    if (this.whereClauses.length > 0) {
      const lastCondition = this.whereClauses.pop();
      this.whereClauses.push(`(${lastCondition}) OR (${condition})`);
    } else {
      this.whereClauses.push(condition);
    }
    return this;
  }

  /**
   * Add IN clause with array parameter
   */
  whereIn(column: string, values: any[]): this {
    if (values.length === 0) {
      this.whereClauses.push('FALSE'); // No matches
      return this;
    }

    const placeholders = values.map(() => `$${this.paramIndex++}`).join(', ');
    this.parameters.push(...values);
    this.whereClauses.push(`${column} IN (${placeholders})`);
    return this;
  }

  /**
   * Add BETWEEN clause
   */
  whereBetween(column: string, min: any, max: any): this {
    this.parameters.push(min, max);
    this.whereClauses.push(`${column} BETWEEN $${this.paramIndex++} AND $${this.paramIndex++}`);
    return this;
  }

  /**
   * Add GROUP BY clause
   */
  groupBy(columns: string | string[]): this {
    if (Array.isArray(columns)) {
      this.groupByClauses.push(...columns);
    } else {
      this.groupByClauses.push(columns);
    }
    return this;
  }

  /**
   * Add HAVING clause
   */
  having(condition: string, value?: any): this {
    if (value !== undefined) {
      this.parameters.push(value);
      condition = condition.replace('?', `$${this.paramIndex++}`);
    }
    this.havingClauses.push(condition);
    return this;
  }

  /**
   * Add ORDER BY clause
   */
  orderBy(column: string, direction: 'ASC' | 'DESC' = 'ASC'): this {
    this.orderByClauses.push(`${column} ${direction}`);
    return this;
  }

  /**
   * Add LIMIT clause
   */
  limit(count: number): this {
    this.parameters.push(count);
    this.limitClause = `LIMIT $${this.paramIndex++}`;
    return this;
  }

  /**
   * Add OFFSET clause
   */
  offset(count: number): this {
    this.parameters.push(count);
    this.offsetClause = `OFFSET $${this.paramIndex++}`;
    return this;
  }

  /**
   * Build the complete SQL query
   */
  build(): { query: string; params: any[] } {
    const parts = [];

    // SELECT
    if (this.selectClauses.length > 0) {
      parts.push(`SELECT ${this.selectClauses.join(', ')}`);
    } else {
      parts.push('SELECT *');
    }

    // FROM
    if (!this.fromClause) {
      throw new Error('FROM clause is required');
    }
    parts.push(`FROM ${this.fromClause}`);

    // JOINs
    if (this.joinClauses.length > 0) {
      parts.push(this.joinClauses.join(' '));
    }

    // WHERE
    if (this.whereClauses.length > 0) {
      parts.push(`WHERE ${this.whereClauses.join(' AND ')}`);
    }

    // GROUP BY
    if (this.groupByClauses.length > 0) {
      parts.push(`GROUP BY ${this.groupByClauses.join(', ')}`);
    }

    // HAVING
    if (this.havingClauses.length > 0) {
      parts.push(`HAVING ${this.havingClauses.join(' AND ')}`);
    }

    // ORDER BY
    if (this.orderByClauses.length > 0) {
      parts.push(`ORDER BY ${this.orderByClauses.join(', ')}`);
    }

    // LIMIT
    if (this.limitClause) {
      parts.push(this.limitClause);
    }

    // OFFSET
    if (this.offsetClause) {
      parts.push(this.offsetClause);
    }

    return {
      query: parts.join(' '),
      params: this.parameters
    };
  }
}

/**
 * Advanced Database Service
 */
class DatabaseService {
  private static pool: Pool | null = null;
  private static queryMetrics: QueryMetrics[] = [];
  private static maxMetrics = 1000; // Keep last 1000 queries

  /**
   * Initialize database pool
   */
  static initialize(databaseUrl: string): void {
    if (this.pool) {
      console.warn('Database pool already initialized');
      return;
    }

    this.pool = new Pool({
      connectionString: databaseUrl,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });

    this.pool.on('error', (err) => {
      console.error('Unexpected database pool error:', err);
    });
  }

  /**
   * Get the database pool
   */
  private static getPool(): Pool {
    if (!this.pool) {
      throw new Error('Database pool not initialized. Call DatabaseService.initialize() first.');
    }
    return this.pool;
  }

  /**
   * Execute a query with comprehensive error handling and metrics
   */
  static async query<T extends QueryResultRow = any>(
    queryText: string,
    params: any[] = [],
    options: QueryOptions = {}
  ): Promise<QueryResult<T>> {
    const startTime = Date.now();
    const maxRetries = options.maxRetries ?? 3;
    const retryDelay = options.retryDelay ?? 1000;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const queryConfig: QueryConfig = {
          text: queryText,
          values: params,
        };

        if (options.timeout) {
          // Set query timeout in the connection
          const pool = this.getPool();
          const client = await pool.connect();
          
          try {
            // Set statement timeout for this query
            await client.query(`SET statement_timeout = ${options.timeout}`);
            const result = await client.query<T>(queryConfig);
            
            // Reset statement timeout
            await client.query('SET statement_timeout = 0');
            
            // Record metrics
            this.recordQueryMetrics(queryText, Date.now() - startTime, result.rowCount ?? 0);
            
            return result;
          } finally {
            client.release();
          }
        } else {
          const pool = this.getPool();
          const result = await pool.query<T>(queryText, params);
          
          // Record metrics
          this.recordQueryMetrics(queryText, Date.now() - startTime, result.rowCount ?? 0);
          
          return result;
        }
      } catch (error) {
        lastError = error as Error;

        // Determine if error is retryable
        const isRetryable = this.isRetryableError(lastError);
        
        if (!options.retry || !isRetryable || attempt === maxRetries) {
          throw this.createDatabaseError(lastError, queryText, params);
        }

        // Wait before retry
        await this.delay(retryDelay * attempt);
      }
    }

    throw this.createDatabaseError(lastError!, queryText, params);
  }

  /**
   * Execute multiple queries in a transaction
   */
  static async transaction<T>(
    callback: (tx: TransactionClient) => Promise<T>,
    options: TransactionOptions = {}
  ): Promise<T> {
    const pool = this.getPool();
    const client = await pool.connect();

    try {
      // Start transaction with options
      let beginQuery = 'BEGIN';
      
      if (options.isolationLevel) {
        beginQuery += ` ISOLATION LEVEL ${options.isolationLevel}`;
      }
      
      if (options.readOnly) {
        beginQuery += ' READ ONLY';
      }
      
      if (options.deferrable) {
        beginQuery += ' DEFERRABLE';
      }

      await client.query(beginQuery);

      // Create transaction client wrapper
      const txClient = new TransactionClient(client);
      
      const result = await callback(txClient);
      
      await client.query('COMMIT');
      return result;
      
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        console.error('Failed to rollback transaction:', rollbackError);
      }
      
      throw new TransactionError(
        'Transaction failed: ' + (error as Error).message,
        error as Error
      );
    } finally {
      client.release();
    }
  }

  /**
   * Create a new query builder
   */
  static queryBuilder(): QueryBuilder {
    return new QueryBuilder();
  }

  /**
   * Batch insert with conflict resolution
   */
  static async batchInsert<T extends QueryResultRow = any>(
    table: string,
    columns: string[],
    rows: any[][],
    conflictResolution: 'IGNORE' | 'UPDATE' | 'ERROR' = 'ERROR',
    conflictColumns?: string[]
  ): Promise<QueryResult<T>> {
    if (rows.length === 0) {
      // Create a minimal QueryResult structure for empty case
      return {
        rows: [],
        rowCount: 0,
        command: 'INSERT',
        oid: 0,
        fields: []
      } as QueryResult<T>;
    }

    const columnList = columns.join(', ');
    const valuePlaceholders = rows.map((row, rowIndex) =>
      `(${columns.map((_, colIndex) => `$${rowIndex * columns.length + colIndex + 1}`).join(', ')})`
    ).join(', ');

    let query = `INSERT INTO ${table} (${columnList}) VALUES ${valuePlaceholders}`;

    // Handle conflict resolution
    if (conflictResolution === 'IGNORE') {
      query += ' ON CONFLICT DO NOTHING';
    } else if (conflictResolution === 'UPDATE' && conflictColumns) {
      const updateSet = columns
        .filter(col => !conflictColumns.includes(col))
        .map(col => `${col} = EXCLUDED.${col}`)
        .join(', ');
      
      query += ` ON CONFLICT (${conflictColumns.join(', ')}) DO UPDATE SET ${updateSet}`;
    }

    const params = rows.flat();
    return this.query<T>(query, params);
  }

  /**
   * Paginated query execution
   */
  static async paginate<T extends QueryResultRow = any>(
    queryBuilder: QueryBuilder,
    page: number = 1,
    limit: number = 20
  ): Promise<{
    data: T[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  }> {
    // Count total records
    const countBuilder = new QueryBuilder()
      .select('COUNT(*) as total')
      .from(`(${queryBuilder.build().query}) as subquery`);
    
    const { query: countQuery, params: countParams } = countBuilder.build();
    const countResult = await this.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].total);

    // Get paginated data
    const offset = (page - 1) * limit;
    queryBuilder.limit(limit).offset(offset);
    
    const { query: dataQuery, params: dataParams } = queryBuilder.build();
    const dataResult = await this.query<T>(dataQuery, dataParams);

    const totalPages = Math.ceil(total / limit);

    return {
      data: dataResult.rows,
      total,
      page,
      limit,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1
    };
  }

  /**
   * Get query performance metrics
   */
  static getQueryMetrics(): QueryMetrics[] {
    return [...this.queryMetrics];
  }

  /**
   * Get slow query analysis
   */
  static getSlowQueries(thresholdMs: number = 1000): QueryMetrics[] {
    return this.queryMetrics.filter(metric => metric.duration > thresholdMs);
  }

  /**
   * Clear query metrics
   */
  static clearMetrics(): void {
    this.queryMetrics = [];
  }

  /**
   * Private: Record query metrics
   */
  private static recordQueryMetrics(query: string, duration: number, rowCount: number): void {
    this.queryMetrics.push({
      query: query.substring(0, 200), // Truncate long queries
      duration,
      rowCount,
      timestamp: new Date()
    });

    // Keep only recent metrics
    if (this.queryMetrics.length > this.maxMetrics) {
      this.queryMetrics.shift();
    }
  }

  /**
   * Private: Determine if error is retryable
   */
  private static isRetryableError(error: Error): boolean {
    const retryableErrors = [
      'ECONNRESET',
      'ECONNREFUSED',
      'ETIMEDOUT',
      'connection terminated',
      'connection closed'
    ];

    return retryableErrors.some(retryableError => 
      error.message.toLowerCase().includes(retryableError.toLowerCase())
    );
  }

  /**
   * Private: Create appropriate database error
   */
  private static createDatabaseError(error: Error, query?: string, params?: any[]): DatabaseError {
    const message = error.message.toLowerCase();

    if (message.includes('timeout') || message.includes('etimedout')) {
      return new QueryTimeoutError('Query timeout', error, query);
    }

    if (message.includes('connect') || message.includes('connection')) {
      return new ConnectionError('Database connection error', error);
    }

    return new DatabaseError('Database query error', error, query, params);
  }

  /**
   * Private: Delay execution
   */
  private static delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Transaction Client Wrapper
 */
class TransactionClient {
  constructor(private client: PoolClient) {}

  /**
   * Execute query within transaction
   */
  async query<T extends QueryResultRow = any>(queryText: string, params: any[] = []): Promise<QueryResult<T>> {
    try {
      return await this.client.query<T>(queryText, params);
    } catch (error) {
      throw new DatabaseError(
        'Transaction query failed: ' + (error as Error).message,
        error as Error,
        queryText,
        params
      );
    }
  }

  /**
   * Create query builder for transaction
   */
  queryBuilder(): QueryBuilder {
    return new QueryBuilder();
  }

  /**
   * Execute query builder within transaction
   */
  async executeBuilder<T extends QueryResultRow = any>(builder: QueryBuilder): Promise<QueryResult<T>> {
    const { query, params } = builder.build();
    return this.query<T>(query, params);
  }
}

/**
 * Utility Functions
 */
class DatabaseUtils {
  /**
   * Validate table/column names to prevent SQL injection
   */
  static validateIdentifier(identifier: string): boolean {
    return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(identifier);
  }

  /**
   * Escape SQL identifiers (table/column names)
   */
  static escapeIdentifier(identifier: string): string {
    if (!this.validateIdentifier(identifier)) {
      throw new Error(`Invalid SQL identifier: ${identifier}`);
    }
    return `"${identifier}"`;
  }

  /**
   * Build WHERE clause for common search patterns
   */
  static buildSearchClause(
    searchTerm: string,
    columns: string[],
    paramIndex: number = 1
  ): { clause: string; param: string; nextIndex: number } {
    const searchPattern = `%${searchTerm.toLowerCase()}%`;
    const conditions = columns.map(col => `LOWER(${col}) LIKE $${paramIndex}`);
    
    return {
      clause: `(${conditions.join(' OR ')})`,
      param: searchPattern,
      nextIndex: paramIndex + 1
    };
  }

  /**
   * Convert camelCase to snake_case for database columns
   */
  static toSnakeCase(str: string): string {
    return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
  }

  /**
   * Convert snake_case to camelCase for JavaScript objects
   */
  static toCamelCase(str: string): string {
    return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
  }

  /**
   * Transform database row to JavaScript object
   */
  static transformRow(row: Record<string, any>): Record<string, any> {
    const transformed: Record<string, any> = {};
    
    for (const [key, value] of Object.entries(row)) {
      transformed[this.toCamelCase(key)] = value;
    }
    
    return transformed;
  }
}

// Named exports for convenience
export { QueryBuilder, DatabaseService, TransactionClient, DatabaseUtils };
export type { QueryOptions, QueryMetrics, TransactionOptions };
export { DatabaseError, ConnectionError, QueryTimeoutError, TransactionError };

export default DatabaseService;