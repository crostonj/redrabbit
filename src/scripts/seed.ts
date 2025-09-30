#!/usr/bin/env node

/**
 * Database Seeding CLI
 * 
 * Command-line tool to seed the database with test data.
 */

import { DatabaseService } from '../services/database.js';
import { seedDatabase, DEFAULT_SEED_CONFIG } from '../repositories/seed.js';
import type { SeedConfig } from '../repositories/seed.js';

/**
 * Parse command line arguments
 */
function parseArguments(): Partial<SeedConfig> & { help?: boolean; stats?: boolean } {
  const args = process.argv.slice(2);
  const config: any = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const nextArg = args[i + 1];

    switch (arg) {
      case '--help':
      case '-h':
        config.help = true;
        break;
      
      case '--stats':
        config.stats = true;
        break;

      case '--customers':
        if (nextArg && !isNaN(Number(nextArg))) {
          config.customers = Number(nextArg);
          i++; // Skip next arg
        }
        break;

      case '--products':
        if (nextArg && !isNaN(Number(nextArg))) {
          config.products = Number(nextArg);
          i++; // Skip next arg
        }
        break;

      case '--categories':
        if (nextArg && !isNaN(Number(nextArg))) {
          config.categories = Number(nextArg);
          i++; // Skip next arg
        }
        break;

      case '--orders':
        if (nextArg && !isNaN(Number(nextArg))) {
          config.orders = Number(nextArg);
          i++; // Skip next arg
        }
        break;

      case '--min-order-items':
        if (nextArg && !isNaN(Number(nextArg))) {
          config.minOrderItems = Number(nextArg);
          i++; // Skip next arg
        }
        break;

      case '--max-order-items':
        if (nextArg && !isNaN(Number(nextArg))) {
          config.maxOrderItems = Number(nextArg);
          i++; // Skip next arg
        }
        break;

      case '--min-addresses':
        if (nextArg && !isNaN(Number(nextArg))) {
          config.minAddressesPerCustomer = Number(nextArg);
          i++; // Skip next arg
        }
        break;

      case '--max-addresses':
        if (nextArg && !isNaN(Number(nextArg))) {
          config.maxAddressesPerCustomer = Number(nextArg);
          i++; // Skip next arg
        }
        break;

      default:
        console.warn(`Unknown argument: ${arg}`);
        break;
    }
  }

  return config;
}

/**
 * Show help message
 */
function showHelp(): void {
  console.log(`
Database Seeding CLI

Usage: npm run seed [options]

Options:
  --help, -h                 Show this help message
  --stats                    Show database statistics only (no seeding)
  --customers <number>       Number of customers to create (default: ${DEFAULT_SEED_CONFIG.customers})
  --products <number>        Number of products to create (default: ${DEFAULT_SEED_CONFIG.products})
  --categories <number>      Number of categories to create (default: ${DEFAULT_SEED_CONFIG.categories})
  --orders <number>          Number of orders to create (default: ${DEFAULT_SEED_CONFIG.orders})
  --min-order-items <number> Minimum items per order (default: ${DEFAULT_SEED_CONFIG.minOrderItems})
  --max-order-items <number> Maximum items per order (default: ${DEFAULT_SEED_CONFIG.maxOrderItems})
  --min-addresses <number>   Minimum addresses per customer (default: ${DEFAULT_SEED_CONFIG.minAddressesPerCustomer})
  --max-addresses <number>   Maximum addresses per customer (default: ${DEFAULT_SEED_CONFIG.maxAddressesPerCustomer})

Examples:
  npm run seed                                    # Use default configuration
  npm run seed -- --customers 100 --products 500 # Seed 100 customers and 500 products
  npm run seed -- --stats                        # Show statistics only
  npm run seed -- --help                         # Show this help

Environment Variables:
  DATABASE_URL               PostgreSQL connection URL
  POSTGRES_HOST              PostgreSQL host (default: localhost)
  POSTGRES_PORT              PostgreSQL port (default: 5432)
  POSTGRES_DB                PostgreSQL database name (default: retail_orders)
  POSTGRES_USER              PostgreSQL username (default: postgres)
  POSTGRES_PASSWORD          PostgreSQL password (required)
`);
}

/**
 * Show database statistics
 */
async function showStats(db: DatabaseService): Promise<void> {
  try {
    const { DatabaseSeeder } = await import('../repositories/seed.js');
    const seeder = new DatabaseSeeder(db);
    const stats = await seeder.getStats();

    console.log('📊 Database Statistics:');
    console.log('┌─────────────────────┬───────────┐');
    console.log('│ Table               │ Count     │');
    console.log('├─────────────────────┼───────────┤');
    
    const tables = ['customers', 'categories', 'products', 'addresses', 'orders', 'order_items', 'inventory_movements'];
    for (const table of tables) {
      const count = stats[table] || 0;
      const paddedTable = table.padEnd(19);
      const paddedCount = count.toString().padStart(9);
      console.log(`│ ${paddedTable} │ ${paddedCount} │`);
    }
    
    console.log('└─────────────────────┴───────────┘');

  } catch (error) {
    console.error('❌ Failed to get statistics:', error);
    process.exit(1);
  }
}

/**
 * Main function
 */
async function main(): Promise<void> {
  const config = parseArguments();

  if (config.help) {
    showHelp();
    return;
  }

  // Initialize database connection
  const db = new DatabaseService();
  
  try {
    await db.initialize();
    console.log('✅ Connected to database');

    if (config.stats) {
      await showStats(db);
      return;
    }

    // Show current configuration
    const finalConfig = { ...DEFAULT_SEED_CONFIG, ...config };
    console.log('🌱 Database Seeding Configuration:');
    console.log('┌─────────────────────┬───────────┐');
    console.log('│ Setting             │ Value     │');
    console.log('├─────────────────────┼───────────┤');
    console.log(`│ Customers           │ ${finalConfig.customers.toString().padStart(9)} │`);
    console.log(`│ Products            │ ${finalConfig.products.toString().padStart(9)} │`);
    console.log(`│ Categories          │ ${finalConfig.categories.toString().padStart(9)} │`);
    console.log(`│ Orders              │ ${finalConfig.orders.toString().padStart(9)} │`);
    console.log(`│ Min Order Items     │ ${finalConfig.minOrderItems.toString().padStart(9)} │`);
    console.log(`│ Max Order Items     │ ${finalConfig.maxOrderItems.toString().padStart(9)} │`);
    console.log(`│ Min Addresses       │ ${finalConfig.minAddressesPerCustomer.toString().padStart(9)} │`);
    console.log(`│ Max Addresses       │ ${finalConfig.maxAddressesPerCustomer.toString().padStart(9)} │`);
    console.log('└─────────────────────┴───────────┘');
    console.log();

    // Confirm before proceeding
    if (process.env.NODE_ENV !== 'development') {
      console.warn('⚠️  You are not in development mode. This will clear all existing data!');
      console.log('Press Ctrl+C to cancel, or wait 5 seconds to continue...');
      await new Promise(resolve => setTimeout(resolve, 5000));
    }

    // Start seeding
    const startTime = Date.now();
    await seedDatabase(db, finalConfig);
    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(1);

    console.log(`⏱️  Seeding completed in ${duration} seconds`);
    console.log();

    // Show final statistics
    await showStats(db);

  } catch (error) {
    console.error('❌ Seeding failed:', error);
    process.exit(1);
  } finally {
    await db.close();
    console.log('👋 Database connection closed');
  }
}

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('💥 Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Run the CLI
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error('💥 CLI Error:', error);
    process.exit(1);
  });
}