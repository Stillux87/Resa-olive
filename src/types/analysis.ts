export type OliveCultivar =
  | "Frantoio"
  | "Moraiolo"
  | "Coratina"
  | "Leccino"
  | "Nocellara del Belice"
  | "Taggiasca"
  | "Mista / Ignota";

export type SamplePhotoRole =
  | "overview"
  | "closeup"
  | "cross_section"
  | "supplemental_defect"
  | "supplemental_lighting";

export type PhotoSource = "camera" | "upload" | "demo";

export interface PhotoQualityMetrics {
  meanLuminance: number; // 0..255
  contrastSpread: number; // 0..100
  sharpnessScore: number; // 0..100
  qualityFlag: "ottima" | "accettabile" | "scarsa_luce" | "sfocata";
}

export interface PhotoAsset {
  id: string;
  analysisId: string;
  role: SamplePhotoRole;
  label: string;
  source: PhotoSource;
  mimeType: string;
  width: number;
  height: number;
  sizeBytes: number;
  capturedAt: string;
  quality: PhotoQualityMetrics;
  previewUrl?: string;
}

export interface SupplementalPhotoRequest {
  id: string;
  role: SamplePhotoRole;
  title: string;
  instruction: string;
  reason: string;
  expectedUncertaintyReductionPct: number;
  required: boolean;
  fulfilledPhotoId?: string;
}

export type ParameterSource =
  | "valutazione_visiva"
  | "misurazione_utente"
  | "media_cultivar"
  | "modello_statistico"
  | "non_rilevabile";

export type OliveSizeCategory = "piccola" | "media" | "grande";
export type OliveConsistency = "soda" | "media" | "molle";
export type MaturationUniformity = "alta" | "media" | "bassa";
export type DehydrationLevel = "assente" | "lieve" | "moderata" | "marcata";
export type MillEfficiencyPreference = "sconosciuta" | "bassa" | "standard" | "alta";

export interface VisualMorphologyFeatures {
  veraisonIndex: number; // 0..5 Jaen scale
  greenPct: number;
  turningPct: number;
  blackPct: number;
  maturationUniformity?: MaturationUniformity;
  apparentAverageSize?: OliveSizeCategory;
  estimatedVisibleCount?: number;
  consistency?: OliveConsistency;
  dehydrationLevel?: DehydrationLevel;
  shrivelingDetected?: boolean;
  turgorScore: number; // 0..1
  pulpToPitEstimate: number | null; // null if no cut photo and not measurable
  pulpToPitObservable?: boolean;
  defectSeverity: number; // 0..1
  visibleDefectsPct?: number; // 0..100
  oliveFlySignsPct?: number; // 0..100
  leafDebrisPct: number; // 0..25
  varietyHint: string;
  confidence: number; // 0..1
  imageQualitySufficient?: boolean;
  qualityIssues?: string[];
  summaryNote: string;
  parameterSources?: Record<string, ParameterSource>;
  isSimulated: boolean;
}

/**
 * User-editable / user-measured quantitative parameters for each sample.
 */
export interface SamplePhysicalData {
  oliveCount?: number;
  averageSize: OliveSizeCategory;
  consistency: OliveConsistency;
  damagedPct: number; // 0..100
  oliveFlyPct: number; // 0..100
  measuredPulpToPit?: number; // e.g. 4.5 when user actually cuts & weighs/measures
  dehydrationLevel: DehydrationLevel;
  millEfficiencyPreference: MillEfficiencyPreference;
  customMillEfficiencyPct?: number; // e.g. 85%
  notes?: string;
  fieldSources: {
    oliveCount: ParameterSource;
    averageSize: ParameterSource;
    consistency: ParameterSource;
    maturation: ParameterSource;
    damagedPct: ParameterSource;
    oliveFlyPct: ParameterSource;
    pulpToPit: ParameterSource;
  };
}

export interface PredictionFactor {
  id: string;
  label: string;
  observedValue: string;
  impactPct: number;
  source?: ParameterSource;
  note: string;
}

export interface HarvestAdvice {
  recommendation:
    | "Conviene raccogliere adesso"
    | "Potrebbe convenire attendere"
    | "La maturazione appare già avanzata"
    | "Il rischio di deterioramento potrebbe rendere sconsigliabile attendere";
  rationale: string;
  urgencyLevel: "raccogliere" | "attendere" | "avanzata" | "rischio";
}

export interface CalibrationSnapshot {
  applied: boolean;
  sampleCountUsed: number;
  cohortLabel: string;
  adjustmentPct: number;
  uncalibratedYieldPct: number;
  reason: string;
}

export interface PredictionResult {
  predictedYieldPct: number; // Resa più probabile (kg olio / 100 kg olive)
  minYieldPct?: number; // Resa minima stimata
  maxYieldPct?: number; // Resa massima stimata
  uncertaintyIntervalPct: [number, number];
  marginPct: number;
  oilKgPer100Kg?: number;
  oilLitersPer100Kg?: number;
  oilKgPer100KgRange?: [number, number];
  oilLitersPer100KgRange?: [number, number];
  theoreticalFruitOilPct?: number;
  millExtractionEfficiencyPct?: number;
  estimatedOilKg: number; // Totale sul lotto (lotWeightKg)
  estimatedOilLiters: number; // Totale sul lotto (lotWeightKg)
  oilKgRange: [number, number];
  oilLitersRange: [number, number];
  oilDensityKgPerLiter: number;
  confidenceLevel: "alta" | "media" | "bassa";
  factors: PredictionFactor[];
  calibration?: CalibrationSnapshot;
  harvestAdvice?: HarvestAdvice;
  isSimulated: boolean;
  disclaimer: string;
}

export type MillExtractionMethod =
  | "continuo_2_fasi"
  | "continuo_3_fasi"
  | "tradizionale";

export interface MillOutcome {
  actualYieldPct: number;
  actualOilKg: number;
  actualOilLiters: number;
  lotWeightKg: number;
  harvestDate?: string;
  millName?: string;
  extractionMethod: MillExtractionMethod;
  recordedAt: string;
  notes?: string;
}

export type AnalysisStatus =
  | "bozza"
  | "richiesta_foto"
  | "completata"
  | "verificata_frantoio";

export type AnalysisDataOrigin =
  | "simulato_demo"
  | "stima_locale"
  | "gemini_backend";

export interface OliveAnalysisRecord {
  id: string;
  code: string;
  title: string;
  cultivar: OliveCultivar;
  groveLocation: string;
  harvestDate: string;
  sampleWeightGrams: number;
  lotWeightKg: number;
  isDemo?: boolean;
  status: AnalysisStatus;
  photos: PhotoAsset[];
  supplementalRequests: SupplementalPhotoRequest[];
  sampleData?: SamplePhysicalData;
  visualFeatures?: VisualMorphologyFeatures;
  prediction?: PredictionResult;
  millOutcome?: MillOutcome;
  dataOrigin: AnalysisDataOrigin;
  createdAt: string;
  updatedAt: string;
}

export type AiEngineMode = "simulato_locale" | "gemini_backend";

export interface AppSettings {
  aiMode: AiEngineMode;
  defaultDensityKgPerLiter: number;
  seededDemoVersion: number;
}

export interface CalibrationErrorRecord {
  analysisId: string;
  code: string;
  title: string;
  cultivar: OliveCultivar;
  harvestDate: string;
  veraisonIndex: number;
  predictedYieldPct: number;
  actualYieldPct: number;
  signedErrorPct: number; // actual - predicted
  absoluteErrorPct: number;
  insideInterval: boolean;
}

export interface CalibrationSummary {
  realVerifiedCount: number;
  minimumRequiredForAdjustment: number;
  calibrationActive: boolean;
  globalMeanBiasPct: number | null;
  globalMaePct: number | null;
  byCultivar: Array<{
    cultivar: OliveCultivar;
    verifiedCount: number;
    meanBiasPct: number;
    maePct: number;
    dampedAdjustmentPct: number;
  }>;
  errorHistory: CalibrationErrorRecord[];
}

export interface AggregateStats {
  totalAnalyses: number;
  verifiedCount: number;
  simulatedDemoCount: number;
  meanPredictedYieldPct: number | null;
  meanActualYieldPct: number | null;
  meanAbsoluteErrorPct: number | null;
  meanSignedBiasPct: number | null;
  intervalCoverageRatePct: number | null;
  totalSampleWeightGrams: number;
  totalLotWeightKg: number;
  totalEstimatedOilKg: number;
  totalEstimatedOilLiters: number;
  totalActualOilKg: number;
  totalActualOilLiters: number;
  cultivarSummaries: Array<{
    cultivar: string;
    count: number;
    avgPredictedYieldPct: number;
    avgActualYieldPct: number | null;
    minPredictedPct: number;
    maxPredictedPct: number;
  }>;
  seasonalSeries: Array<{
    id: string;
    code: string;
    date: string;
    cultivar: string;
    predictedYieldPct: number;
    actualYieldPct: number | null;
    signedErrorPct: number | null;
    greenPct: number;
    turningPct: number;
    blackPct: number;
    veraisonIndex: number;
  }>;
}

export const OLIVE_OIL_DENSITY_KG_PER_LITER = 0.916;

export const CULTIVAR_OPTIONS: OliveCultivar[] = [
  "Frantoio",
  "Moraiolo",
  "Coratina",
  "Leccino",
  "Nocellara del Belice",
  "Taggiasca",
  "Mista / Ignota",
];

export const PHOTO_ROLE_LABELS: Record<SamplePhotoRole, string> = {
  overview: "Vista dall'alto (panoramica)",
  closeup: "Vista ravvicinata",
  cross_section: "Olive tagliate (polpa/nocciolo)",
  supplemental_defect: "Dettaglio difetti / mosca",
  supplemental_lighting: "Scatto a luce diffusa",
};
