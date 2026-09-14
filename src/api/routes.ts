// src/api/routes.ts
/**
 * REST API Endpoints for ESG Data Quality Steward AI Agent
 * Powers the Exception Review Console, Simulator, and Audit Explorer
 */

import { Router, Request, Response } from 'express';
import { MultiAgentOrchestrator } from '../agent/orchestrator.js';
import { generateDisputePackage, generateInspectionWorkOrder } from '../agent/tools/dispute-generator.js';

export function createEsgRoutes(orchestrator: MultiAgentOrchestrator): Router {
  const router = Router();

  // 1. Executive Metrics & KPIs
  router.get('/metrics', (_req: Request, res: Response) => {
    const metrics = orchestrator.getSystemMetrics();
    res.json({ success: true, data: metrics });
  });

  // 2. Exception Review Queue
  router.get('/cases', (req: Request, res: Response) => {
    const statusFilter = req.query.status as string;
    const fuelFilter = req.query.fuel as string;
    const materialityFilter = req.query.materiality as string;

    let cases = Array.from(orchestrator.activeCases.values());

    if (statusFilter && statusFilter !== 'ALL') {
      cases = cases.filter((c) => c.workflow_status === statusFilter);
    }
    if (fuelFilter && fuelFilter !== 'ALL') {
      cases = cases.filter((c) => c.utility_type === fuelFilter);
    }
    if (materialityFilter === 'HIGH') {
      cases = cases.filter((c) => c.is_high_stakes);
    } else if (materialityFilter === 'LOW') {
      cases = cases.filter((c) => !c.is_high_stakes);
    }

    // Sort: Escalated first, then recent
    cases.sort((a, b) => {
      if (a.workflow_status === 'ESCALATED' && b.workflow_status !== 'ESCALATED') return -1;
      if (b.workflow_status === 'ESCALATED' && a.workflow_status !== 'ESCALATED') return 1;
      return b.event_id.localeCompare(a.event_id);
    });

    res.json({ success: true, count: cases.length, data: cases });
  });

  // 3. Single Case Detail
  router.get('/cases/:id', (req: Request, res: Response) => {
    const caseState = orchestrator.activeCases.get(req.params.id);
    if (!caseState) {
      return res.status(404).json({ success: false, error: 'Case not found' });
    }
    res.json({ success: true, data: caseState });
  });

  // 4. 1-Click HITL Action Dispatcher (Approve / Edit / Reject)
  router.post('/cases/:id/hitl-action', async (req: Request, res: Response) => {
    try {
      const { action, approverEmail = 'user_esg_lead_04@company.com', overrideValue, reviewerNotes } = req.body;

      if (action === 'APPROVE') {
        const updated = await orchestrator.executeHumanApproval({
          eventId: req.params.id,
          approverEmail,
          overrideRemediatedValue: overrideValue !== undefined ? Number(overrideValue) : undefined,
          reviewerNotes: reviewerNotes || 'Approved via 1-Click HITL Exception Review Console',
        });
        return res.json({ success: true, message: 'Case approved and writeback executed', data: updated });
      }

      if (action === 'EDIT') {
        if (overrideValue === undefined) {
          return res.status(400).json({ success: false, error: 'overrideValue is required for EDIT action' });
        }
        const updated = await orchestrator.executeHumanApproval({
          eventId: req.params.id,
          approverEmail,
          overrideRemediatedValue: Number(overrideValue),
          reviewerNotes: reviewerNotes || `Remediation value manually adjusted to ${overrideValue}`,
        });
        return res.json({ success: true, message: 'Case edited and writeback executed', data: updated });
      }

      if (action === 'REJECT') {
        const updated = orchestrator.rejectProposal(
          req.params.id,
          approverEmail,
          reviewerNotes || 'Proposal rejected by ESG reviewer'
        );
        return res.json({ success: true, message: 'Proposal rejected', data: updated });
      }

      if (action === 'REVERT') {
        const updated = orchestrator.executeReversion({
          eventId: req.params.id,
          userEmail: approverEmail,
          reason: reviewerNotes || 'Reverted writeback upon site technician request',
        });
        return res.json({ success: true, message: 'Case reverted to original unadjusted read', data: updated });
      }

      return res.status(400).json({ success: false, error: `Unknown action: ${action}` });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // 4b. Explicit Rollback / Reversion Endpoint
  router.post('/cases/:id/revert', (req: Request, res: Response) => {
    try {
      const { userEmail = 'user_esg_lead_04@company.com', reason } = req.body;
      const updated = orchestrator.executeReversion({
        eventId: req.params.id,
        userEmail,
        reason,
      });
      res.json({ success: true, message: 'Case rolled back to original unadjusted read', data: updated });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 5. Utility Dispute Package Generator
  router.get('/cases/:id/dispute-package', (req: Request, res: Response) => {
    const caseState = orchestrator.activeCases.get(req.params.id);
    if (!caseState) {
      return res.status(404).json({ success: false, error: 'Case not found' });
    }
    const pkg = generateDisputePackage(caseState);
    res.json({ success: true, data: pkg });
  });

  // 6. On-site Facility Inspection Ticket
  router.get('/cases/:id/inspection-ticket', (req: Request, res: Response) => {
    const caseState = orchestrator.activeCases.get(req.params.id);
    if (!caseState) {
      return res.status(404).json({ success: false, error: 'Case not found' });
    }
    const ticket = generateInspectionWorkOrder(caseState);
    res.json({ success: true, data: ticket });
  });

  // 7. Anomaly Scenario Simulator & Webhook Ingestion
  router.post('/anomalies/simulate', async (req: Request, res: Response) => {
    try {
      const { scenario, customPayload } = req.body;

      let input = customPayload;

      if (scenario === 'case_2026_8942') {
        // Page 8 Blueprint Canonical Case: Logistics Hub 4 10x Spike
        input = {
          event_id: 'case_2026_8942',
          asset_id: 'GB-LON-LOG-004',
          meter_id: 'ELEC-MAIN-01',
          observed_value: 120400.0,
          interval_start: '2026-08-01',
          interval_end: '2026-08-31',
        };
      } else if (scenario === 'stp_multiplier') {
        // 70% STP Canonical Case: Commercial Office 10x spike with < 50 tCO2e impact
        input = {
          event_id: `stp_${Date.now()}`,
          asset_id: 'GB-LON-LOG-004',
          meter_id: 'ELEC-MAIN-01',
          observed_value: 120500.0, // 10x pulse multiplier slip on 12,050 baseline (< 50 tCO2e delta -> Auto-Remediated STP)
          interval_start: '2026-08-01',
          interval_end: '2026-08-31',
        };
      } else if (scenario === 'gas_winter_freeze') {
        // Page 15/16 Blueprint Scenario: Peak Winter Freeze Gas Read 0.00 m3
        input = {
          event_id: `gas_freeze_${Date.now()}`,
          asset_id: 'GB-MID-LOG-002',
          meter_id: 'GAS-MAIN-02',
          observed_value: 0.0,
          interval_start: '2026-01-01',
          interval_end: '2026-01-31',
        };
      } else if (scenario === 'eu_taxonomy_flagship') {
        // Page 5 & 11: EU Taxonomy Flagship Asset - Frankfurt Commercial Tower
        input = {
          event_id: `eu_tax_${Date.now()}`,
          asset_id: 'DE-FRK-OFF-001',
          meter_id: 'ELEC-FRK-01',
          observed_value: 450000.0, // 10x surge on 45,000 kWh baseline
          interval_start: '2026-08-01',
          interval_end: '2026-08-31',
        };
      } else if (scenario === 'meter_rollover') {
        input = {
          event_id: `rollover_${Date.now()}`,
          asset_id: 'US-NYC-OFF-102',
          meter_id: 'ELEC-NYC-01',
          observed_value: 0.0,
          is_meter_swap: true,
          interval_start: '2026-08-01',
          interval_end: '2026-08-31',
        };
      } else if (scenario === 'operational_drift') {
        input = {
          event_id: `drift_${Date.now()}`,
          asset_id: 'GB-LON-LOG-004',
          meter_id: 'ELEC-MAIN-01',
          observed_value: 19800.0, // 64% jump without multiplier match
          interval_start: '2026-08-01',
          interval_end: '2026-08-31',
        };
      }

      if (!input || !input.asset_id || !input.meter_id || input.observed_value === undefined) {
        return res.status(400).json({ success: false, error: 'Valid scenario or custom input payload required' });
      }

      const result = await orchestrator.processAnomalyEvent(input);
      res.json({ success: true, scenario, data: result });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 8. Immutable Audit Ledger Explorer
  router.get('/audit/ledger', (_req: Request, res: Response) => {
    const records = orchestrator.auditLedger.getAllRecords();
    const verification = orchestrator.auditLedger.verifyLedgerIntegrity();
    res.json({
      success: true,
      count: records.length,
      integrity: verification,
      data: records,
    });
  });

  // 9. Auditor Assurance Verification Pack Export
  router.get('/audit/export/:asset_id?', (req: Request, res: Response) => {
    const pack = orchestrator.auditLedger.generateAuditorVerificationPack(req.params.asset_id);
    res.json({ success: true, data: pack });
  });

  return router;
}
