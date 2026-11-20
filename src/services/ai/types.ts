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
  oliveCount?: number;
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
  geminiOperational?: boolean;
  primaryModel?: string;
  fallbackModel?: string;
  activeModel?: string | null;
  fallbackUsed?: boolean;
  errorMessage?: string;
  verifiedAt?: string;
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
        title: "Olive tagliate a metà (polpa/nocciolo)",
        instruction:
          "Taglia a metà nel senso della lunghezza 3 olive rappresentative del campione e fotografale dall'alto su fondo neutro.",
        reason,
        expectedUncertaintyReductionPct: 0.5,
        required: false,
      };
    case "closeup":
      return {
        id: `req_${role}`,
        role,
        title: "Vista ravvicinata delle drupe",
        instruction:
          "Avvicina la fotocamera a 15–20 cm da 6–10 olive per rendere leggibili buccia, lenticelle ed eventuali lesioni.",
        reason,
        expectedUncertaintyReductionPct: 0.4,
        required: false,
      };
    case "supplemental_lighting":
      return {
        id: `req_${role}`,
        role,
        title: "Scatto aggiuntivo a luce naturale diffusa",
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
        title: "Dettaglio difetti e segni di mosca",
        instruction:
          "Inquadra da vicino eventuali olive con punture, macchie scure o raggrinzimenti per stimare la quota danneggiata.",
        reason,
        expectedUncertaintyReductionPct: 0.4,
        required: false,
      };
  }
}
