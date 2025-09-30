import { Pool } from 'pg';
import type { PoolClient, PoolConfig, QueryResult } from 'pg';

/**
 * Database Service
 * 
 * Provides database connection management and query utilities for PostgreSQL.
 * Handles connection pooling, transactions, and error handling.
 */

export class DatabaseService {
  private pool: Pool | null;
  private isInitialized = false;
  private mockMode = false;
  private mockData: Record<string, any[]> = {};
  // Mock schema & transactional state helpers
  private mockSchemas: Record<string, {
    primaryKey?: string;
    unique?: string[];
    foreignKeys?: Array<{ column: string; references: { table: string; column: string } }>;
    autoIncrement?: string[]; // columns that should auto-increment (simulate SERIAL)
  }> = {};
  private mockSequences: Record<string, number> = {}; // key format: table.column
  private transactionStack: Array<{ mockData: Record<string, any[]>; mockSequences: Record<string, number> }> = [];

  constructor(config?: PoolConfig) {
    const poolConfig: PoolConfig = {
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      database: process.env.DB_NAME || 'retail_orders',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'password',
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
      max: 20, // Maximum number of connections
      idleTimeoutMillis: 30000, // 30 seconds
      connectionTimeoutMillis: 2000, // 2 seconds
      ...config
    };

    if (process.env.MOCK_DB === 'true' || process.env.NODE_ENV === 'test') {
      this.mockMode = true;
      this.pool = null;
      // Define lightweight schemas for constraint simulation
      this.mockSchemas = {
        orders: { primaryKey: 'id', unique: ['order_number'] },
        order_items: { primaryKey: 'id', autoIncrement: ['id'], foreignKeys: [ { column: 'order_id', references: { table: 'orders', column: 'id' } } ] },
        inventory: { primaryKey: 'product_id', unique: ['product_sku'] },
        inventory_reservations: { primaryKey: 'id', foreignKeys: [ { column: 'product_id', references: { table: 'inventory', column: 'product_id' } } ] },
        inventory_audit: { primaryKey: 'id', foreignKeys: [ { column: 'product_id', references: { table: 'inventory', column: 'product_id' } } ] },
        payments: { primaryKey: 'id', foreignKeys: [ { column: 'order_id', references: { table: 'orders', column: 'id' } } ] }
      };
    } else {
      this.pool = new Pool(poolConfig);
      this.pool.on('error', (err) => {
        console.error('Unexpected error on idle client', err);
        process.exit(-1);
      });
    }
  }

  /**
   * Initialize database service and verify connection
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    if (this.mockMode) {
      this.isInitialized = true;
      return;
    }
    if (!this.pool) return;
    try {
      const client = await this.pool.connect();
      await client.query('SELECT NOW()');
      client.release();
      this.isInitialized = true;
      console.log('Database service initialized successfully');
    } catch (error) {
      console.error('Failed to initialize database service:', error);
      throw new Error('Database connection failed');
    }
  }

  /**
   * Get a database connection from the pool
   */
  async getConnection(): Promise<PoolClient> {
    if (this.mockMode) {
      return {
        query: async (text: string, params?: any[]) => this.mockQuery(text, params),
        release: () => {}
      } as unknown as PoolClient;
    }
    if (!this.pool) throw new Error('Pool not initialized');
    return await this.pool.connect();
  }

  /**
   * Release a connection back to the pool
   */
  async releaseConnection(client: PoolClient): Promise<void> {
    if (!this.mockMode) client.release();
  }

  /**
   * Execute a query with a managed connection
   */
  async withConnection<T>(
    callback: (client: PoolClient) => Promise<T>
  ): Promise<T> {
    const client = await this.getConnection();
    try {
      return await callback(client);
    } finally {
      this.releaseConnection(client);
    }
  }

  /**
   * Execute a query within a transaction with automatic rollback on error
   */
  async withTransaction<T>(
    callback: (client: PoolClient) => Promise<T>
  ): Promise<T> {
    if (this.mockMode) {
      const mockClient = await this.getConnection();
      // Take snapshot
      const snapshot: { mockData: Record<string, any[]>; mockSequences: Record<string, number> } = {
        mockData: Object.fromEntries(
          Object.entries(this.mockData).map(([table, rows]) => [table, rows.map(r => ({ ...r }))])
        ),
        mockSequences: { ...this.mockSequences }
      };
      this.transactionStack.push(snapshot);
      try {
        const result = await callback(mockClient);
        // Commit: discard snapshot
        this.transactionStack.pop();
        return result;
      } catch (error) {
        // Rollback: restore snapshot
        const last = this.transactionStack.pop();
        if (last) {
          this.mockData = Object.fromEntries(
            Object.entries(last.mockData).map(([table, rows]) => [table, rows.map(r => ({ ...r }))])
          );
          this.mockSequences = { ...last.mockSequences };
        }
        throw error;
      } finally {
        this.releaseConnection(mockClient);
      }
    }
    const client = await this.getConnection();
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      try { await client.query('ROLLBACK'); } catch (rollbackError) { console.error('Failed to rollback transaction:', rollbackError); }
      throw error;
    } finally {
      this.releaseConnection(client);
    }
  }

  /**
   * Execute a simple query using the pool
   */
  async query(text: string, params?: any[]): Promise<QueryResult> {
    if (this.mockMode) {
      return this.mockQuery(text, params);
    }
    if (!this.pool) throw new Error('Pool not initialized');
    return await this.pool.query(text, params);
  }

  /**
   * Close all database connections
   */
  async close(): Promise<void> {
    if (this.pool) await this.pool.end();
    this.isInitialized = false;
    console.log('Database service closed');
  }

  /**
   * Check if database is healthy
   */
  async healthCheck(): Promise<boolean> {
    try {
      const result = await this.query('SELECT 1 as health');
      return result.rows[0]?.health === 1;
    } catch (error) {
      console.error('Database health check failed:', error);
      return false;
    }
  }

  /**
   * Get database statistics
   */
  async getStats(): Promise<{
    totalConnections: number;
    idleConnections: number;
    waitingConnections: number;
  }> {
    if (this.mockMode || !this.pool) {
      return { totalConnections: 0, idleConnections: 0, waitingConnections: 0 };
    }
    return { totalConnections: this.pool.totalCount, idleConnections: this.pool.idleCount, waitingConnections: this.pool.waitingCount };
  }

  /**
   * Execute database migrations
   */
  async runMigrations(): Promise<void> {
    await this.withTransaction(async (client) => {
      // Create migrations table if it doesn't exist
      await client.query(`
        CREATE TABLE IF NOT EXISTS migrations (
          id SERIAL PRIMARY KEY,
          filename VARCHAR(255) NOT NULL UNIQUE,
          executed_at TIMESTAMP DEFAULT NOW()
        )
      `);

      // Create orders table
      await client.query(`
        CREATE TABLE IF NOT EXISTS orders (
          id VARCHAR(50) PRIMARY KEY,
          customer_id VARCHAR(50) NOT NULL,
          customer_email VARCHAR(255) NOT NULL,
          status VARCHAR(20) NOT NULL DEFAULT 'pending',
          subtotal_amount DECIMAL(10,2) NOT NULL,
          tax_amount DECIMAL(10,2) DEFAULT 0,
          shipping_amount DECIMAL(10,2) DEFAULT 0,
          discount_amount DECIMAL(10,2) DEFAULT 0,
          total_amount DECIMAL(10,2) NOT NULL,
          payment_method VARCHAR(50) NOT NULL,
          payment_status VARCHAR(20) DEFAULT 'pending',
          payment_id VARCHAR(50),
          order_number VARCHAR(50),
          notes TEXT,
          shipping_address JSONB NOT NULL,
          billing_address JSONB NOT NULL,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW(),
          shipped_at TIMESTAMP,
          delivered_at TIMESTAMP
        )
      `);

      // Create order_items table
      await client.query(`
        CREATE TABLE IF NOT EXISTS order_items (
          id SERIAL PRIMARY KEY,
          order_id VARCHAR(50) REFERENCES orders(id) ON DELETE CASCADE,
          product_id VARCHAR(50) NOT NULL,
          product_name VARCHAR(255) NOT NULL,
          product_sku VARCHAR(100),
          quantity INTEGER NOT NULL,
          unit_price DECIMAL(10,2) NOT NULL,
          total_price DECIMAL(10,2) NOT NULL,
          tax_amount DECIMAL(10,2) DEFAULT 0,
          discount_amount DECIMAL(10,2) DEFAULT 0
        )
      `);

      // Create payments table
      await client.query(`
        CREATE TABLE IF NOT EXISTS payments (
          id VARCHAR(50) PRIMARY KEY,
          order_id VARCHAR(50) REFERENCES orders(id),
          customer_id VARCHAR(50) NOT NULL,
          amount DECIMAL(10,2) NOT NULL,
          currency VARCHAR(3) NOT NULL,
          payment_method VARCHAR(50) NOT NULL,
          status VARCHAR(20) NOT NULL,
          transaction_id VARCHAR(100),
          gateway_transaction_id VARCHAR(100),
          authorization_code VARCHAR(50),
          card_last4 VARCHAR(4),
          card_brand VARCHAR(20),
          card_expiry_month VARCHAR(2),
          card_expiry_year VARCHAR(4),
          processing_fee DECIMAL(10,2) DEFAULT 0,
          net_amount DECIMAL(10,2) NOT NULL,
          error_code VARCHAR(50),
          error_message TEXT,
          description TEXT,
          metadata JSONB,
          created_at TIMESTAMP DEFAULT NOW(),
          processed_at TIMESTAMP,
          updated_at TIMESTAMP DEFAULT NOW()
        )
      `);

      // Create inventory table
      await client.query(`
        CREATE TABLE IF NOT EXISTS inventory (
          product_id VARCHAR(50) PRIMARY KEY,
          product_name VARCHAR(255) NOT NULL,
          product_sku VARCHAR(100) UNIQUE NOT NULL,
          category VARCHAR(100) NOT NULL,
          stock_quantity INTEGER NOT NULL DEFAULT 0,
          reserved_quantity INTEGER NOT NULL DEFAULT 0,
          available_quantity INTEGER GENERATED ALWAYS AS (stock_quantity - reserved_quantity) STORED,
          reorder_level INTEGER DEFAULT 10,
          reorder_quantity INTEGER DEFAULT 100,
          max_stock_level INTEGER DEFAULT 1000,
          supplier_id VARCHAR(50),
          supplier_sku VARCHAR(100),
          lead_time_days INTEGER DEFAULT 7,
          cost_price DECIMAL(10,2),
          selling_price DECIMAL(10,2) NOT NULL,
          weight DECIMAL(8,2),
          dimensions JSONB,
          is_active BOOLEAN DEFAULT true,
          is_tracking_enabled BOOLEAN DEFAULT true,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW(),
          last_stock_update TIMESTAMP
        )
      `);

      // Create inventory_reservations table
      await client.query(`
        CREATE TABLE IF NOT EXISTS inventory_reservations (
          id VARCHAR(50) PRIMARY KEY,
          order_id VARCHAR(50) NOT NULL,
          customer_id VARCHAR(50) NOT NULL,
          product_id VARCHAR(50) REFERENCES inventory(product_id),
          reserved_quantity INTEGER NOT NULL,
          status VARCHAR(20) DEFAULT 'active',
          created_at TIMESTAMP DEFAULT NOW(),
          expires_at TIMESTAMP NOT NULL,
          fulfilled_at TIMESTAMP,
          cancelled_at TIMESTAMP
        )
      `);

      // Create inventory_audit table
      await client.query(`
        CREATE TABLE IF NOT EXISTS inventory_audit (
          id VARCHAR(50) PRIMARY KEY,
          product_id VARCHAR(50) REFERENCES inventory(product_id),
          change_type VARCHAR(50) NOT NULL,
          quantity_change INTEGER NOT NULL,
          previous_quantity INTEGER NOT NULL,
          new_quantity INTEGER NOT NULL,
          reason VARCHAR(200) NOT NULL,
          reference_id VARCHAR(100),
          user_id VARCHAR(100) NOT NULL,
          timestamp TIMESTAMP DEFAULT NOW(),
          metadata JSONB
        )
      `);

      // Create indexes for better performance
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_orders_customer_id ON orders(customer_id);
        CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
        CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at);
        CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
        CREATE INDEX IF NOT EXISTS idx_order_items_product_id ON order_items(product_id);
        CREATE INDEX IF NOT EXISTS idx_payments_order_id ON payments(order_id);
        CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
        CREATE INDEX IF NOT EXISTS idx_inventory_category ON inventory(category);
        CREATE INDEX IF NOT EXISTS idx_inventory_available_quantity ON inventory(available_quantity);
        CREATE INDEX IF NOT EXISTS idx_inventory_reservations_expires_at ON inventory_reservations(expires_at);
        CREATE INDEX IF NOT EXISTS idx_inventory_audit_product_id ON inventory_audit(product_id);
        CREATE INDEX IF NOT EXISTS idx_inventory_audit_timestamp ON inventory_audit(timestamp);
      `);

      console.log('Database migrations completed successfully');
    });
  }

  /**
   * Utility method to build WHERE clauses with proper parameterization
   */
  buildWhereClause(
    conditions: Record<string, any>,
    startParam: number = 1
  ): { whereClause: string; params: any[]; nextParam: number } {
    const clauses: string[] = [];
    const params: any[] = [];
    let paramCount = startParam;

    for (const [key, value] of Object.entries(conditions)) {
      if (value !== undefined && value !== null) {
        if (Array.isArray(value)) {
          const placeholders = value.map(() => `$${paramCount++}`).join(', ');
          clauses.push(`${key} IN (${placeholders})`);
          params.push(...value);
        } else {
          clauses.push(`${key} = $${paramCount++}`);
          params.push(value);
        }
      }
    }

    const whereClause = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
    
    return {
      whereClause,
      params,
      nextParam: paramCount
    };
  }

  /**
   * Utility method to build ORDER BY clause
   */
  buildOrderByClause(sortBy?: string, sortOrder?: 'asc' | 'desc'): string {
    if (!sortBy) return '';
    
    const order = sortOrder === 'asc' ? 'ASC' : 'DESC';
    return `ORDER BY ${sortBy} ${order}`;
  }

  /**
   * Utility method to build LIMIT and OFFSET clause
   */
  buildLimitClause(page?: number, limit?: number): { 
    limitClause: string; 
    offset: number; 
  } {
    if (!page || !limit) {
      return { limitClause: '', offset: 0 };
    }

    const offset = (page - 1) * limit;
    return {
      limitClause: `LIMIT ${limit} OFFSET ${offset}`,
      offset
    };
  }

  // --- Mock Query Implementation ---
  private async mockQuery(text: string, params?: any[]): Promise<QueryResult<any>> {
    const original = text.trim();
    const lowered = original.toLowerCase();

    // Helpers
    const ensureTable = (table: string): any[] => {
      if (!this.mockData[table]) this.mockData[table] = [];
      return this.mockData[table];
    };
    const applyWhere = (rows: any[], whereClause: string | null, params: any[] = []): any[] => {
      if (!whereClause) return rows;
      // Support patterns: col = $n AND col2 = $m ; col LIKE $n
      const conditions = whereClause.split(/\band\b/i).map(c => c.trim()).filter(Boolean);
      return rows.filter(r => {
        return conditions.every(cond => {
          // col = $n
          let m = /(\w+)\s*=\s*\$(\d+)/i.exec(cond);
          if (m) {
            const col = m[1];
            const paramToken = m[2];
            if (!paramToken) return true;
            const idx = parseInt(paramToken, 10) - 1;
            return r[col as keyof typeof r] === params[idx];
          }
          // col LIKE $n
          m = /(\w+)\s+like\s*\$(\d+)/i.exec(cond);
          if (m) {
            const col = m[1];
            const paramToken = m[2];
            if (!paramToken) return true;
            const idx = parseInt(paramToken, 10) - 1;
            const pattern = String(params[idx] ?? '').replace(/%/g, '');
            return String(r[col as keyof typeof r] ?? '').includes(pattern);
          }
          return true; // unknown condition ignored
        });
      });
    };
    const parseWhere = (sql: string): { base: string; where: string | null } => {
      const m = /(.*)\bwhere\b(.*)/i.exec(sql);
      if (!m) return { base: sql, where: null };
      const base = (m[1] || '').trim();
      const where = (m[2] || '').trim();
      return { base, where };
    };

    // Health checks
    if (/select\s+now\(\)/i.test(original)) {
      return { rows: [{ current_time: new Date() }], rowCount: 1, command: 'SELECT', fields: [], oid: 0 } as any;
    }
    if (/select\s+1\s+as\s+health/i.test(original)) {
      return { rows: [{ health: 1 }], rowCount: 1, command: 'SELECT', fields: [], oid: 0 } as any;
    }

    // COUNT(*) aggregate
    if (/select\s+count\(\*\)\s+as\s+(\w+)\s+from\s+(\w+)/i.test(lowered)) {
      const mAgg = /select\s+count\(\*\)\s+as\s+(\w+)\s+from\s+(\w+)(.*)/i.exec(lowered);
      if (mAgg) {
        const alias = (mAgg[1] || 'count');
        const table = (mAgg[2] || '').toString();
        const rest = mAgg[3] || '';
        const { where } = parseWhere(rest);
        const rows = applyWhere(ensureTable(table), where, params || []);
        const row: Record<string, any> = {};
        row[alias] = rows.length;
        return { rows: [row], rowCount: 1, command: 'SELECT', fields: [], oid: 0 } as any;
      }
    }

    // INSERT
    if (/^insert\s+into\s+/i.test(lowered)) {
      // Pattern: INSERT INTO table (col1, col2, ...) VALUES ($1,$2,...) [RETURNING ...]
      const tableMatch = /^insert\s+into\s+(\w+)/i.exec(lowered);
      if (!tableMatch) return { rows: [], rowCount: 0, command: 'INSERT', fields: [], oid: 0 } as any;
  const table = tableMatch[1] || '';
  const colsMatch = /\(([^)]+)\)\s*values/i.exec(original);
  const cols = colsMatch && colsMatch[1] ? colsMatch[1].split(',').map(c => c.trim().replace(/\"/g, '')) : [];
      const returningMatch = /returning\s+(.+)$/i.exec(original);
      const values: any = {};
      cols.forEach((c, idx) => { values[c] = params?.[idx]; });
      // Auto increment simulation if configured
  const schema = this.mockSchemas[table];
      if (schema?.autoIncrement) {
        for (const col of schema.autoIncrement) {
          if (values[col] === undefined) {
            const seqKey = `${table}.${col}`;
            this.mockSequences[seqKey] = (this.mockSequences[seqKey] || 0) + 1;
            values[col] = this.mockSequences[seqKey];
          }
        }
      }
      // Primary key / unique constraints
      if (schema?.primaryKey) {
        const pk = schema.primaryKey;
        const existing = ensureTable(table).some(r => r[pk] === values[pk]);
        if (existing) {
          const err: any = new Error(`duplicate key value violates unique constraint "${table}_${pk}_pkey"`);
            err.code = '23505';
          throw err;
        }
      }
      if (schema?.unique) {
        for (const u of schema.unique) {
          if (values[u] !== undefined) {
            const exists = ensureTable(table).some(r => r[u] === values[u]);
            if (exists) {
              const err: any = new Error(`duplicate key value violates unique constraint "${table}_${u}_key"`);
              err.code = '23505';
              throw err;
            }
          }
        }
      }
      // Foreign key constraints
      if (schema?.foreignKeys) {
        for (const fk of schema.foreignKeys) {
          const val = values[fk.column];
          if (val !== undefined) {
            const refTableRows = ensureTable(fk.references.table);
            const exists = refTableRows.some(r => r[fk.references.column] === val);
            if (!exists) {
              const err: any = new Error(`insert or update on table "${table}" violates foreign key constraint "${table}_${fk.column}_fkey"`);
              err.code = '23503';
              throw err;
            }
          }
        }
      }
  ensureTable(table).push(values);
      let returningRows: any[] = [];
      if (returningMatch && returningMatch[1]) {
        const retCols = returningMatch[1].trim();
        if (retCols === '*' ) returningRows = [values];
        else {
          const list = retCols.split(',').map(c => c.trim());
          returningRows = [ Object.fromEntries(list.map(c => [c, values[c]])) ];
        }
      }
      return { rows: returningRows, rowCount: 1, command: 'INSERT', fields: [], oid: 0 } as any;
    }

    // SELECT
    if (/^select\s+/i.test(lowered)) {
      const fromMatch = /from\s+(\w+)/i.exec(lowered);
      if (!fromMatch) return { rows: [], rowCount: 0, command: 'SELECT', fields: [], oid: 0 } as any;
  const table = fromMatch[1] || '';
      const { where, base } = parseWhere(original);
      // Column list
      const selectPart = base.replace(/select/i,'').replace(/from.*/i,'').trim();
      const rowsRaw = applyWhere(ensureTable(table), where, params || []);
      let rows = rowsRaw.map(r => ({ ...r }));
      if (selectPart !== '*') {
        const cols = selectPart.split(',').map(c => c.trim());
        rows = rows.map(r => Object.fromEntries(cols.map(c => [c, r[c]])));
      }
      return { rows, rowCount: rows.length, command: 'SELECT', fields: [], oid: 0 } as any;
    }

    // UPDATE
    if (/^update\s+(\w+)/i.test(lowered)) {
      const m = /^update\s+(\w+)/i.exec(lowered)!;
  const table = m[1] || '';
      const { where, base } = parseWhere(original);
      const setMatch = /set\s+([^]+?)(?:where|returning|$)/i.exec(base);
      const setClause = setMatch ? setMatch[1] : '';
  const safeSetClause = setClause || '';
  const assigns = safeSetClause.split(',').map(a => a.trim()).filter(Boolean);
  const tableRows = ensureTable(table);
      const filtered = applyWhere(tableRows, where, params || []);
      // Map param index usage: col=$n
      assigns.forEach(assign => {
        const mm = /(\w+)\s*=\s*\$(\d+)/.exec(assign);
        if (mm) {
          const col = mm[1];
          const token = mm[2];
          if (token) {
            const idx = parseInt(token, 10) - 1;
            filtered.forEach(r => { (r as any)[col as string] = params ? params[idx] : undefined; });
          }
        }
      });
      const returningMatch = /returning\s+(.+)$/i.exec(original);
      let returningRows: any[] = [];
      if (returningMatch && returningMatch[1]) {
        const retCols = returningMatch[1].trim();
        if (retCols === '*') returningRows = filtered.map(r => ({ ...r }));
        else {
          const list = retCols.split(',').map(c => c.trim());
            returningRows = filtered.map(r => Object.fromEntries(list.map(c => [c, r[c]])));
        }
      }
      return { rows: returningRows, rowCount: filtered.length, command: 'UPDATE', fields: [], oid: 0 } as any;
    }

    // DELETE
    if (/^delete\s+from\s+(\w+)/i.test(lowered)) {
      const m = /^delete\s+from\s+(\w+)/i.exec(lowered)!;
  const table = m[1] || '';
      const { where } = parseWhere(original);
  const tableRows = ensureTable(table);
  const toDelete = applyWhere(tableRows, where, params || []);
      // Naive referential integrity: if other tables have FK referencing these rows, prevent deletion
      const referencingTables = Object.entries(this.mockSchemas).filter(([_, sch]) => sch?.foreignKeys?.some(fk => fk.references.table === table));
      for (const [childTable, sch] of referencingTables) {
        const fks = sch!.foreignKeys || [];
        for (const fk of fks.filter(f => f.references.table === table)) {
          for (const victim of toDelete) {
            const dependents = ensureTable(childTable).some(r => r[fk.column] === victim[fk.references.column]);
            if (dependents) {
              const err: any = new Error(`update or delete on table "${table}" violates foreign key constraint "${childTable}_${fk.column}_fkey" on table "${childTable}"`);
              err.code = '23503';
              throw err;
            }
          }
        }
      }
  this.mockData[table] = tableRows.filter(r => !toDelete.includes(r));
      return { rows: [], rowCount: toDelete.length, command: 'DELETE', fields: [], oid: 0 } as any;
    }

    return { rows: [], rowCount: 0, command: 'SELECT', fields: [], oid: 0 } as any;
  }
}