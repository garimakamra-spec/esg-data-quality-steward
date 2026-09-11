// src/controllers/onboarding-controller.ts
import { Request, Response } from 'express';
import { InMemoryStore } from '../models/store.js';
import { BlueprintSeeder } from '../services/blueprint-seeder.js';

export class OnboardingController {
  constructor(private store: InMemoryStore, private seeder: BlueprintSeeder) {}

  public getRunbook(req: Request, res: Response): void {
    const userId = (req.query.userId as string) || (req.headers['x-user-id'] as string);

    if (!userId) {
      res.status(400).json({ error: 'Missing userId parameter' });
      return;
    }

    const state = this.store.userOnboardingStates.get(userId);
    const user = this.store.users.get(userId);

    if (!user || !state) {
      res.status(404).json({ error: `Onboarding state for user ${userId} not found` });
      return;
    }

    const workspace = this.store.workspaces.get(state.workspace_id);
    const recipeKey = workspace?.blueprint_recipe_key || 'general-starter';
    const recipe = this.seeder.getRecipe(recipeKey);

    const steps = (recipe?.microRunbook.steps || []).map((step) => ({
      ...step,
      isCompleted: state.completed_steps.includes(step.id),
    }));

    const totalSteps = steps.length;
    const completedCount = state.completed_steps.length;
    const progressPercent = totalSteps > 0 ? Math.round((completedCount / totalSteps) * 100) : 100;

    res.status(200).json({
      userId: user.id,
      userName: user.display_name,
      workspaceId: workspace?.id,
      workspaceName: workspace?.name,
      roleKey: state.role_key,
      isDismissed: state.is_dismissed,
      progressPercent,
      completedSteps: state.completed_steps,
      steps,
      firstLoginAt: state.first_login_at,
      completedAt: state.completed_at,
    });
  }

  public completeStep(req: Request, res: Response): void {
    const { userId, stepId } = req.body;

    if (!userId || !stepId) {
      res.status(400).json({ error: 'userId and stepId are required' });
      return;
    }

    const state = this.store.userOnboardingStates.get(userId);
    if (!state) {
      res.status(404).json({ error: `Onboarding state for user ${userId} not found` });
      return;
    }

    if (!state.completed_steps.includes(stepId)) {
      state.completed_steps.push(stepId);
    }

    const workspace = this.store.workspaces.get(state.workspace_id);
    const recipe = this.seeder.getRecipe(workspace?.blueprint_recipe_key || 'general-starter');
    const totalSteps = recipe?.microRunbook.steps.length || 3;

    if (state.completed_steps.length >= totalSteps && !state.completed_at) {
      state.completed_at = new Date();
    }

    res.status(200).json({
      success: true,
      completedSteps: state.completed_steps,
      isComplete: state.completed_steps.length >= totalSteps,
      completedAt: state.completed_at,
    });
  }

  public dismiss(req: Request, res: Response): void {
    const { userId } = req.body;

    if (!userId) {
      res.status(400).json({ error: 'userId is required' });
      return;
    }

    const state = this.store.userOnboardingStates.get(userId);
    if (!state) {
      res.status(404).json({ error: `Onboarding state for user ${userId} not found` });
      return;
    }

    state.is_dismissed = true;

    res.status(200).json({
      success: true,
      isDismissed: true,
    });
  }
}
