// tests/lifecycle-and-queue.test.ts
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { InMemoryStore } from '../src/models/store.js';
import { AccountLifecycleService } from '../src/services/lifecycle-service.js';
import { ProvisioningQueue } from '../src/queue/provisioning-queue.js';
import { randomUUID } from 'crypto';

describe('AccountLifecycleService & ProvisioningQueue', () => {
  let store: InMemoryStore;
  let lifecycleService: AccountLifecycleService;
  let enterpriseId: string;
  let defaultWsId: string;
  let engWsId: string;

  beforeEach(() => {
    store = new InMemoryStore();
    lifecycleService = new AccountLifecycleService(store);

    enterpriseId = 'ent-test-1';
    defaultWsId = 'ws-default-1';
    engWsId = 'ws-eng-1';

    store.enterprises.set(enterpriseId, {
      id: enterpriseId,
      name: 'Test Corp',
      sso_domain: 'test.com',
      default_workspace_id: defaultWsId,
      created_at: new Date(),
      updated_at: new Date(),
    });

    store.workspaces.set(defaultWsId, {
      id: defaultWsId,
      enterprise_id: enterpriseId,
      slug: 'general',
      name: 'General',
      is_archived: false,
      created_at: new Date(),
    });

    store.workspaces.set(engWsId, {
      id: engWsId,
      enterprise_id: enterpriseId,
      slug: 'eng',
      name: 'Engineering',
      is_archived: false,
      created_at: new Date(),
    });

    store.mappingRules.set('r1', {
      id: 'r1',
      enterprise_id: enterpriseId,
      idp_group_pattern: '^eng-.*',
      target_workspace_id: engWsId,
      assigned_role: 'DEVELOPER',
      priority: 10,
      is_active: true,
      created_at: new Date(),
    });
  });

  it('should provision a greenfield user into default workspace when no groups exist', () => {
    const { user, isReactivated } = lifecycleService.provisionOrReactivateUser({
      enterpriseId,
      email: 'alex@test.com',
      displayName: 'Alex Rivera',
      scimExternalId: 'ext-alex-1',
    });

    assert.strictEqual(isReactivated, false);
    assert.strictEqual(user.is_active, true);
    assert.strictEqual(user.email, 'alex@test.com');

    // Check membership
    const membership = store.workspaceMemberships.get(`${defaultWsId}_${user.id}`);
    assert.ok(membership);
    assert.strictEqual(membership.role, 'MEMBER');
    assert.strictEqual(membership.is_active, true);

    // Check onboarding state was initialized
    const onboarding = store.userOnboardingStates.get(user.id);
    assert.ok(onboarding);
    assert.strictEqual(onboarding.workspace_id, defaultWsId);
    assert.strictEqual(onboarding.is_dismissed, false);
  });

  it('should reactivate a deprovisioned user cleanly on POST /Users without conflict', () => {
    const { user: originalUser } = lifecycleService.provisionOrReactivateUser({
      enterpriseId,
      email: 'returning@test.com',
      displayName: 'Returning Employee',
    });

    // Deactivate user
    lifecycleService.deactivateUser(originalUser.id, enterpriseId);
    assert.strictEqual(originalUser.is_active, false);

    // Re-provisioning with same email should trigger reactivation
    const { user: reactivatedUser, isReactivated } = lifecycleService.provisionOrReactivateUser({
      enterpriseId,
      email: 'returning@test.com',
      displayName: 'Returning Employee Updated',
    });

    assert.strictEqual(isReactivated, true);
    assert.strictEqual(reactivatedUser.id, originalUser.id);
    assert.strictEqual(reactivatedUser.is_active, true);
    assert.strictEqual(reactivatedUser.display_name, 'Returning Employee Updated');
  });

  it('should reject already active user with CONFLICT error', () => {
    lifecycleService.provisionOrReactivateUser({
      enterpriseId,
      email: 'active@test.com',
      displayName: 'Active User',
    });

    assert.throws(() => {
      lifecycleService.provisionOrReactivateUser({
        enterpriseId,
        email: 'active@test.com',
        displayName: 'Active User Duplicate',
      });
    }, /CONFLICT_USER_ALREADY_ACTIVE/);
  });

  it('should update group memberships and recalculate user workspace roles', () => {
    const { user } = lifecycleService.provisionOrReactivateUser({
      enterpriseId,
      email: 'dev@test.com',
      displayName: 'Dev User',
    });

    // Create group
    const groupId = 'grp-eng-core';
    store.directoryGroups.set(groupId, {
      id: groupId,
      enterprise_id: enterpriseId,
      scim_external_id: 'scim-grp-1',
      display_name: 'eng-core-devs',
      created_at: new Date(),
      updated_at: new Date(),
    });

    // Sync group membership
    lifecycleService.syncGroupMemberships(groupId, enterpriseId, [user.id], 'add');

    // Rule '^eng-.*' matches 'eng-core-devs' -> engWsId with 'DEVELOPER' role
    const engMembership = store.workspaceMemberships.get(`${engWsId}_${user.id}`);
    assert.ok(engMembership);
    assert.strictEqual(engMembership.role, 'DEVELOPER');
    assert.strictEqual(engMembership.is_active, true);
  });

  it('should discard duplicate jobs using idempotency hashing in ProvisioningQueue', () => {
    const queue = new ProvisioningQueue(lifecycleService);

    const first = queue.enqueue(enterpriseId, 'PROVISION_USER', 'ext-123', {
      enterpriseId,
      email: 'queued@test.com',
      displayName: 'Queued User',
    });
    assert.strictEqual(first.queued, true);

    const duplicate = queue.enqueue(enterpriseId, 'PROVISION_USER', 'ext-123', {
      enterpriseId,
      email: 'queued@test.com',
      displayName: 'Queued User',
    });
    assert.strictEqual(duplicate.queued, false);
    assert.strictEqual(duplicate.idempotencyKey, first.idempotencyKey);
  });
});
