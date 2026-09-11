// src/services/rule-evaluator.ts
import { MappingRule, PlacementResult } from '../models/types.js';

export class MappingRuleEvaluator {
  /**
   * Evaluates directory groups against ordered mapping rules to determine target workspaces and roles.
   * Priority ordering: Lower number = higher priority.
   * Supports regex patterns and literal matches.
   */
  public static evaluate(
    userGroups: string[],
    activeRules: MappingRule[],
    defaultWorkspaceId: string
  ): PlacementResult {
    // Sort rules strictly by priority ascending
    const sortedRules = [...activeRules].sort((a, b) => a.priority - b.priority);
    const matchedPlacements = new Map<string, string>(); // workspaceId -> role
    let primaryWorkspaceId: string | null = null;

    for (const rule of sortedRules) {
      // Build safe regex: treat exact pattern or regex pattern
      let regex: RegExp;
      try {
        regex = new RegExp(rule.idp_group_pattern, 'i');
      } catch {
        // If invalid regex, fallback to exact string matching
        regex = new RegExp(`^${rule.idp_group_pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
      }

      const hasMatch = userGroups.some((groupName) => regex.test(groupName));

      if (hasMatch) {
        // If workspace is not yet mapped by a higher-priority rule, assign it
        if (!matchedPlacements.has(rule.target_workspace_id)) {
          matchedPlacements.set(rule.target_workspace_id, rule.assigned_role);
        }
        if (!primaryWorkspaceId) {
          primaryWorkspaceId = rule.target_workspace_id;
        }
      }
    }

    // Fallback if no groups matched any rules
    if (matchedPlacements.size === 0) {
      return {
        isFallback: true,
        placements: [{ workspaceId: defaultWorkspaceId, role: 'MEMBER' }],
        primaryWorkspaceId: defaultWorkspaceId,
      };
    }

    return {
      isFallback: false,
      placements: Array.from(matchedPlacements.entries()).map(([workspaceId, role]) => ({
        workspaceId,
        role,
      })),
      primaryWorkspaceId: primaryWorkspaceId ?? defaultWorkspaceId,
    };
  }
}
