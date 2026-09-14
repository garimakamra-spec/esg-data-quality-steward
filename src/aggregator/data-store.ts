// src/aggregator/data-store.ts
/**
 * Enterprise Central Data Aggregator Store & Mock API
 * Simulates upstream utility data aggregators, weather APIs, and asset master DB
 */

import { randomUUID, createHash } from 'crypto';
import { AssetType, UtilityType, RegulatoryClass, WritebackReceipt } from '../agent/types.js';

export interface AssetMasterRecord {
  asset_id: string;
  name: string;
  asset_type: AssetType;
  location: string;
  postal_code: string;
  climate_zone: string;
  floor_area_sqft: number;
  regulatory_class: RegulatoryClass;
  is_green_financing_facility: boolean;
  meter_ids: string[];
}

export interface MeterMasterRecord {
  meter_id: string;
  asset_id: string;
  utility_type: UtilityType;
  unit_of_measure: string;
  current_multiplier_scalar: number;
  hardware_serial: string;
  is_submeter: boolean;
}

export interface MeterIntervalRecord {
  interval_id: string;
  meter_id: string;
  period_start: string;
  period_end: string;
  raw_consumption: number;
  original_unadjusted_value: number;
  corrected_consumption: number | null;
  status: 'PENDING' | 'FLAGGED_ANOMALY' | 'REMEDIATED_AUTO' | 'REMEDIATED_MANUAL' | 'CLEARED' | 'REVERTED';
  remediation_method?: string;
  audit_token?: string;
}

export class AggregatorDataStore {
  public assets: Map<string, AssetMasterRecord> = new Map();
  public meters: Map<string, MeterMasterRecord> = new Map();
  public intervals: Map<string, MeterIntervalRecord> = new Map();

  constructor() {
    this.seedMasterData();
  }

  private seedMasterData() {
    // 1. Logistics Hub 4 - Metro London (from Page 8 Case #2026-8942)
    const logHub4: AssetMasterRecord = {
      asset_id: 'GB-LON-LOG-004',
      name: 'Logistics Hub 4 - Metro London',
      asset_type: 'LOGISTICS_WAREHOUSE',
      location: 'Southeast London, UK',
      postal_code: 'SE10 0AA',
      climate_zone: '4A',
      floor_area_sqft: 85000,
      regulatory_class: 'STANDARD',
      is_green_financing_facility: false,
      meter_ids: ['ELEC-MAIN-01'],
    };
    this.assets.set(logHub4.asset_id, logHub4);
    this.meters.set('ELEC-MAIN-01', {
      meter_id: 'ELEC-MAIN-01',
      asset_id: logHub4.asset_id,
      utility_type: 'ELECTRICITY',
      unit_of_measure: 'kWh',
      current_multiplier_scalar: 1.0,
      hardware_serial: 'EL-MTR-9921',
      is_submeter: false,
    });

    // 2. High-Stakes EU Taxonomy Flagship Asset - Frankfurt Commercial Tower
    const frkTower: AssetMasterRecord = {
      asset_id: 'DE-FRK-OFF-001',
      name: 'Taunus Green Tower - Frankfurt',
      asset_type: 'COMMERCIAL_OFFICE',
      location: 'Frankfurt am Main, Germany',
      postal_code: '60311',
      climate_zone: '4A',
      floor_area_sqft: 145000,
      regulatory_class: 'EU_TAXONOMY_ALIGNED',
      is_green_financing_facility: true,
      meter_ids: ['ELEC-FRK-01', 'GAS-FRK-01'],
    };
    this.assets.set(frkTower.asset_id, frkTower);
    this.meters.set('ELEC-FRK-01', {
      meter_id: 'ELEC-FRK-01',
      asset_id: frkTower.asset_id,
      utility_type: 'ELECTRICITY',
      unit_of_measure: 'kWh',
      current_multiplier_scalar: 1.0,
      hardware_serial: 'EL-FRK-8812',
      is_submeter: false,
    });
    this.meters.set('GAS-FRK-01', {
      meter_id: 'GAS-FRK-01',
      asset_id: frkTower.asset_id,
      utility_type: 'NATURAL_GAS',
      unit_of_measure: 'm3',
      current_multiplier_scalar: 1.0,
      hardware_serial: 'GAS-FRK-5541',
      is_submeter: false,
    });

    // 3. Logistics Hub 2 - North Midlands (Gas Freeze Anomaly from Page 15/16)
    const logHub2: AssetMasterRecord = {
      asset_id: 'GB-MID-LOG-002',
      name: 'Midlands Distribution Hub 2',
      asset_type: 'LOGISTICS_WAREHOUSE',
      location: 'Birmingham, UK',
      postal_code: 'B1 1AA',
      climate_zone: '4A',
      floor_area_sqft: 120000,
      regulatory_class: 'STANDARD',
      is_green_financing_facility: false,
      meter_ids: ['GAS-MAIN-02'],
    };
    this.assets.set(logHub2.asset_id, logHub2);
    this.meters.set('GAS-MAIN-02', {
      meter_id: 'GAS-MAIN-02',
      asset_id: logHub2.asset_id,
      utility_type: 'NATURAL_GAS',
      unit_of_measure: 'm3',
      current_multiplier_scalar: 1.0,
      hardware_serial: 'GAS-MID-2201',
      is_submeter: false,
    });

    // 4. Manhattan Financial Center - SFDR Article 9 Flagship
    const nycTower: AssetMasterRecord = {
      asset_id: 'US-NYC-OFF-102',
      name: 'One Hudson Green Center',
      asset_type: 'COMMERCIAL_OFFICE',
      location: 'New York, USA',
      postal_code: '10001',
      climate_zone: '4A',
      floor_area_sqft: 220000,
      regulatory_class: 'SFDR_ARTICLE_9',
      is_green_financing_facility: true,
      meter_ids: ['STEAM-NYC-01', 'ELEC-NYC-01'],
    };
    this.assets.set(nycTower.asset_id, nycTower);
    this.meters.set('STEAM-NYC-01', {
      meter_id: 'STEAM-NYC-01',
      asset_id: nycTower.asset_id,
      utility_type: 'STEAM',
      unit_of_measure: 'kWh',
      current_multiplier_scalar: 1.0,
      hardware_serial: 'STM-NYC-1099',
      is_submeter: false,
    });
    this.meters.set('ELEC-NYC-01', {
      meter_id: 'ELEC-NYC-01',
      asset_id: nycTower.asset_id,
      utility_type: 'ELECTRICITY',
      unit_of_measure: 'kWh',
      current_multiplier_scalar: 1.0,
      hardware_serial: 'EL-NYC-9090',
      is_submeter: false,
    });

    // Seed default baseline interval for ELEC-MAIN-01 (Aug 2026 flagged case)
    this.intervals.set('ELEC-MAIN-01_2026-08', {
      interval_id: 'int_aug_2026_01',
      meter_id: 'ELEC-MAIN-01',
      period_start: '2026-08-01',
      period_end: '2026-08-31',
      raw_consumption: 120400.0,
      original_unadjusted_value: 120400.0,
      corrected_consumption: null,
      status: 'FLAGGED_ANOMALY',
    });
  }

  /**
   * Tool: fetch_meter_history(meter_id, lookback_period=24_months)
   */
  public fetchMeterHistory(meter_id: string): {
    baseline_mean: number;
    baseline_stdev: number;
    prior_month_value: number;
    interval_history: { month: string; value: number }[];
  } {
    // Generate realistic 24-month baseline curves depending on meter type
    const meter = this.meters.get(meter_id);
    let base = 12050; // Default for ELEC-MAIN-01
    let stdev = 420;

    if (meter?.utility_type === 'NATURAL_GAS') {
      base = 18400;
      stdev = 1200;
    } else if (meter?.meter_id === 'ELEC-FRK-01') {
      base = 45000;
      stdev = 1800;
    }

    const history: { month: string; value: number }[] = [];
    for (let i = 24; i >= 1; i--) {
      const d = new Date(2026, 7 - i, 1);
      const monthStr = d.toISOString().slice(0, 7);
      // Small seasonal fluctuation
      const noise = (Math.sin(i) * 0.05) * base;
      history.push({
        month: monthStr,
        value: Math.round(base + noise),
      });
    }

    const priorMonthValue = history[history.length - 1]?.value || base;

    return {
      baseline_mean: base,
      baseline_stdev: stdev,
      prior_month_value: priorMonthValue,
      interval_history: history,
    };
  }

  /**
   * Tool: fetch_degree_days(postal_code, timeframe)
   */
  public fetchDegreeDays(postal_code: string, timeframe?: string): {
    cooling_degree_days: number;
    heating_degree_days: number;
    cdd_delta_pct: number;
    hdd_delta_pct: number;
    climate_zone: string;
  } {
    // Return localized weather metrics
    if (postal_code.startsWith('SE') || postal_code.startsWith('B1')) {
      // UK summer / winter
      return {
        cooling_degree_days: 94.5,
        heating_degree_days: 12.0,
        cdd_delta_pct: 1.2, // Page 8: CDD remained flat (+1.2% delta)
        hdd_delta_pct: -0.8,
        climate_zone: '4A',
      };
    }
    return {
      cooling_degree_days: 140.0,
      heating_degree_days: 20.0,
      cdd_delta_pct: 2.5,
      hdd_delta_pct: -1.0,
      climate_zone: '4A',
    };
  }

  // Idempotency cache to prevent duplicate mutations over flaky networks
  public idempotencyReceipts: Map<string, WritebackReceipt> = new Map();

  /**
   * Tool Definition 3: Aggregator API Write-Back Tool
   * execute_writeback_remediation(meter_id, target_interval, remediated_value, audit_token, idempotency_key)
   */
  public executeWriteback(params: {
    meter_id: string;
    target_interval: string;
    remediated_value: number;
    audit_token: string;
    idempotency_key?: string;
    original_unadjusted_value?: number;
    method?: string;
  }): WritebackReceipt {
    const idempotencyKey =
      params.idempotency_key ||
      createHash('sha256')
        .update(`${params.meter_id}-${params.target_interval}-${params.remediated_value}`)
        .digest('hex');

    // Idempotency check: return cached receipt if already executed
    if (this.idempotencyReceipts.has(idempotencyKey)) {
      return this.idempotencyReceipts.get(idempotencyKey)!;
    }

    const key = `${params.meter_id}_${params.target_interval}`;
    const interval = this.intervals.get(key) || {
      interval_id: `int_${randomUUID().slice(0, 8)}`,
      meter_id: params.meter_id,
      period_start: `${params.target_interval}-01`,
      period_end: `${params.target_interval}-28`,
      raw_consumption: params.original_unadjusted_value ?? params.remediated_value,
      original_unadjusted_value: params.original_unadjusted_value ?? params.remediated_value,
      corrected_consumption: null,
      status: 'PENDING',
    };

    if (params.original_unadjusted_value !== undefined) {
      interval.original_unadjusted_value = params.original_unadjusted_value;
    }

    interval.corrected_consumption = params.remediated_value;
    interval.status = 'REMEDIATED_AUTO';
    interval.remediation_method = params.method || 'SCALAR_CORRECTION';
    interval.audit_token = params.audit_token;
    this.intervals.set(key, interval);

    const txHash = createHash('sha256')
      .update(`${params.meter_id}-${params.target_interval}-${params.remediated_value}-${idempotencyKey}`)
      .digest('hex');

    const receipt: WritebackReceipt = {
      target_api: 'Central_Aggregator_v2/meter-reads/writeback',
      response_status: 200,
      transaction_hash: txHash,
      timestamp: new Date().toISOString(),
      idempotency_key: idempotencyKey,
      original_unadjusted_value: interval.original_unadjusted_value,
    };

    this.idempotencyReceipts.set(idempotencyKey, receipt);
    return receipt;
  }

  /**
   * Reversion Safety: Rolls back an interval read to its original unadjusted value
   */
  public executeRollback(params: {
    meter_id: string;
    target_interval: string;
    audit_token?: string;
  }): { success: boolean; restored_value: number; transaction_hash: string } {
    const key = `${params.meter_id}_${params.target_interval}`;
    const interval = this.intervals.get(key);

    if (!interval) {
      throw new Error(`Interval not found for meter ${params.meter_id} at ${params.target_interval}`);
    }

    const originalVal = interval.original_unadjusted_value ?? interval.raw_consumption;
    interval.corrected_consumption = null;
    interval.status = 'REVERTED';
    interval.remediation_method = 'ROLLBACK_TO_RAW_VALUE';
    this.intervals.set(key, interval);

    const rollbackTxHash = createHash('sha256')
      .update(`ROLLBACK-${params.meter_id}-${params.target_interval}-${originalVal}-${Date.now()}`)
      .digest('hex');

    return {
      success: true,
      restored_value: originalVal,
      transaction_hash: rollbackTxHash,
    };
  }
}
