import type {
  AiEngineMode,
  OliveCultivar,
  PhotoAsset,
  SamplePhotoRole,
  SupplementalPhotoRequest,
  VisualMorphologyFeatures,
} from "../../types/analysis";

export interface AiAnalysisProgressEvent {
  stepIndex: number;
  totalSteps: number;
  label: string;
  detail: string;
  progressPct: number;
}

export interface AiAnalysisInput {
  cultivar: OliveCultivar;
  sampleWeightGrams: number;
  lotWeightKg: number;
  groveLocation: string;
  photos: Array<{
    asset: PhotoAsset;
    blob: Blob;
  }>;
  onProgress?: (event: AiAnalysisProgressEvent) => void;
}

export interface AiAnalysisOutput {
  features: VisualMorphologyFeatures;
  supplementalRequests: SupplementalPhotoRequest[];
  providerLabel: string;
  dataOrigin: "stima_locale" | "gemini_backend";
}

export interface MultimodalAnalysisProvider {
  readonly id: AiEngineMode;
  readonly label: string;
  analyzeSample(input: AiAnalysisInput): Promise<AiAnalysisOutput>;
}

export interface BackendHealthStatus {
  status: "ok" | "offline";
  geminiConfigured: boolean;
  timestamp?: string;
}

export function buildSupplementalRequest(
  role: SamplePhotoRole,
  reason: string
): SupplementalPhotoRequest {
  switch (role) {
    case "cross_section":
      return {
        id: `req_${role}`,
        role,
        title: "Sezione trasversale (olive tagliate)",
        instruction:
          "Taglia a metà nel senso della lunghezza 3 olive rappresentative del campione e fotografale dall'alto su fondo neutro.",
        reason,
        expectedUncertaintyReductionPct: 0.5,
        required: false,
      };
    case "supplemental_lighting":
      return {
        id: `req_${role}`,
        role,
        title: "Scatto a luce naturale diffusa",
        instruction:
          "Ripeti uno scatto all'ombra luminosa (senza flash diretto né ombre nette) mantenendo il telefono parallelo al piano.",
        reason,
        expectedUncertaintyReductionPct: 0.4,
        required: false,
      };
    case "supplemental_defect":
    default:
      return {
        id: "req_supplemental_defect",
        role: "supplemental_defect",
        title: "Dettaglio ravvicinato integrità drupe",
        instruction:
          "Avvicina la fotocamera a 15–20 cm da 6–8 olive per verificare eventuale raggrinzimento o punture di mosca olearia.",
        reason,
        expectedUncertaintyReductionPct: 0.4,
        required: false,
      };
  }
}
