// src/scim/filter-parser.ts
import { ScimError } from './rfc7644-errors.js';

export interface ScimFilterCondition {
  attribute: string;
  operator: 'eq' | 'ne' | 'co' | 'sw' | 'ew' | 'pr';
  value?: string;
}

export class ScimFilterParser {
  /**
   * Parses basic RFC 7644 filter queries e.g.:
   *   userName eq "alex@acme.com"
   *   emails.value eq "alex@acme.com"
   */
  public static parse(filterString?: string): ScimFilterCondition | null {
    if (!filterString || !filterString.trim()) {
      return null;
    }

    const trimmed = filterString.trim();
    // Match: attribute operator "value" or attribute operator value
    const match = trimmed.match(/^([a-zA-Z0-9_.]+)\s+(eq|ne|co|sw|ew|pr)(?:\s+["']?([^"']+)["']?)?$/i);

    if (!match) {
      throw new ScimError(400, `Invalid filter expression: ${filterString}`, 'invalidFilter');
    }

    const [, rawAttr, rawOp, rawVal] = match;
    const operator = rawOp.toLowerCase() as ScimFilterCondition['operator'];

    // Normalize attribute name
    let attribute = rawAttr.toLowerCase();
    if (attribute.startsWith('emails[') || attribute === 'emails.value') {
      attribute = 'email';
    } else if (attribute === 'username') {
      attribute = 'username';
    }

    return {
      attribute,
      operator,
      value: rawVal,
    };
  }

  /**
   * Evaluates if a given object matches the parsed filter condition.
   */
  public static matches(item: { userName?: string; email?: string }, condition: ScimFilterCondition | null): boolean {
    if (!condition) return true;

    let targetValue: string | undefined;
    if (condition.attribute === 'username') {
      targetValue = item.userName;
    } else if (condition.attribute === 'email') {
      targetValue = item.email;
    }

    if (!targetValue) return false;

    if (condition.operator === 'eq') {
      return targetValue.toLowerCase() === (condition.value || '').toLowerCase();
    }
    if (condition.operator === 'co') {
      return targetValue.toLowerCase().includes((condition.value || '').toLowerCase());
    }
    if (condition.operator === 'sw') {
      return targetValue.toLowerCase().startsWith((condition.value || '').toLowerCase());
    }

    return false;
  }
}
