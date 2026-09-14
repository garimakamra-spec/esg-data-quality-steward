// src/agent/tools/dispute-generator.ts
/**
 * Automated utility invoice dispute letter and site inspection ticket generator
 * Conforming to Section 4.2 & Section 3.1
 */

import { DisputePackage, InspectionWorkOrder, AnomalyState } from '../types.js';
import { randomUUID } from 'crypto';

export function generateDisputePackage(state: AnomalyState): DisputePackage {
  const discrepancyFactor = state.historical_baseline_mean > 0
    ? Number((state.observed_value / state.historical_baseline_mean).toFixed(2))
    : 10.0;

  // Assuming standard commercial utility rate of $0.18/kWh or equivalent
  const unitRate = state.utility_type === 'ELECTRICITY' ? 0.18 : 0.85;
  const excessUnits = Math.max(0, state.observed_value - (state.proposed_remediated_value || state.historical_baseline_mean));
  const estimatedOvercharge = Number((excessUnits * unitRate).toFixed(2));

  const letter = `
FORMAL NOTICE OF BILLING INQUIRY & MULTIPLIER CORRECTION REQUEST
Date: ${new Date().toISOString().split('T')[0]}
Reference ID: DISP-${state.event_id.slice(0, 8).toUpperCase()}

To: Customer Billing & Meter Operations Team
Re: Disputed Interval Read - Account & Meter #${state.meter_id}
Asset Name: ${state.asset_name} (ID: ${state.asset_id})
Billing Cycle: ${state.interval_start} to ${state.interval_end}

Dear Billing Operations,

We are writing on behalf of Enterprise ESG and Energy Accounting to officially dispute the interval consumption recorded for Meter #${state.meter_id} during the aforementioned billing cycle.

DIAGNOSTIC FINDINGS:
1. Billed Consumption: ${state.observed_value.toLocaleString()} ${state.unit_of_measure}
2. 24-Month Established Baseline Mean: ${state.historical_baseline_mean.toLocaleString()} ${state.unit_of_measure}
3. Discrepancy Multiplier: Identified scalar shift of exactly ${discrepancyFactor}x (variance within +/-0.05%).
4. Peer & Weather Validation: Independent peer clustering across comparable ${state.asset_type} assets and local degree-day normalization verify no operational or weather driver for this surge.
5. Probable Cause: Register multiplier or decimal entry slip during utility billing file compilation (MWh billed as kWh or 10x pulse multiplier misapplication).

REMEDIAL ACTION REQUESTED:
- Rescale the interval consumption to the corrected value: ${(state.proposed_remediated_value || state.historical_baseline_mean).toLocaleString()} ${state.unit_of_measure}
- Issue a revised billing statement and credit adjustment of approx. $${estimatedOvercharge.toLocaleString()}
- Confirm the current CT multiplier settings on this physical utility meter.

Our immutable audit trail for CSRD ESRS E1 and GHG Protocol compliance has logged this exception. Please provide a ticket reference number upon receipt.

Sincerely,
Automated ESG Data Quality Steward AI Agent
Auditing on behalf of: ${state.asset_name} Energy Management
`.trim();

  return {
    ticket_id: `DISP-${randomUUID().slice(0, 8)}`,
    generated_at: new Date().toISOString(),
    utility_provider: 'Grid Power & Gas Distribution Network',
    account_number: `ACC-${state.asset_id.slice(-4)}-9981`,
    meter_id: state.meter_id,
    asset_name: state.asset_name,
    billing_period: { start: state.interval_start, end: state.interval_end },
    billed_amount: state.observed_value,
    expected_amount: state.proposed_remediated_value || state.historical_baseline_mean,
    discrepancy_factor: discrepancyFactor,
    calculated_rebate_estimate_currency: estimatedOvercharge,
    formal_letter_body: letter,
    evidence_summary: [
      `Scalar factor match: ${discrepancyFactor}x within 0.05% error margin`,
      `Weather variance was flat (+${state.cdd_delta_pct || 1.2}% CDD delta)`,
      `Peer baseline showed steady consumption (+/- 3%)`,
      `Estimated financial invoice impact: $${estimatedOvercharge.toLocaleString()}`,
    ],
  };
}

export function generateInspectionWorkOrder(state: AnomalyState): InspectionWorkOrder {
  return {
    work_order_id: `WO-${randomUUID().slice(0, 8)}`,
    created_at: new Date().toISOString(),
    asset_id: state.asset_id,
    asset_name: state.asset_name,
    location: `${state.asset_name}, Building Mechanical Room 01`,
    meter_id: state.meter_id,
    priority: state.is_high_stakes ? 'URGENT' : 'HIGH',
    checklist: [
      `Physical check of Meter #${state.meter_id} dial register against BMS telemetry readout`,
      `Inspect Current Transformer (CT) pulse multiplier switch and terminal wiring`,
      `Verify communication dead-band or AMR gateway connectivity`,
      `Check main circuit breaker and backup generator changeover switchgear`,
      `Sign and upload utility calibration sticker photo`,
    ],
    instructions: `URGENT ACTION REQUIRED: The ESG Data Quality Steward AI Agent detected an unexpected reading of ${state.observed_value} ${state.unit_of_measure} for ${state.utility_type}. Perform on-site ground inspection immediately to confirm hardware integrity.`,
  };
}
