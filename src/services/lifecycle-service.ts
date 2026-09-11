// src/services/lifecycle-service.ts
import { InMemoryStore } from '../models/store.js';
import {
  User,
  DirectoryGroup,
  WorkspaceMembership,
  UserOnboardingState,
  ProvisioningAuditLog,
} from '../models/types.js';
import { MappingRuleEvaluator } from './rule-evaluator.js';
import { randomUUID } from 'crypto';

export interface ProvisionUserParams {
  enterpriseId: string;
  email: string;
  displayName: string;
  firstName?: string;
  lastName?: string;
  scimExternalId?: string;
}

export class AccountLifecycleService {
  constructor(private store: InMemoryStore) {}

  /**
   * Creates or reactivates a user and places them in appropriate workspaces via mapping rules.
   */
  public provisionOrReactivateUser(params: ProvisionUserParams): { user: User; isReactivated: boolean } {
    const existing = this.store.findUserByEmail(params.enterpriseId, params.email);

    if (existing) {
      if (!existing.is_active) {
        // Reactivation flow
        existing.is_active = true;
        existing.deactivated_at = undefined;
        existing.display_name = params.displayName;
        if (params.firstName) existing.first_name = params.firstName;
        if (params.lastName) existing.last_name = params.lastName;
        if (params.scimExternalId) existing.scim_external_id = params.scimExternalId;
        existing.updated_at = new Date();

        this.evaluateAndApplyUserPlacements(existing.id, params.enterpriseId);
        this.logAudit(params.enterpriseId, 'scim.user.reactivated', 'User', existing.id, {
          email: existing.email,
        });

        return { user: existing, isReactivated: true };
      } else {
        // Already active user
        throw new Error(`CONFLICT_USER_ALREADY_ACTIVE: User ${params.email} is already active`);
      }
    }

    // Greenfield creation
    const newUser: User = {
      id: randomUUID(),
      enterprise_id: params.enterpriseId,
      email: params.email,
      display_name: params.displayName,
      first_name: params.firstName,
      last_name: params.lastName,
      scim_external_id: params.scimExternalId,
      is_active: true,
      created_at: new Date(),
      updated_at: new Date(),
    };

    this.store.users.set(newUser.id, newUser);
    this.evaluateAndApplyUserPlacements(newUser.id, params.enterpriseId);

    this.logAudit(params.enterpriseId, 'scim.user.created', 'User', newUser.id, {
      email: newUser.email,
      externalId: newUser.scim_external_id,
    });

    return { user: newUser, isReactivated: false };
  }

  /**
   * Deactivates a user, terminates sessions, and marks workspace memberships inactive.
   */
  public deactivateUser(userId: string, enterpriseId: string): User {
    const user = this.store.users.get(userId);
    if (!user || user.enterprise_id !== enterpriseId) {
      throw new Error(`NOT_FOUND: User ${userId} not found`);
    }

    user.is_active = false;
    user.deactivated_at = new Date();
    user.updated_at = new Date();

    // Mark workspace memberships inactive
    for (const membership of this.store.workspaceMemberships.values()) {
      if (membership.user_id === userId) {
        membership.is_active = false;
        membership.updated_at = new Date();
      }
    }

    this.logAudit(enterpriseId, 'scim.user.deactivated', 'User', userId, {
      email: user.email,
      deactivatedAt: user.deactivated_at,
    });

    return user;
  }

  /**
   * Evaluates mapping rules for a user based on their current directory groups and updates memberships.
   */
  public evaluateAndApplyUserPlacements(userId: string, enterpriseId: string): void {
    const enterprise = this.store.enterprises.get(enterpriseId);
    if (!enterprise) return;

    const defaultWorkspaceId = enterprise.default_workspace_id || Array.from(this.store.workspaces.values()).find(w => w.enterprise_id === enterpriseId)?.id;
    if (!defaultWorkspaceId) return;

    const userGroups = this.store.getGroupsForUser(userId);
    const activeRules = this.store.getActiveMappingRules(enterpriseId);

    const placementResult = MappingRuleEvaluator.evaluate(userGroups, activeRules, defaultWorkspaceId);

    // Apply placements
    for (const p of placementResult.placements) {
      const membershipKey = `${p.workspaceId}_${userId}`;
      const existingMembership = this.store.workspaceMemberships.get(membershipKey);

      if (existingMembership) {
        existingMembership.role = p.role;
        existingMembership.is_active = true;
        existingMembership.updated_at = new Date();
      } else {
        const newMembership: WorkspaceMembership = {
          id: randomUUID(),
          workspace_id: p.workspaceId,
          user_id: userId,
          role: p.role,
          is_active: true,
          created_at: new Date(),
          updated_at: new Date(),
        };
        this.store.workspaceMemberships.set(membershipKey, newMembership);
      }
    }

    // Initialize or update onboarding state for the primary workspace
    const targetWorkspace = this.store.workspaces.get(placementResult.primaryWorkspaceId);
    const roleKey = placementResult.placements[0]?.role || 'MEMBER';

    if (!this.store.userOnboardingStates.has(userId)) {
      const onboardingState: UserOnboardingState = {
        user_id: userId,
        workspace_id: placementResult.primaryWorkspaceId,
        role_key: roleKey,
        completed_steps: [],
        is_dismissed: false,
        first_login_at: new Date(),
      };
      this.store.userOnboardingStates.set(userId, onboardingState);
    }
  }

  /**
   * Synchronizes members of a directory group with ON CONFLICT DO NOTHING semantics.
   */
  public syncGroupMemberships(groupId: string, enterpriseId: string, userIds: string[], operation: 'add' | 'remove' | 'replace'): void {
    const group = this.store.directoryGroups.get(groupId);
    if (!group || group.enterprise_id !== enterpriseId) {
      throw new Error(`NOT_FOUND: Group ${groupId} not found`);
    }

    if (operation === 'replace') {
      this.store.directoryGroupMembers = this.store.directoryGroupMembers.filter(
        (m) => m.directory_group_id !== groupId
      );
      for (const uid of userIds) {
        this.store.directoryGroupMembers.push({
          directory_group_id: groupId,
          user_id: uid,
          created_at: new Date(),
        });
      }
    } else if (operation === 'add') {
      for (const uid of userIds) {
        const exists = this.store.directoryGroupMembers.some(
          (m) => m.directory_group_id === groupId && m.user_id === uid
        );
        if (!exists) {
          this.store.directoryGroupMembers.push({
            directory_group_id: groupId,
            user_id: uid,
            created_at: new Date(),
          });
        }
      }
    } else if (operation === 'remove') {
      const set = new Set(userIds);
      this.store.directoryGroupMembers = this.store.directoryGroupMembers.filter(
        (m) => !(m.directory_group_id === groupId && set.has(m.user_id))
      );
    }

    // Re-evaluate placements for affected users
    for (const uid of userIds) {
      this.evaluateAndApplyUserPlacements(uid, enterpriseId);
    }

    this.logAudit(enterpriseId, 'scim.group.membership_updated', 'DirectoryGroup', groupId, {
      operation,
      affectedUserCount: userIds.length,
    });
  }

  /**
   * Handles group rename and cascades mapping rule re-evaluation to all member users.
   */
  public handleGroupRename(groupId: string, enterpriseId: string, newDisplayName: string): DirectoryGroup {
    const group = this.store.directoryGroups.get(groupId);
    if (!group || group.enterprise_id !== enterpriseId) {
      throw new Error(`NOT_FOUND: Group ${groupId} not found`);
    }

    const oldName = group.display_name;
    group.display_name = newDisplayName;
    group.updated_at = new Date();

    // Re-evaluate all members of this group
    const memberIds = this.store.directoryGroupMembers
      .filter((m) => m.directory_group_id === groupId)
      .map((m) => m.user_id);

    for (const uid of memberIds) {
      this.evaluateAndApplyUserPlacements(uid, enterpriseId);
    }

    this.logAudit(enterpriseId, 'scim.group.renamed', 'DirectoryGroup', groupId, {
      oldName,
      newName: newDisplayName,
      recalculatedUsers: memberIds.length,
    });

    return group;
  }

  private logAudit(
    enterpriseId: string,
    eventType: string,
    targetType: string,
    targetId: string,
    payload: Record<string, unknown>
  ): void {
    const log: ProvisioningAuditLog = {
      id: randomUUID(),
      enterprise_id: enterpriseId,
      event_type: eventType,
      actor_type: 'SCIM_CLIENT',
      target_resource_type: targetType,
      target_resource_id: targetId,
      payload,
      created_at: new Date(),
    };
    this.store.provisioningAuditLogs.push(log);
  }
}
