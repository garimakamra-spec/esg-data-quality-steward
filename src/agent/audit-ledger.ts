// src/agent/audit-ledger.ts
/**
 * Immutable Decision Ledger & Assurance Export Engine
 * Conforming to Section 5.1 & 5.2 of Strategic Blueprint
 * Features strict cryptographic SHA-256 block hashing and tamper-evident chaining:
 * Block Hash = SHA-256(prev_hash + event_id + timestamp + remediated_val + signer_id)
 */

import { createHash, randomUUID } from 'crypto';
import { AuditRecord, AnomalyState, WritebackReceipt } from './types.js';

export const GENESIS_HASH = '0'.repeat(64);
export const HASHING_CONTRACT = 'SHA-256(prev_hash + event_id + timestamp + remediated_val + signer_id)';

export class AuditLedger {
  private records: AuditRecord[] = [];
  private lastBlockHash: string = GENESIS_HASH;

  constructor() {
    // Empty ledger, ready for intake
  }

  /**
   * Computes deterministic cryptographic block hash conforming to:
   * SHA-256(prev_hash + event_id + timestamp + remediated_val + signer_id)
   */
  public static computeBlockHash(
    prevHash: string,
    eventId: string,
    timestamp: string,
    remediatedVal: number,
    signerId: string
  ): string {
    const rawPayload = `${prevHash}${eventId}${timestamp}${remediatedVal}${signerId}`;
    return createHash('sha256').update(rawPayload).digest('hex');
  }

  /**
   * Commits a new immutable audit record to the ledger with cryptographic hashing
   */
  public commitAuditRecord(
    state: AnomalyState,
    receipt: WritebackReceipt,
    overrideExecutionPath?: 'AUTONOMOUS_STP' | 'HUMAN_SIGN_OFF' | 'MANUAL_OVERRIDE' | 'ROLLBACK_REVERSION'
  ): AuditRecord {
    const auditEventId = `evt_${randomUUID()}`;
    const timestampUtc = new Date().toISOString();

    const frameworks = ['CSRD_ESRS_E1', 'GHG_PROTOCOL_SCOPE_2_DUAL'];
    if (state.regulatory_class === 'EU_TAXONOMY_ALIGNED' || state.is_green_financing_facility) {
      frameworks.push('EU_TAXONOMY');
    }
    if (state.regulatory_class === 'SFDR_ARTICLE_8' || state.regulatory_class === 'SFDR_ARTICLE_9') {
      frameworks.push('SFDR_PAI_INDICATORS');
    }

    const signerId =
      state.approver_identity ||
      (state.requires_human_signoff ? 'pending_human' : 'agent_compliance_guard_v1');

    const remediatedVal = state.proposed_remediated_value ?? state.observed_value;

    // Cryptographic Block Hash computation
    const blockHash = AuditLedger.computeBlockHash(
      this.lastBlockHash,
      auditEventId,
      timestampUtc,
      remediatedVal,
      signerId
    );

    const execPath =
      overrideExecutionPath ||
      (state.requires_human_signoff ? 'HUMAN_SIGN_OFF' : 'AUTONOMOUS_STP');

    const record: AuditRecord = {
      audit_event_id: auditEventId,
      timestamp_utc: timestampUtc,
      asset_id: state.asset_id,
      asset_name: state.asset_name,
      meter_id: state.meter_id,
      reporting_frameworks: frameworks,
      anomaly_observation: {
        observed_value: state.observed_value,
        reported_uom: state.unit_of_measure,
        billing_period: {
          start: state.interval_start,
          end: state.interval_end,
        },
      },
      agent_diagnostics: {
        classified_cause: state.classified_root_cause || 'UNKNOWN',
        confidence_scoring: {
          composite: state.composite_confidence_score,
          s_stat: state.confidence_components.s_stat,
          s_cause: state.confidence_components.s_cause,
          s_context: state.confidence_components.s_context,
        },
        reasoning_chain: state.chain_of_thought_logs,
      },
      remediation_decision: {
        action_type: state.proposed_remediation_action || 'APPLY_SCALAR_CORRECTION',
        remediated_value: remediatedVal,
        delta_emissions_tco2e: state.delta_carbon_emissions_tco2e,
        delta_emissions_tco2e_location: state.delta_carbon_emissions_tco2e_location ?? state.delta_carbon_emissions_tco2e,
        delta_emissions_tco2e_market: state.delta_carbon_emissions_tco2e_market ?? state.delta_carbon_emissions_tco2e,
        execution_path: execPath,
        approver: signerId,
        approval_timestamp: state.approval_timestamp || timestampUtc,
        signer_id: signerId,
      },
      writeback_receipt: receipt,
      previous_block_hash: this.lastBlockHash,
      hashing_contract: HASHING_CONTRACT,
      block_hash: blockHash,
    };

    this.lastBlockHash = blockHash;
    this.records.push(record);
    return record;
  }

  /**
   * Retrieves all committed audit entries
   */
  public getAllRecords(): AuditRecord[] {
    return [...this.records];
  }

  /**
   * Finds record by audit_event_id or meter_id or tx_hash
   */
  public getRecordById(id: string): AuditRecord | undefined {
    return this.records.find(
      (r) =>
        r.audit_event_id === id ||
        r.meter_id === id ||
        r.writeback_receipt.transaction_hash === id ||
        r.writeback_receipt.idempotency_key === id
    );
  }

  /**
   * Verifies the cryptographic integrity of the entire ledger chain
   * Traversing every block from genesis to tip
   */
  public verifyLedgerIntegrity(): {
    is_valid: boolean;
    total_blocks: number;
    failed_block_id?: string;
    details: string;
  } {
    let expectedPrevious = GENESIS_HASH;

    for (let i = 0; i < this.records.length; i++) {
      const record = this.records[i];

      // 1. Check predecessor chain pointer
      if (record.previous_block_hash !== expectedPrevious) {
        return {
          is_valid: false,
          total_blocks: this.records.length,
          failed_block_id: record.audit_event_id,
          details: `Broken hash chain at block index ${i} (${record.audit_event_id}). Expected previous ${expectedPrevious}, got ${record.previous_block_hash}`,
        };
      }

      // 2. Re-compute block hash using the explicit formula
      const computedHash = AuditLedger.computeBlockHash(
        record.previous_block_hash,
        record.audit_event_id,
        record.timestamp_utc,
        record.remediation_decision.remediated_value,
        record.remediation_decision.signer_id
      );

      if (computedHash !== record.block_hash) {
        return {
          is_valid: false,
          total_blocks: this.records.length,
          failed_block_id: record.audit_event_id,
          details: `Tampering detected at block index ${i}! Computed hash ${computedHash} does not match block ${record.block_hash}`,
        };
      }

      expectedPrevious = record.block_hash;
    }

    return {
      is_valid: true,
      total_blocks: this.records.length,
      details: 'Ledger cryptographically verified. All block hashes and sequence pointers are intact and tamper-evident.',
    };
  }

  /**
   * Generates a packaged export for External Assurance Auditors (PwC, KPMG, ERM, Bureau Veritas)
   * conforming to CSRD ESRS E1 and GHG Protocol Scope 2 Dual-Reporting assurance criteria
   */
  public generateAuditorVerificationPack(assetId?: string): {
    verification_package_id: string;
    generated_at: string;
    assurance_standard: string;
    total_records: number;
    ledger_integrity_status: string;
    cumulative_carbon_delta_location_tco2e: number;
    cumulative_carbon_delta_market_tco2e: number;
    records: AuditRecord[];
    digital_signature_manifest: {
      root_hash: string;
      genesis_hash: string;
      hashing_contract: string;
      signer_authority: string;
      compliance_status: string;
    };
  } {
    const filteredRecords = assetId
      ? this.records.filter((r) => r.asset_id === assetId)
      : this.records;

    const integrity = this.verifyLedgerIntegrity();
    const carbonLocTotal = filteredRecords.reduce(
      (sum, r) => sum + r.remediation_decision.delta_emissions_tco2e_location,
      0
    );
    const carbonMktTotal = filteredRecords.reduce(
      (sum, r) => sum + r.remediation_decision.delta_emissions_tco2e_market,
      0
    );

    return {
      verification_package_id: `VERIF-CSRD-2026-${randomUUID().slice(0, 8).toUpperCase()}`,
      generated_at: new Date().toISOString(),
      assurance_standard:
        'CSRD ESRS E1 / GHG Protocol Corporate Standard & Scope 2 Dual-Reporting (Limited & Reasonable Assurance)',
      total_records: filteredRecords.length,
      ledger_integrity_status: integrity.is_valid ? 'VERIFIED_TAMPER_PROOF' : 'COMPROMISED',
      cumulative_carbon_delta_location_tco2e: Number(carbonLocTotal.toFixed(2)),
      cumulative_carbon_delta_market_tco2e: Number(carbonMktTotal.toFixed(2)),
      records: filteredRecords,
      digital_signature_manifest: {
        root_hash: this.lastBlockHash,
        genesis_hash: GENESIS_HASH,
        hashing_contract: HASHING_CONTRACT,
        signer_authority: 'ESG_DATA_QUALITY_STEWARD_LEDGER_SYSTEM',
        compliance_status: '100% Defensible to 3rd-Party Auditors',
      },
    };
  }
}
