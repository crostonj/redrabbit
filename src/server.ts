#!/usr/bin/env node

/**
 * RedRabbit Orders API - Main Server Entry Point
 * 
 * Starts the Express.js server and handles application lifecycle.
 * This is the main entry point for the microservice.
 */

import { Server, createApp } from './app.js';
import { DatabaseService } from './services/database.js';

// Export app for testing
export const app = createApp();

/**
 * Main application startup
 */
async function main(): Promise<void> {
  console.log('🐰 Starting RedRabbit Orders API...');
  
  const server = new Server();
  
  try {
    // Initialize database connection
    console.log('🔌 Connecting to database...');
    const databaseService = new DatabaseService();
    await databaseService.initialize();
    console.log('✅ Database connection established');
    
    // Start the HTTP server
    console.log('🚀 Starting HTTP server...');
    await server.start();
    console.log('✅ Server started successfully');
    
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

/**
 * Handle unhandled errors
 */
process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

process.on('uncaughtException', (error: Error) => {
  console.error('❌ Uncaught Exception:', error);
  process.exit(1);
});

// Check if this module is being run directly
const isMain = import.meta.url === `file://${process.argv[1]}`;

// Start the application only if run directly
if (isMain) {
  main().catch((error) => {
    console.error('❌ Application startup failed:', error);
    process.exit(1);
  });
}