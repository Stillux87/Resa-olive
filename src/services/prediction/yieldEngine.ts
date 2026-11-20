import type {
  AggregateStats,
  OliveAnalysisRecord,
  OliveCultivar,
  PhotoAsset,
  PredictionFactor,
  PredictionResult,
  VisualMorphologyFeatures,
} from "../../types/analysis";
import { OLIVE_OIL_DENSITY_KG_PER_LITER } from "../../types/analysis";

interface CultivarBaseline {
  baseYieldPct: number;
  minPlausiblePct: number;
  maxPlausiblePct: number;
  typicalPulpToPit: number;
}

const CULTIVAR_BASELINES: Record<OliveCultivar, CultivarBaseline> = {
  Frantoio: {
    baseYieldPct: 15.8,
    minPlausiblePct: 11.5,
    maxPlausiblePct: 20.5,
    typicalPulpToPit: 4.4,
  },
  Moraiolo: {
    baseYieldPct: 16.4,
    minPlausiblePct: 12.0,
    maxPlausiblePct: 21.0,
    typicalPulpToPit: 4.1,
  },
  Coratina: {
    baseYieldPct: 18.6,
    minPlausiblePct: 14.0,
    maxPlausiblePct: 23.5,
    typicalPulpToPit: 4.8,
  },
  Leccino: {
    baseYieldPct: 14.2,
    minPlausiblePct: 10.5,
    maxPlausiblePct: 18.5,
    typicalPulpToPit: 4.3,
  },
  "Nocellara del Belice": {
    baseYieldPct: 14.6,
    minPlausiblePct: 11.0,
    maxPlausiblePct: 18.5,
    typicalPulpToPit: 5.2,
  },
  Taggiasca: {
    baseYieldPct: 17.5,
    minPlausiblePct: 13.5,
    maxPlausiblePct: 22.0,
    typicalPulpToPit: 4.5,
  },
  "Mista / Ignota": {
    baseYieldPct: 15.2,
    minPlausiblePct: 11.0,
    maxPlausiblePct: 20.0,
    typicalPulpToPit: 4.3,
  },
};

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export interface PredictionEngineInput {
  cultivar: OliveCultivar;
  sampleWeightGrams: number;
  lotWeightKg: number;
  photos: PhotoAsset[];
  features: VisualMorphologyFeatures;
  densityKgPerLiter?: number;
}

/**
 * Pure statistical olive oil yield estimation engine.
 * Combines cultivar priors, maturity (Jaen veraison index), visual turgor/hydration,
 * pulp-to-pit morphology, sanitary integrity, and photo coverage uncertainty.
 */
export function computeYieldPrediction(
  input: PredictionEngineInput
): PredictionResult {
  const baseline = CULTIVAR_BASELINES[input.cultivar] ?? CULTIVAR_BASELINES["Mista / Ignota"];
  const density = input.densityKgPerLiter ?? OLIVE_OIL_DENSITY_KG_PER_LITER;
  const f = input.features;

  // 1. Veraison maturity contribution (sweet spot around index 2.8 - 4.1)
  const maturityDelta =
    f.veraisonIndex < 1.5
      ? -1.6 + f.veraisonIndex * 0.5
      : f.veraisonIndex <= 3.8
      ? (f.veraisonIndex - 2.2) * 0.85
      : 1.36 - (f.veraisonIndex - 3.8) * 0.25;

  // 2. Hydration / turgor balance: slightly lower water content concentrates oil on fresh weight,
  // while severe dehydration or rain-swollen drupes shift fresh-weight percentage
  const hydrationDelta = (0.72 - f.turgorScore) * 2.1;

  // 3. Pulp-to-pit morphology contribution
  const pulpDelta = (f.pulpToPitEstimate - baseline.typicalPulpToPit) * 0.75;

  // 4. Sanitary integrity & leaf/debris penalty
  const sanitaryPenalty = -(f.defectSeverity * 1.45 + (f.leafDebrisPct / 100) * 6.5);

  const rawPredicted =
    baseline.baseYieldPct + maturityDelta + hydrationDelta + pulpDelta + sanitaryPenalty;
  const predictedYieldPct = round1(
    clamp(rawPredicted, baseline.minPlausiblePct, baseline.maxPlausiblePct)
  );

  // Uncertainty interval calculation: depends on photo diversity, sample weight, and AI confidence
  const hasOverview = input.photos.some((p) => p.role === "overview");
  const hasCloseup = input.photos.some((p) => p.role === "closeup");
  const hasCrossSection = input.photos.some((p) => p.role === "cross_section");
  const hasSupplemental = input.photos.some(
    (p) => p.role === "supplemental_defect" || p.role === "supplemental_lighting"
  );

  let baseMargin = 2.4;
  if (hasOverview) baseMargin -= 0.25;
  if (hasCloseup) baseMargin -= 0.35;
  if (hasCrossSection) baseMargin -= 0.5;
  if (hasSupplemental) baseMargin -= 0.2;

  if (input.sampleWeightGrams >= 500) baseMargin -= 0.15;
  if (input.sampleWeightGrams >= 1000) baseMargin -= 0.1;

  const confidenceAdjustment = (1 - clamp(f.confidence, 0.35, 0.95)) * 1.35;
  const cultivarPenalty = input.cultivar === "Mista / Ignota" ? 0.35 : 0;

  const marginPct = round1(clamp(baseMargin + confidenceAdjustment + cultivarPenalty, 0.9, 3.4));
  const minYieldPct = round1(Math.max(7.5, predictedYieldPct - marginPct));
  const maxYieldPct = round1(Math.min(27.0, predictedYieldPct + marginPct));

  const effectiveLotKg = Math.max(1, input.lotWeightKg);
  const estimatedOilKg = round1(effectiveLotKg * (predictedYieldPct / 100));
  const estimatedOilLiters = round1(estimatedOilKg / density);

  const minOilKg = round1(effectiveLotKg * (minYieldPct / 100));
  const maxOilKg = round1(effectiveLotKg * (maxYieldPct / 100));

  const minOilLiters = round1(minOilKg / density);
  const maxOilLiters = round1(maxOilKg / density);

  let confidenceLevel: PredictionResult["confidenceLevel"] = "media";
  if (marginPct <= 1.35 && f.confidence >= 0.78) {
    confidenceLevel = "alta";
  } else if (marginPct >= 2.2 || f.confidence < 0.6) {
    confidenceLevel = "bassa";
  }

  const factors: PredictionFactor[] = [
    {
      id: "cultivar_prior",
      label: "Base statistica cultivar",
      observedValue: input.cultivar,
      impactPct: round2(baseline.baseYieldPct),
      note: `Riferimento agronomico medio per ${input.cultivar}`,
    },
    {
      id: "veraison",
      label: "Indice di invaiatura (Jaén)",
      observedValue: `${f.veraisonIndex.toFixed(1)} / 5,0`,
      impactPct: round2(maturityDelta),
      note: `${Math.round(f.greenPct)}% verdi · ${Math.round(f.turningPct)}% invaiate · ${Math.round(f.blackPct)}% nere`,
    },
    {
      id: "pulp_pit",
      label: "Rapporto polpa / nocciolo",
      observedValue: `${f.pulpToPitEstimate.toFixed(1)} : 1`,
      impactPct: round2(pulpDelta),
      note: hasCrossSection
        ? "Calibrato su foto in sezione trasversale"
        : "Stimato da profilo esterno (margine più ampio)",
    },
    {
      id: "hydration",
      label: "Turgore e idratazione drupe",
      observedValue: `${Math.round(f.turgorScore * 100)} / 100`,
      impactPct: round2(hydrationDelta),
      note: "Incide sulla concentrazione lipidica sul peso fresco",
    },
    {
      id: "sanitary",
      label: "Integrità sanitaria e impurità",
      observedValue: `${Math.round(f.leafDebrisPct)}% foglie · difetti ${Math.round(f.defectSeverity * 100)}%`,
      impactPct: round2(sanitaryPenalty),
      note: "Penalità per foglie, rametti o lesioni visibili",
    },
  ];

  const disclaimer = f.isSimulated
    ? "Stima statistica simulata a scopo dimostrativo: non costituisce una misurazione chimica di laboratorio né sostituisce la pesa ufficiale del frantoio."
    : "Stima statistica ottenuta da analisi visiva AI e curve agronomiche medie: non sostituisce l'analisi chimica o la resa reale di molitura.";

  return {
    predictedYieldPct,
    uncertaintyIntervalPct: [minYieldPct, maxYieldPct],
    marginPct,
    estimatedOilKg,
    estimatedOilLiters,
    oilKgRange: [minOilKg, maxOilKg],
    oilLitersRange: [minOilLiters, maxOilLiters],
    oilDensityKgPerLiter: density,
    confidenceLevel,
    factors,
    isSimulated: f.isSimulated,
    disclaimer,
  };
}

export function computeAggregateStats(
  records: OliveAnalysisRecord[]
): AggregateStats {
  const withPrediction = records.filter((r) => Boolean(r.prediction));
  const verified = records.filter((r) => Boolean(r.prediction && r.millOutcome));
  const simulatedDemoCount = records.filter(
    (r) => r.dataOrigin === "simulato_demo"
  ).length;

  const meanPredictedYieldPct =
    withPrediction.length > 0
      ? round2(
          withPrediction.reduce(
            (sum, r) => sum + (r.prediction?.predictedYieldPct ?? 0),
            0
          ) / withPrediction.length
        )
      : null;

  const meanActualYieldPct =
    verified.length > 0
      ? round2(
          verified.reduce(
            (sum, r) => sum + (r.millOutcome?.actualYieldPct ?? 0),
            0
          ) / verified.length
        )
      : null;

  const meanAbsoluteErrorPct =
    verified.length > 0
      ? round2(
          verified.reduce((sum, r) => {
            const pred = r.prediction?.predictedYieldPct ?? 0;
            const actual = r.millOutcome?.actualYieldPct ?? 0;
            return sum + Math.abs(actual - pred);
          }, 0) / verified.length
        )
      : null;

  const meanSignedBiasPct =
    verified.length > 0
      ? round2(
          verified.reduce((sum, r) => {
            const pred = r.prediction?.predictedYieldPct ?? 0;
            const actual = r.millOutcome?.actualYieldPct ?? 0;
            return sum + (actual - pred);
          }, 0) / verified.length
        )
      : null;

  const insideIntervalCount = verified.filter((r) => {
    const interval = r.prediction?.uncertaintyIntervalPct;
    const actual = r.millOutcome?.actualYieldPct;
    if (!interval || actual === undefined) return false;
    return actual >= interval[0] && actual <= interval[1];
  }).length;

  const intervalCoverageRatePct =
    verified.length > 0
      ? Math.round((insideIntervalCount / verified.length) * 100)
      : null;

  const totalSampleWeightGrams = records.reduce(
    (sum, r) => sum + r.sampleWeightGrams,
    0
  );
  const totalLotWeightKg = round1(
    records.reduce((sum, r) => sum + r.lotWeightKg, 0)
  );
  const totalEstimatedOilKg = round1(
    withPrediction.reduce(
      (sum, r) => sum + (r.prediction?.estimatedOilKg ?? 0),
      0
    )
  );
  const totalEstimatedOilLiters = round1(
    withPrediction.reduce(
      (sum, r) => sum + (r.prediction?.estimatedOilLiters ?? 0),
      0
    )
  );
  const totalActualOilKg = round1(
    verified.reduce((sum, r) => sum + (r.millOutcome?.actualOilKg ?? 0), 0)
  );
  const totalActualOilLiters = round1(
    verified.reduce((sum, r) => sum + (r.millOutcome?.actualOilLiters ?? 0), 0)
  );

  // Group by cultivar
  const map = new Map<string, OliveAnalysisRecord[]>();
  for (const r of withPrediction) {
    const list = map.get(r.cultivar) ?? [];
    list.push(r);
    map.set(r.cultivar, list);
  }

  const cultivarSummaries = Array.from(map.entries()).map(([cultivar, items]) => {
    const preds = items.map((i) => i.prediction!.predictedYieldPct);
    const actuals = items
      .filter((i) => Boolean(i.millOutcome))
      .map((i) => i.millOutcome!.actualYieldPct);

    return {
      cultivar,
      count: items.length,
      avgPredictedYieldPct: round2(
        preds.reduce((a, b) => a + b, 0) / preds.length
      ),
      avgActualYieldPct:
        actuals.length > 0
          ? round2(actuals.reduce((a, b) => a + b, 0) / actuals.length)
          : null,
      minPredictedPct: Math.min(...preds),
      maxPredictedPct: Math.max(...preds),
    };
  });

  return {
    totalAnalyses: records.length,
    verifiedCount: verified.length,
    simulatedDemoCount,
    meanPredictedYieldPct,
    meanActualYieldPct,
    meanAbsoluteErrorPct,
    meanSignedBiasPct,
    intervalCoverageRatePct,
    totalSampleWeightGrams,
    totalLotWeightKg,
    totalEstimatedOilKg,
    totalEstimatedOilLiters,
    totalActualOilKg,
    totalActualOilLiters,
    cultivarSummaries,
  };
}
