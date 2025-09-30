# Quickstart Guide: Retail Orders Microservice

**Technology**: TypeScript + Node.js + PostgreSQL
**Dependencies**: Minimal (Express, pg, zod, jsonwebtoken)

## Prerequisites

- Node.js 18+ LTS
- PostgreSQL 14+
- Docker (for containerized deployment)
- TypeScript 5.2+

## Quick Setup

### 1. Environment Setup

```bash
# Clone and setup
git clone <repository>
cd retail-orders-microservice

# Install minimal dependencies
npm install

# Setup database
createdb orders_development
npm run db:migrate

# Set environment variables
cp .env.example .env
# Edit .env with your database credentials
```

### 2. Environment Variables

```env
# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/orders_development

# Server
PORT=3000
NODE_ENV=development

# Authentication
JWT_SECRET=your-256-bit-secret-key-here
JWT_EXPIRES_IN=1h

# Rate Limiting
RATE_LIMIT_RPM=100

# External Services
PAYMENT_PROCESSOR_API_KEY=your-payment-api-key
INVENTORY_SERVICE_URL=http://localhost:3001
SHIPPING_CALCULATOR_URL=http://localhost:3002
```

### 3. Database Migration

```bash
# Run migrations
npm run db:migrate

# Seed with sample data (development only)
npm run db:seed
```

### 4. Start Development Server

```bash
# Start with hot reload
npm run dev

# Or build and start production
npm run build
npm start
```

Server starts at `http://localhost:3000`

## API Usage Examples

### Authentication

First, obtain a JWT token (in production, integrate with your auth system):

```bash
# Development: Get test JWT token
curl -X POST http://localhost:3000/auth/token \
  -H "Content-Type: application/json" \
  -d '{"userId": "test-user", "role": "admin"}'
```

Use the token in all subsequent requests:
```bash
export TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

### Create Customer

```bash
curl -X POST http://localhost:3000/v1/customers \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "firstName": "John",
    "lastName": "Doe", 
    "email": "john.doe@example.com",
    "phone": "+1-555-0123",
    "type": "retail"
  }'
```

### Create Order

```bash
curl -X POST http://localhost:3000/v1/orders \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "customerId": "customer-uuid-here",
    "lineItems": [
      {
        "productId": "product-uuid-here",
        "quantity": 2
      }
    ],
    "billingAddress": {
      "addressLine1": "123 Main St",
      "city": "Anytown",
      "state": "CA",
      "postalCode": "12345"
    },
    "shippingAddress": {
      "addressLine1": "123 Main St",
      "city": "Anytown", 
      "state": "CA",
      "postalCode": "12345"
    },
    "shippingMethod": "standard"
  }'
```

### Get Orders

```bash
# List all orders
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:3000/v1/orders"

# Filter by customer
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:3000/v1/orders?customerId=customer-uuid"

# Filter by status and date range
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:3000/v1/orders?status=processing&dateFrom=2025-01-01T00:00:00Z"
```

### Update Order Status

```bash
# Process order (move from pending to processing)
curl -X POST http://localhost:3000/v1/orders/order-uuid/process \
  -H "Authorization: Bearer $TOKEN"

# Cancel order
curl -X POST http://localhost:3000/v1/orders/order-uuid/cancel \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"reason": "Customer requested cancellation"}'
```

## Health Checks

```bash
# Basic health check
curl http://localhost:3000/health

# Detailed health with dependencies
curl http://localhost:3000/health/detailed
```

## Testing

### Run All Tests

```bash
# Unit tests
npm run test:unit

# Integration tests  
npm run test:integration

# All tests
npm test
```

### Test Specific Scenarios

```bash
# Test order creation workflow
npm run test -- --grep "order creation"

# Test payment processing
npm run test -- --grep "payment"

# Test inventory integration
npm run test -- --grep "inventory"
```

## Development Workflow

### 1. Test-Driven Development

```bash
# Create failing test first
npm run test:watch

# Write minimal code to pass test
# Refactor while keeping tests green
```

### 2. API Contract Testing

```bash
# Validate OpenAPI contracts
npm run validate:contracts

# Generate TypeScript types from contracts
npm run generate:types
```

### 3. Database Changes

```bash
# Create new migration
npm run db:migration:create add_new_field

# Run migrations
npm run db:migrate

# Rollback if needed
npm run db:rollback
```

## Production Deployment

### Docker Build

```bash
# Build optimized image
docker build -t orders-api:latest .

# Run with environment
docker run -d \
  -p 3000:3000 \
  -e DATABASE_URL=postgresql://... \
  -e JWT_SECRET=... \
  orders-api:latest
```

### Kubernetes Deployment

```bash
# Apply Kubernetes manifests
kubectl apply -f k8s/

# Check deployment status
kubectl get pods -l app=orders-api
```

### Health Monitoring

The service provides these endpoints for monitoring:

- `GET /health` - Basic health check
- `GET /health/detailed` - Health with dependency status  
- `GET /metrics` - Prometheus-compatible metrics

## Configuration

### Minimal Dependencies Strategy

This service intentionally uses minimal dependencies:

- **Express.js**: Lightweight web framework
- **pg**: Native PostgreSQL driver (no ORM)
- **zod**: TypeScript schema validation
- **jsonwebtoken**: JWT token handling

### Performance Tuning

```env
# Database connection pooling
DB_POOL_MIN=2
DB_POOL_MAX=10

# Server tuning
CLUSTER_WORKERS=auto
KEEP_ALIVE_TIMEOUT=65000

# Memory optimization
NODE_OPTIONS="--max-old-space-size=512"
```

### Security Configuration

```env
# HTTPS enforcement (production)
FORCE_HTTPS=true

# CORS configuration
CORS_ORIGINS=https://yourfrontend.com,https://admin.yoursite.com

# Rate limiting
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=100
```

## Troubleshooting

### Common Issues

1. **Database Connection**: Check `DATABASE_URL` format
2. **JWT Errors**: Verify `JWT_SECRET` is set and secure
3. **Permission Errors**: Ensure proper API key permissions
4. **Memory Usage**: Monitor with `/metrics` endpoint

### Debug Mode

```bash
# Enable debug logging
DEBUG=orders:* npm run dev

# Database query logging
DEBUG_SQL=true npm run dev
```

### Log Levels

- `error`: Errors requiring attention
- `warn`: Warnings and degraded functionality  
- `info`: Normal operational messages
- `debug`: Detailed debugging information

## API Documentation

Full API documentation is available at:
- Interactive docs: `http://localhost:3000/docs`
- OpenAPI spec: `http://localhost:3000/openapi.json`
- Contract files: `./contracts/`

## Next Steps

1. **Integration**: Connect with your existing systems
2. **Monitoring**: Set up logging and metrics collection
3. **Scaling**: Configure horizontal scaling and load balancing
4. **Security**: Implement production security measures
5. **Backup**: Set up automated database backups

For detailed implementation guidance, see `tasks.md` (generated by `/tasks` command).