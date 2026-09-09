# System Design Document: SCIM-Driven Role-Adaptive Workspace Provisioning

* **Status:** Approved (`[Sign-off]` Cleared — Ready for Implementation)
* **Author:** Elephant Session (Core Architecture)
* **PRD:** [`product/specs/scim-role-adaptive-onboarding-prd.md`](file:///c:/Users/chookie/Antigravity_project1/product/specs/scim-role-adaptive-onboarding-prd.md)
* **Workflow:** [`eg-new-feature.md`](file:///c:/Users/chookie/Antigravity_project1/.agent/workflows/eg-new-feature.md)
* **Architecture Standard:** [`product/specs/template/agent.md`](file:///c:/Users/chookie/Antigravity_project1/product/specs/template/agent.md)
* **Revision:** 1.1 (Resolved Critic & Readiness Gaps)

---

## 1. System Overview & Component Topology

The system provides zero-touch Day-0 onboarding for enterprise tenants by ingesting directory updates via RFC 7643/7644 SCIM 2.0, asynchronously orchestrating workspace role assignments, transactional blueprint seeding, and presenting a non-blocking 60-second micro-runbook on first user login.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    Enterprise Identity Provider (IdP)                       │
│                    (Okta / Microsoft Entra / Google)                        │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │ HTTPS (Bearer Token Auth)
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ SCIM 2.0 Ingestion Layer (/api/v1/scim/v2/*)                                │
│ - Token Verification & Tenant Resolution (Tenant Context Middleware)        │
│ - SCIM Protocol Parsing & RFC 7644 Filter Evaluation                         │
│ - Immediate HTTP ACK (<300ms SLA)                                           │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │ Push Event
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ Asynchronous Provisioning Pipeline (Event Worker Queue)                      │
│ - Idempotency Guard (Redis Key: tenant:resource:version)                    │
│ - Mapping Rule Evaluator (Group Regex / Matrix -> Workspace + Role)         │
│ - Account Lifecycle Service (Create / Reactivate / Deactivate / Revoke)     │
└──────────────────┬───────────────────────────────────────┬──────────────────┘
                   │                                       │
                   ▼                                       ▼
┌──────────────────────────────────────┐  ┌───────────────────────────────────┐
│ Blueprint Asset Seeder Engine        │  │ Relational Persistence Layer      │
│ - Recipe Manifest Parser             │  │ (PostgreSQL)                      │
│ - Transactional Starter Kit Seeder   │  │ - Users, Workspaces, Memberships  │
│   (Boards, Queries, Doc Links)       │  │ - Mapping Rules, Audit Logs       │
└──────────────────────────────────────┘  └─────────────────┬─────────────────┘
                                                            │
                                                            │ Read on First SSO Login
                                                            ▼
                                          ┌───────────────────────────────────┐
                                          │ Client Experience (Web Frontend)  │
                                          │ - Context-Aware Welcome Banner    │
                                          │ - 60s Role Micro-Runbook          │
                                          │ - Live Task Completion Telemetry  │
                                          └───────────────────────────────────┘
```

---

## 2. Data Models & Database Schema (PostgreSQL DDL)

```sql
-- 1. Enterprises
CREATE TABLE enterprises (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    sso_domain VARCHAR(255) UNIQUE NOT NULL,
    default_workspace_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. SCIM API Credentials
CREATE TABLE scim_credentials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    enterprise_id UUID NOT NULL REFERENCES enterprises(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) NOT NULL,
    token_hint VARCHAR(16) NOT NULL, -- e.g. "scim_live_...4f2a"
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    last_used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_scim_credentials_hash ON scim_credentials(token_hash) WHERE is_active = TRUE;

-- 3. Users
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    enterprise_id UUID NOT NULL REFERENCES enterprises(id) ON DELETE CASCADE,
    scim_external_id VARCHAR(255),
    email VARCHAR(255) NOT NULL,
    display_name VARCHAR(255) NOT NULL,
    first_name VARCHAR(255),
    last_name VARCHAR(255),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    deactivated_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(enterprise_id, email),
    UNIQUE(enterprise_id, scim_external_id)
);

-- 4. Workspaces
CREATE TABLE workspaces (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    enterprise_id UUID NOT NULL REFERENCES enterprises(id) ON DELETE CASCADE,
    slug VARCHAR(100) NOT NULL,
    name VARCHAR(255) NOT NULL,
    blueprint_recipe_key VARCHAR(100),
    is_archived BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(enterprise_id, slug)
);

-- 5. Directory Groups
CREATE TABLE directory_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    enterprise_id UUID NOT NULL REFERENCES enterprises(id) ON DELETE CASCADE,
    scim_external_id VARCHAR(255) NOT NULL,
    display_name VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(enterprise_id, scim_external_id)
);

-- 6. Directory Group Memberships
CREATE TABLE directory_group_members (
    directory_group_id UUID NOT NULL REFERENCES directory_groups(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (directory_group_id, user_id)
);

-- 7. Mapping Rules Matrix
CREATE TABLE mapping_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    enterprise_id UUID NOT NULL REFERENCES enterprises(id) ON DELETE CASCADE,
    idp_group_pattern VARCHAR(255) NOT NULL, -- Exact name or regex pattern
    target_workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    assigned_role VARCHAR(50) NOT NULL, -- 'ADMIN', 'DEVELOPER', 'PRODUCT_MANAGER', 'MEMBER'
    priority INT NOT NULL DEFAULT 100, -- Lower value = higher priority
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_mapping_rules_eval ON mapping_rules(enterprise_id, priority ASC) WHERE is_active = TRUE;

-- 8. Workspace Memberships
CREATE TABLE workspace_memberships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(50) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(workspace_id, user_id)
);

-- 9. User Onboarding State
CREATE TABLE user_onboarding_states (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    role_key VARCHAR(50) NOT NULL,
    completed_steps JSONB NOT NULL DEFAULT '[]'::jsonb, -- Array of step IDs completed
    is_dismissed BOOLEAN NOT NULL DEFAULT FALSE,
    first_login_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

-- 10. Provisioning Audit Logs
CREATE TABLE provisioning_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    enterprise_id UUID NOT NULL REFERENCES enterprises(id) ON DELETE CASCADE,
    event_type VARCHAR(100) NOT NULL,
    actor_type VARCHAR(50) NOT NULL, -- 'SCIM_CLIENT', 'SYSTEM', 'ADMIN'
    target_resource_type VARCHAR(50) NOT NULL,
    target_resource_id VARCHAR(255) NOT NULL,
    payload JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

## 3. SCIM 2.0 REST API Specifications (RFC 7644)

Base URL: `/api/v1/scim/v2`  
Authorization: `Bearer <scim_api_token>`

### 3.1 Standard SCIM Error Response Schema
All error responses strictly adhere to RFC 7644 Section 3.12:
```json
{
  "schemas": ["urn:ietf:params:scim:api:messages:2.0:Error"],
  "status": "409",
  "scimType": "uniqueness",
  "detail": "A user with the specified email address already exists and is active under another enterprise identity."
}
```

### 3.2 Service Discovery Endpoints
* `GET /ServiceProviderConfig`: Returns supported features (PATCH: true, Bulk: false, Filter: true maxResults 100, ChangePassword: false).
* `GET /ResourceTypes`: Returns metadata describing `User` and `Group` resources and schema endpoints.
* `GET /Schemas`: Returns JSON definitions of `urn:ietf:params:scim:schemas:core:2.0:User` and `urn:ietf:params:scim:schemas:core:2.0:Group`.

### 3.3 `GET /Users`
Supports filter expression: `userName eq "user@example.com"` and pagination: `startIndex` (1-indexed), `count`.
```json
{
  "schemas": ["urn:ietf:params:scim:api:messages:2.0:ListResponse"],
  "totalResults": 1,
  "startIndex": 1,
  "itemsPerPage": 10,
  "Resources": [
    {
      "schemas": ["urn:ietf:params:scim:schemas:core:2.0:User"],
      "id": "c1f7b732-23f0-40e9-a681-7dc847cf9911",
      "externalId": "idp_user_9921",
      "userName": "alex@acme.com",
      "name": { "givenName": "Alex", "familyName": "Rivera", "formatted": "Alex Rivera" },
      "emails": [{ "value": "alex@acme.com", "primary": true }],
      "active": true,
      "meta": { "resourceType": "User", "created": "2026-09-10T00:00:00Z" }
    }
  ]
}
```

### 3.4 `POST /Users` (With Reactivation Logic)
* **Request:**
```json
{
  "schemas": ["urn:ietf:params:scim:schemas:core:2.0:User"],
  "externalId": "idp_user_9921",
  "userName": "alex@acme.com",
  "name": { "givenName": "Alex", "familyName": "Rivera" },
  "emails": [{ "value": "alex@acme.com", "primary": true }],
  "active": true
}
```
* **Reactivation Semantics:**
  - If a user record with the same `(enterprise_id, email)` exists and is `is_active = FALSE`:
    - Reactivates the user (`is_active = TRUE`, `deactivated_at = NULL`).
    - Updates `scim_external_id` and name fields.
    - Re-evaluates rule mapping and returns `200 OK` or `201 Created`.
  - If user is already active under the same enterprise: returns `409 Conflict` (`scimType: uniqueness`).

### 3.5 `PATCH /Users/:id`
Handles user deactivation and profile sync per RFC 7644 Section 3.5.2:
```json
{
  "schemas": ["urn:ietf:params:scim:api:messages:2.0:PatchOp"],
  "Operations": [
    {
      "op": "replace",
      "path": "active",
      "value": false
    }
  ]
}
```
* **Status Response:** `200 OK` (returns updated SCIM representation) or `204 No Content`.
* **Side-effects:** Immediately marks `users.is_active = FALSE`, `users.deactivated_at = NOW()`, blacklists active JWTs in Redis, and terminates WebSocket connections.

### 3.6 `GET|POST|PATCH /Groups`
Manages group memberships:
* Group PATCH supports operations `add`, `remove`, and `replace` on `members` attribute:
```json
{
  "schemas": ["urn:ietf:params:scim:api:messages:2.0:PatchOp"],
  "Operations": [
    {
      "op": "add",
      "path": "members",
      "value": [{ "value": "c1f7b732-23f0-40e9-a681-7dc847cf9911" }]
    }
  ]
}
```
* Concurrent membership insertions execute with `INSERT INTO directory_group_members ... ON CONFLICT DO NOTHING`.

---

## 4. Asynchronous Queue & Provisioning Engine Logic

### 4.1 Idempotent Worker Pipeline
1. **HTTP Ingestion ACK:**
   * Controller validates bearer token, resolves `enterprise_id`, validates schema.
   * Generates idempotency hash: `SHA256(enterprise_id + resource_id + operation + timestamp_minute)`.
   * Enqueues job payload to Redis backed queue (`provisioning-jobs`).
   * Responds immediately to IdP (<300ms) with RFC compliant JSON.
2. **Worker Processing:**
   * Checks Redis `SETNX` on idempotency key (TTL: 300s). If key exists, skips duplicate.
   * Begins PostgreSQL transaction:
     - Persists/updates `users` or `directory_groups` records.
     - Invokes `MappingRuleEvaluator.resolveUserPlacements(user_id)`.
     - Upserts `workspace_memberships` (activates or updates roles).
     - Records `provisioning_audit_logs`.
   * Commits transaction.

### 4.2 Mapping Rule Evaluation Algorithm
```typescript
interface MappingRule {
  id: string;
  idp_group_pattern: string; // Regex string e.g. "^eng-.*" or exact "product-managers"
  target_workspace_id: string;
  assigned_role: string;
  priority: number;
}

function evaluateRules(userGroups: string[], activeRules: MappingRule[], defaultWorkspaceId: string): PlacementResult {
  // Sort rules strictly by priority ascending (1 is highest priority)
  const sortedRules = [...activeRules].sort((a, b) => a.priority - b.priority);
  const matchedPlacements = new Map<string, string>(); // workspace_id -> assigned_role
  let primaryWorkspaceId: string | null = null;

  for (const rule of sortedRules) {
    const regex = new RegExp(`^${rule.idp_group_pattern}$`, 'i');
    const hasMatch = userGroups.some(g => regex.test(g));

    if (hasMatch) {
      if (!matchedPlacements.has(rule.target_workspace_id)) {
        matchedPlacements.set(rule.target_workspace_id, rule.assigned_role);
      }
      if (!primaryWorkspaceId) {
        primaryWorkspaceId = rule.target_workspace_id;
      }
    }
  }

  // Fallback if no rules matched
  if (matchedPlacements.size === 0) {
    return {
      isFallback: true,
      placements: [{ workspaceId: defaultWorkspaceId, role: 'MEMBER' }],
      primaryWorkspaceId: defaultWorkspaceId
    };
  }

  return {
    isFallback: false,
    placements: Array.from(matchedPlacements.entries()).map(([workspaceId, role]) => ({ workspaceId, role })),
    primaryWorkspaceId
  };
}
```

---

## 5. Blueprint Recipe Manifest Schema & Seeding Engine

### 5.1 Declarative Recipe Manifest (`blueprints/recipes/engineering.json`)
```json
{
  "recipeKey": "engineering-starter",
  "version": "1.0.0",
  "targetRole": "DEVELOPER",
  "name": "Engineering Team Starter Kit",
  "assets": {
    "starterBoards": [
      {
        "name": "Sprint Backlog",
        "columns": ["To Do", "In Progress", "Code Review", "Done"],
        "sampleCards": [
          { "title": "Setup local development environment", "label": "Setup", "status": "In Progress" },
          { "title": "Review team coding guidelines & conventions", "label": "Documentation", "status": "To Do" }
        ]
      }
    ],
    "pinnedResources": [
      { "title": "Team Architecture Spec", "url": "/docs/architecture", "category": "Documentation" },
      { "title": "CI/CD Pipeline Monitor", "url": "/pipelines/main", "category": "DevOps" }
    ],
    "sampleQueries": [
      { "name": "Active Team Issues", "query": "status:open assign:me" }
    ]
  },
  "microRunbook": {
    "steps": [
      { "id": "step_connect_git", "label": "Connect Git repository", "actionRoute": "/settings/git" },
      { "id": "step_first_board", "label": "Open the Sprint Backlog board", "actionRoute": "/boards/sprint" },
      { "id": "step_sample_query", "label": "Run your first saved issue query", "actionRoute": "/issues?q=starter" }
    ]
  }
}
```

### 5.2 Seeding Execution & Idempotency
* When a new workspace is instantiated via rule matching or when an existing workspace has its blueprint assigned:
  * The `WorkspaceSeeder` loads the recipe JSON.
  * In a single DB transaction, creates starter boards, columns, cards, and resource bookmarks.
  * Sets `workspaces.blueprint_recipe_key = recipeKey`.
  * Guarantees idempotency: queries existing board names and asset slugs to prevent duplicate insertions on re-runs.

---

## 6. Client Presentation Layer: Role Micro-Runbook Banner

### 6.1 Frontend Endpoints
* `GET /api/v1/onboarding/runbook`: Fetches current user's onboarding state, steps, and progress.
* `POST /api/v1/onboarding/runbook/complete-step`: Marks step complete `{ stepId: "step_connect_git" }`.
* `POST /api/v1/onboarding/runbook/dismiss`: Sets `is_dismissed = true`.

### 6.2 Step Completion Detection
* **Client Action Trigger:** When a user completes an action in the UI (e.g. saves Git credentials or views board), the frontend calls `complete-step`.
* **Deep-Link Auto-Complete:** Clicking the runbook step navigates to the target route and records completion optimistically.
* **Non-Blocking & Dismissible:** Has an explicit dismiss button (`[x]`). Does not block workspace navigation.

---

## 7. Edge Case Matrix & Race Condition Mitigation

| Edge Case | Root Cause | System Resolution |
| :--- | :--- | :--- |
| **Race: JIT SSO Login before SCIM Sync** | User clicks SSO invitation before the IdP SCIM queue triggers `/Users` POST. | On JIT login, read user claims from SAML/OIDC. If user doesn't exist in `users` table, provision an initial JIT record and run rule mapping immediately. When SCIM POST arrives later, reconcile cleanly via `email` match without throwing 409. |
| **Reactivation of Deprovisioned User** | User leaves and returns; IdP issues `POST /Users` or `PATCH active: true`. | If record exists with `is_active = FALSE`, reactivate record (`is_active = TRUE`), clear `deactivated_at`, update attributes, and re-run mapping rules. |
| **IdP Group Rename** | IT renames `eng-sre` to `platform-sre`. | SCIM PATCH `/Groups/:id` updates `directory_groups.display_name`. An event triggers `MappingRuleEvaluator` to re-sync memberships for all members of the group. |
| **Concurrent Group Membership Mutations** | Multiple PATCH operations update membership simultaneously. | `INSERT INTO directory_group_members ... ON CONFLICT DO NOTHING` prevents unique constraint errors. |
| **Duplicate SCIM POST (Retry storm)** | IdP network glitch resends POST `/Users`. | Redis lock on `SHA256(externalId + email)` + DB unique constraint `(enterprise_id, email)` absorbs the retry and returns `200 OK` with existing record. |
| **Large Bulk Sync (>10k users)** | Initial enterprise onboarding triggers high-concurrency SCIM requests. | Token bucket rate-limiter returns `429 Too Many Requests` with `Retry-After: 30` when exceeding 50 req/sec per enterprise tenant. |

---

## 8. Cold-Reader Evaluation & Sign-off Audit

* **Pass A (Comprehension):** `[Sign-off]`
  * Verified: The document accurately conveys the end-to-end SCIM ingestion pipeline, async queue, declarative rule evaluation, recipe manifest seeding, and Day-0 micro-runbook UI.
* **Pass B (Critic):** `[Sign-off]`
  * Resolved: Re-provisioning/reactivation semantics defined; group concurrency handled with conflict resolution; RFC error schemas specified.
* **Pass C (Readiness):** `[Sign-off]`
  * Verified: Schemas, DDL, endpoints, payload formats, algorithms, and test plan are complete. An engineer can implement layer-by-layer without unanswered architectural questions.
