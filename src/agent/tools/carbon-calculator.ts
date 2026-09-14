// src/agent/tools/carbon-calculator.ts
/**
 * Carbon accounting engine with GHG Protocol Scope 2 Dual-Reporting
 * Supports both Location-Based (grid average) and Market-Based (contractual instrument/EAC) methods
 * Enforces CSRD ESRS E1 and EU Taxonomy boundaries
 */

import { UtilityType, RegulatoryClass } from '../types.js';

// Emission factors in kg CO2e per unit of measure
export const EMISSION_FACTORS: Record<
  UtilityType,
  {
    location_factor_kg: number;
    market_factor_kg: number;
    default_uom: string;
    scope: string;
  }
> = {
  ELECTRICITY: {
    location_factor_kg: 0.207, // UK/EU average grid intensity
    market_factor_kg: 0.245,   // Standard residual supplier mix (or 0.00 for 100% certified green tariff)
    default_uom: 'kWh',
    scope: 'Scope 2 Dual-Reporting',
  },
  NATURAL_GAS: {
    location_factor_kg: 2.020,
    market_factor_kg: 2.020,
    default_uom: 'm3',
    scope: 'Scope 1 Direct Combustion',
  },
  STEAM: {
    location_factor_kg: 0.170,
    market_factor_kg: 0.195,
    default_uom: 'kWh',
    scope: 'Scope 2 Dual-Reporting',
  },
  WATER: {
    location_factor_kg: 0.344,
    market_factor_kg: 0.344,
    default_uom: 'm3',
    scope: 'Scope 3 Category 1/5',
  },
};

export interface CarbonEvaluation {
  observed_emissions_tco2e_location: number;
  remediated_emissions_tco2e_location: number;
  delta_emissions_tco2e_location: number;

  observed_emissions_tco2e_market: number;
  remediated_emissions_tco2e_market: number;
  delta_emissions_tco2e_market: number;

  // Primary reported value (Location-based for standard filings)
  delta_emissions_tco2e: number;

  pct_of_property_baseline: number;
  is_high_stakes: boolean;
  high_stakes_reasons: string[];
}

export function calculateCarbonAndMateriality(params: {
  utilityType: UtilityType;
  observedValue: number;
  remediatedValue: number;
  baselineMean: number;
  regulatoryClass: RegulatoryClass;
  isGreenFinancingFacility: boolean;
  isMeterHardwareSwap?: boolean;
  hasRenewableTariff?: boolean;
}): CarbonEvaluation {
  const {
    utilityType,
    observedValue,
    remediatedValue,
    baselineMean,
    regulatoryClass,
    isGreenFinancingFacility,
    isMeterHardwareSwap = false,
    hasRenewableTariff = false,
  } = params;

  const config = EMISSION_FACTORS[utilityType] || EMISSION_FACTORS.ELECTRICITY;
  
  // 1. Location-Based Method (Standard regional grid factor)
  const locFactor = config.location_factor_kg;
  const observedLoc = (observedValue * locFactor) / 1000;
  const remediatedLoc = (remediatedValue * locFactor) / 1000;
  const deltaLoc = Number((remediatedLoc - observedLoc).toFixed(2));
  const absDeltaLoc = Math.abs(deltaLoc);

  // 2. Market-Based Method (Supplier contractual factor or 0.00 for PPA/EAC)
  const mktFactor = hasRenewableTariff ? 0.00 : config.market_factor_kg;
  const observedMkt = (observedValue * mktFactor) / 1000;
  const remediatedMkt = (remediatedValue * mktFactor) / 1000;
  const deltaMkt = Number((remediatedMkt - observedMkt).toFixed(2));
  const absDeltaMkt = Math.abs(deltaMkt);

  // Baseline total property emissions estimate (Location-based)
  const baselineEmissions = (baselineMean * locFactor) / 1000;
  const pctOfBaseline = baselineEmissions > 0 
    ? Number(((Math.abs(remediatedValue - observedValue) / baselineMean) * 100).toFixed(1))
    : 100;

  const highStakesReasons: string[] = [];

  // Guardrail Trigger: Materiality threshold if EITHER Location-Based OR Market-Based >= 50 tCO2e
  if (absDeltaLoc >= 50.0 || absDeltaMkt >= 50.0) {
    const triggerVal = Math.max(absDeltaLoc, absDeltaMkt);
    const triggerType = absDeltaLoc >= 50.0 ? 'Location-Based' : 'Market-Based';
    highStakesReasons.push(
      `Materiality threshold exceeded: ${triggerType} adjustment of ${triggerVal} tCO2e >= 50 tCO2e limit (GHG Protocol Scope 2 Dual-Reporting Guardrail)`
    );
  }

  // Regulatory Class: EU Taxonomy-aligned green financing or SFDR Article 8/9
  if (isGreenFinancingFacility || regulatoryClass === 'EU_TAXONOMY_ALIGNED') {
    highStakesReasons.push('Asset mapped to EU Taxonomy-aligned Green Financing Facility (Mandatory Auditor Governance)');
  }
  if (regulatoryClass === 'SFDR_ARTICLE_8' || regulatoryClass === 'SFDR_ARTICLE_9') {
    highStakesReasons.push(`Asset classified under ${regulatoryClass} disclosure fund`);
  }

  // Physical Meter Hardware Swaps
  if (isMeterHardwareSwap) {
    highStakesReasons.push('Physical meter hardware replacement requiring signed utility confirmation documents');
  }

  const isHighStakes = highStakesReasons.length > 0;

  return {
    observed_emissions_tco2e_location: Number(observedLoc.toFixed(2)),
    remediated_emissions_tco2e_location: Number(remediatedLoc.toFixed(2)),
    delta_emissions_tco2e_location: deltaLoc,

    observed_emissions_tco2e_market: Number(observedMkt.toFixed(2)),
    remediated_emissions_tco2e_market: Number(remediatedMkt.toFixed(2)),
    delta_emissions_tco2e_market: deltaMkt,

    delta_emissions_tco2e: deltaLoc,
    pct_of_property_baseline: pctOfBaseline,
    is_high_stakes: isHighStakes,
    high_stakes_reasons: highStakesReasons,
  };
}
