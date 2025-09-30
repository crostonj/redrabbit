import type { PoolClient } from 'pg';
import { DatabaseService } from '../services/database.js';
import type { PaginationOptions, PaginatedResult } from './interfaces.js';

/**
 * Base Repository Class
 * 
 * Provides common database operations and utilities for all repository implementations.
 * Handles pagination, error handling, and transaction management.
 */
export abstract class BaseRepositoryImpl<T, CreateData, UpdateData> {
  protected db: DatabaseService;
  protected tableName: string;

  constructor(db: DatabaseService, tableName: string) {
    this.db = db;
    this.tableName = tableName;
  }

  /**
   * Build pagination query with sorting
   */
  protected buildPaginationQuery(
    baseQuery: string,
    options?: PaginationOptions,
    whereClause?: string,
    params: any[] = []
  ): { query: string; countQuery: string; params: any[] } {
    const { page = 1, limit = 10, sortBy = 'created_at', sortOrder = 'desc' } = options || {};
    
    const offset = (page - 1) * limit;
    
    let query = baseQuery;
    let countQuery = `SELECT COUNT(*) FROM ${this.tableName}`;
    
    if (whereClause) {
      query += ` WHERE ${whereClause}`;
      countQuery += ` WHERE ${whereClause}`;
    }
    
    // Add ORDER BY clause
    query += ` ORDER BY ${sortBy} ${sortOrder.toUpperCase()}`;
    
    // Add LIMIT and OFFSET
    query += ` LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);
    
    return { query, countQuery, params };
  }

  /**
   * Execute paginated query and return results
   */
  protected async executePaginatedQuery<R>(
    baseQuery: string,
    options: PaginationOptions | undefined,
    whereClause?: string,
    baseParams: any[] = [],
    rowMapper?: (row: any) => R
  ): Promise<PaginatedResult<R>> {
    const { query, countQuery, params } = this.buildPaginationQuery(
      baseQuery,
      options,
      whereClause,
      [...baseParams]
    );

    const [dataResult, countResult] = await Promise.all([
      this.db.query(query, params),
      this.db.query(countQuery, baseParams)
    ]);

    const data = rowMapper 
      ? dataResult.rows.map(rowMapper)
      : dataResult.rows;
    
    const total = parseInt(countResult.rows[0].count);
    const { page = 1, limit = 10 } = options || {};
    const totalPages = Math.ceil(total / limit);

    return {
      data,
      total,
      page,
      limit,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1
    };
  }

  /**
   * Convert database row to domain object
   */
  protected abstract mapRowToEntity(row: any): T;

  /**
   * Convert create data to database columns
   */
  protected abstract mapCreateDataToColumns(data: CreateData): Record<string, any>;

  /**
   * Convert update data to database columns
   */
  protected abstract mapUpdateDataToColumns(data: UpdateData): Record<string, any>;

  /**
   * Build INSERT query with returning clause
   */
  protected buildInsertQuery(data: Record<string, any>): { query: string; params: any[] } {
    const columns = Object.keys(data);
    const placeholders = columns.map((_, index) => `$${index + 1}`);
    const params = columns.map(col => data[col]);

    const query = `
      INSERT INTO ${this.tableName} (${columns.join(', ')})
      VALUES (${placeholders.join(', ')})
      RETURNING *
    `;

    return { query, params };
  }

  /**
   * Build UPDATE query with returning clause
   */
  protected buildUpdateQuery(id: string, data: Record<string, any>): { query: string; params: any[] } {
    const columns = Object.keys(data).filter(key => data[key] !== undefined);
    const setClause = columns.map((col, index) => `${col} = $${index + 1}`);
    const params = [...columns.map(col => data[col]), id];

    const query = `
      UPDATE ${this.tableName}
      SET ${setClause.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $${params.length}
      RETURNING *
    `;

    return { query, params };
  }

  /**
   * Build DELETE query
   */
  protected buildDeleteQuery(id: string): { query: string; params: any[] } {
    const query = `DELETE FROM ${this.tableName} WHERE id = $1`;
    return { query, params: [id] };
  }

  /**
   * Build soft delete query
   */
  protected buildSoftDeleteQuery(id: string): { query: string; params: any[] } {
    const query = `
      UPDATE ${this.tableName}
      SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND deleted_at IS NULL
      RETURNING *
    `;
    return { query, params: [id] };
  }

  /**
   * Create a new record
   */
  async create(data: CreateData): Promise<T> {
    const columns = this.mapCreateDataToColumns(data);
    const { query, params } = this.buildInsertQuery(columns);
    
    const result = await this.db.query(query, params);
    if (result.rows.length === 0) {
      throw new Error(`Failed to create record in ${this.tableName}`);
    }
    
    return this.mapRowToEntity(result.rows[0]);
  }

  /**
   * Create multiple records in a transaction
   */
  async createMany(data: CreateData[]): Promise<T[]> {
    return this.db.withTransaction(async (client: PoolClient) => {
      const results: T[] = [];
      
      for (const item of data) {
        const columns = this.mapCreateDataToColumns(item);
        const { query, params } = this.buildInsertQuery(columns);
        
        const result = await client.query(query, params);
        if (result.rows.length > 0) {
          results.push(this.mapRowToEntity(result.rows[0]));
        }
      }
      
      return results;
    });
  }

  /**
   * Find record by ID
   */
  async findById(id: string): Promise<T | null> {
    const query = `SELECT * FROM ${this.tableName} WHERE id = $1 AND deleted_at IS NULL`;
    const result = await this.db.query(query, [id]);
    
    return result.rows.length > 0 ? this.mapRowToEntity(result.rows[0]) : null;
  }

  /**
   * Find all records with pagination
   */
  async findAll(options?: PaginationOptions): Promise<PaginatedResult<T>> {
    const baseQuery = `SELECT * FROM ${this.tableName}`;
    const whereClause = 'deleted_at IS NULL';
    
    return this.executePaginatedQuery(
      baseQuery,
      options,
      whereClause,
      [],
      (row) => this.mapRowToEntity(row)
    );
  }

  /**
   * Check if record exists
   */
  async exists(id: string): Promise<boolean> {
    const query = `SELECT 1 FROM ${this.tableName} WHERE id = $1 AND deleted_at IS NULL`;
    const result = await this.db.query(query, [id]);
    return result.rows.length > 0;
  }

  /**
   * Count records with optional filters
   */
  async count(filters?: Record<string, any>): Promise<number> {
    let query = `SELECT COUNT(*) FROM ${this.tableName} WHERE deleted_at IS NULL`;
    const params: any[] = [];
    
    if (filters && Object.keys(filters).length > 0) {
      const conditions = Object.keys(filters).map((key, index) => {
        params.push(filters[key]);
        return `${key} = $${params.length}`;
      });
      query += ` AND ${conditions.join(' AND ')}`;
    }
    
    const result = await this.db.query(query, params);
    return parseInt(result.rows[0].count);
  }

  /**
   * Update record by ID
   */
  async update(id: string, data: UpdateData): Promise<T | null> {
    const columns = this.mapUpdateDataToColumns(data);
    
    // Remove undefined values
    const cleanColumns = Object.keys(columns).reduce((acc, key) => {
      if (columns[key] !== undefined) {
        acc[key] = columns[key];
      }
      return acc;
    }, {} as Record<string, any>);
    
    if (Object.keys(cleanColumns).length === 0) {
      return this.findById(id);
    }
    
    const { query, params } = this.buildUpdateQuery(id, cleanColumns);
    const result = await this.db.query(query, params);
    
    return result.rows.length > 0 ? this.mapRowToEntity(result.rows[0]) : null;
  }

  /**
   * Update multiple records
   */
  async updateMany(ids: string[], data: UpdateData): Promise<T[]> {
    return this.db.withTransaction(async (client: PoolClient) => {
      const results: T[] = [];
      
      for (const id of ids) {
        const columns = this.mapUpdateDataToColumns(data);
        const { query, params } = this.buildUpdateQuery(id, columns);
        
        const result = await client.query(query, params);
        if (result.rows.length > 0) {
          results.push(this.mapRowToEntity(result.rows[0]));
        }
      }
      
      return results;
    });
  }

  /**
   * Delete record by ID (hard delete)
   */
  async delete(id: string): Promise<boolean> {
    const { query, params } = this.buildDeleteQuery(id);
    const result = await this.db.query(query, params);
    return (result.rowCount ?? 0) > 0;
  }

  /**
   * Delete multiple records
   */
  async deleteMany(ids: string[]): Promise<number> {
    const query = `DELETE FROM ${this.tableName} WHERE id = ANY($1)`;
    const result = await this.db.query(query, [ids]);
    return result.rowCount ?? 0;
  }

  /**
   * Soft delete record by ID
   */
  async softDelete(id: string): Promise<boolean> {
    const { query, params } = this.buildSoftDeleteQuery(id);
    const result = await this.db.query(query, params);
    return (result.rowCount ?? 0) > 0;
  }

  /**
   * Restore soft deleted record
   */
  async restore(id: string): Promise<boolean> {
    const query = `
      UPDATE ${this.tableName}
      SET deleted_at = NULL, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND deleted_at IS NOT NULL
    `;
    const result = await this.db.query(query, [id]);
    return (result.rowCount ?? 0) > 0;
  }

  /**
   * Build full-text search query
   */
  protected buildSearchQuery(searchColumns: string[], query: string): { whereClause: string; params: any[] } {
    if (!query.trim()) {
      return { whereClause: '', params: [] };
    }
    
    const searchConditions = searchColumns.map(column => 
      `${column} ILIKE $1`
    ).join(' OR ');
    
    return {
      whereClause: `(${searchConditions})`,
      params: [`%${query}%`]
    };
  }

  /**
   * Execute query within transaction
   */
  protected async withTransaction<R>(callback: (client: PoolClient) => Promise<R>): Promise<R> {
    return this.db.withTransaction(callback);
  }

  /**
   * Execute raw query
   */
  protected async query(text: string, params?: any[]) {
    return this.db.query(text, params);
  }
}

/**
 * Repository Error Classes
 */
export class RepositoryError extends Error {
  constructor(message: string, public code?: string, public details?: any) {
    super(message);
    this.name = 'RepositoryError';
  }
}

export class NotFoundError extends RepositoryError {
  constructor(resource: string, id: string) {
    super(`${resource} with ID ${id} not found`, 'NOT_FOUND', { resource, id });
    this.name = 'NotFoundError';
  }
}

export class ConflictError extends RepositoryError {
  constructor(message: string, details?: any) {
    super(message, 'CONFLICT', details);
    this.name = 'ConflictError';
  }
}

export class ValidationError extends RepositoryError {
  constructor(message: string, field?: string, value?: any) {
    super(message, 'VALIDATION_ERROR', { field, value });
    this.name = 'ValidationError';
  }
}