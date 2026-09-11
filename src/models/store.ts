// src/models/store.ts
import {
  Enterprise,
  ScimCredential,
  User,
  Workspace,
  DirectoryGroup,
  DirectoryGroupMember,
  MappingRule,
  WorkspaceMembership,
  UserOnboardingState,
  ProvisioningAuditLog,
} from './types.js';

export interface SeededBoard {
  id: string;
  workspace_id: string;
  name: string;
  columns: string[];
}

export interface SeededCard {
  id: string;
  board_id: string;
  title: string;
  label: string;
  status: string;
}

export interface SeededResource {
  id: string;
  workspace_id: string;
  title: string;
  url: string;
  category: string;
}

export interface SeededQuery {
  id: string;
  workspace_id: string;
  name: string;
  query: string;
}

export class InMemoryStore {
  public enterprises: Map<string, Enterprise> = new Map();
  public scimCredentials: Map<string, ScimCredential> = new Map();
  public users: Map<string, User> = new Map();
  public workspaces: Map<string, Workspace> = new Map();
  public directoryGroups: Map<string, DirectoryGroup> = new Map();
  public directoryGroupMembers: DirectoryGroupMember[] = [];
  public mappingRules: Map<string, MappingRule> = new Map();
  public workspaceMemberships: Map<string, WorkspaceMembership> = new Map();
  public userOnboardingStates: Map<string, UserOnboardingState> = new Map();
  public provisioningAuditLogs: ProvisioningAuditLog[] = [];

  // Seeded Workspace Asset collections
  public seededBoards: Map<string, SeededBoard> = new Map();
  public seededCards: SeededCard[] = [];
  public seededResources: Map<string, SeededResource> = new Map();
  public seededQueries: Map<string, SeededQuery> = new Map();

  public clear(): void {
    this.enterprises.clear();
    this.scimCredentials.clear();
    this.users.clear();
    this.workspaces.clear();
    this.directoryGroups.clear();
    this.directoryGroupMembers = [];
    this.mappingRules.clear();
    this.workspaceMemberships.clear();
    this.userOnboardingStates.clear();
    this.provisioningAuditLogs = [];
    this.seededBoards.clear();
    this.seededCards = [];
    this.seededResources.clear();
    this.seededQueries.clear();
  }

  // Helper methods
  public findUserByEmail(enterpriseId: string, email: string): User | undefined {
    for (const u of this.users.values()) {
      if (u.enterprise_id === enterpriseId && u.email.toLowerCase() === email.toLowerCase()) {
        return u;
      }
    }
    return undefined;
  }

  public findUserByScimExternalId(enterpriseId: string, externalId: string): User | undefined {
    for (const u of this.users.values()) {
      if (u.enterprise_id === enterpriseId && u.scim_external_id === externalId) {
        return u;
      }
    }
    return undefined;
  }

  public findGroupByScimExternalId(enterpriseId: string, externalId: string): DirectoryGroup | undefined {
    for (const g of this.directoryGroups.values()) {
      if (g.enterprise_id === enterpriseId && g.scim_external_id === externalId) {
        return g;
      }
    }
    return undefined;
  }

  public getGroupsForUser(userId: string): string[] {
    const groupNames: string[] = [];
    for (const mem of this.directoryGroupMembers) {
      if (mem.user_id === userId) {
        const group = this.directoryGroups.get(mem.directory_group_id);
        if (group) {
          groupNames.push(group.display_name);
        }
      }
    }
    return groupNames;
  }

  public getActiveMappingRules(enterpriseId: string): MappingRule[] {
    const rules: MappingRule[] = [];
    for (const r of this.mappingRules.values()) {
      if (r.enterprise_id === enterpriseId && r.is_active) {
        rules.push(r);
      }
    }
    return rules.sort((a, b) => a.priority - b.priority);
  }
}

export const globalStore = new InMemoryStore();
