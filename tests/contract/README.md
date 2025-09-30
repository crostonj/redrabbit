# Contract Test Development - Orders API

## Test Dependencies Setup

```powershell
npm install --save-dev supertest @types/supertest
```

## Test File Structure

### `tests/contract/orders-post.test.ts`
- **Purpose**: Contract testing for POST /v1/orders endpoint
- **Status**: ✅ Created (MUST FAIL - TDD compliance)
- **Coverage**: 16 comprehensive test scenarios covering validation, business logic, authentication, and error handling

## Test Scenarios Coverage

### Valid Order Creation (3 tests)
1. **Complete order creation** - Full payload with all optional fields
2. **Minimal order creation** - Required fields only
3. **Multiple line items** - Complex order with 3+ products

### Request Validation (6 tests)
4. **Invalid customer ID** - Non-UUID format rejection
5. **Empty items array** - Must contain at least one item
6. **Negative quantity** - Business rule validation
7. **Negative unit price** - Price validation
8. **Invalid shipping address ID** - UUID format validation
9. **Notes length validation** - 500 character limit

### Business Logic Validation (4 tests)
10. **Non-existent customer** - 404 for invalid customer
11. **Non-existent product** - 404 for invalid product
12. **Non-existent shipping address** - 404 for invalid address
13. **Insufficient inventory** - 409 for stock validation

### Authentication & Authorization (2 tests)
14. **Missing auth token** - 401 unauthorized
15. **Invalid auth token** - 401 invalid token

### Error Response Format (1 test)
16. **Consistent error format** - Standardized error structure

## Zod Schema Validation

### Request Schema (`CreateOrderRequestSchema`)
- Customer ID: UUID validation
- Items array: Min 1 item, positive quantities, non-negative prices
- Shipping/billing addresses: UUID validation
- Notes: Optional, max 500 characters

### Response Schema (`CreateOrderResponseSchema`)
- Order ID: UUID format
- Order number: Format `ORD-XXXXXXXX-XXXX`
- Status: Enum validation (pending, confirmed, etc.)
- Financial fields: Non-negative integers (cents)
- Timestamps: ISO datetime format
- Nested item and address objects

## TDD Compliance ✅

The contract test is properly designed to fail initially:
- Express app import is intentionally broken
- `before()` hook throws error: "Express app not implemented yet"
- All 16 test scenarios will fail until implementation exists
- TypeScript compilation errors confirm no implementation exists

## Next Implementation Steps

1. Create Express app structure (`src/server.ts`)
2. Implement POST /v1/orders route handler
3. Add request validation middleware (Zod)
4. Implement business logic services
5. Add authentication middleware
6. Run contract test to verify implementation

## Expected Test Behavior

```bash
# Current behavior (TDD compliance)
npm test -- tests/contract/orders-post.test.ts
# Should fail with: "Express app not implemented yet"

# After implementation
npm test -- tests/contract/orders-post.test.ts  
# Should pass all 16 test scenarios
```

## Integration Points

- Database: Customer, Product, Address, Order entities
- Authentication: JWT token validation
- Inventory: Stock level checking
- Tax/Shipping: Price calculation services
- Error handling: Standardized error response format