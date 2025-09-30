# Implementation Plan: Retail Orders Microservice

**Branch**: `001-build-a-microservice` | **Date**: September 19, 2025 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `C:\workspace\redrabbit\specs\001-build-a-microservice\spec.md`

## Execution Flow (/plan command scope)
```
1. Load feature spec from Input path
   → If not found: ERROR "No feature spec at {path}"
2. Fill Technical Context (scan for NEEDS CLARIFICATION)
   → Detect Project Type from context (web=frontend+backend, mobile=app+api)
   → Set Structure Decision based on project type
3. Fill the Constitution Check section based on the content of the constitution document.
4. Evaluate Constitution Check section below
   → If violations exist: Document in Complexity Tracking
   → If no justification possible: ERROR "Simplify approach first"
   → Update Progress Tracking: Initial Constitution Check
5. Execute Phase 0 → research.md
   → If NEEDS CLARIFICATION remain: ERROR "Resolve unknowns"
6. Execute Phase 1 → contracts, data-model.md, quickstart.md, agent-specific template file
7. Re-evaluate Constitution Check section
   → If new violations: Refactor design, return to Phase 1
   → Update Progress Tracking: Post-Design Constitution Check
8. Plan Phase 2 → Describe task generation approach (DO NOT create tasks.md)
9. STOP - Ready for /tasks command
```

## Summary
Build a microservice that handles retail orders for home improvement supplies and tools, with comprehensive order management, payment processing, inventory integration, and customer service capabilities using TypeScript with minimal dependencies.

## Technical Context
**Language/Version**: TypeScript 5.2+ with Node.js 18+
**Primary Dependencies**: Express.js (minimal web framework), node:http (native), zod (validation), jsonwebtoken (auth)
**Storage**: PostgreSQL with native pg driver (no ORM)
**Testing**: Node.js native test runner, supertest for API testing
**Target Platform**: Linux containers (Docker) with Kubernetes deployment
**Project Type**: single (microservice API only)
**Performance Goals**: 1000+ concurrent requests, <200ms p95 response time, 99.9% uptime
**Constraints**: <100MB memory usage, minimal external dependencies, PCI DSS compliance
**Scale/Scope**: 10k+ orders/day, commercial and retail customers, real-time inventory integration

**Technical Approach**: TypeScript and minimal dependencies focus per requirements

## Constitution Check
*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Constitution file appears to be template only - proceeding with standard best practices:
- ✅ Library-First: Core business logic as separate modules
- ✅ Test-First: TDD approach with comprehensive test coverage  
- ✅ Simplicity: Minimal dependencies, standard patterns
- ✅ Clear interfaces: RESTful APIs with OpenAPI contracts

## Project Structure

### Documentation (this feature)
```
specs/001-build-a-microservice/
├── plan.md              # This file (/plan command output)
├── research.md          # Phase 0 output (/plan command)
├── data-model.md        # Phase 1 output (/plan command)
├── quickstart.md        # Phase 1 output (/plan command)
├── contracts/           # Phase 1 output (/plan command)
└── tasks.md             # Phase 2 output (/tasks command - NOT created by /plan)
```

### Source Code (repository root)
```
# Option 1: Single project (DEFAULT) - TypeScript Microservice
src/
├── models/           # Domain entities and validation
├── services/         # Business logic and external integrations
├── controllers/      # HTTP request handlers
├── middleware/       # Auth, validation, error handling
├── lib/              # Shared utilities and configurations
└── types/            # TypeScript type definitions

tests/
├── unit/             # Model and service unit tests
├── integration/      # API endpoint tests
└── contract/         # External service contract tests

config/
├── database.ts       # DB connection and migration setup
├── server.ts         # Express server configuration
└── environment.ts    # Environment variables and validation
```

**Structure Decision**: Option 1 (Single TypeScript microservice project)

## Phase 0: Outline & Research
1. **Extract unknowns from Technical Context**: All technical choices are specified - TypeScript, minimal dependencies approach
2. **Research Areas**:
   - TypeScript best practices for microservices with minimal dependencies
   - Native Node.js capabilities vs external libraries
   - PostgreSQL integration without ORM (raw SQL approach)
   - PCI DSS compliance requirements for payment processing
   - Container optimization for <100MB memory constraint

3. **Key Research Questions**:
   - Optimal TypeScript configuration for production microservices
   - Native Node.js HTTP vs minimal Express.js setup
   - Database connection pooling with native pg driver
   - JWT implementation for authentication without heavy libraries
   - Input validation patterns with minimal dependencies

**Output**: research.md with technology decisions and rationale

## Phase 1: Design & Contracts
*Prerequisites: research.md complete*

1. **Extract entities from feature spec** → `data-model.md`:
   - Order, OrderLineItem, Product, Customer, Address, Payment
   - OrderEvent, APIKey, WebhookSubscription, InventoryReservation
   - TypeScript interfaces with validation schemas

2. **Generate API contracts** from functional requirements:
   - REST endpoints for order CRUD operations
   - Authentication and authorization endpoints
   - Webhook management endpoints
   - OpenAPI 3.0 specification in `/contracts/`

3. **Generate contract tests** from contracts:
   - API endpoint tests with request/response validation
   - Authentication flow tests
   - Integration tests for external service calls

4. **Extract test scenarios** from user stories:
   - Order placement workflow tests
   - Payment processing integration tests
   - Inventory validation scenarios

5. **Update agent file** for GitHub Copilot context

**Output**: data-model.md, /contracts/*, failing tests, quickstart.md, .github/copilot-instructions.md

## Phase 2: Task Planning Approach
*This section describes what the /tasks command will do - DO NOT execute during /plan*

**Task Generation Strategy**:
- Load `.specify/templates/tasks-template.md` as base template
- Generate tasks from TypeScript microservice design artifacts:
  * Each TypeScript interface in data-model.md → type definition + validation task [P]
  * Each OpenAPI endpoint in contracts/ → contract test + implementation task
  * Each domain service identified → service layer task with tests [P]
  * Each middleware requirement → middleware implementation task [P]
  * Database schema and migration tasks
  * Docker containerization and deployment tasks

**Ordering Strategy**:
- TDD order: All contract tests before any implementation
- Dependency order: Types → Models → Services → Controllers → Middleware → Integration
- Infrastructure first: Database setup, environment configuration
- Mark [P] for parallel execution where no dependencies exist:
  * Type definitions can be created in parallel
  * Independent service modules can be developed in parallel
  * Contract tests for different endpoints can be written in parallel

**TypeScript-Specific Considerations**:
- Zod schema creation alongside TypeScript interfaces
- API route handlers with proper type safety
- Middleware typing and error handling patterns
- Database query functions with typed results
- JWT token validation and role-based authorization

**Estimated Task Breakdown**:
1. **Setup & Infrastructure (5 tasks)**:
   - Project initialization with TypeScript config
   - Database setup and migrations
   - Environment configuration and validation
   - Docker containerization setup
   - CI/CD pipeline configuration

2. **Core Types & Models (8 tasks)**:
   - TypeScript interfaces for all domain entities [P]
   - Zod validation schemas for each entity [P]
   - Database query functions for each entity
   - Entity relationship mapping and validation

3. **API Layer (12 tasks)**:
   - Contract tests for Orders API endpoints
   - Contract tests for Customers API endpoints  
   - Contract tests for authentication endpoints
   - Order management route handlers
   - Customer management route handlers
   - Authentication middleware implementation
   - Input validation middleware
   - Error handling middleware
   - Rate limiting middleware

4. **Business Logic (10 tasks)**:
   - Order processing service with inventory checks
   - Payment integration service with PCI compliance
   - Customer management service
   - Inventory reservation service
   - Webhook delivery service
   - Email notification service
   - Tax calculation service
   - Shipping calculator service

5. **Integration & Testing (8 tasks)**:
   - Integration tests for complete order workflows
   - Payment processor integration tests
   - Database integration tests with cleanup
   - Authentication flow integration tests
   - API contract validation tests
   - Performance and load testing setup
   - Security testing and vulnerability scanning
   - End-to-end workflow testing

**Estimated Total**: 43 numbered, ordered tasks optimized for TypeScript development

**IMPORTANT**: This phase is executed by the /tasks command, NOT by /plan

## Complexity Tracking
*No constitutional violations identified - proceeding with standard microservice architecture*

## Progress Tracking
*This checklist is updated during execution flow*

**Phase Status**:
- [x] Phase 0: Research complete (/plan command)
- [x] Phase 1: Design complete (/plan command)
- [x] Phase 2: Task planning complete (/plan command - describe approach only)
- [ ] Phase 3: Tasks generated (/tasks command)
- [ ] Phase 4: Implementation complete
- [ ] Phase 5: Validation passed

**Gate Status**:
- [x] Initial Constitution Check: PASS
- [x] Post-Design Constitution Check: PASS
- [x] All NEEDS CLARIFICATION resolved
- [x] Complexity deviations documented

---
*Based on Constitutional principles and TypeScript microservice best practices*