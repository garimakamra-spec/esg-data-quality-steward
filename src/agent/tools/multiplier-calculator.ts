// src/agent/tools/multiplier-calculator.ts
/**
 * Tool Definition 2: Multiplier Anomaly Calculator
 * Evaluates observed value against standard engineering scalars:
 * (0.001x, 0.01x, 0.1x, 10x, 100x, 1000x, and Therm-to-kWh conversions)
 */

export interface MultiplierTestResult {
  is_scalar_error: boolean;
  matched_factor: number | null;
  match_precision: number;
  expected_scalar: number | null;
  corrected_value: number | null;
  candidate_label: string | null;
  confidence_contribution: number;
}

const CANDIDATE_SCALARS: { factor: number; label: string; inverse: number }[] = [
  { factor: 10.0, label: '10x Pulse Multiplier Slip / Decimal Shift', inverse: 0.10 },
  { factor: 100.0, label: '100x Scaling Register Error', inverse: 0.01 },
  { factor: 1000.0, label: '1000x MWh vs kWh Entry Error', inverse: 0.001 },
  { factor: 0.1, label: '0.1x Sub-Meter CT Division Error', inverse: 10.0 },
  { factor: 0.01, label: '0.01x Data Ingestion Scalar Truncation', inverse: 100.0 },
  { factor: 0.001, label: '0.001x kWh Billed as MWh Error', inverse: 1000.0 },
  { factor: 29.3071, label: 'Therms-to-kWh Conversion Misalignment (29.3x)', inverse: 1 / 29.3071 },
];

export function testMultiplierDiscrepancy(
  observedValue: number,
  baselineMean: number,
  tolerance: number = 0.05 // 5% tolerance window for multiplier match
): MultiplierTestResult {
  if (!baselineMean || baselineMean <= 0 || observedValue <= 0) {
    return {
      is_scalar_error: false,
      matched_factor: null,
      match_precision: 0,
      expected_scalar: null,
      corrected_value: null,
      candidate_label: null,
      confidence_contribution: 0,
    };
  }

  const ratio = observedValue / baselineMean;

  let bestMatch: {
    factor: number;
    label: string;
    inverse: number;
    precision: number;
    delta: number;
  } | null = null;

  for (const candidate of CANDIDATE_SCALARS) {
    const error = Math.abs(ratio - candidate.factor) / candidate.factor;
    if (error <= tolerance) {
      const precision = Math.max(0, 1 - error);
      if (!bestMatch || precision > bestMatch.precision) {
        bestMatch = {
          ...candidate,
          precision,
          delta: error,
        };
      }
    }
  }

  if (bestMatch) {
    const correctedValue = Number((observedValue * bestMatch.inverse).toFixed(2));
    // High precision match gives near 1.0 confidence contribution
    const confidence = Math.min(1.0, 0.90 + (bestMatch.precision * 0.09));
    return {
      is_scalar_error: true,
      matched_factor: bestMatch.factor,
      match_precision: Number(bestMatch.precision.toFixed(4)),
      expected_scalar: bestMatch.inverse,
      corrected_value: correctedValue,
      candidate_label: bestMatch.label,
      confidence_contribution: Number(confidence.toFixed(3)),
    };
  }

  return {
    is_scalar_error: false,
    matched_factor: null,
    match_precision: 0,
    expected_scalar: null,
    corrected_value: null,
    candidate_label: null,
    confidence_contribution: 0,
  };
}
