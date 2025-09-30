# Tasks: Retail Orders Microservice

**Input**: Design documents from `/specs/001-build-a-microservice/`
**Prerequisites**: plan.md (✓), research.md (✓), data-model.md (✓), contracts/ (✓)

## Execution Flow (main)
```
1. Load plan.md from feature directory
   → Tech stack: TypeScript 5.2+ with Node.js 18+, Express.js, PostgreSQL
   → Dependencies: pg (native), zod (validation), jsonwebtoken (auth)
   → Structure: Single microservice project
2. Load design documents:
   → data-model.md: 10 entities extracted → model tasks
   → contracts/orders-api.yaml: 8 endpoints → contract test tasks
   → research.md: Technical decisions → setup tasks
3. Generate tasks by category:
   → Setup: TypeScript project, dependencies, database
   → Tests: Contract tests for all API endpoints (TDD)
   → Core: TypeScript models with Zod validation
   → Services: Business logic and integrations
   → API: Express route handlers with middleware
   → Integration: Database, auth, logging, webhooks
   → Polish: Unit tests, performance validation, docs
4. Apply task rules:
   → Different files = mark [P] for parallel execution
   → Same file = sequential (no [P])
   → All tests before implementation (TDD)
5. Number tasks sequentially (T001-T044)
6. Validate completeness: All contracts tested, all entities modeled
7. Return: SUCCESS (44 tasks ready for TypeScript microservice)
```

## Format: `[ID] [P?] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- All file paths are relative to repository root

## Path Conventions (Single TypeScript Microservice)
- **Source**: `src/` at repository root
- **Tests**: `tests/` with `unit/`, `integration/`, `contract/` subdirectories
- **Config**: `config/` for database and server configuration
- **Scripts**: `scripts/` for database migrations and utilities

## Phase 3.1: Project Setup & Infrastructure

- [x] **T001** Create TypeScript project structure with `src/`, `tests/`, `config/`, `scripts/` directories and initialize package.json with Node.js 18+ requirements

- [x] **T002** [P] Configure TypeScript 5.2+ with strict mode, ES modules, and optimal compiler options in `tsconfig.json` for production microservice

- [x] **T003** [P] Install and configure ESLint + Prettier with TypeScript-specific rules in `.eslintrc.js` and `.prettierrc`

- [x] **T004** [P] Set up PostgreSQL database schema and migration system in `scripts/migrations/` with connection pooling configuration

- [x] **T005** [P] Create Docker containerization with multi-stage Alpine Linux build targeting <100MB image size in `Dockerfile` and `docker-compose.yml`

- [x] **T006** Configure environment variables validation using Zod schema in `config/environment.ts` with type-safe configuration loading

## Phase 3.2: Tests First (TDD) ⚠️ MUST COMPLETE BEFORE 3.3

**CRITICAL: These tests MUST be written and MUST FAIL before ANY implementation**

### API Contract Tests [P] - All Independent Files
- [x] **T007** [P] Contract test POST /v1/orders endpoint with order creation validation in `tests/contract/orders-post.test.ts`

- [x] **T008** [P] Contract test GET /v1/orders endpoint with filtering and pagination in `tests/contract/orders-get.test.ts`

- [x] **T009** [P] Contract test GET /v1/orders/{orderId} endpoint with order retrieval in `tests/contract/orders-get-by-id.test.ts`

- [x] **T010** [P] Contract test PUT /v1/orders/{orderId} endpoint with order updates in `tests/contract/orders-put.test.ts`

- [x] **T011** [P] Contract test POST /v1/orders/{orderId}/cancel endpoint with cancellation logic in `tests/contract/orders-cancel.test.ts`

- [x] **T012** [P] Contract test GET /v1/orders/{orderId}/line-items endpoint in `tests/contract/order-line-items.test.ts`

- [x] **T013** [P] Contract test GET /v1/orders/{orderId}/events endpoint for order audit trail in `tests/contract/order-events.test.ts`

- [x] **T014** [P] Contract test authentication and authorization middleware with JWT tokens in `tests/contract/auth-middleware.test.ts`

### Integration Test Scenarios [P] - All Independent Files
- [x] **T015** [P] Integration test complete order creation workflow with inventory validation in `tests/integration/order-creation-workflow.test.ts`

- [x] **T016** [P] Integration test payment processing with external service mocks in `tests/integration/payment-processing.test.ts`

- [x] **T017** [P] Integration test inventory reservation and release logic in `tests/integration/inventory-management.test.ts`

- [x] **T018** [P] Integration test webhook delivery with retry mechanisms in `tests/integration/webhook-delivery.test.ts`

- [x] **T019** [P] Integration test order status transitions and event logging in `tests/integration/order-lifecycle.test.ts`

## Phase 3.2b: Repository Unit Testing Infrastructure (TDD Foundation)
**COMPLETED: Database mocking and repository testing framework**

- [x] **T019a** [P] Build comprehensive database mocking utilities in `tests/unit/utils/database-mocks.ts` with MockDatabaseService, QueryResult simulation, and TestDataGenerator

- [x] **T019b** [P] Create Customer repository unit tests with CRUD operations, email validation, and existence checks in `tests/unit/customer-core.test.ts`

- [x] **T019c** [P] Create Product repository unit tests with inventory management, category operations, and stock validation in `tests/unit/product-core.test.ts`

- [x] **T019d** [P] Create Order repository unit tests with order lifecycle, status transitions, and item management in `tests/unit/order-simple.test.ts`

## Phase 3.3: Core Domain Models (ONLY after tests are failing)

### TypeScript Interfaces & Zod Schemas [P] - All Independent Files
- [x] **T020** [P] Order entity with TypeScript interface and Zod validation schema in `src/models/Order.ts`

- [x] **T021** [P] OrderLineItem entity with quantity and pricing validation in `src/models/OrderLineItem.ts`

- [x] **T022** [P] Product entity with inventory tracking properties in `src/models/Product.ts`

- [x] **T023** [P] Customer entity with retail/commercial type distinctions in `src/models/Customer.ts`

- [x] **T024** [P] Address entity with validation for US postal addresses in `src/models/Address.ts`

- [x] **T025** [P] Payment entity with PCI-compliant data handling in `src/models/Payment.ts`

- [x] **T026** [P] OrderEvent entity for audit trail functionality in `src/models/OrderEvent.ts`

- [x] **T027** [P] APIKey entity for authentication and rate limiting in `src/models/APIKey.ts`

- [x] **T028** [P] WebhookSubscription entity for external notifications in `src/models/WebhookSubscription.ts`

- [x] **T029** [P] InventoryReservation entity for concurrent order handling in `src/models/InventoryReservation.ts`

## Phase 3.4: Database Layer & Services

### Database Operations - Sequential (Share Connection Logic)
- [x] **T030** Database connection and query utilities with connection pooling in `src/lib/database.ts`

- [x] **T031** Order repository with CRUD operations and complex queries in `src/repositories/OrderRepository.ts`

- [x] **T032** Customer repository with search and filtering capabilities in `src/repositories/CustomerRepository.ts`

- [x] **T033** Product repository with inventory management functions in `src/repositories/ProductRepository.ts`

### Business Logic Services [P] - Independent Business Logic
- [x] **T034** [P] OrderService with order processing and validation logic in `src/services/OrderService.ts`

- [x] **T035** [P] PaymentService with external payment processor integration in `src/services/PaymentService.ts`

- [x] **T036** [P] InventoryService with real-time stock checking in `src/services/InventoryService.ts`

- [x] **T037** [P] WebhookService with delivery and retry mechanisms in `src/services/WebhookService.ts`

- [x] **T038** [P] NotificationService for order status updates in `src/services/NotificationService.ts`

## Phase 3.5: API Layer & Middleware

### Express.js Route Handlers - Sequential (Share Express App)
- [x] **T039** Orders API routes (POST, GET, PUT) with request validation in `src/controllers/OrderController.ts`

- [x] **T040** Authentication middleware with JWT validation and role-based access in `src/middleware/auth.ts`

- [x] **T041** Input validation middleware using Zod schemas in `src/middleware/validation.ts`

- [x] **T042** Error handling middleware with standardized responses in `src/middleware/errorHandler.ts`

- [x] **T043** Rate limiting and security middleware (CORS, helmet) in `src/middleware/security.ts`

## Phase 3.6: Final Integration & Polish

- [x] **T044** Main Express application with all routes, middleware, and startup logic in `src/server.ts`

## Dependencies

### Phase Dependencies
- Setup (T001-T006) before all other phases
- Tests (T007-T019) before implementation (T020-T044)
- Models (T020-T029) before services (T030-T038)
- Services before API layer (T039-T043)
- API components before final integration (T044)

### File-Level Dependencies
- T030 (database utilities) blocks T031-T033 (repositories)
- T031-T033 (repositories) block T034-T038 (services)
- T040-T043 (middleware) needed for T044 (server integration)

## Parallel Execution Examples

### Contract Tests Phase (Run Simultaneously)
```bash
# All contract tests can run in parallel - different files
Task: "Contract test POST /v1/orders endpoint in tests/contract/orders-post.test.ts"
Task: "Contract test GET /v1/orders endpoint in tests/contract/orders-get.test.ts" 
Task: "Contract test GET /v1/orders/{orderId} in tests/contract/orders-get-by-id.test.ts"
Task: "Contract test authentication middleware in tests/contract/auth.test.ts"
```

### Model Creation Phase (Run Simultaneously)
```bash
# All TypeScript models can be created in parallel - independent files
Task: "Order entity with TypeScript interface in src/models/Order.ts"
Task: "Customer entity with validation in src/models/Customer.ts"
Task: "Product entity with inventory tracking in src/models/Product.ts" 
Task: "Payment entity with PCI compliance in src/models/Payment.ts"
```

### Service Layer Phase (Run Simultaneously)
```bash
# Business logic services can be developed in parallel - independent logic
Task: "OrderService with processing logic in src/services/OrderService.ts"
Task: "PaymentService with external integration in src/services/PaymentService.ts"
Task: "InventoryService with stock checking in src/services/InventoryService.ts"
Task: "WebhookService with delivery logic in src/services/WebhookService.ts"
```

## Notes

### TDD Compliance
- **All contract tests (T007-T014) MUST fail initially** - no implementation exists yet
- **All integration tests (T015-T019) MUST fail initially** - business logic not implemented
- Verify each test fails with meaningful error before proceeding to implementation

### TypeScript Best Practices
- Use strict TypeScript configuration with `noImplicitAny`, `strictNullChecks`
- Implement proper error handling with typed exceptions
- Use Zod for runtime validation alongside TypeScript compile-time checking
- Follow consistent naming conventions and file organization

### Performance & Security
- Implement connection pooling with configurable limits (T030)
- Use prepared statements to prevent SQL injection (T031-T033)
- Implement proper JWT token validation and expiration (T040)
- Add rate limiting and security headers (T043)

### Database Considerations
- All monetary amounts stored as integers (cents) for precision
- Use UUIDs for all entity identifiers
- Implement proper indexing for query performance
- Set up database migrations for schema changes

## Task Validation Checklist
*GATE: Verified before execution*

- [x] All 8 API endpoints have contract tests (T007-T014)
- [x] All 10 entities have model creation tasks (T020-T029)
- [x] All tests come before implementation (T007-T019 before T020-T044)
- [x] Parallel tasks are truly independent (different files, no shared state)
- [x] Each task specifies exact file path and clear deliverable
- [x] No [P] task modifies same file as another [P] task
- [x] Dependencies properly mapped (database before repositories before services)
- [x] TDD workflow enforced (failing tests required before implementation)