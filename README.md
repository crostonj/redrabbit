# Retail Orders Microservice

TypeScript + Express REST microservice providing order lifecycle management (creation, status transitions, audit trail, inventory reservation hooks, payment orchestration hooks, webhook emission) intended for deployment to Kubernetes.

## Status
Tests-first phase (TDD): Contract + integration tests authored before implementation. Domain model & service implementation tasks next (see `specs/001-build-a-microservice/tasks.md`).

## Key Documents
- Service Constitution: `CONSTITUTION.md` (architecture, security, ops baseline)
- Task Plan: `specs/001-build-a-microservice/tasks.md`
- API Contracts: `specs/001-build-a-microservice/contracts/`
- Kubernetes Manifests: `k8s/`

## Running Tests
```bash
npm install
npm test
```
(Tests expected to fail until implementation phases complete per TDD workflow.)

## Local Development (Planned)
```bash
npm run dev
```
Will start server once `src/` implementations (models, repositories, services, controllers) are created.

## Kubernetes Quickstart
```bash
kubectl apply -k k8s/
```
Requires a PostgreSQL instance and properly populated secret (`k8s/secret-example.yaml`).

## Environment Variables (Validated at Startup)
| Variable | Purpose |
|----------|---------|
| PORT | HTTP listen port (default 8080) |
| DATABASE_URL | PostgreSQL connection string |
| JWT_JWKS_URL / JWT_PUBLIC_KEY | JWT verification source |
| WEBHOOK_SIGNATURE_SECRET | HMAC signing secret for outbound webhooks |
| LOG_LEVEL | log verbosity (info, debug, warn, error) |
| NODE_ENV | runtime environment (development/test/production) |

## Observability (Planned)
Structured JSON logs + event audit trail; metrics & tracing hooks to be added in service implementation phase.

## License
(Choose a license; placeholder)

## Mock Database Mode

For running tests or iterating locally without a PostgreSQL instance you can enable an in-memory mock database layer.

Enable it by either:
- Setting environment variable `MOCK_DB=true`, or
- Running under `NODE_ENV=test` (auto-enabled in test runs).

Implemented features:
- Basic CRUD: INSERT / SELECT / UPDATE / DELETE with positional params ($1, $2, ...)
- WHERE filtering: equality and simple `LIKE` (substring match for `%pattern%`)
- Transaction snapshotting with rollback on error via `withTransaction`
- Constraint simulation: primary key, unique, and selected foreign keys (orders/order_items, inventory/*)
- Auto-increment (serial-style) for `order_items.id` when omitted
- Aggregates: `COUNT(*) AS alias`
- INSERT/UPDATE `RETURNING *` or explicit column list

Limitations:
- No joins, subqueries, complex expressions, ORDER BY/LIMIT parsing (except where done in code before calling DB)
- Regex-based SQL parsing; unexpected patterns return empty results or no-ops
- Foreign key checks only immediate (no deferred constraints)
- No performance optimizations; full table scans in memory
- Ephemeral: data lost when process exits

Use a real PostgreSQL instance (unset `MOCK_DB`) for full fidelity testing.
