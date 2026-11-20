import type {
  CalibrationErrorRecord,
  CalibrationSnapshot,
  CalibrationSummary,
  OliveAnalysisRecord,
  OliveCultivar,
} from "../../types/analysis";

const MINIMUM_REAL_SAMPLES_FOR_CALIBRATION = 3;
const MAX_CALIBRATION_SHIFT_PCT = 1.8;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

export function isDemoAnalysis(record: OliveAnalysisRecord): boolean {
  return (
    record.isDemo === true ||
    record.dataOrigin === "simulato_demo" ||
    record.id.startsWith("demo_")
  );
}

/**
 * Computes conservative empirical calibration from REAL verified mill outcomes only.
 * Demo/simulated records and unverified real samples without mill outcomes are strictly excluded.
 */
export function buildCalibrationSummary(
  allRecords: OliveAnalysisRecord[]
): CalibrationSummary {
  const realVerified = allRecords.filter(
    (r) =>
      !isDemoAnalysis(r) &&
      r.status === "verificata_frantoio" &&
      Boolean(r.prediction) &&
      Boolean(r.millOutcome) &&
      r.millOutcome!.actualYieldPct > 0 &&
      r.millOutcome!.lotWeightKg > 0 &&
      r.millOutcome!.actualOilKg > 0
  );

  const errorHistory: CalibrationErrorRecord[] = realVerified
    .map((r) => {
      const pred = r.prediction!;
      const mill = r.millOutcome!;
      const signed = round2(mill.actualYieldPct - pred.predictedYieldPct);
      const abs = round2(Math.abs(signed));
      const inside =
        mill.actualYieldPct >= pred.uncertaintyIntervalPct[0] &&
        mill.actualYieldPct <= pred.uncertaintyIntervalPct[1];
      return {
        analysisId: r.id,
        code: r.code,
        title: r.title,
        cultivar: r.cultivar,
        harvestDate: mill.harvestDate || r.harvestDate,
        veraisonIndex: r.visualFeatures?.veraisonIndex ?? 2.5,
        predictedYieldPct: pred.predictedYieldPct,
        actualYieldPct: mill.actualYieldPct,
        signedErrorPct: signed,
        absoluteErrorPct: abs,
        insideInterval: inside,
      };
    })
    .sort((a, b) => a.harvestDate.localeCompare(b.harvestDate));

  const n = errorHistory.length;
  const globalMeanBiasPct =
    n > 0
      ? round2(
          errorHistory.reduce((s, e) => s + e.signedErrorPct, 0) / n
        )
      : null;
  const globalMaePct =
    n > 0
      ? round2(
          errorHistory.reduce((s, e) => s + e.absoluteErrorPct, 0) / n
        )
      : null;

  const byCultivarMap = new Map<OliveCultivar, CalibrationErrorRecord[]>();
  for (const item of errorHistory) {
    const list = byCultivarMap.get(item.cultivar) ?? [];
    list.push(item);
    byCultivarMap.set(item.cultivar, list);
  }

  const byCultivar = Array.from(byCultivarMap.entries()).map(
    ([cultivar, items]) => {
      const meanBias = round2(
        items.reduce((s, i) => s + i.signedErrorPct, 0) / items.length
      );
      const mae = round2(
        items.reduce((s, i) => s + i.absoluteErrorPct, 0) / items.length
      );
      // Conservative shrinkage: requires >= 3 real samples in cultivar cohort before full weight
      const shrinkage = items.length / (items.length + 4);
      const damped =
        items.length >= MINIMUM_REAL_SAMPLES_FOR_CALIBRATION
          ? round2(
              clamp(
                meanBias * shrinkage,
                -MAX_CALIBRATION_SHIFT_PCT,
                MAX_CALIBRATION_SHIFT_PCT
              )
            )
          : 0;
      return {
        cultivar,
        verifiedCount: items.length,
        meanBiasPct: meanBias,
        maePct: mae,
        dampedAdjustmentPct: damped,
      };
    }
  );

  return {
    realVerifiedCount: n,
    minimumRequiredForAdjustment: MINIMUM_REAL_SAMPLES_FOR_CALIBRATION,
    calibrationActive: n >= MINIMUM_REAL_SAMPLES_FOR_CALIBRATION,
    globalMeanBiasPct,
    globalMaePct,
    byCultivar,
    errorHistory,
  };
}

/**
 * Selects a damped calibration offset for a new prediction based on cultivar & real history.
 * Never alters coefficients after a single outcome.
 */
export function resolveCalibrationForSample(params: {
  cultivar: OliveCultivar;
  veraisonIndex: number;
  uncalibratedYieldPct: number;
  realRecords: OliveAnalysisRecord[];
}): CalibrationSnapshot {
  const summary = buildCalibrationSummary(
    params.realRecords.filter((r) => !isDemoAnalysis(r))
  );

  if (summary.realVerifiedCount < MINIMUM_REAL_SAMPLES_FOR_CALIBRATION) {
    return {
      applied: false,
      sampleCountUsed: summary.realVerifiedCount,
      cohortLabel: params.cultivar,
      adjustmentPct: 0,
      uncalibratedYieldPct: params.uncalibratedYieldPct,
      reason:
        summary.realVerifiedCount === 0
          ? "Nessun risultato reale di frantoio ancora registrato: stima basata sui soli parametri agronomici."
          : `Solo ${summary.realVerifiedCount} riscontro/i reale/i disponibile/i (minimo ${MINIMUM_REAL_SAMPLES_FOR_CALIBRATION} per attivare la calibrazione automatica ed evitare sovra-adattamento).`,
    };
  }

  // Prefer cultivar-specific cohort if >= 3 verified real records exist for that cultivar
  const cultivarCohort = summary.byCultivar.find(
    (c) =>
      c.cultivar === params.cultivar &&
      c.verifiedCount >= MINIMUM_REAL_SAMPLES_FOR_CALIBRATION
  );

  if (cultivarCohort) {
    return {
      applied: Math.abs(cultivarCohort.dampedAdjustmentPct) >= 0.05,
      sampleCountUsed: cultivarCohort.verifiedCount,
      cohortLabel: `${params.cultivar} (storico reale)`,
      adjustmentPct: cultivarCohort.dampedAdjustmentPct,
      uncalibratedYieldPct: params.uncalibratedYieldPct,
      reason: `Calibrazione prudenziale applicata su ${cultivarCohort.verifiedCount} moliture reali di ${params.cultivar} (scostamento medio ${
        cultivarCohort.meanBiasPct > 0 ? "+" : ""
      }${cultivarCohort.meanBiasPct.toFixed(1)}%, fattore smorzato).`,
    };
  }

  // Otherwise check maturation-band or global real cohort (>= 3 verified real samples)
  const globalBias = summary.globalMeanBiasPct ?? 0;
  const shrinkage = summary.realVerifiedCount / (summary.realVerifiedCount + 5);
  const dampedGlobal = round2(
    clamp(
      globalBias * shrinkage,
      -MAX_CALIBRATION_SHIFT_PCT,
      MAX_CALIBRATION_SHIFT_PCT
    )
  );

  return {
    applied: Math.abs(dampedGlobal) >= 0.05,
    sampleCountUsed: summary.realVerifiedCount,
    cohortLabel: "Storico aziendale reale",
    adjustmentPct: dampedGlobal,
    uncalibratedYieldPct: params.uncalibratedYieldPct,
    reason: `Calibrazione prudenziale globale su ${summary.realVerifiedCount} moliture reali (scostamento medio ${
      globalBias > 0 ? "+" : ""
    }${globalBias.toFixed(1)}%, smorzato per evitare oscillazioni eccessive).`,
  };
}
