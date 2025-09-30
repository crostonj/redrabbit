import { DatabaseService } from '../services/database.js';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Database Migration System
 * 
 * Handles database schema versioning, migrations, and rollbacks.
 * Supports both SQL files and programmatic migrations.
 */

export interface Migration {
  id: string;
  name: string;
  version: number;
  up: string | (() => Promise<void>);
  down?: string | (() => Promise<void>);
  checksum?: string;
  applied_at?: Date;
}

export class MigrationManager {
  private db: DatabaseService;
  private migrationsPath: string;

  constructor(databaseService: DatabaseService, migrationsPath?: string) {
    this.db = databaseService;
    this.migrationsPath = migrationsPath || join(__dirname, 'migrations');
  }

  /**
   * Initialize migration tracking table
   */
  async initializeMigrationTable(): Promise<void> {
    const createTableSQL = `
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id SERIAL PRIMARY KEY,
        migration_id VARCHAR(255) UNIQUE NOT NULL,
        name VARCHAR(255) NOT NULL,
        version INTEGER NOT NULL,
        checksum VARCHAR(64),
        applied_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        execution_time_ms INTEGER,
        
        CONSTRAINT schema_migrations_version_check CHECK (version > 0)
      );
      
      CREATE INDEX IF NOT EXISTS idx_schema_migrations_version 
        ON schema_migrations(version);
      CREATE INDEX IF NOT EXISTS idx_schema_migrations_applied 
        ON schema_migrations(applied_at);
    `;

    await this.db.query(createTableSQL);
    console.log('✅ Migration tracking table initialized');
  }

  /**
   * Get current database schema version
   */
  async getCurrentVersion(): Promise<number> {
    try {
      const result = await this.db.query(
        'SELECT MAX(version) as max_version FROM schema_migrations'
      );
      return result.rows[0]?.max_version || 0;
    } catch (error) {
      // If table doesn't exist, we're at version 0
      return 0;
    }
  }

  /**
   * Get list of applied migrations
   */
  async getAppliedMigrations(): Promise<Migration[]> {
    try {
      const result = await this.db.query(`
        SELECT migration_id, name, version, checksum, applied_at
        FROM schema_migrations 
        ORDER BY version ASC
      `);
      
      return result.rows.map(row => ({
        id: row.migration_id,
        name: row.name,
        version: row.version,
        checksum: row.checksum,
        applied_at: row.applied_at,
        up: '', // Not stored in DB
        ...(row.down && { down: row.down })
      }));
    } catch (error) {
      return [];
    }
  }

  /**
   * Load migration files from directory
   */
  async loadMigrationFiles(): Promise<Migration[]> {
    try {
      const files = await readdir(this.migrationsPath);
      const migrationFiles = files
        .filter(file => file.endsWith('.sql') || file.endsWith('.js') || file.endsWith('.ts'))
        .sort();

      const migrations: Migration[] = [];

      for (const file of migrationFiles) {
        const filePath = join(this.migrationsPath, file);
        const migration = await this.parseMigrationFile(filePath, file);
        if (migration) {
          migrations.push(migration);
        }
      }

      return migrations.sort((a, b) => a.version - b.version);
    } catch (error) {
      console.warn(`Warning: Could not load migrations from ${this.migrationsPath}`);
      return [];
    }
  }

  /**
   * Parse individual migration file
   */
  private async parseMigrationFile(filePath: string, fileName: string): Promise<Migration | null> {
    try {
      // Parse version and name from filename: "001_create_initial_schema.sql"
      const match = fileName.match(/^(\d+)_(.+)\.(sql|js|ts)$/);
      if (!match || !match[1] || !match[2] || !match[3]) {
        console.warn(`Skipping invalid migration file: ${fileName}`);
        return null;
      }

      const version = parseInt(match[1], 10);
      const name = match[2].replace(/_/g, ' ');
      const extension = match[3];

      const content = await readFile(filePath, 'utf-8');
      
      if (extension === 'sql') {
        // Parse SQL file with optional -- UP and -- DOWN sections
        const sections = this.parseSQLMigration(content);
        return {
          id: fileName,
          name,
          version,
          up: sections.up,
          ...(sections.down && { down: sections.down }),
          checksum: this.generateChecksum(sections.up)
        };
      } else {
        // For JS/TS files, import and extract functions
        // This is a simplified version - in practice you'd want proper module loading
        return {
          id: fileName,
          name,
          version,
          up: content, // Simplified - would need proper parsing
          checksum: this.generateChecksum(content)
        };
      }
    } catch (error) {
      console.error(`Error parsing migration file ${fileName}:`, error);
      return null;
    }
  }

  /**
   * Parse SQL migration file with UP/DOWN sections
   */
  private parseSQLMigration(content: string): { up: string; down?: string } {
    const lines = content.split('\n');
    let upSQL = '';
    let downSQL = '';
    let currentSection = 'up';

    for (const line of lines) {
      const trimmed = line.trim().toLowerCase();
      
      if (trimmed.startsWith('-- up') || trimmed.startsWith('--up')) {
        currentSection = 'up';
        continue;
      } else if (trimmed.startsWith('-- down') || trimmed.startsWith('--down')) {
        currentSection = 'down';
        continue;
      }

      if (currentSection === 'up') {
        upSQL += line + '\n';
      } else if (currentSection === 'down') {
        downSQL += line + '\n';
      }
    }

    const result: { up: string; down?: string } = {
      up: upSQL.trim()
    };

    const trimmedDownSQL = downSQL.trim();
    if (trimmedDownSQL) {
      result.down = trimmedDownSQL;
    }

    return result;
  }

  /**
   * Generate checksum for migration content
   */
  private generateChecksum(content: string): string {
    const crypto = require('node:crypto');
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  /**
   * Run pending migrations
   */
  async runMigrations(targetVersion?: number): Promise<void> {
    await this.initializeMigrationTable();
    
    const currentVersion = await this.getCurrentVersion();
    const appliedMigrations = await this.getAppliedMigrations();
    const availableMigrations = await this.loadMigrationFiles();
    
    console.log(`Current database version: ${currentVersion}`);
    console.log(`Found ${availableMigrations.length} migration files`);

    const pendingMigrations = availableMigrations.filter(migration => {
      const isApplied = appliedMigrations.some(applied => applied.id === migration.id);
      const withinTarget = !targetVersion || migration.version <= targetVersion;
      return !isApplied && withinTarget && migration.version > currentVersion;
    });

    if (pendingMigrations.length === 0) {
      console.log('✅ No pending migrations');
      return;
    }

    console.log(`Running ${pendingMigrations.length} pending migrations...`);

    for (const migration of pendingMigrations) {
      await this.runSingleMigration(migration);
    }

    const newVersion = await this.getCurrentVersion();
    console.log(`✅ Migrations complete. Database version: ${newVersion}`);
  }

  /**
   * Run a single migration
   */
  private async runSingleMigration(migration: Migration): Promise<void> {
    console.log(`\n🔄 Running migration: ${migration.id} - ${migration.name}`);
    const startTime = Date.now();

    try {
      await this.db.withTransaction(async (client) => {
        // Execute the migration
        if (typeof migration.up === 'string') {
          await client.query(migration.up);
        } else if (typeof migration.up === 'function') {
          await migration.up();
        }

        // Record the migration
        const executionTime = Date.now() - startTime;
        await client.query(`
          INSERT INTO schema_migrations 
            (migration_id, name, version, checksum, execution_time_ms)
          VALUES ($1, $2, $3, $4, $5)
        `, [
          migration.id,
          migration.name,
          migration.version,
          migration.checksum,
          executionTime
        ]);
      });

      const executionTime = Date.now() - startTime;
      console.log(`✅ Completed migration ${migration.id} (${executionTime}ms)`);
    } catch (error) {
      console.error(`❌ Failed migration ${migration.id}:`, error);
      throw error;
    }
  }

  /**
   * Rollback migrations to specific version
   */
  async rollbackToVersion(targetVersion: number): Promise<void> {
    const currentVersion = await this.getCurrentVersion();
    
    if (targetVersion >= currentVersion) {
      console.log('✅ No rollback needed');
      return;
    }

    const appliedMigrations = await this.getAppliedMigrations();
    const availableMigrations = await this.loadMigrationFiles();
    
    // Get migrations to rollback (in reverse order)
    const migrationsToRollback = appliedMigrations
      .filter(migration => migration.version > targetVersion)
      .sort((a, b) => b.version - a.version);

    console.log(`Rolling back ${migrationsToRollback.length} migrations...`);

    for (const appliedMigration of migrationsToRollback) {
      // Find the corresponding migration file for rollback SQL
      const migrationFile = availableMigrations.find(m => m.id === appliedMigration.id);
      
      if (!migrationFile?.down) {
        throw new Error(`No rollback script found for migration: ${appliedMigration.id}`);
      }

      await this.rollbackSingleMigration(appliedMigration, migrationFile.down);
    }

    const newVersion = await this.getCurrentVersion();
    console.log(`✅ Rollback complete. Database version: ${newVersion}`);
  }

  /**
   * Rollback a single migration
   */
  private async rollbackSingleMigration(migration: Migration, downScript: string | (() => Promise<void>)): Promise<void> {
    console.log(`\n🔄 Rolling back migration: ${migration.id} - ${migration.name}`);

    try {
      await this.db.withTransaction(async (client) => {
        // Execute rollback script
        if (typeof downScript === 'string') {
          await client.query(downScript);
        } else if (typeof downScript === 'function') {
          await downScript();
        }

        // Remove migration record
        await client.query(
          'DELETE FROM schema_migrations WHERE migration_id = $1',
          [migration.id]
        );
      });

      console.log(`✅ Rolled back migration ${migration.id}`);
    } catch (error) {
      console.error(`❌ Failed to rollback migration ${migration.id}:`, error);
      throw error;
    }
  }

  /**
   * Show migration status
   */
  async showStatus(): Promise<void> {
    const currentVersion = await this.getCurrentVersion();
    const appliedMigrations = await this.getAppliedMigrations();
    const availableMigrations = await this.loadMigrationFiles();

    console.log('\n📊 Database Migration Status');
    console.log('═'.repeat(50));
    console.log(`Current Version: ${currentVersion}`);
    console.log(`Applied Migrations: ${appliedMigrations.length}`);
    console.log(`Available Migrations: ${availableMigrations.length}`);

    const pendingMigrations = availableMigrations.filter(migration => {
      return !appliedMigrations.some(applied => applied.id === migration.id);
    });

    if (pendingMigrations.length > 0) {
      console.log(`Pending Migrations: ${pendingMigrations.length}`);
      console.log('\nPending:');
      for (const migration of pendingMigrations) {
        console.log(`  📄 ${migration.id} - ${migration.name}`);
      }
    } else {
      console.log('✅ Database is up to date');
    }

    console.log('\nApplied Migrations:');
    for (const migration of appliedMigrations) {
      const date = migration.applied_at ? migration.applied_at.toISOString().split('T')[0] : 'Unknown';
      console.log(`  ✅ ${migration.id} - ${migration.name} (${date})`);
    }
  }

  /**
   * Validate migration integrity
   */
  async validateMigrations(): Promise<boolean> {
    const appliedMigrations = await this.getAppliedMigrations();
    const availableMigrations = await this.loadMigrationFiles();
    
    let isValid = true;

    console.log('\n🔍 Validating Migration Integrity');
    console.log('═'.repeat(40));

    // Check for missing migration files
    for (const applied of appliedMigrations) {
      const fileExists = availableMigrations.some(available => available.id === applied.id);
      if (!fileExists) {
        console.error(`❌ Missing migration file: ${applied.id}`);
        isValid = false;
      }
    }

    // Check for checksum mismatches
    for (const applied of appliedMigrations) {
      const available = availableMigrations.find(m => m.id === applied.id);
      if (available && applied.checksum && available.checksum !== applied.checksum) {
        console.error(`❌ Checksum mismatch: ${applied.id}`);
        console.error(`  Expected: ${applied.checksum}`);
        console.error(`  Actual: ${available.checksum}`);
        isValid = false;
      }
    }

    if (isValid) {
      console.log('✅ All migrations are valid');
    } else {
      console.log('❌ Migration integrity check failed');
    }

    return isValid;
  }
}

export default MigrationManager;