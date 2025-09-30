# Kubernetes Deployment Notes: Orders API

## Quick Deploy (Namespace assumed created)
```bash
kubectl apply -k k8s/
```

## Health Endpoints
- Liveness: `GET /health/live` (basic process check)
- Readiness: `GET /health/ready` (DB + downstream readiness when implemented)

## Secrets
Edit `secret-example.yaml` and apply as real secret (avoid committing real values):
```bash
kubectl apply -f k8s/secret-example.yaml
```
Replace with external secret manager integration (e.g., SealedSecrets, ExternalSecrets) in higher environments.

## Scaling
```bash
kubectl scale deploy/orders-api --replicas=3
```
(Optional future) Add an HPA manifest based on CPU or custom metrics.

## Log Review
```bash
kubectl logs deploy/orders-api -f
```

## Rollout Status
```bash
kubectl rollout status deploy/orders-api
```

## Image Update via Kustomize Override
```bash
kustomize edit set image ghcr.io/example/orders-api=ghcr.io/your-org/orders-api:0.1.1
kubectl apply -k k8s/
```

## Port Forward (Local Access)
```bash
kubectl port-forward svc/orders-api 8080:80
```

## Cleanup
```bash
kubectl delete -k k8s/
```

---
Last Updated: 2025-09-22
