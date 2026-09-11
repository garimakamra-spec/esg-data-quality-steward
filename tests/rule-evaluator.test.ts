// tests/rule-evaluator.test.ts
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { MappingRuleEvaluator } from '../src/services/rule-evaluator.js';
import { MappingRule } from '../src/models/types.js';

describe('MappingRuleEvaluator', () => {
  const defaultWs = 'ws-default-general';

  it('should fall back to default workspace when user has no groups', () => {
    const rules: MappingRule[] = [
      {
        id: 'r1',
        enterprise_id: 'ent-1',
        idp_group_pattern: '^eng-.*',
        target_workspace_id: 'ws-eng',
        assigned_role: 'DEVELOPER',
        priority: 10,
        is_active: true,
        created_at: new Date(),
      },
    ];

    const result = MappingRuleEvaluator.evaluate([], rules, defaultWs);
    assert.strictEqual(result.isFallback, true);
    assert.strictEqual(result.primaryWorkspaceId, defaultWs);
    assert.strictEqual(result.placements.length, 1);
    assert.strictEqual(result.placements[0].role, 'MEMBER');
  });

  it('should map regex pattern to target workspace and role', () => {
    const rules: MappingRule[] = [
      {
        id: 'r1',
        enterprise_id: 'ent-1',
        idp_group_pattern: '^eng-.*',
        target_workspace_id: 'ws-eng',
        assigned_role: 'DEVELOPER',
        priority: 10,
        is_active: true,
        created_at: new Date(),
      },
    ];

    const result = MappingRuleEvaluator.evaluate(['eng-backend-team'], rules, defaultWs);
    assert.strictEqual(result.isFallback, false);
    assert.strictEqual(result.primaryWorkspaceId, 'ws-eng');
    assert.strictEqual(result.placements[0].workspaceId, 'ws-eng');
    assert.strictEqual(result.placements[0].role, 'DEVELOPER');
  });

  it('should strictly respect priority order when multiple rules match', () => {
    const rules: MappingRule[] = [
      {
        id: 'r-low',
        enterprise_id: 'ent-1',
        idp_group_pattern: '.*',
        target_workspace_id: 'ws-general',
        assigned_role: 'VIEWER',
        priority: 100, // lower priority
        is_active: true,
        created_at: new Date(),
      },
      {
        id: 'r-high',
        enterprise_id: 'ent-1',
        idp_group_pattern: 'product-leads',
        target_workspace_id: 'ws-product',
        assigned_role: 'PRODUCT_MANAGER',
        priority: 5, // higher priority
        is_active: true,
        created_at: new Date(),
      },
    ];

    const result = MappingRuleEvaluator.evaluate(['product-leads'], rules, defaultWs);
    assert.strictEqual(result.primaryWorkspaceId, 'ws-product');
    const prodPlacement = result.placements.find(p => p.workspaceId === 'ws-product');
    assert.strictEqual(prodPlacement?.role, 'PRODUCT_MANAGER');
  });
});
