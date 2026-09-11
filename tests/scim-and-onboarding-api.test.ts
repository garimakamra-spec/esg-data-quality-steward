// tests/scim-and-onboarding-api.test.ts
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { createApp } from '../src/app.js';
import { InMemoryStore } from '../src/models/store.js';
import { Server } from 'http';
import { AddressInfo } from 'net';

describe('SCIM 2.0 & Onboarding REST API Endpoints', () => {
  let server: Server;
  let baseUrl: string;
  let store: InMemoryStore;
  const enterpriseId = 'ent-api-test';
  const scimToken = 'scim_test_bearer_token';
  const defaultWsId = 'ws-api-default';

  before(async () => {
    store = new InMemoryStore();
    store.enterprises.set(enterpriseId, {
      id: enterpriseId,
      name: 'API Test Corp',
      sso_domain: 'apitest.com',
      default_workspace_id: defaultWsId,
      created_at: new Date(),
      updated_at: new Date(),
    });

    store.workspaces.set(defaultWsId, {
      id: defaultWsId,
      enterprise_id: enterpriseId,
      slug: 'default',
      name: 'Default Hub',
      blueprint_recipe_key: 'general-starter',
      is_archived: false,
      created_at: new Date(),
    });

    store.scimCredentials.set('cred-1', {
      id: 'cred-1',
      enterprise_id: enterpriseId,
      token_hash: 'ignored_in_test',
      token_hint: scimToken,
      is_active: true,
      created_at: new Date(),
    });

    const { app, seeder } = createApp(store);
    seeder.seedWorkspace(defaultWsId, 'general-starter');

    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const address = server.address() as AddressInfo;
        baseUrl = `http://localhost:${address.port}`;
        resolve();
      });
    });
  });

  after(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  it('should reject unauthenticated SCIM requests with 401 Unauthorized', async () => {
    const res = await fetch(`${baseUrl}/api/v1/scim/v2/ServiceProviderConfig`);
    assert.strictEqual(res.status, 401);
    const body = await res.json();
    assert.ok(body.schemas.includes('urn:ietf:params:scim:api:messages:2.0:Error'));
  });

  it('should return RFC 7643 ServiceProviderConfig when authenticated', async () => {
    const res = await fetch(`${baseUrl}/api/v1/scim/v2/ServiceProviderConfig`, {
      headers: { Authorization: `Bearer ${scimToken}` },
    });
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.ok(body.schemas.includes('urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig'));
    assert.strictEqual(body.patch.supported, true);
  });

  let createdUserId: string;

  it('should create user via POST /Users (201 Created)', async () => {
    const res = await fetch(`${baseUrl}/api/v1/scim/v2/Users`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${scimToken}`,
        'Content-Type': 'application/scim+json',
      },
      body: JSON.stringify({
        schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'],
        userName: 'sarah@apitest.com',
        name: { formatted: 'Sarah Connor' },
        emails: [{ value: 'sarah@apitest.com', primary: true }],
        active: true,
      }),
    });

    assert.strictEqual(res.status, 201);
    const body = await res.json();
    assert.strictEqual(body.userName, 'sarah@apitest.com');
    assert.strictEqual(body.active, true);
    assert.ok(body.id);
    createdUserId = body.id;
  });

  it('should filter users via GET /Users?filter=userName eq "..."', async () => {
    const res = await fetch(
      `${baseUrl}/api/v1/scim/v2/Users?filter=userName%20eq%20%22sarah@apitest.com%22`,
      {
        headers: { Authorization: `Bearer ${scimToken}` },
      }
    );
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.totalResults, 1);
    assert.strictEqual(body.Resources[0].userName, 'sarah@apitest.com');
  });

  it('should deactivate user via PATCH /Users/:id (active: false)', async () => {
    const res = await fetch(`${baseUrl}/api/v1/scim/v2/Users/${createdUserId}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${scimToken}`,
        'Content-Type': 'application/scim+json',
      },
      body: JSON.stringify({
        schemas: ['urn:ietf:params:scim:api:messages:2.0:PatchOp'],
        Operations: [{ op: 'replace', path: 'active', value: false }],
      }),
    });

    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.active, false);

    // Verify in store
    const userInStore = store.users.get(createdUserId);
    assert.strictEqual(userInStore?.is_active, false);
  });

  it('should retrieve onboarding runbook and complete steps via /api/v1/onboarding/runbook', async () => {
    // 1. Fetch runbook
    const getRes = await fetch(`${baseUrl}/api/v1/onboarding/runbook?userId=${createdUserId}`);
    assert.strictEqual(getRes.status, 200);
    const runbook = await getRes.json();

    assert.strictEqual(runbook.userId, createdUserId);
    assert.strictEqual(runbook.isDismissed, false);
    assert.ok(runbook.steps.length > 0);
    const firstStepId = runbook.steps[0].id;

    // 2. Complete first step
    const completeRes = await fetch(`${baseUrl}/api/v1/onboarding/runbook/complete-step`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: createdUserId, stepId: firstStepId }),
    });
    assert.strictEqual(completeRes.status, 200);
    const completeBody = await completeRes.json();
    assert.ok(completeBody.completedSteps.includes(firstStepId));

    // 3. Dismiss runbook
    const dismissRes = await fetch(`${baseUrl}/api/v1/onboarding/runbook/dismiss`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: createdUserId }),
    });
    assert.strictEqual(dismissRes.status, 200);
    const dismissBody = await dismissRes.json();
    assert.strictEqual(dismissBody.isDismissed, true);
  });
});
