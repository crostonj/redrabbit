import { z } from 'zod';
import { Pool, type PoolConfig } from 'pg';
import { getConfig } from './environment.js';

export type DatabaseConfig = {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  ssl: boolean;
  maxConnections: number;
  idleTimeoutMs: number;
  connectionTimeoutMs: number;
  statementTimeoutMs: number;
};

/**
 * Load database configuration from environment
 */
export function loadDatabaseConfig(): DatabaseConfig {
  const config = getConfig();
  // Parse the database URL
  const dbUrl = config.database.url;
  const url = new URL(dbUrl);

  return {
    host: url.hostname,
    port: Number(url.port) || 5432,
    database: url.pathname.replace(/^\//, ''),
    username: url.username,
    password: url.password,
    ssl: url.protocol === 'postgresql:' ? false : true,
    maxConnections: config.database.maxConnections,
    idleTimeoutMs: config.database.idleTimeoutMs,
    connectionTimeoutMs: config.database.connectionTimeoutMs,
    statementTimeoutMs: config.database.statementTimeoutMs,
  };
}

/**
 * Create PostgreSQL connection pool with optimal settings for production
 */
export class DatabaseConnection {
  private static pool: Pool | null = null;
  private static config: DatabaseConfig | null = null;

  /**
   * Initialize the database connection pool
   */
  static async initialize(): Promise<void> {
    if (this.pool) {
      console.warn('Database pool already initialized');
      return;
    }

    this.config = loadDatabaseConfig();

    const poolConfig: PoolConfig = {
      host: this.config.host,
      port: this.config.port,
      database: this.config.database,
      user: this.config.username,
      password: this.config.password,
      ssl: this.config.ssl ? { rejectUnauthorized: false } : false,
      max: this.config.maxConnections,
      idleTimeoutMillis: this.config.idleTimeoutMs,
      connectionTimeoutMillis: this.config.connectionTimeoutMs,
      statement_timeout: this.config.statementTimeoutMs,
      // Additional production optimizations
      query_timeout: this.config.statementTimeoutMs,
      keepAlive: true,
      keepAliveInitialDelayMillis: 10000,
    };

    this.pool = new Pool(poolConfig);

    // Handle pool errors
    this.pool.on('error', (err) => {
      console.error('Unexpected database pool error:', err);
      // Don't exit the process, let the application handle recovery
    });

    this.pool.on('connect', () => {
      console.log('New database client connected');
    });

    this.pool.on('remove', () => {
      console.log('Database client removed from pool');
    });

    // Test the connection
    try {
      const client = await this.pool.connect();
      const result = await client.query('SELECT NOW() as current_time, version() as version');
      console.log('Database connected successfully:', {
        currentTime: result.rows[0].current_time,
        version: result.rows[0].version.split(' ')[0] + ' ' + result.rows[0].version.split(' ')[1],
      });
      client.release();
    } catch (error) {
      console.error('Failed to connect to database:', error);
      throw new Error('Database connection test failed');
    }
  }

  /**
   * Get the database connection pool
   */
  static getPool(): Pool {
    if (!this.pool) {
      throw new Error('Database pool not initialized. Call DatabaseConnection.initialize() first.');
    }
    return this.pool;
  }

  /**
   * Execute a query with automatic client management
   */
  static async query(text: string, params?: any[]) {
    const pool = this.getPool();
    const client = await pool.connect();
    
    try {
      const result = await client.query(text, params);
      return result;
    } finally {
      client.release();
    }
  }

  /**
   * Execute a transaction with automatic rollback on error
   */
  static async transaction<T>(callback: (client: any) => Promise<T>): Promise<T> {
    const pool = this.getPool();
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get current pool status for monitoring
   */
  static getPoolStatus() {
    if (!this.pool) {
      return { initialized: false };
    }

    return {
      initialized: true,
      totalCount: this.pool.totalCount,
      idleCount: this.pool.idleCount,
      waitingCount: this.pool.waitingCount,
      config: {
        host: this.config?.host,
        database: this.config?.database,
        maxConnections: this.config?.maxConnections,
      },
    };
  }

  /**
   * Gracefully close all database connections
   */
  static async close(): Promise<void> {
    if (this.pool) {
      console.log('Closing database connection pool...');
      await this.pool.end();
      this.pool = null;
      this.config = null;
      console.log('Database connection pool closed');
    }
  }

  /**
   * Health check for monitoring endpoints
   */
  static async healthCheck(): Promise<{ healthy: boolean; latency?: number; error?: string }> {
    try {
      const start = Date.now();
      await this.query('SELECT 1');
      const latency = Date.now() - start;
      
      return {
        healthy: true,
        latency,
      };
    } catch (error) {
      return {
        healthy: false,
        error: error instanceof Error ? error.message : 'Unknown database error',
      };
    }
  }
}

// Graceful shutdown handling
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, closing database connections...');
  await DatabaseConnection.close();
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, closing database connections...');
  await DatabaseConnection.close();
});

export default DatabaseConnection;