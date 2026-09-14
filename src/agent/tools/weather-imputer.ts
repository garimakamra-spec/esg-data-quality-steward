// src/agent/tools/weather-imputer.ts
/**
 * Weather degree day regression and synthetic baseline imputation engine
 * Implements GHG Protocol Scope 2 Guidance compliant techniques for missing/estimated reads
 */

export interface WeatherAnalysisResult {
  weather_variance_explains_delta: boolean;
  expected_weather_delta_pct: number;
  unexplained_residual_delta_pct: number;
  is_freeze_condition_anomaly: boolean;
  synthetic_interpolated_value: number;
  imputation_method: string;
  imputation_confidence: number;
}

export function analyzeWeatherAndImpute(params: {
  utilityType: string;
  observedValue: number;
  baselineMean: number;
  coolingDegreeDays: number;
  heatingDegreeDays: number;
  cddDeltaPct: number;
  hddDeltaPct: number;
}): WeatherAnalysisResult {
  const {
    utilityType,
    observedValue,
    baselineMean,
    coolingDegreeDays,
    heatingDegreeDays,
    cddDeltaPct,
    hddDeltaPct,
  } = params;

  const actualDeltaPct = baselineMean > 0 ? ((observedValue - baselineMean) / baselineMean) * 100 : 0;

  // Weather sensitivity coefficients (rough empirical values)
  // Electricity is cooling sensitive (CDD); Gas/Steam is heating sensitive (HDD)
  let expectedWeatherDeltaPct = 0;
  if (utilityType === 'ELECTRICITY') {
    // 1% CDD delta typically shifts cooling electricity by ~0.35%
    expectedWeatherDeltaPct = cddDeltaPct * 0.35;
  } else if (utilityType === 'NATURAL_GAS' || utilityType === 'STEAM') {
    // 1% HDD delta typically shifts heating fuel by ~0.65%
    expectedWeatherDeltaPct = hddDeltaPct * 0.65;
  }

  const unexplainedResidualPct = actualDeltaPct - expectedWeatherDeltaPct;
  const weatherVarianceExplains = Math.abs(unexplainedResidualPct) <= 15.0;

  // Special scenario: Gas/Electricity flatline or zero during severe freeze/heat
  const isFreezeConditionAnomaly =
    (utilityType === 'NATURAL_GAS' || utilityType === 'STEAM') &&
    heatingDegreeDays >= 350 &&
    observedValue <= baselineMean * 0.05;

  // Calculate GHG Protocol compliant weather-normalized fill
  // Value = Baseline Mean * (1 + Expected Weather Delta)
  const syntheticFill = Number((baselineMean * (1 + expectedWeatherDeltaPct / 100)).toFixed(1));

  let imputationMethod = 'GHG_PROTOCOL_WEATHER_NORMALIZED_INTERPOLATION';
  let imputationConfidence = 0.92;

  if (isFreezeConditionAnomaly) {
    imputationMethod = 'GHG_PROTOCOL_HIGH_HDD_SYNTHETIC_PEAK_SEASON_FILL';
    imputationConfidence = 0.95;
  }

  return {
    weather_variance_explains_delta: weatherVarianceExplains,
    expected_weather_delta_pct: Number(expectedWeatherDeltaPct.toFixed(2)),
    unexplained_residual_delta_pct: Number(unexplainedResidualPct.toFixed(2)),
    is_freeze_condition_anomaly: isFreezeConditionAnomaly,
    synthetic_interpolated_value: Math.max(0, syntheticFill),
    imputation_method: imputationMethod,
    imputation_confidence: imputationConfidence,
  };
}
