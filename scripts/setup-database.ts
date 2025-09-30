#!/usr/bin/env tsx
/**
 * Database setup script for Red Rabbit Orders Microservice
 * Usage: tsx scripts/setup-database.ts [command]
 */

import { MigrationRunner } from './migration-runner.js';
import DatabaseConnection from '../config/database.js';

async function setupDatabase() {
  console.log('🚀 Setting up Red Rabbit Orders Database...\n');

  try {
    // Initialize database connection
    console.log('1. Connecting to PostgreSQL...');
    await DatabaseConnection.initialize();
    
    // Check database health
    const health = await DatabaseConnection.healthCheck();
    if (!health.healthy) {
      throw new Error(`Database unhealthy: ${health.error}`);
    }
    console.log(`✅ Database connected (latency: ${health.latency}ms)\n`);

    // Run migrations
    console.log('2. Running database migrations...');
    const runner = new MigrationRunner();
    await runner.runMigrations();
    
    console.log('\n🎉 Database setup completed successfully!');
    console.log('\nNext steps:');
    console.log('- Run tests: npm test');
    console.log('- Start development: npm run dev');
    
  } catch (error) {
    console.error('\n❌ Database setup failed:', error);
    process.exit(1);
  } finally {
    await DatabaseConnection.close();
  }
}

async function showDatabaseInfo() {
  try {
    await DatabaseConnection.initialize();
    
    const poolStatus = DatabaseConnection.getPoolStatus();
    const health = await DatabaseConnection.healthCheck();
    
    console.log('📊 Database Information:');
    console.log('========================');
    console.log(`Host: ${poolStatus.config?.host}`);
    console.log(`Database: ${poolStatus.config?.database}`);
    console.log(`Max Connections: ${poolStatus.config?.maxConnections}`);
    console.log(`Current Connections: ${poolStatus.totalCount}`);
    console.log(`Idle Connections: ${poolStatus.idleCount}`);
    console.log(`Health: ${health.healthy ? '✅ Healthy' : '❌ Unhealthy'}`);
    if (health.latency) {
      console.log(`Latency: ${health.latency}ms`);
    }
    
    console.log('\n📋 Migration Status:');
    const runner = new MigrationRunner();
    await runner.showStatus();
    
  } catch (error) {
    console.error('❌ Failed to get database info:', error);
    process.exit(1);
  } finally {
    await DatabaseConnection.close();
  }
}

// Command line interface
const command = process.argv[2];

switch (command) {
  case 'setup':
  case undefined:
    await setupDatabase();
    break;
    
  case 'info':
    await showDatabaseInfo();
    break;
    
  case 'reset':
    if (process.env.NODE_ENV === 'production') {
      console.error('❌ Cannot reset database in production environment');
      process.exit(1);
    }
    
    console.log('⚠️  This will completely reset your database!');
    console.log('All data will be lost. Press Ctrl+C to cancel.\n');
    
    // Simple confirmation (in real app, use proper prompting library)
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    await DatabaseConnection.initialize();
    const runner = new MigrationRunner();
    await runner.reset();
    console.log('\n🔄 Re-running setup after reset...');
    await runner.runMigrations();
    await DatabaseConnection.close();
    break;
    
  default:
    console.log(`
🗄️  Red Rabbit Database Setup

Usage: tsx scripts/setup-database.ts [command]

Commands:
  setup      Set up database and run migrations (default)
  info       Show database connection and migration status
  reset      Reset database (development only)

Environment Variables:
  DB_HOST        PostgreSQL host (default: localhost)
  DB_PORT        PostgreSQL port (default: 5432)
  DB_NAME        Database name (default: redrabbit_orders)
  DB_USER        Database username (default: postgres)
  DB_PASSWORD    Database password (required)
  DB_SSL         Enable SSL connection (default: false)

Examples:
  # Basic setup
  tsx scripts/setup-database.ts

  # Check database status
  tsx scripts/setup-database.ts info

  # Reset database (development)
  NODE_ENV=development tsx scripts/setup-database.ts reset
    `);
    process.exit(1);
}