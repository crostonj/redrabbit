#!/usr/bin/env node

/**
 * Database Migration Runner Script
 * 
 * Runs database migrations for the RedRabbit Orders microservice.
 * Supports migration up, down, status, and validation commands.
 */

import { DatabaseService } from '../src/services/database.js';
import MigrationManager from '../src/database/migration-manager.js';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Set environment variables if not set
if (!process.env.NODE_ENV) process.env.NODE_ENV = 'development';
if (!process.env.DATABASE_URL && !process.env.DB_NAME) {
  process.env.DB_NAME = 'redrabbit_orders';
  process.env.DB_USER = process.env.DB_USER || 'postgres';
  process.env.DB_PASSWORD = process.env.DB_PASSWORD || 'password';
  process.env.DB_HOST = process.env.DB_HOST || 'localhost';
  process.env.DB_PORT = process.env.DB_PORT || '5432';
}

async function main() {
  const command = process.argv[2];
  const target = process.argv[3];

  console.log('🗄️  RedRabbit Database Migration Tool\n');

  // Show help without database connection
  if (!command || command === '--help' || command === 'help') {
    console.log('📋 Available Commands:');
    console.log('  up/migrate [version]  - Run migrations up to specified version (or latest)');
    console.log('  down/rollback <version> - Rollback to specified version');
    console.log('  status                - Show current migration status');
    console.log('  validate              - Validate migration integrity');
    console.log('  reset                 - Reset database (rollback all then migrate all)');
    console.log('\nExamples:');
    console.log('  npm run db:migrate up');
    console.log('  npm run db:migrate up 3');
    console.log('  npm run db:migrate down 1');
    console.log('  npm run db:migrate status');
    console.log('  npm run db:migrate validate');
    console.log('\nEnvironment Variables:');
    console.log('  DATABASE_URL - Full database connection string');
    console.log('  DB_NAME      - Database name (default: redrabbit_orders)');
    console.log('  DB_USER      - Database user (default: postgres)');
    console.log('  DB_PASSWORD  - Database password (default: password)');
    console.log('  DB_HOST      - Database host (default: localhost)');
    console.log('  DB_PORT      - Database port (default: 5432)');
    return;
  }

  try {
    // Initialize database service
    const dbService = new DatabaseService();
    await dbService.initialize();
    
    // Initialize migration manager
    const migrationsPath = join(__dirname, '../src/database/migrations');
    const migrationManager = new MigrationManager(dbService, migrationsPath);

    switch (command) {
      case 'up':
      case 'migrate':
        const targetVersion = target ? parseInt(target) : undefined;
        await migrationManager.runMigrations(targetVersion);
        break;

      case 'down':
      case 'rollback':
        if (!target) {
          console.error('❌ Target version required for rollback');
          console.log('Usage: npm run db:migrate down <version>');
          process.exit(1);
        }
        const rollbackVersion = parseInt(target);
        await migrationManager.rollbackToVersion(rollbackVersion);
        break;

      case 'status':
        await migrationManager.showStatus();
        break;

      case 'validate':
        const isValid = await migrationManager.validateMigrations();
        process.exit(isValid ? 0 : 1);
        break;

      case 'reset':
        console.log('🔥 Resetting database (this will destroy all data)...');
        console.log('Rolling back to version 0...');
        await migrationManager.rollbackToVersion(0);
        console.log('Running all migrations...');
        await migrationManager.runMigrations();
        break;

      default:
        console.error(`❌ Unknown command: ${command}`);
        console.log('Run without arguments or --help to see available commands');
        process.exit(1);
    }

    console.log('\n✅ Migration command completed successfully');
    await dbService.close();

  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error('\n❌ Migration failed:', err.message);
    if (process.env.NODE_ENV === 'development') {
      console.error('Stack trace:', err.stack);
    }
    process.exit(1);
  }
}

// Handle process signals
process.on('SIGINT', async () => {
  console.log('\n🛑 Migration interrupted by user');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 Migration terminated');
  process.exit(0);
});

// Run the migration script
main().catch(error => {
  console.error('💥 Unexpected error:', error);
  process.exit(1);
});