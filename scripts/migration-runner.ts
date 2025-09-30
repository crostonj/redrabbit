import { readdir, readFile } from 'fs/promises';
import { join } from 'path';
import DatabaseConnection from '../config/database.js';

interface Migration {
  filename: string;
  version: string;
  content: string;
}

/**
 * Database migration runner for PostgreSQL schema management
 */
export class MigrationRunner {
  private migrationsDir: string;

  constructor(migrationsDir = './scripts/migrations') {
    this.migrationsDir = migrationsDir;
  }

  /**
   * Create migrations tracking table if it doesn't exist
   */
  private async createMigrationsTable(): Promise<void> {
    const sql = `
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version VARCHAR(255) PRIMARY KEY,
        filename VARCHAR(255) NOT NULL,
        executed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `;
    
    await DatabaseConnection.query(sql);
    console.log('✓ Schema migrations table ready');
  }

  /**
   * Load all migration files from the migrations directory
   */
  private async loadMigrations(): Promise<Migration[]> {
    try {
      const files = await readdir(this.migrationsDir);
      const migrationFiles = files
        .filter(file => file.endsWith('.sql'))
        .sort(); // Ensure migrations run in order

      const migrations: Migration[] = [];

      for (const filename of migrationFiles) {
        const version = filename.replace('.sql', '');
        const content = await readFile(join(this.migrationsDir, filename), 'utf-8');
        migrations.push({ filename, version, content });
      }

      return migrations;
    } catch (error) {
      throw new Error(`Failed to load migrations: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get list of already executed migrations
   */
  private async getExecutedMigrations(): Promise<Set<string>> {
    try {
      const result = await DatabaseConnection.query(
        'SELECT version FROM schema_migrations ORDER BY executed_at'
      );
      return new Set(result.rows.map(row => row.version));
    } catch (error) {
      // If table doesn't exist, return empty set
      return new Set();
    }
  }

  /**
   * Execute a single migration within a transaction
   */
  private async executeMigration(migration: Migration): Promise<void> {
    await DatabaseConnection.transaction(async (client) => {
      // Execute the migration SQL
      await client.query(migration.content);
      
      // Record the migration as executed
      await client.query(
        'INSERT INTO schema_migrations (version, filename) VALUES ($1, $2)',
        [migration.version, migration.filename]
      );
    });

    console.log(`✓ Executed migration: ${migration.filename}`);
  }

  /**
   * Run all pending migrations
   */
  async runMigrations(): Promise<void> {
    try {
      console.log('🔄 Starting database migration...');

      // Initialize database connection if needed
      if (!DatabaseConnection.getPoolStatus().initialized) {
        await DatabaseConnection.initialize();
      }

      // Create migrations table
      await this.createMigrationsTable();

      // Load migrations and check which ones need to run
      const migrations = await this.loadMigrations();
      const executedMigrations = await this.getExecutedMigrations();

      const pendingMigrations = migrations.filter(
        migration => !executedMigrations.has(migration.version)
      );

      if (pendingMigrations.length === 0) {
        console.log('✅ No pending migrations, database is up to date');
        return;
      }

      console.log(`📋 Found ${pendingMigrations.length} pending migrations:`);
      pendingMigrations.forEach(migration => {
        console.log(`  - ${migration.filename}`);
      });

      // Execute pending migrations in order
      for (const migration of pendingMigrations) {
        await this.executeMigration(migration);
      }

      console.log(`✅ Successfully executed ${pendingMigrations.length} migrations`);
      
      // Show final status
      await this.showStatus();
    } catch (error) {
      console.error('❌ Migration failed:', error);
      throw error;
    }
  }

  /**
   * Show current migration status
   */
  async showStatus(): Promise<void> {
    try {
      const migrations = await this.loadMigrations();
      const executedMigrations = await this.getExecutedMigrations();

      console.log('\n📊 Migration Status:');
      console.log('===================');
      
      for (const migration of migrations) {
        const status = executedMigrations.has(migration.version) ? '✅' : '⏳';
        console.log(`${status} ${migration.filename}`);
      }
      
      const executed = migrations.filter(m => executedMigrations.has(m.version)).length;
      console.log(`\nExecuted: ${executed}/${migrations.length} migrations`);
    } catch (error) {
      console.error('❌ Failed to show migration status:', error);
    }
  }

  /**
   * Reset database by dropping all tables (USE WITH CAUTION)
   */
  async reset(): Promise<void> {
    console.log('⚠️  RESETTING DATABASE - This will drop all tables!');
    
    try {
      // Drop all tables in the correct order (respecting foreign keys)
      const dropTablesSQL = `
        DROP TABLE IF EXISTS webhook_subscriptions CASCADE;
        DROP TABLE IF EXISTS inventory_reservations CASCADE;
        DROP TABLE IF EXISTS order_events CASCADE;
        DROP TABLE IF EXISTS payments CASCADE;
        DROP TABLE IF EXISTS order_line_items CASCADE;
        DROP TABLE IF EXISTS orders CASCADE;
        DROP TABLE IF EXISTS api_keys CASCADE;
        DROP TABLE IF EXISTS products CASCADE;
        DROP TABLE IF EXISTS addresses CASCADE;
        DROP TABLE IF EXISTS customers CASCADE;
        DROP TABLE IF EXISTS schema_migrations CASCADE;
        DROP FUNCTION IF EXISTS update_updated_at_column() CASCADE;
        DROP FUNCTION IF EXISTS recalculate_order_totals() CASCADE;
        DROP EXTENSION IF EXISTS "uuid-ossp" CASCADE;
      `;
      
      await DatabaseConnection.query(dropTablesSQL);
      console.log('✅ Database reset complete');
    } catch (error) {
      console.error('❌ Database reset failed:', error);
      throw error;
    }
  }
}

// CLI interface for running migrations
if (import.meta.url === `file://${process.argv[1]}`) {
  const command = process.argv[2];
  const runner = new MigrationRunner();

  switch (command) {
    case 'migrate':
    case 'up':
      await runner.runMigrations();
      process.exit(0);
      
    case 'status':
      await DatabaseConnection.initialize();
      await runner.showStatus();
      await DatabaseConnection.close();
      process.exit(0);
      
    case 'reset':
      if (process.env.NODE_ENV === 'production') {
        console.error('❌ Cannot reset database in production environment');
        process.exit(1);
      }
      await DatabaseConnection.initialize();
      await runner.reset();
      await DatabaseConnection.close();
      process.exit(0);
      
    default:
      console.log(`
Usage: tsx scripts/migrate.ts <command>

Commands:
  migrate, up    Run pending migrations
  status         Show migration status
  reset          Reset database (development only)

Environment Variables:
  DB_HOST        PostgreSQL host (default: localhost)
  DB_PORT        PostgreSQL port (default: 5432)
  DB_NAME        Database name (default: redrabbit_orders)
  DB_USER        Database username (default: postgres)
  DB_PASSWORD    Database password (required)
  DB_SSL         Enable SSL connection (default: false)
      `);
      process.exit(1);
  }
}