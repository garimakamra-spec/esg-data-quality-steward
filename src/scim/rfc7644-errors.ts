// src/scim/rfc7644-errors.ts

export type ScimErrorType =
  | 'invalidFilter'
  | 'tooMany'
  | 'uniqueness'
  | 'mutability'
  | 'invalidSyntax'
  | 'invalidPath'
  | 'noTarget'
  | 'invalidValue'
  | 'invalidVers'
  | 'sensitive';

export interface ScimErrorPayload {
  schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'];
  status: string;
  scimType?: ScimErrorType;
  detail: string;
}

export class ScimError extends Error {
  constructor(
    public statusCode: number,
    public detail: string,
    public scimType?: ScimErrorType
  ) {
    super(detail);
    this.name = 'ScimError';
  }

  public toJSON(): ScimErrorPayload {
    const payload: ScimErrorPayload = {
      schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
      status: this.statusCode.toString(),
      detail: this.detail,
    };
    if (this.scimType) {
      payload.scimType = this.scimType;
    }
    return payload;
  }
}
