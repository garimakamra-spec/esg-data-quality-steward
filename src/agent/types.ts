// src/agent/types.ts
/**
 * Data contracts and state schemas for the ESG Data Quality Steward AI Agent
 * Conforming to Strategic Blueprint Specifications (Sections 4, 5, 7)
 * Enhanced with Neuro-Symbolic boundaries, Scope 2 Dual-Reporting, Idempotency & Reversion safety
 */

export type UtilityType = 'ELECTRICITY' | 'NATURAL_GAS' | 'STEAM' | 'WATER';

export type AssetType = 'COMMERCIAL_OFFICE' | 'LOGISTICS_WAREHOUSE' | 'DATA_CENTER' | 'RETAIL';

export type RegulatoryClass = 'EU_TAXONOMY_ALIGNED' | 'SFDR_ARTICLE_8' | 'SFDR_ARTICLE_9' | 'STANDARD';

export type RootCauseClassification =
  | 'UTILITY_MULTIPLIER_ERROR'
  | 'ESTIMATED_OR_MISSING_READ'
  | 'METER_ROLLOVER_OR_SWAP'
  | 'OPERATIONAL_BEHAVIORAL_SHIFT'
  | 'UNKNOWN';

export type RemediationActionType =
  | 'APPLY_SCALAR_CORRECTION'
  | 'WEATHER_ADJUSTED_SYNTHETIC_FILL'
  | 'DISPUTE_UTILITY_INVOICE'
  | 'SITE_INSPECTION_DISPATCH'
  | 'REVERT_TO_ORIGINAL';

export type WorkflowStatus =
  | 'INGESTED'
  | 'DIAGNOSED'
  | 'ESCALATED'
  | 'AUTO_REMEDIATED'
  | 'HUMAN_APPROVED'
  | 'REJECTED'
  | 'REVERTED';

export interface ConfidenceComponents {
  s_stat: number;    // Statistical plausibility (variance vs baseline & peers)
  s_cause: number;   // Structural root cause certainty (multiplier match, flatline flag)
  s_context: number; // Quality & completeness of context data (>12 mo history, weather, peers)
}

export interface EvidenceItem {
  id: string;
  rule: string;
  detail: string;
  verified: boolean;
}

export interface TimeseriesPoint {
  date: string;
  observed: number;
  peer_mean: number;
  weather_baseline: number;
}

export interface WritebackReceipt {
  target_api: string;
  response_status: number;
  transaction_hash: string;
  timestamp: string;
  idempotency_key: string;
  original_unadjusted_value: number;
  reverted?: boolean;
}

/**
 * Orchestrator State Schema (StateGraph Definition)
 * Passed across all sub-agent steps and nodes
 */
export interface AnomalyState {
  // Ingestion Metadata
  event_id: string;
  asset_id: string;
  asset_name: string;
  asset_type: AssetType;
  meter_id: string;
  utility_type: UtilityType;
  observed_value: number;
  unit_of_measure: string;
  interval_start: string;
  interval_end: string;
  floor_area_sqft: number;
  climate_zone: string;
  postal_code: string;
  regulatory_class: RegulatoryClass;
  is_green_financing_facility: boolean;

  // Contextual Data
  prior_month_value: number;
  historical_baseline_mean: number;
  historical_baseline_stdev: number;
  cooling_degree_days: number;
  heating_degree_days: number;
  cdd_delta_pct: number;
  hdd_delta_pct: number;
  peer_cluster_mean: number;
  peer_cluster_stdev: number;
  peer_sample_size: number;
  peer_consumption_delta_pct: number;
  timeseries_context?: TimeseriesPoint[];

  // Diagnostic Outputs (Neuro-symbolic synthesis)
  classified_root_cause?: RootCauseClassification;
  root_cause_probability: number;
  confidence_components: ConfidenceComponents;
  composite_confidence_score: number;
  chain_of_thought_logs: string[];
  evidence_chain: EvidenceItem[];

  // Remediation & Compliance (Scope 2 Dual-Reporting)
  proposed_remediation_action?: RemediationActionType;
  proposed_remediated_value?: number;
  scalar_factor?: number;
  delta_carbon_emissions_tco2e: number;
  delta_carbon_emissions_tco2e_location: number;
  delta_carbon_emissions_tco2e_market: number;
  is_high_stakes: boolean;
  high_stakes_reasons: string[];
  requires_human_signoff: boolean;

  // Execution, Reversion & Routing
  workflow_status: WorkflowStatus;
  routing_reason: string;
  human_reviewer_notes?: string;
  approver_identity?: string;
  approval_timestamp?: string;
  audit_hash?: string;
  previous_audit_hash?: string;
  idempotency_key?: string;
  writeback_receipt?: WritebackReceipt;
  is_reverted?: boolean;
}

/**
 * Immutable Decision Ledger Record Schema (Section 5.2)
 * Features strict hashing formula:
 * Block Hash = SHA-256(prev_hash + event_id + timestamp + remediated_val + signer_id)
 */
export interface AuditRecord {
  audit_event_id: string;
  timestamp_utc: string;
  asset_id: string;
  asset_name: string;
  meter_id: string;
  reporting_frameworks: string[];
  anomaly_observation: {
    observed_value: number;
    reported_uom: string;
    billing_period: {
      start: string;
      end: string;
    };
  };
  agent_diagnostics: {
    classified_cause: RootCauseClassification;
    confidence_scoring: {
      composite: number;
      s_stat: number;
      s_cause: number;
      s_context: number;
    };
    reasoning_chain: string[];
  };
  remediation_decision: {
    action_type: RemediationActionType;
    remediated_value: number;
    delta_emissions_tco2e: number;
    delta_emissions_tco2e_location: number;
    delta_emissions_tco2e_market: number;
    execution_path: 'AUTONOMOUS_STP' | 'HUMAN_SIGN_OFF' | 'MANUAL_OVERRIDE' | 'ROLLBACK_REVERSION';
    approver: string;
    approval_timestamp: string;
    signer_id: string;
  };
  writeback_receipt: WritebackReceipt;
  previous_block_hash: string;
  hashing_contract: string;
  block_hash: string;
}

export interface DisputePackage {
  ticket_id: string;
  generated_at: string;
  utility_provider: string;
  account_number: string;
  meter_id: string;
  asset_name: string;
  billing_period: { start: string; end: string };
  billed_amount: number;
  expected_amount: number;
  discrepancy_factor: number;
  calculated_rebate_estimate_currency: number;
  formal_letter_body: string;
  evidence_summary: string[];
}

export interface InspectionWorkOrder {
  work_order_id: string;
  created_at: string;
  asset_id: string;
  asset_name: string;
  location: string;
  meter_id: string;
  priority: 'URGENT' | 'HIGH' | 'MEDIUM';
  checklist: string[];
  instructions: string;
}
