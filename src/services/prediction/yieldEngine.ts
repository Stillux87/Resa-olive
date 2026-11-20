import type {
  AggregateStats,
  OliveAnalysisRecord,
  OliveCultivar,
  PhotoAsset,
  PredictionFactor,
  PredictionResult,
  SamplePhysicalData,
  VisualMorphologyFeatures,
} from "../../types/analysis";
import { OLIVE_OIL_DENSITY_KG_PER_LITER } from "../../types/analysis";
import { isDemoAnalysis, resolveCalibrationForSample } from "./calibration";
import { computeHarvestAdvice } from "./harvestAdvice";

interface CultivarBaseline {
  potentialPulpOilPct: number; // Theoretical total oil in healthy mature fruit (% fresh weight)
  typicalPulpToPit: number;
  typicalMillEfficiencyPct: number; // Typical fraction recovered at mill (~83-88%)
  minPlausibleMillPct: number;
  maxPlausibleMillPct: number;
}

const CULTIVAR_BASELINES: Record<OliveCultivar, CultivarBaseline> = {
  Frantoio: {
    potentialPulpOilPct: 19.2,
    typicalPulpToPit: 4.4,
    typicalMillEfficiencyPct: 85.0,
    minPlausibleMillPct: 10.5,
    maxPlausibleMillPct: 21.0,
  },
  Moraiolo: {
    potentialPulpOilPct: 19.8,
    typicalPulpToPit: 4.1,
    typicalMillEfficiencyPct: 84.5,
    minPlausibleMillPct: 11.0,
    maxPlausibleMillPct: 21.5,
  },
  Coratina: {
    potentialPulpOilPct: 22.4,
    typicalPulpToPit: 4.8,
    typicalMillEfficiencyPct: 85.5,
    minPlausibleMillPct: 13.0,
    maxPlausibleMillPct: 24.0,
  },
  Leccino: {
    potentialPulpOilPct: 17.4,
    typicalPulpToPit: 4.3,
    typicalMillEfficiencyPct: 84.5,
    minPlausibleMillPct: 9.5,
    maxPlausibleMillPct: 19.0,
  },
  "Nocellara del Belice": {
    potentialPulpOilPct: 17.8,
    typicalPulpToPit: 5.2,
    typicalMillEfficiencyPct: 83.5,
    minPlausibleMillPct: 10.0,
    maxPlausibleMillPct: 19.0,
  },
  Taggiasca: {
    potentialPulpOilPct: 21.0,
    typicalPulpToPit: 4.5,
    typicalMillEfficiencyPct: 85.0,
    minPlausibleMillPct: 12.5,
    maxPlausibleMillPct: 22.5,
  },
  "Mista / Ignota": {
    potentialPulpOilPct: 18.6,
    typicalPulpToPit: 4.3,
    typicalMillEfficiencyPct: 84.0,
    minPlausibleMillPct: 10.0,
    maxPlausibleMillPct: 20.5,
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

export function buildDefaultSampleData(
  features?: VisualMorphologyFeatures
): SamplePhysicalData {
  const damagedPct =
    features?.visibleDefectsPct !== undefined
      ? Math.round(features.visibleDefectsPct)
      : features
      ? Math.round(features.defectSeverity * 40)
      : 3;
  const oliveFlyPct =
    features?.oliveFlySignsPct !== undefined
      ? Math.round(features.oliveFlySignsPct)
      : 0;

  return {
    oliveCount: features?.estimatedVisibleCount,
    averageSize: features?.apparentAverageSize ?? "media",
    consistency: features?.consistency ?? "media",
    damagedPct,
    oliveFlyPct,
    measuredPulpToPit: undefined,
    dehydrationLevel: features?.dehydrationLevel ?? "assente",
    millEfficiencyPreference: "standard",
    notes: "",
    fieldSources: {
      oliveCount: features?.estimatedVisibleCount
        ? "valutazione_visiva"
        : "non_rilevabile",
      averageSize: "valutazione_visiva",
      consistency: features?.consistency
        ? "valutazione_visiva"
        : "non_rilevabile",
      maturation: "valutazione_visiva",
      damagedPct: "valutazione_visiva",
      oliveFlyPct: "valutazione_visiva",
      pulpToPit:
        features?.pulpToPitObservable && features.pulpToPitEstimate != null
          ? "valutazione_visiva"
          : "non_rilevabile",
    },
  };
}

export interface PredictionEngineInput {
  cultivar: OliveCultivar;
  sampleWeightGrams: number;
  lotWeightKg: number;
  photos: PhotoAsset[];
  features: VisualMorphologyFeatures;
  sampleData?: SamplePhysicalData;
  realHistoricalRecords?: OliveAnalysisRecord[];
  densityKgPerLiter?: number;
}

/**
 * OLIVESTIMA V2 Statistical Mill Yield Engine.
 * Explicitly separates:
 *  1) Theoretical lipid content inside the fruit (pulp lipid potential + maturation + pulp/pit + hydration)
 *  2) Actual extractable mill yield (losses from mill extraction efficiency, defects, fly attack, leaves/debris)
 *  3) Conservative empirical calibration using REAL verified mill results only.
 */
export function computeYieldPrediction(
  input: PredictionEngineInput
): PredictionResult {
  const baseline =
    CULTIVAR_BASELINES[input.cultivar] ?? CULTIVAR_BASELINES["Mista / Ignota"];
  const density = clamp(
    input.densityKgPerLiter ?? OLIVE_OIL_DENSITY_KG_PER_LITER,
    0.89,
    0.94
  );
  const f = input.features;
  const sd = input.sampleData ?? buildDefaultSampleData(f);

  // 1. Maturity factor on theoretical fruit oil content (Jaén index 0..5)
  // Green olives have lower lipid synthesis; synthesis plateaus near index 3.3 - 4.0
  const maturityMultiplier =
    f.veraisonIndex < 1.0
      ? 0.82 + f.veraisonIndex * 0.08
      : f.veraisonIndex <= 3.6
      ? 0.9 + ((f.veraisonIndex - 1.0) / 2.6) * 0.14
      : 1.04 - Math.min(0.03, (f.veraisonIndex - 3.6) * 0.015);

  // 2. Pulp-to-pit ratio impact (oil resides almost exclusively in mesocarp pulp)
  const effectivePulpToPit =
    sd.measuredPulpToPit ?? f.pulpToPitEstimate ?? baseline.typicalPulpToPit;
  const pulpRatioMeasured = sd.measuredPulpToPit !== undefined;
  const pulpRatioObservedFromCut =
    Boolean(f.pulpToPitObservable) ||
    input.photos.some((p) => p.role === "cross_section");

  // Converting pulp-to-pit to pulp weight fraction: pulp/(pulp+pit) = R / (R + 1)
  const typicalPulpFraction =
    baseline.typicalPulpToPit / (baseline.typicalPulpToPit + 1);
  const samplePulpFraction = effectivePulpToPit / (effectivePulpToPit + 1);
  const pulpFractionMultiplier = clamp(
    samplePulpFraction / typicalPulpFraction,
    0.88,
    1.12
  );

  // 3. Hydration & dehydration effect on fresh-weight percentage
  // Note: Mild dehydration concentrates oil per 100kg fresh fruit, while water-swollen olives dilute it.
  // Severe shriveling/oxidation hurts extractability later in step 5.
  const dehydrationLevel = sd.dehydrationLevel ?? f.dehydrationLevel ?? "assente";
  const hydrationDeltaPct =
    dehydrationLevel === "assente"
      ? (0.76 - clamp(f.turgorScore, 0.3, 0.95)) * 1.6
      : dehydrationLevel === "lieve"
      ? 0.7
      : dehydrationLevel === "moderata"
      ? 1.15
      : 0.9; // marcata increases concentration slightly but harms extractability

  // Theoretical total oil present in 100 kg of fruit
  const rawTheoreticalFruitOil =
    baseline.potentialPulpOilPct * maturityMultiplier * pulpFractionMultiplier +
    hydrationDeltaPct;
  const theoreticalFruitOilPct = round1(clamp(rawTheoreticalFruitOil, 11.5, 27.5));

  // 4. Mill extraction efficiency (fraction of fruit oil actually extracted into oil at the mill)
  let millEfficiencyPct = baseline.typicalMillEfficiencyPct;
  if (sd.millEfficiencyPreference === "alta") {
    millEfficiencyPct = 87.5;
  } else if (sd.millEfficiencyPreference === "bassa") {
    millEfficiencyPct = 80.5;
  } else if (
    sd.customMillEfficiencyPct !== undefined &&
    Number.isFinite(sd.customMillEfficiencyPct)
  ) {
    millEfficiencyPct = clamp(sd.customMillEfficiencyPct, 72, 92);
  }

  // Consistency & emulsion difficulty affect extractability (very soft or overly wet paste can emulsify)
  if (sd.consistency === "molle") {
    millEfficiencyPct -= 1.8;
  } else if (sd.consistency === "soda") {
    millEfficiencyPct += 0.5;
  }

  if (dehydrationLevel === "marcata") {
    millEfficiencyPct -= 2.5;
  }

  // 5. Defects, olive fly attack, and leaf debris losses
  const damagedPct = clamp(sd.damagedPct ?? 0, 0, 100);
  const flyPct = clamp(sd.oliveFlyPct ?? 0, 0, 100);
  const defectLossPct = damagedPct * 0.032 + flyPct * 0.045;
  const debrisLossPct = (clamp(f.leafDebrisPct ?? 0, 0, 25) / 100) * 6.0;

  const extractableBeforeCalibration =
    theoreticalFruitOilPct * (millEfficiencyPct / 100) -
    defectLossPct -
    debrisLossPct;

  const uncalibratedYieldPct = round1(
    clamp(
      extractableBeforeCalibration,
      baseline.minPlausibleMillPct,
      baseline.maxPlausibleMillPct
    )
  );

  // 6. Conservative calibration from REAL verified mill outcomes (never demo data)
  const realRecords = (input.realHistoricalRecords ?? []).filter(
    (r) => !isDemoAnalysis(r)
  );
  const calibration = resolveCalibrationForSample({
    cultivar: input.cultivar,
    veraisonIndex: f.veraisonIndex,
    uncalibratedYieldPct,
    realRecords,
  });

  const predictedYieldPct = round1(
    clamp(
      uncalibratedYieldPct + calibration.adjustmentPct,
      baseline.minPlausibleMillPct,
      baseline.maxPlausibleMillPct
    )
  );

  // 7. Prudent Uncertainty Interval (widens whenever measurements or angles are missing!)
  const hasOverview = input.photos.some((p) => p.role === "overview");
  const hasCloseup = input.photos.some((p) => p.role === "closeup");
  const hasCrossSection = input.photos.some((p) => p.role === "cross_section");
  const hasSupplemental = input.photos.some(
    (p) => p.role === "supplemental_defect" || p.role === "supplemental_lighting"
  );

  let baseMargin = 2.75;
  if (hasOverview) baseMargin -= 0.25;
  if (hasCloseup) baseMargin -= 0.3;
  if (hasCrossSection) baseMargin -= 0.45;
  if (hasSupplemental) baseMargin -= 0.2;

  // Real physical user measurements reduce uncertainty
  if (pulpRatioMeasured) baseMargin -= 0.35;
  if (sd.oliveCount && sd.oliveCount > 0) baseMargin -= 0.15;
  if (input.sampleWeightGrams >= 800) baseMargin -= 0.2;
  else if (input.sampleWeightGrams >= 500) baseMargin -= 0.1;
  else if (input.sampleWeightGrams < 300) baseMargin += 0.35;

  // Missing critical information increases uncertainty
  if (!pulpRatioMeasured && !pulpRatioObservedFromCut) {
    baseMargin += 0.4;
  }
  if (input.cultivar === "Mista / Ignota") {
    baseMargin += 0.4;
  }
  if (sd.millEfficiencyPreference === "sconosciuta") {
    baseMargin += 0.25;
  }
  if (f.imageQualitySufficient === false) {
    baseMargin += 0.45;
  }

  const confidencePenalty = (1 - clamp(f.confidence, 0.35, 0.95)) * 1.4;
  const marginPct = round1(clamp(baseMargin + confidencePenalty, 0.9, 4.2));

  const minYieldPct = round1(Math.max(7.0, predictedYieldPct - marginPct));
  const maxYieldPct = round1(Math.min(27.0, predictedYieldPct + marginPct));

  // Per 100 kg of olives (Primary objective)
  const oilKgPer100Kg = predictedYieldPct;
  const oilLitersPer100Kg = round1(oilKgPer100Kg / density);
  const oilKgPer100KgRange: [number, number] = [minYieldPct, maxYieldPct];
  const oilLitersPer100KgRange: [number, number] = [
    round1(minYieldPct / density),
    round1(maxYieldPct / density),
  ];

  // Full lot quantities
  const effectiveLotKg = Math.max(1, input.lotWeightKg);
  const estimatedOilKg = round1(effectiveLotKg * (predictedYieldPct / 100));
  const estimatedOilLiters = round1(estimatedOilKg / density);

  const minOilKg = round1(effectiveLotKg * (minYieldPct / 100));
  const maxOilKg = round1(effectiveLotKg * (maxYieldPct / 100));
  const minOilLiters = round1(minOilKg / density);
  const maxOilLiters = round1(maxOilKg / density);

  let confidenceLevel: PredictionResult["confidenceLevel"] = "media";
  if (marginPct <= 1.4 && f.confidence >= 0.78) {
    confidenceLevel = "alta";
  } else if (marginPct >= 2.4 || f.confidence < 0.6) {
    confidenceLevel = "bassa";
  }

  const harvestAdvice = computeHarvestAdvice({
    cultivar: input.cultivar,
    predictedYieldPct,
    cultivarBaseYieldPct: round1(
      baseline.potentialPulpOilPct * (baseline.typicalMillEfficiencyPct / 100)
    ),
    features: f,
    sampleData: sd,
  });

  const factors: PredictionFactor[] = [
    {
      id: "theoretical_fruit_oil",
      label: "Contenuto lipidico potenziale (polpa)",
      observedValue: `${formatFactorNumber(theoreticalFruitOilPct)}% su frutto`,
      impactPct: theoreticalFruitOilPct,
      source: sd.fieldSources.maturation,
      note: `${input.cultivar} · Invaiatura ${f.veraisonIndex.toFixed(1)}/5 (${Math.round(f.greenPct)}% verdi, ${Math.round(f.turningPct)}% inv., ${Math.round(f.blackPct)}% nere)`,
    },
    {
      id: "pulp_pit",
      label: "Rapporto polpa / nocciolo",
      observedValue:
        sd.measuredPulpToPit !== undefined
          ? `${sd.measuredPulpToPit.toFixed(1)} : 1 (misurato)`
          : f.pulpToPitEstimate != null && pulpRatioObservedFromCut
          ? `${f.pulpToPitEstimate.toFixed(1)} : 1 (sezione)`
          : `~${baseline.typicalPulpToPit.toFixed(1)} : 1 (media cultivar)`,
      impactPct: round2((pulpFractionMultiplier - 1) * baseline.potentialPulpOilPct),
      source: pulpRatioMeasured
        ? "misurazione_utente"
        : pulpRatioObservedFromCut
        ? "valutazione_visiva"
        : "non_rilevabile",
      note: pulpRatioMeasured
        ? "Valore misurato dall'utente sul campione"
        : pulpRatioObservedFromCut
        ? "Stimato dalla foto delle olive tagliate a metà"
        : "Sezione non presente: applicata media varietale con margine più prudente",
    },
    {
      id: "hydration",
      label: "Idratazione e consistenza",
      observedValue: `Disidratazione ${dehydrationLevel} · Polpa ${sd.consistency}`,
      impactPct: round2(hydrationDeltaPct),
      source: sd.fieldSources.consistency,
      note: "Incide sia sul rapporto peso fresco/olio sia sulla separabilità in gramola",
    },
    {
      id: "mill_efficiency",
      label: "Efficienza di estrazione del frantoio",
      observedValue: `${round1(millEfficiencyPct)}% recuperato`,
      impactPct: round2(
        theoreticalFruitOilPct * (millEfficiencyPct / 100) - theoreticalFruitOilPct
      ),
      source:
        sd.millEfficiencyPreference === "sconosciuta"
          ? "non_rilevabile"
          : "misurazione_utente",
      note: "Quota di olio effettivamente estraibile rispetto al totale teorico presente nella drupa (parte resta in sansa e acque)",
    },
    {
      id: "sanitary",
      label: "Difetti, attacchi mosca e impurità",
      observedValue: `Danni ${Math.round(damagedPct)}% · Mosca ${Math.round(flyPct)}% · Foglie ${Math.round(f.leafDebrisPct)}%`,
      impactPct: round2(-(defectLossPct + debrisLossPct)),
      source: sd.fieldSources.damagedPct,
      note: "Riduzione prudenziale della resa utile estraibile",
    },
  ];

  if (calibration.applied) {
    factors.push({
      id: "historical_calibration",
      label: "Calibrazione su storico frantoio reale",
      observedValue: `${calibration.sampleCountUsed} lotti reali`,
      impactPct: calibration.adjustmentPct,
      source: "misurazione_utente",
      note: calibration.reason,
    });
  }

  const disclaimer = f.isSimulated
    ? "Stima dimostrativa simulata: non proviene da analisi Gemini Vision né da pesatura reale al frantoio."
    : "Stima statistica della resa estraibile su 100 kg di olive: combina visione artificiale, dati fisici inseriti e resa tipica di frantoio, ma non sostituisce la molitura effettiva.";

  return {
    predictedYieldPct,
    minYieldPct,
    maxYieldPct,
    uncertaintyIntervalPct: [minYieldPct, maxYieldPct],
    marginPct,
    oilKgPer100Kg,
    oilLitersPer100Kg,
    oilKgPer100KgRange,
    oilLitersPer100KgRange,
    theoreticalFruitOilPct,
    millExtractionEfficiencyPct: round1(millEfficiencyPct),
    estimatedOilKg,
    estimatedOilLiters,
    oilKgRange: [minOilKg, maxOilKg],
    oilLitersRange: [minOilLiters, maxOilLiters],
    oilDensityKgPerLiter: density,
    confidenceLevel,
    factors,
    calibration,
    harvestAdvice,
    isSimulated: f.isSimulated,
    disclaimer,
  };
}

function formatFactorNumber(n: number): string {
  return n.toFixed(1).replace(".", ",");
}

export function computeAggregateStats(
  records: OliveAnalysisRecord[]
): AggregateStats {
  const withPrediction = records.filter((r) => Boolean(r.prediction));
  const verified = records.filter((r) => Boolean(r.prediction && r.millOutcome));
  const simulatedDemoCount = records.filter((r) => isDemoAnalysis(r)).length;

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

  const seasonalSeries = [...withPrediction]
    .sort((a, b) => a.harvestDate.localeCompare(b.harvestDate))
    .map((r) => {
      const pred = r.prediction!.predictedYieldPct;
      const actual = r.millOutcome?.actualYieldPct ?? null;
      return {
        id: r.id,
        code: r.code,
        date: r.harvestDate,
        cultivar: r.cultivar,
        predictedYieldPct: pred,
        actualYieldPct: actual,
        signedErrorPct: actual !== null ? round2(actual - pred) : null,
        greenPct: r.visualFeatures?.greenPct ?? 40,
        turningPct: r.visualFeatures?.turningPct ?? 35,
        blackPct: r.visualFeatures?.blackPct ?? 25,
        veraisonIndex: r.visualFeatures?.veraisonIndex ?? 2.5,
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
    seasonalSeries,
  };
}
