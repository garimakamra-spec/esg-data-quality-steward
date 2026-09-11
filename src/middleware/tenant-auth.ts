// src/middleware/tenant-auth.ts
import { Request, Response, NextFunction } from 'express';
import { InMemoryStore } from '../models/store.js';
import { ScimError } from '../scim/rfc7644-errors.js';
import { createHash } from 'crypto';

export interface AuthenticatedScimRequest extends Request {
  enterpriseId?: string;
}

export function createTenantAuthMiddleware(store: InMemoryStore) {
  return (req: AuthenticatedScimRequest, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      const err = new ScimError(401, 'Missing or malformed Authorization header with Bearer token');
      return res.status(err.statusCode).json(err.toJSON());
    }

    const token = authHeader.substring(7).trim();
    const tokenHash = createHash('sha256').update(token).digest('hex');

    // Find active credential matching hash
    let matchedEnterpriseId: string | null = null;
    for (const cred of store.scimCredentials.values()) {
      if (cred.is_active && (cred.token_hash === tokenHash || cred.token_hint === token)) {
        matchedEnterpriseId = cred.enterprise_id;
        cred.last_used_at = new Date();
        break;
      }
    }

    if (!matchedEnterpriseId) {
      const err = new ScimError(401, 'Invalid, revoked, or expired Bearer token');
      return res.status(err.statusCode).json(err.toJSON());
    }

    req.enterpriseId = matchedEnterpriseId;
    next();
  };
}
