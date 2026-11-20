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

export interface VisualMorphologyFeatures {
  veraisonIndex: number; // 0..5 Jaen scale
  greenPct: number;
  turningPct: number;
  blackPct: number;
  turgorScore: number; // 0..1
  pulpToPitEstimate: number; // ratio ~3.2..6.2
  defectSeverity: number; // 0..1
  leafDebrisPct: number; // 0..25
  varietyHint: string;
  confidence: number; // 0..1
  summaryNote: string;
  isSimulated: boolean;
}

export interface PredictionFactor {
  id: string;
  label: string;
  observedValue: string;
  impactPct: number;
  note: string;
}

export interface PredictionResult {
  predictedYieldPct: number;
  uncertaintyIntervalPct: [number, number];
  marginPct: number;
  estimatedOilKg: number;
  estimatedOilLiters: number;
  oilKgRange: [number, number];
  oilLitersRange: [number, number];
  oilDensityKgPerLiter: number;
  confidenceLevel: "alta" | "media" | "bassa";
  factors: PredictionFactor[];
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
  status: AnalysisStatus;
  photos: PhotoAsset[];
  supplementalRequests: SupplementalPhotoRequest[];
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
  overview: "Panoramica campione",
  closeup: "Dettaglio ravvicinato",
  cross_section: "Sezione polpa/nocciolo",
  supplemental_defect: "Verifica integrità drupe",
  supplemental_lighting: "Scatto a luce diffusa",
};
