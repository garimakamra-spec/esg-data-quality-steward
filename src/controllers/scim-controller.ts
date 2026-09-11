// src/controllers/scim-controller.ts
import { Response } from 'express';
import { InMemoryStore } from '../models/store.js';
import { AccountLifecycleService } from '../services/lifecycle-service.js';
import { ProvisioningQueue } from '../queue/provisioning-queue.js';
import { AuthenticatedScimRequest } from '../middleware/tenant-auth.js';
import { ScimError } from '../scim/rfc7644-errors.js';
import { ScimFilterParser } from '../scim/filter-parser.js';
import {
  ScimUserResource,
  ScimGroupResource,
  ScimListResponse,
  ScimPatchRequest,
} from '../models/types.js';
import { randomUUID } from 'crypto';

export class ScimController {
  constructor(
    private store: InMemoryStore,
    private lifecycleService: AccountLifecycleService,
    private queue: ProvisioningQueue
  ) {}

  public getServiceProviderConfig(req: AuthenticatedScimRequest, res: Response): void {
    res.setHeader('Content-Type', 'application/scim+json');
    res.status(200).json({
      schemas: ['urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig'],
      documentationUri: 'https://docs.enterprise.local/scim/v2',
      patch: { supported: true },
      bulk: { supported: false, maxOperations: 0, maxPayloadSize: 0 },
      filter: { supported: true, maxResults: 100 },
      changePassword: { supported: false },
      sort: { supported: false },
      etag: { supported: false },
      authenticationSchemes: [
        {
          name: 'OAuth Bearer Token',
          description: 'Authentication via Enterprise SCIM API Bearer Token',
          type: 'oauthbearertoken',
          primary: true,
        },
      ],
    });
  }

  public getResourceTypes(req: AuthenticatedScimRequest, res: Response): void {
    res.setHeader('Content-Type', 'application/scim+json');
    res.status(200).json([
      {
        schemas: ['urn:ietf:params:scim:schemas:core:2.0:ResourceType'],
        id: 'User',
        name: 'User',
        endpoint: '/Users',
        description: 'User Account',
        schema: 'urn:ietf:params:scim:schemas:core:2.0:User',
      },
      {
        schemas: ['urn:ietf:params:scim:schemas:core:2.0:ResourceType'],
        id: 'Group',
        name: 'Group',
        endpoint: '/Groups',
        description: 'Directory Group',
        schema: 'urn:ietf:params:scim:schemas:core:2.0:Group',
      },
    ]);
  }

  public getSchemas(req: AuthenticatedScimRequest, res: Response): void {
    res.setHeader('Content-Type', 'application/scim+json');
    res.status(200).json([
      {
        id: 'urn:ietf:params:scim:schemas:core:2.0:User',
        name: 'User',
        description: 'Core User Schema',
      },
      {
        id: 'urn:ietf:params:scim:schemas:core:2.0:Group',
        name: 'Group',
        description: 'Core Group Schema',
      },
    ]);
  }

  public getUsers(req: AuthenticatedScimRequest, res: Response): void {
    const enterpriseId = req.enterpriseId!;
    const filterQuery = req.query.filter as string | undefined;
    const startIndex = Math.max(1, parseInt((req.query.startIndex as string) || '1', 10));
    const count = Math.min(100, Math.max(1, parseInt((req.query.count as string) || '20', 10)));

    let filterCondition = null;
    if (filterQuery) {
      filterCondition = ScimFilterParser.parse(filterQuery);
    }

    const allUsers = Array.from(this.store.users.values()).filter(
      (u) => u.enterprise_id === enterpriseId
    );

    const filtered = allUsers.filter((u) =>
      ScimFilterParser.matches({ userName: u.email, email: u.email }, filterCondition)
    );

    const paginated = filtered.slice(startIndex - 1, startIndex - 1 + count);

    const resources: ScimUserResource[] = paginated.map((u) => this.toScimUser(u));

    const response: ScimListResponse<ScimUserResource> = {
      schemas: ['urn:ietf:params:scim:api:messages:2.0:ListResponse'],
      totalResults: filtered.length,
      startIndex,
      itemsPerPage: paginated.length,
      Resources: resources,
    };

    res.setHeader('Content-Type', 'application/scim+json');
    res.status(200).json(response);
  }

  public getUserById(req: AuthenticatedScimRequest, res: Response): void {
    const enterpriseId = req.enterpriseId!;
    const userId = req.params.id;

    const user = this.store.users.get(userId);
    if (!user || user.enterprise_id !== enterpriseId) {
      const err = new ScimError(404, `User ${userId} not found`);
      return void res.status(err.statusCode).json(err.toJSON());
    }

    res.setHeader('Content-Type', 'application/scim+json');
    res.status(200).json(this.toScimUser(user));
  }

  public postUser(req: AuthenticatedScimRequest, res: Response): void {
    const enterpriseId = req.enterpriseId!;
    const body = req.body as ScimUserResource;

    if (!body.userName) {
      const err = new ScimError(400, 'Attribute "userName" is required', 'invalidValue');
      return void res.status(err.statusCode).json(err.toJSON());
    }

    const email = body.emails?.[0]?.value || body.userName;
    const displayName = body.name?.formatted || `${body.name?.givenName || ''} ${body.name?.familyName || ''}`.trim() || body.userName;

    try {
      const { user, isReactivated } = this.lifecycleService.provisionOrReactivateUser({
        enterpriseId,
        email,
        displayName,
        firstName: body.name?.givenName,
        lastName: body.name?.familyName,
        scimExternalId: body.externalId,
      });

      res.setHeader('Content-Type', 'application/scim+json');
      res.status(isReactivated ? 200 : 201).json(this.toScimUser(user));
    } catch (err: unknown) {
      if (err instanceof Error && err.message.includes('CONFLICT_USER_ALREADY_ACTIVE')) {
        const scimErr = new ScimError(409, `User with email "${email}" already exists and is active.`, 'uniqueness');
        return void res.status(scimErr.statusCode).json(scimErr.toJSON());
      }
      const genericErr = new ScimError(500, err instanceof Error ? err.message : 'Internal Server Error');
      res.status(genericErr.statusCode).json(genericErr.toJSON());
    }
  }

  public patchUser(req: AuthenticatedScimRequest, res: Response): void {
    const enterpriseId = req.enterpriseId!;
    const userId = req.params.id;
    const patchBody = req.body as ScimPatchRequest;

    const user = this.store.users.get(userId);
    if (!user || user.enterprise_id !== enterpriseId) {
      const err = new ScimError(404, `User ${userId} not found`);
      return void res.status(err.statusCode).json(err.toJSON());
    }

    for (const op of patchBody.Operations || []) {
      const path = (op.path || '').toLowerCase();

      if (path === 'active' || (typeof op.value === 'object' && op.value !== null && 'active' in (op.value as Record<string, unknown>))) {
        const activeVal = path === 'active' ? op.value : (op.value as Record<string, unknown>).active;
        if (activeVal === false) {
          this.lifecycleService.deactivateUser(userId, enterpriseId);
        } else if (activeVal === true && !user.is_active) {
          user.is_active = true;
          user.deactivated_at = undefined;
          this.lifecycleService.evaluateAndApplyUserPlacements(userId, enterpriseId);
        }
      }

      if (path.startsWith('name.') || path === 'displayname') {
        if (typeof op.value === 'string') {
          user.display_name = op.value;
        }
      }
    }

    res.setHeader('Content-Type', 'application/scim+json');
    res.status(200).json(this.toScimUser(user));
  }

  public deleteUser(req: AuthenticatedScimRequest, res: Response): void {
    const enterpriseId = req.enterpriseId!;
    const userId = req.params.id;

    try {
      this.lifecycleService.deactivateUser(userId, enterpriseId);
      res.status(204).send();
    } catch {
      const err = new ScimError(404, `User ${userId} not found`);
      res.status(err.statusCode).json(err.toJSON());
    }
  }

  public getGroups(req: AuthenticatedScimRequest, res: Response): void {
    const enterpriseId = req.enterpriseId!;
    const groups = Array.from(this.store.directoryGroups.values()).filter(
      (g) => g.enterprise_id === enterpriseId
    );

    const resources: ScimGroupResource[] = groups.map((g) => this.toScimGroup(g));

    res.setHeader('Content-Type', 'application/scim+json');
    res.status(200).json({
      schemas: ['urn:ietf:params:scim:api:messages:2.0:ListResponse'],
      totalResults: groups.length,
      startIndex: 1,
      itemsPerPage: groups.length,
      Resources: resources,
    });
  }

  public postGroup(req: AuthenticatedScimRequest, res: Response): void {
    const enterpriseId = req.enterpriseId!;
    const body = req.body as ScimGroupResource;

    if (!body.displayName) {
      const err = new ScimError(400, 'Attribute "displayName" is required', 'invalidValue');
      return void res.status(err.statusCode).json(err.toJSON());
    }

    const newGroup = {
      id: randomUUID(),
      enterprise_id: enterpriseId,
      scim_external_id: body.externalId || body.displayName.toLowerCase().replace(/\s+/g, '-'),
      display_name: body.displayName,
      created_at: new Date(),
      updated_at: new Date(),
    };

    this.store.directoryGroups.set(newGroup.id, newGroup);

    if (body.members && body.members.length > 0) {
      const memberIds = body.members.map((m) => m.value);
      this.lifecycleService.syncGroupMemberships(newGroup.id, enterpriseId, memberIds, 'add');
    }

    res.setHeader('Content-Type', 'application/scim+json');
    res.status(201).json(this.toScimGroup(newGroup));
  }

  public patchGroup(req: AuthenticatedScimRequest, res: Response): void {
    const enterpriseId = req.enterpriseId!;
    const groupId = req.params.id;
    const patchBody = req.body as ScimPatchRequest;

    const group = this.store.directoryGroups.get(groupId);
    if (!group || group.enterprise_id !== enterpriseId) {
      const err = new ScimError(404, `Group ${groupId} not found`);
      return void res.status(err.statusCode).json(err.toJSON());
    }

    for (const op of patchBody.Operations || []) {
      const path = (op.path || '').toLowerCase();

      if (path === 'members' || !op.path) {
        let membersToAdd: string[] = [];
        if (Array.isArray(op.value)) {
          membersToAdd = op.value.map((m: { value: string }) => m.value);
        } else if (typeof op.value === 'object' && op.value !== null && 'members' in (op.value as Record<string, unknown>)) {
          const mList = (op.value as Record<string, unknown>).members as Array<{ value: string }>;
          membersToAdd = mList.map((m) => m.value);
        }

        if (op.op === 'add') {
          this.lifecycleService.syncGroupMemberships(groupId, enterpriseId, membersToAdd, 'add');
        } else if (op.op === 'replace') {
          this.lifecycleService.syncGroupMemberships(groupId, enterpriseId, membersToAdd, 'replace');
        } else if (op.op === 'remove') {
          this.lifecycleService.syncGroupMemberships(groupId, enterpriseId, membersToAdd, 'remove');
        }
      } else if (path === 'displayname' && typeof op.value === 'string') {
        this.lifecycleService.handleGroupRename(groupId, enterpriseId, op.value);
      }
    }

    res.setHeader('Content-Type', 'application/scim+json');
    res.status(200).json(this.toScimGroup(group));
  }

  private toScimUser(user: {
    id: string;
    email: string;
    display_name: string;
    first_name?: string;
    last_name?: string;
    scim_external_id?: string;
    is_active: boolean;
    created_at: Date;
    updated_at: Date;
  }): ScimUserResource {
    const groups = this.store.getGroupsForUser(user.id).map((g) => ({
      value: g,
      display: g,
    }));

    return {
      schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'],
      id: user.id,
      externalId: user.scim_external_id,
      userName: user.email,
      name: {
        formatted: user.display_name,
        familyName: user.last_name,
        givenName: user.first_name,
      },
      emails: [{ value: user.email, primary: true }],
      active: user.is_active,
      groups,
      meta: {
        resourceType: 'User',
        created: user.created_at.toISOString(),
        lastModified: user.updated_at.toISOString(),
        location: `/api/v1/scim/v2/Users/${user.id}`,
      },
    };
  }

  private toScimGroup(group: {
    id: string;
    display_name: string;
    scim_external_id: string;
    created_at: Date;
    updated_at: Date;
  }): ScimGroupResource {
    const members = this.store.directoryGroupMembers
      .filter((m) => m.directory_group_id === group.id)
      .map((m) => {
        const u = this.store.users.get(m.user_id);
        return {
          value: m.user_id,
          display: u?.display_name || u?.email || m.user_id,
        };
      });

    return {
      schemas: ['urn:ietf:params:scim:schemas:core:2.0:Group'],
      id: group.id,
      externalId: group.scim_external_id,
      displayName: group.display_name,
      members,
      meta: {
        resourceType: 'Group',
        created: group.created_at.toISOString(),
        lastModified: group.updated_at.toISOString(),
        location: `/api/v1/scim/v2/Groups/${group.id}`,
      },
    };
  }
}
