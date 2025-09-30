# Database Documentation

## Overview

The RedRabbit Orders microservice uses PostgreSQL 13+ as its primary database with a comprehensive migration system for schema management. The database is designed for scalability, performance, and data integrity.

## Database Schema

### Core Tables

1. **customers** - Customer information and profiles
2. **addresses** - Shipping and billing addresses
3. **products** - Product catalog with inventory
4. **categories** - Product categorization hierarchy
5. **orders** - Order records and status tracking
6. **order_items** - Individual items within orders
7. **payments** - Payment processing records
8. **inventory_movements** - Inventory tracking and audit

### Features

- **UUID Primary Keys** - Using `uuid-ossp` extension for distributed system compatibility
- **Full-Text Search** - Using `pg_trgm` extension for product and customer search
- **Case-Insensitive Text** - Using `citext` extension for emails and usernames
- **JSONB Columns** - For flexible metadata and configuration storage
- **Audit Trails** - Automatic timestamp tracking with database triggers
- **Business Logic** - Database triggers for inventory management and order calculations

## Migration System

### Commands

```bash
# Run all pending migrations
npm run db:migrate

# Run migrations up to specific version
npm run db:migrate:up 3

# Rollback to specific version
npm run db:migrate:down 2

# Show migration status
npm run db:migrate:status

# Validate migration integrity
npm run db:migrate:validate

# Reset database (rollback all + migrate all)
npm run db:migrate:reset

# Show help
npx tsx scripts/migrate.ts --help
```

### Migration Files

Located in `src/database/migrations/`:

- **001_create_initial_schema.sql** - Core tables, enums, and constraints
- **002_add_performance_indexes.sql** - Database indexes for query optimization
- **003_add_database_triggers.sql** - Business logic automation
- **004_add_database_views.sql** - Reporting and analytics views

### Environment Variables

```bash
# Option 1: Full connection string
DATABASE_URL=postgresql://user:password@localhost:5432/database_name

# Option 2: Individual components
DB_NAME=redrabbit_orders
DB_USER=postgres
DB_PASSWORD=password
DB_HOST=localhost
DB_PORT=5432
```

## Database Views

### Business Intelligence Views

1. **order_summary** - Complete order information with customer and totals
2. **product_inventory** - Current inventory levels with movement tracking
3. **customer_order_history** - Customer purchase patterns and totals
4. **daily_sales_summary** - Daily sales metrics and performance
5. **low_stock_alerts** - Products below minimum stock levels
6. **popular_products** - Product popularity rankings
7. **payment_summary** - Payment status and financial reporting

### Example Queries

```sql
-- Get daily sales report
SELECT * FROM daily_sales_summary 
WHERE sale_date >= CURRENT_DATE - INTERVAL '7 days'
ORDER BY sale_date DESC;

-- Find low stock products
SELECT * FROM low_stock_alerts
WHERE current_stock <= minimum_stock * 1.2;

-- Customer order history
SELECT * FROM customer_order_history 
WHERE customer_id = 'uuid-here'
ORDER BY last_order_date DESC;
```

## Database Triggers

### Automatic Triggers

1. **Updated At Timestamps** - Automatically maintains `updated_at` columns
2. **Order Total Calculation** - Recalculates order totals when items change
3. **Inventory Tracking** - Creates audit records for all inventory changes

### Trigger Functions

```sql
-- Update timestamp on row modification
SELECT update_updated_at_column();

-- Recalculate order totals
SELECT update_order_totals();

-- Track inventory movements
SELECT track_inventory_movement();
```

## Performance Optimizations

### Indexes

- **B-tree indexes** for primary key lookups and foreign key joins
- **GIN indexes** for JSONB columns and full-text search
- **Partial indexes** for active records and common query patterns
- **Composite indexes** for multi-column queries

### Query Optimization

- Use prepared statements for repeated queries
- Leverage database views for complex reporting
- Monitor query performance with `EXPLAIN ANALYZE`
- Regular `VACUUM` and `ANALYZE` for table statistics

## Data Validation

### Constraints

- **Foreign Key Constraints** - Referential integrity across tables
- **Check Constraints** - Data validation rules (prices > 0, valid statuses)
- **Unique Constraints** - Prevent duplicate data (emails, SKUs)
- **Not Null Constraints** - Required field validation

### Business Rules

- Order status progression validation
- Inventory cannot go negative
- Payment amounts match order totals
- Customer addresses belong to correct customer

## Backup and Recovery

### Development

```bash
# Backup database
pg_dump -U postgres redrabbit_orders > backup.sql

# Restore database
psql -U postgres -d redrabbit_orders < backup.sql
```

### Production

- Automated daily backups with point-in-time recovery
- Database replication for high availability
- Regular backup testing and restore procedures

## Troubleshooting

### Common Issues

1. **Connection Refused** - Verify PostgreSQL is running and accepting connections
2. **Migration Conflicts** - Check migration status and resolve manually if needed
3. **Performance Issues** - Use `EXPLAIN ANALYZE` to identify slow queries

### Debug Commands

```sql
-- Check active connections
SELECT * FROM pg_stat_activity;

-- View table sizes
SELECT schemaname, tablename, pg_size_pretty(pg_total_relation_size(tablename::regclass))
FROM pg_tables WHERE schemaname = 'public';

-- Monitor query performance
SELECT query, mean_exec_time, calls 
FROM pg_stat_statements 
ORDER BY mean_exec_time DESC LIMIT 10;
```

## Development Workflow

1. **Schema Changes** - Create new migration file with UP and DOWN sections
2. **Testing** - Test migrations in development environment
3. **Review** - Code review migration files for correctness
4. **Deploy** - Run migrations in staging, then production
5. **Monitor** - Check application performance after schema changes

For more information, see the migration manager source code in `src/database/migration-manager.ts`.