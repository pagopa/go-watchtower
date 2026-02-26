# Product Support Tables API

This module implements CRUD APIs for the support tables of the incident management system.

## Features

- Full CRUD operations for all support tables
- RBAC (Role-Based Access Control) integration
- TypeBox schema validation for request/response
- Proper error handling (400, 403, 404, 500)
- OpenAPI/Swagger documentation
- Nested resource routes

## API Endpoints

### Products

Base path: `/api/products`

- `GET /api/products` - List all products (requires: PRODUCT read)
- `GET /api/products/:id` - Get product by ID (requires: PRODUCT read)
- `POST /api/products` - Create product (requires: PRODUCT write)
- `PUT /api/products/:id` - Update product (requires: PRODUCT write)
- `DELETE /api/products/:id` - Delete product (requires: PRODUCT delete)

### Environments

Base path: `/api/products/:productId/environments`

- `GET /api/products/:productId/environments` - List environments (requires: ENVIRONMENT read)
- `POST /api/products/:productId/environments` - Create environment (requires: ENVIRONMENT write)
- `PUT /api/products/:productId/environments/:id` - Update environment (requires: ENVIRONMENT write)
- `DELETE /api/products/:productId/environments/:id` - Delete environment (requires: ENVIRONMENT delete)

### Microservices

Base path: `/api/products/:productId/microservices`

- `GET /api/products/:productId/microservices` - List microservices (requires: MICROSERVICE read)
- `POST /api/products/:productId/microservices` - Create microservice (requires: MICROSERVICE write)
- `PUT /api/products/:productId/microservices/:id` - Update microservice (requires: MICROSERVICE write)
- `DELETE /api/products/:productId/microservices/:id` - Delete microservice (requires: MICROSERVICE delete)

### Runbooks

Base path: `/api/products/:productId/runbooks`

- `GET /api/products/:productId/runbooks` - List runbooks (requires: RUNBOOK read)
- `POST /api/products/:productId/runbooks` - Create runbook (requires: RUNBOOK write)
- `PUT /api/products/:productId/runbooks/:id` - Update runbook (requires: RUNBOOK write)
- `DELETE /api/products/:productId/runbooks/:id` - Delete runbook (requires: RUNBOOK delete)

### Conclusions

Base path: `/api/products/:productId/conclusions`

- `GET /api/products/:productId/conclusions` - List conclusions (requires: CONCLUSION read)
- `POST /api/products/:productId/conclusions` - Create conclusion (requires: CONCLUSION write)
- `PUT /api/products/:productId/conclusions/:id` - Update conclusion (requires: CONCLUSION write)
- `DELETE /api/products/:productId/conclusions/:id` - Delete conclusion (requires: CONCLUSION delete)

## Permission System

All endpoints are protected by the RBAC system. Each operation requires specific permissions:

- `read` - View resources
- `write` - Create and update resources
- `delete` - Remove resources

The permission checks are performed using the `hasPermission` function from `permission.service.ts`.

## Request/Response Examples

### Create Product

**Request:**
```bash
POST /api/products
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "PagoPA",
  "description": "PagoPA payment platform",
  "isActive": true
}
```

**Response (201):**
```json
{
  "id": "clx123abc",
  "name": "PagoPA",
  "description": "PagoPA payment platform",
  "isActive": true,
  "createdAt": "2026-02-05T17:00:00.000Z",
  "updatedAt": "2026-02-05T17:00:00.000Z"
}
```

### Create Environment

**Request:**
```bash
POST /api/products/clx123abc/environments
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "Production",
  "description": "Production environment",
  "order": 1
}
```

**Response (201):**
```json
{
  "id": "clx456def",
  "name": "Production",
  "description": "Production environment",
  "order": 1,
  "productId": "clx123abc",
  "createdAt": "2026-02-05T17:00:00.000Z",
  "updatedAt": "2026-02-05T17:00:00.000Z"
}
```

## Error Responses

### 400 Bad Request
Invalid input data or constraint violation.

```json
{
  "error": "Unique constraint failed on the fields: (`productId`,`name`)"
}
```

### 403 Forbidden
User doesn't have required permission.

```json
{
  "error": "Permission denied"
}
```

### 404 Not Found
Resource not found.

```json
{
  "error": "Product not found"
}
```

### 500 Internal Server Error
Unexpected server error.

```json
{
  "error": "Failed to create product"
}
```

## Testing

You can test the API using curl or any HTTP client:

```bash
# Login first to get a token
TOKEN=$(curl -X POST http://localhost:3001/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"password"}' \
  | jq -r '.accessToken')

# Create a product
curl -X POST http://localhost:3001/api/products \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"PagoPA","description":"Payment platform","isActive":true}'

# List products
curl -X GET http://localhost:3001/api/products \
  -H "Authorization: Bearer $TOKEN"

# Create an environment
PRODUCT_ID="<product-id-from-previous-response>"
curl -X POST http://localhost:3001/api/products/$PRODUCT_ID/environments \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Production","order":1}'
```

## File Structure

```
packages/api/src/routes/products/
├── index.ts      # Route handlers for all CRUD operations
├── schemas.ts    # TypeBox validation schemas
└── README.md     # This documentation
```

## Implementation Details

### Authentication
All routes use the `app.authenticate` hook to verify JWT tokens.

### Authorization
Permission checks are performed in each handler using `hasPermission()`:

```typescript
const canWrite = await hasPermission(request.user.userId, Resource.PRODUCT, "write");
if (!canWrite) {
  return reply.status(403).send({ error: "Permission denied" });
}
```

### Validation
TypeBox schemas validate both input and output:

- Request body validation
- URL parameter validation
- Response schema enforcement

### Error Handling
Consistent error handling across all endpoints:

- Prisma errors are caught and mapped to appropriate HTTP status codes
- User-friendly error messages
- Proper status code usage (400, 403, 404, 500)

### Database Operations
All database operations use Prisma Client with proper error handling:

- Transaction support where needed
- Cascade delete configured in schema
- Unique constraint validation
- Proper ordering (by name, order field)

## Dependencies

- `fastify` - Web framework
- `@fastify/type-provider-typebox` - TypeScript type provider
- `@sinclair/typebox` - JSON schema validation
- `@go-watchtower/database` - Prisma client and types
- `permission.service.ts` - RBAC permission checks
