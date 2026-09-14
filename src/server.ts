// src/server.ts
import { createApp } from './app.js';
import { randomUUID } from 'crypto';

const { app, store, seeder, esgOrchestrator } = createApp();

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

// Seed initial canonical ESG anomaly cases on startup
async function seedInitialEsgCases() {
  try {
    // 1. Canonical Case #2026-8942 (Page 8): Logistics Hub 4 10x Spike (High Stakes HITL)
    await esgOrchestrator.processAnomalyEvent({
      event_id: 'case_2026_8942',
      asset_id: 'GB-LON-LOG-004',
      meter_id: 'ELEC-MAIN-01',
      observed_value: 120400.0,
      interval_start: '2026-08-01',
      interval_end: '2026-08-31',
    });

    // 2. Canonical STP Auto-Remediated Case (Page 1): Low Stake 10x multiplier
    await esgOrchestrator.processAnomalyEvent({
      event_id: 'stp_2026_1041',
      asset_id: 'GB-LON-LOG-004',
      meter_id: 'ELEC-MAIN-01',
      observed_value: 120500.0,
      interval_start: '2026-07-01',
      interval_end: '2026-07-31',
    });

    // 3. Peak Winter Freeze Gas Read Anomaly (Page 15/16): 0.00 m3 (High Stake 140 tCO2e)
    await esgOrchestrator.processAnomalyEvent({
      event_id: 'gas_freeze_9102',
      asset_id: 'GB-MID-LOG-002',
      meter_id: 'GAS-MAIN-02',
      observed_value: 0.0,
      interval_start: '2026-01-01',
      interval_end: '2026-01-31',
    });

    // 4. EU Taxonomy Flagship Asset Anomaly (Page 5/11): Mandatory Human Sign-off
    await esgOrchestrator.processAnomalyEvent({
      event_id: 'eu_tax_4401',
      asset_id: 'DE-FRK-OFF-001',
      meter_id: 'ELEC-FRK-01',
      observed_value: 450000.0,
      interval_start: '2026-08-01',
      interval_end: '2026-08-31',
    });

    console.log('✅ Pre-seeded 4 Canonical ESG Anomaly Cases into Multi-Agent Orchestrator');
  } catch (err) {
    console.error('Error seeding initial ESG cases:', err);
  }
}

const server = app.listen(PORT, async () => {
  console.log(`\n===============================================================`);
  console.log(`🌱 ESG Data Quality Steward AI Agent Engine Online`);
  console.log(`🚀 Exception Review Console: http://localhost:${PORT}/console`);
  console.log(`🎯 API v2 Endpoints:         http://localhost:${PORT}/api/v2/cases`);
  console.log(`⛓️ Audit Ledger & CSRD:      http://localhost:${PORT}/api/v2/audit/ledger`);
  console.log(`===============================================================\n`);

  await seedInitialEsgCases();
});

