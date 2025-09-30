# Service Constitution: Retail Orders Microservice

> Base minimum operational and architectural charter for a REST-based microservice deployed to Kubernetes.

## 1. Purpose
Provide reliable order lifecycle management (creation → fulfillment → completion/cancellation) with inventory coordination, payment orchestration hooks, webhook notifications, and auditable event history.

## 2. Scope & Boundaries
In-Scope:
- Order persistence, status transitions, audit events
- Inventory reservation requests (delegated / stubbed integration)
- Payment intent orchestration (no direct PCI storage)
- Webhook emission (delivery + retry policy)
- Authentication & authorization (JWT bearer) for API access
- Basic rate limiting + request validation

Out-of-Scope (delegated to other services/platform):
- Actual payment processor settlement logic
- Warehouse management / physical logistics
- Email/SMS notification delivery infrastructure
- Customer identity management
- Data warehouse ETL / analytics
- PCI storage of raw card data

## 3. Non-Goals
- Not a monolith; no cross-domain feature accretion
- Not a real-time event streaming engine
- Not responsible for user authentication provider (only token verification)
- Not responsible for SLA of downstream systems (only graceful degradation)

## 4. Core Principles
1. Tests-first (TDD): All contract + integration tests precede implementation (Phase 3.2 tasks)
2. Explicit state machine: Order status transitions are validated and auditable
3. Fail fast, recover safely: Partial failures trigger compensating actions or retries
4. Idempotency: All externally triggered mutating operations are idempotent via keys or natural constraints
5. Observability first: Every business mutation emits structured events + metrics
6. Principle of least privilege: Narrow DB roles, scoped JWT claims, minimized RBAC
7. Configuration as data: No environment-derived hidden logic; all runtime config validated via Zod
8. Deterministic migrations: Forward-only migration scripts; no drift

## 5. API Conventions
- REST, JSON only (UTF-8)
- Resource naming: `orders`, `orders/{id}/events`, `orders/{id}/line-items`
- Pagination: `?page=number&limit=number` with sensible caps
- Filtering: explicit query params (no ad hoc search endpoints initially)
- Error format:
```json
{
  "error": {
    "code": "string_identifier",
    "message": "Human readable",
    "details": {"field?": "context"},
    "traceId": "uuid"
  }
}
```
- Versioning: URI version prefix (`/v1/`); breaking changes require `/v2/`
- Idempotency: Client may send `Idempotency-Key` header for POST order creation; server stores hash + response
- Rate limiting: Per API key / token (initially fixed in-memory or Redis-ready abstraction)

## 6. Data & Persistence
- PostgreSQL primary store
- UUID v4 keys for all entities
- Monetary values stored in integer cents (`INT` / `BIGINT`)
- Timestamps UTC only (`TIMESTAMP WITH TIME ZONE` or ISO8601 at edge)
- No soft deletes for core orders (immutable event log instead); cancellations are state transitions
- Index strategy: (order_id), (customer_id, created_at DESC), (status, updated_at DESC)

## 7. Configuration Management
- All required env vars validated in `config/environment.ts` via Zod before server start
- Required baseline:
  - `PORT`
  - `DATABASE_URL`
  - `JWT_PUBLIC_KEY` or `JWT_JWKS_URL`
  - `WEBHOOK_SIGNATURE_SECRET`
  - `LOG_LEVEL`
  - `NODE_ENV` (`development|test|production`)
- Optional (defaulted) vars documented inline with schema

## 8. Security Baseline
- Authentication: JWT (asymmetric preferred). Reject expired / invalid signatures
- Authorization: Role/claim-based (e.g., `role=system|staff|customer`)
- Input validation: Zod schemas per payload
- Headers enforced: `Content-Type: application/json` for mutating actions
- Sensitive logs redaction: Payment references, auth headers, PII partial masking (email local part hashed)
- TLS termination assumed at ingress; service listens plain HTTP internally
- Secrets mounted via Kubernetes secret → env vars

## 9. Observability & Telemetry
- Logging: Structured JSON (level, timestamp, msg, traceId, spanId, correlationId, orderId?)
- Metrics (future add Prometheus exporter):
  - `order_created_total`
  - `order_status_transition_total{from,to}`
  - `order_webhook_delivery_duration_seconds`
  - `order_payment_attempts_total{result}`
  - `inventory_reservation_latency_ms`
- Tracing: OpenTelemetry ready hooks (no-op exporter until infra attached)
- Audit Events: Immutable append-only order event log

## 10. Resilience & Reliability
- Database connection pool with max concurrency caps
- Retries (exponential backoff) for:
  - Webhook delivery (bounded attempts)
  - Payment confirmation polling (if async)
- Circuit breaker (planned) abstraction around external services
- Timeouts on all outbound HTTP calls (default 5s)
- Graceful shutdown: stop accepting new requests, drain in-flight, flush logs

## 11. Deployment (Kubernetes Baseline)
- Pod spec:
  - Liveness probe: `GET /health/live`
  - Readiness probe: `GET /health/ready`
  - Resources (initial): `requests: 50m CPU / 64Mi`, `limits: 250m / 256Mi`
  - Single container; sidecars for logging/metrics optional later
- Rollouts: RollingUpdate (maxUnavailable 1, maxSurge 1)
- ConfigMap: non-secret config (log level, feature flags)
- Secret: database URL, JWT keys, webhook signing secret
- Horizontal Pod Autoscaler (future): scale on CPU > 70% or RPS metric

## 12. Lifecycle & Versioning
- Git main branch protected; PRs require green test suite
- Semantic versioning for container image tags (`major.minor.patch`)
- Backward compatible DB changes → additive migrations first
- Deprecation policy: Old endpoints maintained for ≥1 minor version post new release

## 13. Testing Policy
Layered test strategy:
- Contract tests: Enforce public API shape (fail first)
- Integration tests: Cross-module behavior (order lifecycle, webhooks, inventory)
- Unit tests: Repositories + services
- Mutation testing (future) to validate coverage quality
- Build pipeline blocks merges on failing tests or lint errors

## 14. Operational Readiness (SLO Placeholders)
| Dimension | Target | Notes |
|----------|--------|-------|
| Availability | 99.5% | Single AZ acceptable initially |
| P95 Order Creation Latency | < 300ms | After warm cache/pool |
| Webhook Delivery Success (w/in 5m) | 99% | Retries included |
| Error Rate (5xx) | < 1% of requests | Excluding client errors |
| Data Consistency (event log) | 100% | No missing transitions |

## 15. Runbook (Minimum)
Incident Classification:
- SEV1: API returning 5xx > 20% sustained 5m
- SEV2: Webhook backlog > 1k pending or retries exhausted > 5%
- SEV3: Latency breach (P95 > target for 15m)

Immediate Actions:
1. Capture traceId samples of failing requests
2. Check DB connectivity & pool saturation
3. Inspect pod restart counts & OOM kills
4. Verify queue backlog depth (webhooks)
5. Toggle feature flags if regression tied

## 16. Deletion & GDPR Considerations (Forward Plan)
- Logical redaction of PII fields (email, phone) upon deletion request while preserving order financial/audit integrity
- Event log remains immutable; redaction events appended

## 17. Backlog (Explicit Future Enhancements)
- Add OpenAPI doc generation from contracts
- Implement idempotency persistence layer
- Add Prometheus + Grafana dashboards
- Introduce dead-letter queue for failed webhooks
- Add partial fulfillment workflow (split shipments)
- Implement distributed tracing exporter

## 18. Enforcement
This constitution is considered ACCEPTANCE CRITERIA for productionization. Changes require PR with explicit section modification + approval from architecture or platform owner.

---
Last Updated: 2025-09-22
