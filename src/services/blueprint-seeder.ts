// src/services/blueprint-seeder.ts
import { InMemoryStore, SeededBoard, SeededCard, SeededResource, SeededQuery } from '../models/store.js';
import { BlueprintRecipe } from '../models/types.js';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

export class BlueprintSeeder {
  private recipes: Map<string, BlueprintRecipe> = new Map();

  constructor(private store: InMemoryStore, private recipesDir?: string) {
    this.loadAvailableRecipes();
  }

  public loadAvailableRecipes(): void {
    const dir = this.recipesDir || path.resolve(process.cwd(), 'blueprints', 'recipes');
    if (!fs.existsSync(dir)) return;

    const files = fs.readdirSync(dir);
    for (const f of files) {
      if (f.endsWith('.json')) {
        const fullPath = path.join(dir, f);
        try {
          const content = fs.readFileSync(fullPath, 'utf-8');
          const parsed = JSON.parse(content) as BlueprintRecipe;
          if (parsed.recipeKey) {
            this.recipes.set(parsed.recipeKey, parsed);
          }
        } catch (e) {
          console.error(`Error loading recipe from ${fullPath}:`, e);
        }
      }
    }
  }

  public registerRecipe(recipe: BlueprintRecipe): void {
    this.recipes.set(recipe.recipeKey, recipe);
  }

  public getRecipe(recipeKey: string): BlueprintRecipe | undefined {
    return this.recipes.get(recipeKey);
  }

  /**
   * Seeds assets into a workspace based on a blueprint recipe key.
   * Guarantees transactional idempotency.
   */
  public seedWorkspace(workspaceId: string, recipeKey: string): {
    boardsCreated: number;
    cardsCreated: number;
    resourcesCreated: number;
    queriesCreated: number;
  } {
    const workspace = this.store.workspaces.get(workspaceId);
    if (!workspace) {
      throw new Error(`Workspace ${workspaceId} not found`);
    }

    const recipe = this.recipes.get(recipeKey);
    if (!recipe) {
      throw new Error(`Recipe ${recipeKey} not found`);
    }

    let boardsCreated = 0;
    let cardsCreated = 0;
    let resourcesCreated = 0;
    let queriesCreated = 0;

    // 1. Starter Boards & Cards
    for (const boardBlueprint of recipe.assets.starterBoards) {
      // Check if board already exists in this workspace
      let existingBoardId: string | null = null;
      for (const b of this.store.seededBoards.values()) {
        if (b.workspace_id === workspaceId && b.name === boardBlueprint.name) {
          existingBoardId = b.id;
          break;
        }
      }

      const boardId = existingBoardId || randomUUID();
      if (!existingBoardId) {
        const board: SeededBoard = {
          id: boardId,
          workspace_id: workspaceId,
          name: boardBlueprint.name,
          columns: boardBlueprint.columns,
        };
        this.store.seededBoards.set(board.id, board);
        boardsCreated++;
      }

      // Add cards
      for (const cardBlueprint of boardBlueprint.sampleCards) {
        const cardExists = this.store.seededCards.some(
          (c) => c.board_id === boardId && c.title === cardBlueprint.title
        );
        if (!cardExists) {
          const card: SeededCard = {
            id: randomUUID(),
            board_id: boardId,
            title: cardBlueprint.title,
            label: cardBlueprint.label,
            status: cardBlueprint.status,
          };
          this.store.seededCards.push(card);
          cardsCreated++;
        }
      }
    }

    // 2. Pinned Resources
    for (const resBlueprint of recipe.assets.pinnedResources) {
      let resourceExists = false;
      for (const r of this.store.seededResources.values()) {
        if (r.workspace_id === workspaceId && r.url === resBlueprint.url) {
          resourceExists = true;
          break;
        }
      }

      if (!resourceExists) {
        const resource: SeededResource = {
          id: randomUUID(),
          workspace_id: workspaceId,
          title: resBlueprint.title,
          url: resBlueprint.url,
          category: resBlueprint.category,
        };
        this.store.seededResources.set(resource.id, resource);
        resourcesCreated++;
      }
    }

    // 3. Sample Queries
    for (const queryBlueprint of recipe.assets.sampleQueries) {
      let queryExists = false;
      for (const q of this.store.seededQueries.values()) {
        if (q.workspace_id === workspaceId && q.name === queryBlueprint.name) {
          queryExists = true;
          break;
        }
      }

      if (!queryExists) {
        const query: SeededQuery = {
          id: randomUUID(),
          workspace_id: workspaceId,
          name: queryBlueprint.name,
          query: queryBlueprint.query,
        };
        this.store.seededQueries.set(query.id, query);
        queriesCreated++;
      }
    }

    workspace.blueprint_recipe_key = recipeKey;

    return {
      boardsCreated,
      cardsCreated,
      resourcesCreated,
      queriesCreated,
    };
  }
}
