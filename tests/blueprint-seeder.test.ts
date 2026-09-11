// tests/blueprint-seeder.test.ts
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { InMemoryStore } from '../src/models/store.js';
import { BlueprintSeeder } from '../src/services/blueprint-seeder.js';
import * as path from 'path';

describe('BlueprintSeeder', () => {
  let store: InMemoryStore;
  let seeder: BlueprintSeeder;
  const workspaceId = 'ws-test-eng';

  beforeEach(() => {
    store = new InMemoryStore();
    store.workspaces.set(workspaceId, {
      id: workspaceId,
      enterprise_id: 'ent-1',
      slug: 'test-eng',
      name: 'Test Engineering',
      is_archived: false,
      created_at: new Date(),
    });

    const recipesPath = path.resolve(process.cwd(), 'blueprints', 'recipes');
    seeder = new BlueprintSeeder(store, recipesPath);
  });

  it('should load all recipes from blueprints/recipes directory', () => {
    assert.ok(seeder.getRecipe('engineering-starter'));
    assert.ok(seeder.getRecipe('product-starter'));
    assert.ok(seeder.getRecipe('general-starter'));
  });

  it('should seed starter boards, sample cards, pinned resources, and queries', () => {
    const result = seeder.seedWorkspace(workspaceId, 'engineering-starter');

    assert.ok(result.boardsCreated >= 1);
    assert.ok(result.cardsCreated >= 2);
    assert.ok(result.resourcesCreated >= 2);
    assert.ok(result.queriesCreated >= 1);

    // Verify workspace record updated
    const ws = store.workspaces.get(workspaceId);
    assert.strictEqual(ws?.blueprint_recipe_key, 'engineering-starter');

    // Verify boards stored
    const boards = Array.from(store.seededBoards.values()).filter(b => b.workspace_id === workspaceId);
    assert.strictEqual(boards.length, 1);
    assert.strictEqual(boards[0].name, 'Sprint Backlog');
  });

  it('should be strictly idempotent and not duplicate boards on multiple seedings', () => {
    const firstRun = seeder.seedWorkspace(workspaceId, 'engineering-starter');
    assert.strictEqual(firstRun.boardsCreated, 1);

    const secondRun = seeder.seedWorkspace(workspaceId, 'engineering-starter');
    assert.strictEqual(secondRun.boardsCreated, 0); // 0 new boards created
    assert.strictEqual(secondRun.cardsCreated, 0);  // 0 new cards created
  });
});
