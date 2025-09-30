# Data Access Layer - Repository Pattern Implementation

This document describes the comprehensive data access layer implementation using the repository pattern for the retail orders microservice.

## Overview

The data access layer provides a clean, type-safe interface between the business logic and the database. It implements the repository pattern with the following key components:

- **Repository Interfaces**: Define contracts for data access operations
- **Base Repository**: Abstract class providing common CRUD functionality  
- **Concrete Repositories**: Specific implementations for Customer, Product, and Order entities
- **Repository Factory**: Dependency injection and service composition
- **Database Seeding**: Utilities for populating test data

## Architecture

```
src/repositories/
├── interfaces.ts     # Repository interfaces and type definitions
├── base.ts          # Base repository abstract class
├── customer.ts      # Customer repository implementation
├── product.ts       # Product repository implementation  
├── order.ts         # Order repository implementation
├── index.ts         # Main entry point with factory and service
└── seed.ts          # Database seeding system
```

## Key Features

### Type Safety
- Full TypeScript support with strict mode compliance
- Comprehensive interfaces for all data models
- Type-safe query parameters and results

### Repository Pattern Benefits
- **Separation of Concerns**: Business logic separated from data access
- **Testability**: Easy to mock repositories for unit testing
- **Consistency**: Standardized CRUD operations across all entities
- **Flexibility**: Easy to switch data sources or add caching

### Advanced Functionality
- **Pagination**: Built-in pagination support with metadata
- **Search**: Full-text search with filtering options
- **Transactions**: Support for database transactions across repositories
- **Validation**: Data validation at the repository level
- **Error Handling**: Comprehensive error handling with custom exceptions

## Repository Implementations

### CustomerRepository
- **CRUD Operations**: Create, read, update, delete customers
- **Address Management**: Handle customer shipping/billing addresses
- **Search**: Search by name, email, phone with pagination
- **Analytics**: Customer order history and statistics

**Key Methods:**
```typescript
create(data: CreateCustomerData): Promise<Customer>
findByEmail(email: string): Promise<Customer | null>
addAddress(customerId: string, address: CreateAddressData): Promise<Address>
getOrderHistory(customerId: string): Promise<PaginatedResult<Order>>
```

### ProductRepository
- **CRUD Operations**: Manage products with full lifecycle
- **Category Management**: Handle product categories
- **Inventory Tracking**: Stock levels and inventory movements
- **Search**: Advanced search with filters (category, price, stock)
- **Analytics**: Popular products, low stock alerts

**Key Methods:**
```typescript
create(data: CreateProductData): Promise<Product>
findBySku(sku: string): Promise<Product | null>
updateStock(productId: string, quantity: number): Promise<Product | null>
getLowStockProducts(threshold?: number): Promise<Product[]>
```

### OrderRepository  
- **CRUD Operations**: Complete order lifecycle management
- **Order Items**: Manage items within orders
- **Status Management**: Order status transitions with validation
- **Calculations**: Automatic total calculations
- **Analytics**: Sales reports, revenue tracking

**Key Methods:**
```typescript
create(data: CreateOrderData): Promise<Order>
addItem(orderId: string, item: CreateOrderItemData): Promise<OrderItem>
updateStatus(orderId: string, status: OrderStatus): Promise<Order | null>
calculateTotals(orderId: string): Promise<OrderTotals>
```

## Repository Factory & Service

### RepositoryFactory
Provides centralized repository creation with dependency injection:

```typescript
const factory = new RepositoryFactory(database);
const customerRepo = factory.getCustomerRepository();
const productRepo = factory.getProductRepository();
const orderRepo = factory.getOrderRepository();
```

### RepositoryService
High-level service combining multiple repositories for complex operations:

```typescript
const service = new RepositoryService(factory);

// Create order with full validation
const order = await service.createOrderWithValidation({
  customerId: 'customer-id',
  items: [{ productId: 'product-id', quantity: 2, unitPrice: 49.99 }],
  shippingAddressId: 'address-id',
  billingAddressId: 'address-id'
});
```

## Database Seeding

### SeedDataGenerator
Generates realistic test data:
- **Customers**: Names, emails, phones, companies
- **Products**: Various categories with realistic pricing
- **Orders**: Historical order data with proper relationships
- **Addresses**: US-style addresses for customers

### DatabaseSeeder
Orchestrates the seeding process:
```typescript
const seeder = new DatabaseSeeder(database);
await seeder.seed({
  customers: 100,
  products: 500,
  orders: 200
});
```

### CLI Tool
Convenient command-line interface:
```bash
# Seed with default configuration
npm run db:seed

# Seed with custom parameters  
npm run db:seed -- --customers 50 --products 200

# Show database statistics
npm run db:seed:stats
```

## Usage Examples

### Basic Repository Usage
```typescript
import { DatabaseService } from '../services/database.js';
import { RepositoryFactory } from './repositories/index.js';

// Initialize
const db = new DatabaseService();
await db.initialize();

const factory = new RepositoryFactory(db);
const customerRepo = factory.getCustomerRepository();

// Create customer
const customer = await customerRepo.create({
  firstName: 'John',
  lastName: 'Doe', 
  email: 'john@example.com'
});

// Add address
const address = await customerRepo.addAddress(customer.id, {
  type: AddressType.BILLING,
  street1: '123 Main St',
  city: 'Anytown',
  state: 'CA',
  zipCode: '12345',
  country: 'US'
});
```

### Transaction Usage
```typescript
import { RepositoryService } from './repositories/index.js';

const service = new RepositoryService(factory);

await service.withTransaction(async (repos) => {
  // All operations in single transaction
  const customer = await repos.customers.create(customerData);
  const product = await repos.products.create(productData);
  const order = await repos.orders.create({
    customerId: customer.id,
    // ... order data
  });
  
  await repos.orders.addItem(order.id, {
    productId: product.id,
    quantity: 2,
    unitPrice: 49.99
  });
});
```

### Search and Pagination
```typescript
// Search customers with pagination
const results = await customerRepo.search({
  query: 'john',
  page: 1,
  limit: 10,
  sortBy: 'lastName',
  sortOrder: 'asc'
});

console.log(results.data);        // Customer[]
console.log(results.total);      // Total count
console.log(results.totalPages); // Total pages
console.log(results.hasNext);    // Has next page
```

## Testing

### Integration Tests
Comprehensive integration tests cover:
- Repository CRUD operations
- Complex queries and relationships
- Transaction handling
- Error scenarios

Run tests:
```bash
npm run test:integration
```

### Test Database
Tests use a separate test database to avoid conflicts:
```bash
export TEST_DB_NAME=retail_orders_test
npm run test:integration
```

## Configuration

### Environment Variables
```bash
DB_HOST=localhost
DB_PORT=5432
DB_NAME=retail_orders
DB_USER=postgres
DB_PASSWORD=password
```

### TypeScript Configuration
The repository layer is built with strict TypeScript settings:
- `exactOptionalPropertyTypes: true`
- `verbatimModuleSyntax: true` 
- Strict null checks and type checking

## Error Handling

### Custom Exceptions
```typescript
export class RepositoryError extends Error {
  constructor(message: string, public cause?: Error) {
    super(message);
    this.name = 'RepositoryError';
  }
}

export class NotFoundError extends RepositoryError {
  constructor(entity: string, id: string) {
    super(`${entity} with ID ${id} not found`);
    this.name = 'NotFoundError';
  }
}
```

### Error Types
- **ValidationError**: Data validation failures
- **NotFoundError**: Entity not found
- **DuplicateError**: Unique constraint violations
- **TransactionError**: Database transaction failures

## Performance Considerations

### Query Optimization
- Indexed columns for common queries
- Efficient pagination using OFFSET/LIMIT
- Selective field loading to minimize data transfer

### Connection Management  
- Connection pooling via `pg.Pool`
- Automatic connection cleanup
- Health check monitoring

### Caching Strategy
Repository layer is designed to support caching:
```typescript
// Future caching implementation
export class CachedCustomerRepository extends CustomerRepository {
  async findById(id: string): Promise<Customer | null> {
    const cached = await this.cache.get(id);
    if (cached) return cached;
    
    const customer = await super.findById(id);
    if (customer) {
      await this.cache.set(id, customer, 300); // 5 min TTL
    }
    return customer;
  }
}
```

## Best Practices

### Repository Design
- Keep repositories focused on single entities
- Use interfaces to define contracts
- Implement consistent error handling
- Provide comprehensive documentation

### Data Access
- Always use parameterized queries
- Handle null/undefined values properly
- Validate input data at repository level
- Use transactions for multi-table operations

### Testing
- Write integration tests for all repositories
- Mock repositories in unit tests
- Test error scenarios and edge cases
- Use test databases to avoid conflicts

## Future Enhancements

### Potential Improvements
1. **Caching Layer**: Redis integration for frequently accessed data
2. **Query Builder**: More sophisticated query building capabilities
3. **Migrations**: Schema migration support within repository layer
4. **Audit Trail**: Automatic audit logging for data changes
5. **Soft Deletes**: Configurable soft delete functionality
6. **Read Replicas**: Support for read/write splitting

### Monitoring & Observability
- Query performance monitoring
- Connection pool metrics
- Error rate tracking
- Repository usage analytics

---

This data access layer provides a solid foundation for the microservice, with type safety, comprehensive functionality, and excellent testing coverage. The repository pattern ensures clean separation of concerns while maintaining flexibility for future enhancements.