<p align="center">
  <img src="https://raw.githubusercontent.com/Bin-E-Commerce/Bin-E-Commerce-UI-Web/main/public/images/logo/logo_background_white.png" alt="Bin E-Commerce" width="190" />
</p>

<h1 align="center">Cart Service</h1>

<p align="center">
  Keep every product a customer wants to buy together, consistent, recoverable, and ready for checkout.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/NestJS-11-E0234E?logo=nestjs&logoColor=white" alt="NestJS 11" />
  <img src="https://img.shields.io/badge/TypeScript-5.7-3178C6?logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/PostgreSQL-TypeORM-336791?logo=postgresql&logoColor=white" alt="PostgreSQL and TypeORM" />
  <img src="https://img.shields.io/badge/Validation-class--validator-3178C6?logo=typescript&logoColor=white" alt="Class validator" />
  <img src="https://img.shields.io/badge/REST-API-0F766E" alt="REST API" />
</p>

## Contents

1. [Problem](#1-problem)
2. [Service at a glance](#2-service-at-a-glance)
3. [What it owns](#3-what-it-owns)
4. [Architecture](#4-architecture)
5. [Trust surface](#5-trust-surface)
6. [See It Work](#6-see-it-work)
7. [Install](#7-install)
8. [Identity Model](#8-identity-model)
9. [Cart Lifecycle](#9-cart-lifecycle)
10. [Add Item Flow](#10-add-item-flow)
11. [Checkout Handoff](#11-checkout-handoff)
12. [API Surface](#12-api-surface)
13. [Data Model](#13-data-model)
14. [Concurrency and Consistency](#14-concurrency-and-consistency)
15. [Project Structure](#15-project-structure)
16. [Configuration Reference](#16-configuration-reference)
17. [Development](#17-development)
18. [Testing Strategy](#18-testing-strategy)
19. [Operational Notes](#19-operational-notes)
20. [Documentation Findings](#20-documentation-findings)
21. [FAQ](#21-faq)
22. [Ownership](#22-ownership)

## 1. Problem

A cart is a mutable state that belongs to a specific customer or anonymous browser session. It is read often, changed frequently and used as the starting point for checkout. That makes ownership and consistency more important than simply storing a list of product IDs.

Without a dedicated Cart Service, other parts of the platform may:

- Keep different copies of the same cart in browser state, Order Service and Product Service.
- Accept a cart ID or user ID supplied by the client and expose another customer's items.
- Store a product price that is later treated as the final checkout price.
- Lose quantity updates when two browser tabs add the same variant concurrently.
- Create a new empty cart while trying to update or check out an existing one.
- Read the Cart database directly from the checkout workflow, coupling two bounded contexts.

Cart Service owns the active-cart aggregate, resolves the owner identity, validates product information through Product Service and provides a protected handoff for checkout. It does not become the source of truth for product price, inventory or order status.

## 2. Service at a glance

| Attribute | Value |
| --- | --- |
| Service | cart-service |
| Default port | 3003 |
| HTTP prefix | /api |
| Public URI version | v1 |
| Development docs | /docs |
| Health endpoint | /api/health |
| Database | PostgreSQL + TypeORM |
| Downstream dependency | Product Service |
| Internal authentication | InternalServiceGuard and shared token |
| Persistence mode | Migrations enabled, synchronize disabled |

### Runtime responsibilities

Cart Service answers these questions:

1. What is the active cart for this customer or guest session?
2. Which items currently belong to that cart?
3. Is the requested product/variant purchasable and within the available quantity?
4. What should happen to the active cart after Order Service completes checkout?

The service does not answer how much inventory should ultimately be reserved or whether an order is paid, shipped or delivered.

## 3. What it owns

| Domain boundary | Cart Service owns |
| --- | --- |
| Cart aggregate | Active, checked-out and abandoned cart state |
| Cart identity | Customer and guest owner mapping |
| Cart items | Product/variant reference, quantity and display snapshot |
| Cart commands | Add, update, remove and checkout transition |
| Cart read model | Stable response mapping for cart pages |
| Database integrity | One active cart per owner and one item per cart variant |
| Product validation client | Contract call to Product Service before item persistence |

### What it does not own

| Concern | Source of truth |
| --- | --- |
| User identity | Auth Service and trusted Gateway context |
| Product master data | Product Service |
| Current price and inventory | Product Service / checkout contract |
| Order aggregate | Order Service |
| Payment status | Payment/order domain |
| Shipment status | Shipping Service |

The item stores a product display and price snapshot so the cart page can render consistently. That snapshot is not a checkout authorization and must be revalidated before an order is committed.

## 4. Architecture

~~~text
Browser
   |
   v
API Gateway
   |  trusted x-user-id / x-session-id
   v
Cart Service
   |
   +--> CartIdentityResolver
   +--> CartQueryService
   +--> CartItemCommandService
   |         |
   |         +--> ProductCatalogClient --> Product Service
   |
   +--> Cart repositories --> PostgreSQL
~~~

### Layer responsibilities

- Presentation controllers parse HTTP input, resolve the request identity and map the response.
- Application services implement cart query/command behavior and domain error mapping.
- ProductCatalogClient owns the HTTP contract used to validate product/variant data.
- Repositories own TypeORM persistence and query boundaries.
- Entities and migrations protect aggregate constraints at database level.

The module composition keeps the Cart bounded context independent from Product persistence entities. Product data is represented by a local integration type instead of importing another service's database model.

## 5. Trust surface

<details>
<summary>What Cart Service trusts and rejects</summary>

### Trusted after validation

- A customer identity forwarded by the trusted Gateway.
- A guest session identifier that matches the service's UUID validation rule.
- Product and variant information returned by Product Service.
- Cart/item IDs looked up under the resolved owner identity.
- Internal requests carrying the configured internal service token.
- PostgreSQL constraints and transactions after a successful commit.

### Never trusted directly

- A cart ID supplied by a public client to select another cart.
- A user ID or owner type supplied in the request body.
- Client-provided product name, unit price, stock or shop ownership.
- A quantity outside the DTO/business limits.
- A product response that is unavailable, malformed or not purchasable.

Public mutations resolve the cart from the request identity. Internal checkout also resolves ownership from headers instead of accepting an arbitrary cart ID, so an internal caller cannot accidentally cross customer boundaries.

</details>

## 6. See It Work

### 6.1. Start local

~~~powershell
cd services/cart-service
Copy-Item .env.example .env
npm install
npm run dev
~~~

The service expects PostgreSQL and Product Service to be reachable through the values in .env.

### 6.2. Check health and OpenAPI

~~~powershell
curl http://localhost:3003/api/health
~~~

Open http://localhost:3003/docs in development. Swagger describes the public cart controller; internal endpoints should remain a service-to-service contract.

### 6.3. Read a customer cart through the Gateway

~~~powershell
curl http://localhost:3001/api/v1/cart -H "Authorization: Bearer <keycloak-access-token>"
~~~

The Gateway must inject a verified x-user-id. A request without a customer or valid guest session identity is rejected instead of creating an orphan cart.

### 6.4. Guest cart contract

~~~powershell
curl http://localhost:3001/api/v1/cart -H "x-session-id: 550e8400-e29b-41d4-a716-446655440000"
~~~

In the real browser flow, the session ID should be generated and persisted by the client according to the web application's session contract. The service validates the format and treats it as a guest owner, not as a user identity.

## 7. Install

> [!IMPORTANT]
> Cart Service is stateful and depends on PostgreSQL plus Product Service. The internal service token must match trusted callers. Do not use database synchronization to change a production schema; use reviewed migrations.

### Required dependencies

| Dependency | Why it is required |
| --- | --- |
| PostgreSQL | Cart and cart-item persistence |
| Product Service | Product/variant status, price snapshot and available quantity |
| API Gateway | Browser authentication and identity propagation |

### Local build

~~~powershell
cd services/cart-service
Copy-Item .env.example .env
npm run type-check
npm run build
npm run start
~~~

### Recovery and rollback

Rolling back code does not restore a cart item that a customer intentionally added or removed. Schema rollback must use a migration. Business recovery should use explicit checkout/cancel operations rather than direct row edits.

## 8. Identity Model

### Owner types

The application identity is normalized to an owner type and owner ID:

~~~text
Customer: ownerType=CUSTOMER, ownerId=<verified x-user-id>
Guest:    ownerType=GUEST,    ownerId=<validated x-session-id>
~~~

The identity resolver prioritizes an authenticated customer over a guest session when both headers exist. This matters when a browser still carries its old guest session after login.

### Validation rules

- A customer requires a trusted x-user-id.
- A guest requires a valid UUID v4 x-session-id.
- Missing or malformed identity returns a client error.
- Public commands never receive owner identity from the JSON body.
- Internal callers still resolve the owner from trusted headers.

### Why identity belongs in the application layer

Controllers should not duplicate the customer-versus-guest decision. The resolver produces a stable CartIdentity object, allowing repositories and command services to work without knowing HTTP header formatting.

## 9. Cart Lifecycle

~~~text
ACTIVE
  |  checkout transition
  v
CHECKED_OUT

ACTIVE --------------------------> ABANDONED
~~~

### Active-cart invariant

There must be at most one active cart for an owner. The database unique index on owner type and owner ID protects this invariant even when two tabs request their first cart at the same time.

### Query semantics

GET active cart is idempotent:

- If an active cart exists, return it with its current items.
- If none exists, create one for the resolved identity.
- If a concurrent request wins creation, read the existing cart after the unique constraint conflict.

### Mutation semantics

Update/remove must not create an empty cart as a side effect. They first find the active cart and return a not-found/domain error when there is no target to mutate.

## 10. Add Item Flow

~~~text
POST /cart/items
       |
       v
resolve owner identity
       |
       v
validate DTO and quantity
       |
       v
read product/variant from Product Service
       |
       v
reject unavailable or excessive stock
       |
       v
lock active cart transaction
       |
       v
insert or increase the existing variant item
       |
       v
return the latest cart response
~~~

### Product snapshot boundary

ProductCatalogClient calls Product Service rather than importing its entity. The response provides the product/variant information needed to validate purchasability, quantity and the display/price snapshot stored in Cart.

### Duplicate variant behavior

The database unique index on cart ID and variant ID prevents two rows for the same variant. Adding an existing variant increases quantity inside the cart command transaction instead of creating a duplicate line.

### Errors

The application distinguishes:

- Catalog not found.
- Product or variant not purchasable.
- Requested quantity exceeding available stock.
- Product service unavailable.
- Invalid cart identity.
- Item/cart not found during a mutation.

These errors should remain distinguishable to the Gateway and frontend.

## 11. Checkout Handoff

~~~text
Order Service
      -> internal cart lookup for the active owner
      -> validate price/stock and commit the order
      -> internal cart checkout transition
      -> Cart marks the active aggregate CHECKED_OUT
      -> next public GET creates a new ACTIVE cart
~~~

### Boundary rules

- Order Service owns the checkout workflow and order aggregate.
- Cart Service exposes a protected internal contract instead of its database.
- Cart checkout happens only after the caller's order workflow has reached its agreed commit point.
- The transition is owner-scoped and should be safe to retry.
- A checked-out cart is historical state, not the next writable active cart.

The current internal controller exposes GET internal/carts/active and POST internal/carts/checkout. Both use InternalServiceGuard and resolve identity; they do not accept arbitrary public cart selection.

## 12. API Surface

All public cart routes use /api/v1. The health route is /api/health.

### Public cart API

| Method | Route | Purpose |
| --- | --- | --- |
| GET | /api/v1/cart | Get or create the active cart |
| POST | /api/v1/cart/items | Add a product variant |
| PATCH | /api/v1/cart/items/:itemId | Set supported item fields/quantity |
| DELETE | /api/v1/cart/items/:itemId | Remove an item from the owner cart |
| GET | /api/health | Process health |

### Internal checkout API

| Method | Route | Purpose |
| --- | --- | --- |
| GET | /api/internal/carts/active | Read an existing active cart without creating an empty one |
| POST | /api/internal/carts/checkout | Mark the active cart as checked out |

The public controller is explicitly versioned. The internal controller is a trusted service contract and should not be exposed as a browser-facing feature.

## 13. Data Model

~~~text
Cart
├── id
├── owner_type
├── owner_id
├── status: ACTIVE | CHECKED_OUT | ABANDONED
└── timestamps

CartItem
├── cart_id
├── product_id
├── variant_id
├── product_name snapshot
├── variant_name/sku snapshot
├── unit_price snapshot
├── quantity
├── origin_type
└── timestamps
~~~

### Database constraints

| Constraint | Purpose |
| --- | --- |
| Unique active owner | Prevent two active carts for one owner |
| Cart-item foreign key | Keep item owned by a real cart |
| Unique cart/variant | Prevent duplicate variant rows |
| Positive quantity | Reject invalid cart lines at database level |
| Non-negative unit price | Prevent impossible stored snapshot |
| Cascade item deletion | Remove child lines when cart is removed |

Product and variant IDs are logical cross-service references. They do not create a foreign key to Product Service's database.

## 14. Concurrency and Consistency

### First-cart race

Two tabs can call GET simultaneously. CartQueryService attempts creation in a transaction; if PostgreSQL reports the unique-owner conflict, the losing request reads the winner's active cart.

### Quantity race

Add-item commands lock the cart aggregate within a transaction so concurrent additions to the same variant do not silently lose one increment. The unique cart/variant index is the final database guard.

### Snapshot freshness

Cart snapshots optimize the cart page. They are intentionally not authoritative for checkout. Order must revalidate current product price, product state and inventory before committing.

### Retry safety

Setting an absolute quantity is safer than sending a delta for a retryable PATCH. Add operations still need the command's duplicate-variant and transaction behavior to be understood by clients.

## 15. Project Structure

~~~text
src/
├── main.ts                              # HTTP bootstrap, validation, versioning, Swagger
├── app.module.ts                        # PostgreSQL and feature composition
├── database/
│   ├── entities/                        # Cart and cart-item entities
│   ├── enums/                           # Cart lifecycle/status enums
│   ├── migrations/                      # Versioned schema changes
│   └── redis/                           # Reserved database module boundary
└── modules/cart/
    ├── application/
    │   ├── clients/                     # Product catalog HTTP contract
    │   ├── errors/                      # Identity/catalog/item errors
    │   ├── services/
    │   │   ├── cart-identity/           # Customer/guest resolution
    │   │   ├── cart-items/              # Add/update/remove/checkout commands
    │   │   ├── cart-queries/            # Get/create active cart queries
    │   │   └── cart-response/           # Entity-to-response mapping
    │   ├── types/                       # Identity, response and integration types
    │   └── utils/                       # Money helpers
    ├── infrastructure/repositories/    # TypeORM persistence
    └── presentation/
        ├── controllers/                 # Public and internal routes
        ├── dto/                         # Add/update request schemas
        └── guards/                      # Internal service guard
~~~

The application layer owns use-case rules. Repositories do not decide actor ownership, and controllers do not import Product persistence entities.

## 16. Configuration Reference

| Variable | Purpose | Example |
| --- | --- | --- |
| PORT | HTTP listener port | 3003 |
| NODE_ENV | Runtime mode and docs behavior | development |
| APP_VERSION | Application metadata | 1.0.0 |
| POSTGRES_HOST | PostgreSQL host | localhost |
| POSTGRES_PORT | PostgreSQL port | 5432 |
| POSTGRES_USER | Database user | bin_ecommerce |
| POSTGRES_PASSWORD | Database password | deployment secret |
| POSTGRES_DB | Cart database | bin_ecommerce_cart |
| PRODUCT_SERVICE_URL | Product integration base URL | http://localhost:3008 |
| INTERNAL_SERVICE_TOKEN | Trusted internal caller token | deployment secret |
| TYPEORM_LOGGING | Enable TypeORM logging | false |

Use [.env.example](./.env.example) as the local variable template. Never commit .env, production database credentials or the internal token.

## 17. Development

### Commands

| Command | Purpose |
| --- | --- |
| npm run dev | Start Nest watch mode |
| npm run build | Compile the service |
| npm run start | Run the built artifact |
| npm run type-check | TypeScript validation without emit |
| npm run lint | ESLint source validation |
| npm test | Run Jest tests |

### Recommended local gate

~~~powershell
npm run type-check
npm run lint
npm test -- --runInBand
npm run build
~~~

Use a disposable cart database when manually testing checkout transitions. Do not point local tests at a shared cart database with real customer data.

## 18. Testing Strategy

### Unit tests

The current test suite should protect:

- Customer identity taking precedence over an old guest session.
- Valid UUID guest session resolution.
- Missing/invalid identity rejection.
- Get-or-create idempotency.
- Concurrent active-cart creation fallback.
- Product not found, unavailable product and stock-exceeded errors.
- Add/update/remove ownership isolation.
- Absolute quantity update behavior.
- Checkout transition and checked-out cart handling.

### Integration tests

Use PostgreSQL and a Product Service test double to verify:

- Unique owner and cart/variant constraints.
- Cart-item cascade behavior.
- Transaction rollback when product validation fails.
- Concurrent add behavior.
- Internal token guard and owner-scoped checkout.
- Response mapping without leaking TypeORM entities.

### Acceptance flow

~~~text
Given a valid customer or guest identity
When the client reads the active cart
Then exactly one owner-scoped cart is returned
When a valid variant is added twice
Then one line exists with the expected quantity
When Order Service completes checkout
Then the cart becomes CHECKED_OUT
When the client reads the cart again
Then a new ACTIVE cart can be created for the same owner
~~~

## 19. Operational Notes

### Dependency health

Monitor PostgreSQL connection pool, transaction latency, unique-constraint conflicts, Product Service latency and catalog-unavailable errors. A cart request may succeed while Product Service is healthy but an add-item command should fail clearly when product validation is unavailable.

### Failure matrix

| Failure | Expected result |
| --- | --- |
| Missing identity | Reject request; do not create an orphan cart |
| Product not found | Return catalog-not-found error |
| Product unavailable | Reject add/update according to item policy |
| Stock too low | Return stock-exceeded conflict |
| Product Service timeout | Return service-unavailable error; do not persist unverified item |
| Concurrent first GET | One active cart survives; loser reads it |
| Concurrent add | Transaction/constraint prevents lost or duplicate line |
| Checkout retry | Owner-scoped transition remains safe to retry |
| Database unavailable | Do not report successful persistence |

### Deployment checklist

1. Verify the Cart database and migration state.
2. Confirm Product Service URL and internal contract version.
3. Confirm the internal token is shared only with trusted callers.
4. Check health and a non-destructive active-cart read.
5. Test one add-item flow with a disposable product/variant.
6. Test checkout transition and next-cart creation.
7. Confirm Gateway points to the actual Cart port.

## 20. Documentation Findings

The following points should be verified when wiring the full local stack:

1. Cart Service uses port 3003 in its own .env.example.
2. API Gateway's current CART_SERVICE_URL has previously been configured with a different local port in the repository. Align the runtime wiring before testing the cart through Gateway.
3. Cart's public controller accepts guest traffic through the Gateway contract, while add/update/remove behavior may require a customer identity according to the controller/application rules. Confirm the desired guest mutation policy before exposing it as a product requirement.
4. Product and variant references are intentionally cross-service logical references, not database foreign keys.
5. The item price/name fields are snapshots for rendering; checkout must not treat them as current price or inventory truth.

This section records integration facts and follow-up checks. It does not change runtime configuration.

## 21. FAQ

### Does Cart Service own product price?

No. It stores a display snapshot, while Product/Order checkout contracts validate the current price and inventory.

### Why does GET create a cart?

The public active-cart query is designed to hydrate the cart page and provide a stable owner-scoped aggregate. Internal lookup intentionally avoids creating an empty cart when an orchestrator only needs to inspect existing state.

### Can a client send cartId?

Public commands resolve the active cart from owner identity. They should not accept arbitrary cart selection from the browser.

### What happens when a guest signs in?

Identity merge is a separate product/application decision. This service currently models customer and guest ownership explicitly; a merge flow must define conflict and quantity rules before being introduced.

### Is checkout handled inside Cart Service?

No. Cart marks the active cart as checked out after the Order workflow reaches its agreed handoff point. Order owns order creation and inventory orchestration.

### Why use PostgreSQL instead of only browser storage?

Server persistence gives the platform a consistent cart across devices and allows checkout to use a trusted owner-scoped state.

## 22. Ownership

### Engineering

**Đào Ngọc Anh**

**Software Engineer**

[View portfolio](https://daongocanh.site)

Software Engineer responsible for the architecture, implementation, integration, and maintenance of this service.

### Architecture & API Design

**Đào Ngọc Anh**

Designed the cart ownership model, customer/guest identity resolver, active-cart invariants, product validation boundary, transactional item commands, and checkout handoff contract.
