// src/server.ts
import { createApp } from './app.js';
import { randomUUID } from 'crypto';

const { app, store, seeder } = createApp();

// Seed initial default enterprise and sample workspaces for local development
const enterpriseId = randomUUID();
store.enterprises.set(enterpriseId, {
  id: enterpriseId,
  name: 'Acme Enterprise',
  sso_domain: 'acme.com',
  created_at: new Date(),
  updated_at: new Date(),
});

// Configure SCIM Credential
const scimToken = 'scim_demo_secret_token_123';
store.scimCredentials.set(randomUUID(), {
  id: randomUUID(),
  enterprise_id: enterpriseId,
  token_hash: 'ignored_in_local_demo',
  token_hint: scimToken,
  is_active: true,
  created_at: new Date(),
});

// Create starter workspaces
const engWorkspaceId = randomUUID();
store.workspaces.set(engWorkspaceId, {
  id: engWorkspaceId,
  enterprise_id: enterpriseId,
  slug: 'engineering-core',
  name: 'Engineering Core Platform',
  blueprint_recipe_key: 'engineering-starter',
  is_archived: false,
  created_at: new Date(),
});

const genWorkspaceId = randomUUID();
store.workspaces.set(genWorkspaceId, {
  id: genWorkspaceId,
  enterprise_id: enterpriseId,
  slug: 'general-hub',
  name: 'Acme General Hub',
  blueprint_recipe_key: 'general-starter',
  is_archived: false,
  created_at: new Date(),
});

store.enterprises.get(enterpriseId)!.default_workspace_id = genWorkspaceId;

// Seed assets
seeder.seedWorkspace(engWorkspaceId, 'engineering-starter');
seeder.seedWorkspace(genWorkspaceId, 'general-starter');

// Set mapping rules
store.mappingRules.set(randomUUID(), {
  id: randomUUID(),
  enterprise_id: enterpriseId,
  idp_group_pattern: '^eng-.*',
  target_workspace_id: engWorkspaceId,
  assigned_role: 'DEVELOPER',
  priority: 10,
  is_active: true,
  created_at: new Date(),
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Enterprise SCIM & Onboarding Server running at http://localhost:${PORT}`);
  console.log(`Demo Onboarding Banner UI: http://localhost:${PORT}/static/components/onboarding/OnboardingBanner.html`);
  console.log(`SCIM API Token: ${scimToken}`);
});
