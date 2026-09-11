// src/models/types.ts

export interface Enterprise {
  id: string;
  name: string;
  sso_domain: string;
  default_workspace_id?: string;
  created_at: Date;
  updated_at: Date;
}

export interface ScimCredential {
  id: string;
  enterprise_id: string;
  token_hash: string;
  token_hint: string;
  is_active: boolean;
  last_used_at?: Date;
  created_at: Date;
}

export interface User {
  id: string;
  enterprise_id: string;
  scim_external_id?: string;
  email: string;
  display_name: string;
  first_name?: string;
  last_name?: string;
  is_active: boolean;
  deactivated_at?: Date;
  created_at: Date;
  updated_at: Date;
}

export interface Workspace {
  id: string;
  enterprise_id: string;
  slug: string;
  name: string;
  blueprint_recipe_key?: string;
  is_archived: boolean;
  created_at: Date;
}

export interface DirectoryGroup {
  id: string;
  enterprise_id: string;
  scim_external_id: string;
  display_name: string;
  created_at: Date;
  updated_at: Date;
}

export interface DirectoryGroupMember {
  directory_group_id: string;
  user_id: string;
  created_at: Date;
}

export interface MappingRule {
  id: string;
  enterprise_id: string;
  idp_group_pattern: string; // Regex or literal pattern
  target_workspace_id: string;
  assigned_role: string; // 'ADMIN' | 'DEVELOPER' | 'PRODUCT_MANAGER' | 'MEMBER'
  priority: number; // Lower number = higher priority
  is_active: boolean;
  created_at: Date;
}

export interface WorkspaceMembership {
  id: string;
  workspace_id: string;
  user_id: string;
  role: string;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface UserOnboardingState {
  user_id: string;
  workspace_id: string;
  role_key: string;
  completed_steps: string[];
  is_dismissed: boolean;
  first_login_at: Date;
  completed_at?: Date;
}

export interface ProvisioningAuditLog {
  id: string;
  enterprise_id: string;
  event_type: string;
  actor_type: 'SCIM_CLIENT' | 'SYSTEM' | 'ADMIN';
  target_resource_type: string;
  target_resource_id: string;
  payload: Record<string, unknown>;
  created_at: Date;
}

// Blueprint Recipe Manifest Types
export interface BlueprintRecipe {
  recipeKey: string;
  version: string;
  targetRole: string;
  name: string;
  assets: {
    starterBoards: Array<{
      name: string;
      columns: string[];
      sampleCards: Array<{
        title: string;
        label: string;
        status: string;
      }>;
    }>;
    pinnedResources: Array<{
      title: string;
      url: string;
      category: string;
    }>;
    sampleQueries: Array<{
      name: string;
      query: string;
    }>;
  };
  microRunbook: {
    steps: Array<{
      id: string;
      label: string;
      actionRoute: string;
    }>;
  };
}

// Placement Engine Types
export interface Placement {
  workspaceId: string;
  role: string;
}

export interface PlacementResult {
  isFallback: boolean;
  placements: Placement[];
  primaryWorkspaceId: string;
}

// SCIM 2.0 Types (RFC 7643 / 7644)
export interface ScimUserResource {
  schemas: string[];
  id?: string;
  externalId?: string;
  userName: string;
  name?: {
    formatted?: string;
    familyName?: string;
    givenName?: string;
  };
  emails?: Array<{
    value: string;
    type?: string;
    primary?: boolean;
  }>;
  active?: boolean;
  groups?: Array<{
    value: string;
    display?: string;
  }>;
  meta?: {
    resourceType: 'User';
    created?: string;
    lastModified?: string;
    location?: string;
  };
}

export interface ScimGroupResource {
  schemas: string[];
  id?: string;
  externalId?: string;
  displayName: string;
  members?: Array<{
    value: string;
    display?: string;
    $ref?: string;
  }>;
  meta?: {
    resourceType: 'Group';
    created?: string;
    lastModified?: string;
    location?: string;
  };
}

export interface ScimPatchOperation {
  op: 'add' | 'remove' | 'replace';
  path?: string;
  value?: unknown;
}

export interface ScimPatchRequest {
  schemas: string[];
  Operations: ScimPatchOperation[];
}

export interface ScimListResponse<T> {
  schemas: string[];
  totalResults: number;
  startIndex: number;
  itemsPerPage: number;
  Resources: T[];
}
