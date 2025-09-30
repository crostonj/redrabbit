## Retail Orders Microservice – Memory Constitution (Sync Summary)

This file is a condensed, tooling-friendly mirror of the canonical service charter in `CONSTITUTION.md`. For full detail (rationale, SLO tables, backlog, runbook), always consult the root document. Keep this summary lean so specification / automation layers can quickly ingest core rules.

### 1. Purpose
Manage lifecycle of retail orders (create → validate → reserve inventory → payment orchestration hook → fulfillment → completion/cancellation) with auditable events and webhook notifications.

### 2. Non‑Goals
No direct payment settlement, no warehouse ops, no identity provider, no analytics warehouse ETL, no raw PCI storage, no monolithic feature creep.

### 3. Core Principles
1. TDD First: All contract & integration tests exist and fail before implementation.
2. Explicit State Machine: All status transitions validated & event logged.
3. Idempotency: Mutating endpoints support safe retries (Idempotency-Key or natural keying).
4. Observability Early: Structured logs + event audit trail + metrics/tracing hooks ready.
5. Principle of Least Privilege: Narrow DB role + JWT claim based authorization.
6. Deterministic Migrations: Forward-only, versioned, reproducible.
7. Fail Fast / Recover Safely: Partial failures trigger compensating actions or bounded retries.
8. Configuration Validation: All env vars schema-checked at startup.

### 4. API Conventions
JSON over HTTP; version prefix `/v1`; consistent error envelope `{ error: { code, message, details, traceId } }`; pagination & filtering explicit; idempotent POST (orders) with `Idempotency-Key`; rate limiting & auth enforced.

### 5. Data Rules
PostgreSQL primary store; UUID v4 identifiers; monetary values integer cents; UTC timestamps; immutable event log (no soft delete of orders—cancellation is a state); indexing on access paths (customer+created_at, status+updated_at, order_id).

### 6. Security Baseline
JWT (asymmetric/JWKS) verification; role/claim guard; request body validation via Zod; redaction of sensitive fields in logs; secrets only from env / K8s Secret; TLS terminated at ingress.

### 7. Observability
Structured JSON logs (level, ts, traceId, correlationId, orderId); metrics (planned): order creation count, status transitions, webhook duration, payment attempts; OpenTelemetry hooks stubbed; audit events immutable.

### 8. Resilience
Connection pooling; bounded retries (webhooks, payment confirmation); timeouts on outbound HTTP; graceful shutdown drains in-flight requests; backoff strategy for transient errors.

### 9. Kubernetes Deployment (Baseline)
Deployment with liveness `/health/live` & readiness `/health/ready`; resource requests 50m/64Mi, limits 250m/256Mi; rolling updates (maxUnavailable=1, maxSurge=1); ConfigMap for non-secret toggles; Secrets for DB + JWT + webhook signing; future HPA on CPU or RPS.

### 10. Testing Strategy
Order: contract → integration → unit; failing tests mandatory pre-implementation; CI blocks on lint + tests. Mutation & load tests planned.

### 11. Versioning & Lifecycle
URI versioning (`/v1` → `/v2` for breaking changes); semantic image tags; additive DB changes first; deprecation window ≥ one minor version.

### 12. SLO Placeholders
Availability 99.5%; P95 order create <300ms (warm); Webhook success <5m: 99%; 5xx <1%; event log consistency 100%.

### 13. Governance
Canonical source: `CONSTITUTION.md`. Amend via PR referencing changed section; architectural approval required for principle modifications; tests updated if API contract shifts.

### 14. Future (Selected Backlog)
OpenAPI generation; Prometheus metrics exporter; dead-letter queue for failed webhooks; idempotency persistence store; split shipment support; tracing exporter.

---
Synced From: `CONSTITUTION.md`  | Last Sync: 2025-09-22