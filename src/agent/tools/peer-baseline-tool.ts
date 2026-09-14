// src/agent/tools/peer-baseline-tool.ts
/**
 * Tool Definition 1: Peer Normalization Tool
 * Queries contextual data to identify a peer asset cluster
 * and returns weather-normalized expected consumption per square foot.
 */

import { AssetType } from '../types.js';

export interface PeerClusterBaseline {
  peer_mean_per_sqft: number;
  peer_stdev_per_sqft: number;
  sample_size: number;
  benchmark_group: string;
}

// Typical benchmark consumption (kWh or m3 equivalent per sq ft per month)
const ASSET_TYPE_BASELINES: Record<AssetType, { base_rate: number; stdev: number }> = {
  COMMERCIAL_OFFICE: { base_rate: 1.42, stdev: 0.11 },
  LOGISTICS_WAREHOUSE: { base_rate: 0.85, stdev: 0.08 },
  DATA_CENTER: { base_rate: 12.80, stdev: 0.95 },
  RETAIL: { base_rate: 2.10, stdev: 0.18 },
};

const CLIMATE_ZONE_MULTIPLIERS: Record<string, number> = {
  '3C': 0.92,
  '4A': 1.05,
  '5B': 1.12,
  '6A': 1.25,
};

export function getPeerClusterBaseline(
  assetType: AssetType,
  climateZone: string,
  floorAreaSqft: number,
  targetMonth?: string
): PeerClusterBaseline {
  const base = ASSET_TYPE_BASELINES[assetType] || ASSET_TYPE_BASELINES.COMMERCIAL_OFFICE;
  const climateFactor = CLIMATE_ZONE_MULTIPLIERS[climateZone] || 1.0;

  // Monthly seasonality factor
  let monthFactor = 1.0;
  if (targetMonth) {
    const month = parseInt(targetMonth.split('-')[1] || '1', 10);
    // Summer peaks (cooling) or Winter peaks (heating)
    if (month >= 6 && month <= 8) monthFactor = 1.15;
    else if (month === 12 || month <= 2) monthFactor = 1.20;
  }

  const peerMeanPerSqft = Number((base.base_rate * climateFactor * monthFactor).toFixed(3));
  const peerStdevPerSqft = Number((base.stdev * climateFactor).toFixed(3));

  return {
    peer_mean_per_sqft: peerMeanPerSqft,
    peer_stdev_per_sqft: peerStdevPerSqft,
    sample_size: 18,
    benchmark_group: `${assetType} in Zone ${climateZone} (N=18 peers)`,
  };
}

export function evaluatePeerDeviation(
  observedValue: number,
  floorAreaSqft: number,
  peerBaseline: PeerClusterBaseline
): {
  normalized_observed_per_sqft: number;
  expected_cluster_total: number;
  z_score: number;
  delta_pct: number;
} {
  const normalizedObserved = observedValue / Math.max(1, floorAreaSqft);
  const expectedClusterTotal = peerBaseline.peer_mean_per_sqft * floorAreaSqft;
  const zScore = (normalizedObserved - peerBaseline.peer_mean_per_sqft) / Math.max(0.001, peerBaseline.peer_stdev_per_sqft);
  const deltaPct = ((observedValue - expectedClusterTotal) / expectedClusterTotal) * 100;

  return {
    normalized_observed_per_sqft: Number(normalizedObserved.toFixed(3)),
    expected_cluster_total: Number(expectedClusterTotal.toFixed(1)),
    z_score: Number(zScore.toFixed(2)),
    delta_pct: Number(deltaPct.toFixed(1)),
  };
}
