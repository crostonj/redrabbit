# API Contracts: Retail Orders Microservice

This directory contains the OpenAPI 3.0 specifications and contract definitions for the Retail Orders Microservice.

## Files

- `orders-api.yaml` - Core orders management API
- `customers-api.yaml` - Customer management API  
- `products-api.yaml` - Product catalog API (read-only)
- `webhooks-api.yaml` - Webhook management API
- `admin-api.yaml` - Administrative operations API

## API Design Principles

1. **RESTful Design**: Standard HTTP methods and resource-based URLs
2. **Consistent Responses**: Standardized error formats and status codes
3. **Versioning**: API versioning via URL path (`/v1/`)
4. **Validation**: Request/response validation using JSON Schema
5. **Security**: JWT authentication with role-based permissions
6. **Pagination**: Cursor-based pagination for list endpoints
7. **Filtering**: Query parameters for resource filtering and search

## Authentication

All API endpoints (except health checks) require JWT authentication:

```
Authorization: Bearer <jwt-token>
```

## Standard Response Format

### Success Response
```json
{
  "data": {}, // Resource data or array of resources
  "meta": {   // Metadata (pagination, etc.)
    "total": 100,
    "page": 1,
    "pageSize": 20
  }
}
```

### Error Response  
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request data",
    "details": [
      {
        "field": "email",
        "message": "Invalid email format"
      }
    ]
  }
}
```

## Status Codes

- `200` - Success with response body
- `201` - Created successfully  
- `204` - Success with no response body
- `400` - Bad Request (validation error)
- `401` - Unauthorized (invalid/missing JWT)
- `403` - Forbidden (insufficient permissions)
- `404` - Not Found
- `409` - Conflict (resource already exists)
- `422` - Unprocessable Entity (business logic error)
- `429` - Too Many Requests (rate limiting)
- `500` - Internal Server Error