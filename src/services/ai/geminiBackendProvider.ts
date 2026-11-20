import type {
  SamplePhotoRole,
  SupplementalPhotoRequest,
  VisualMorphologyFeatures,
} from "../../types/analysis";
import { blobToBase64 } from "../photos/photoManager";
import {
  buildSupplementalRequest,
  type AiAnalysisInput,
  type AiAnalysisOutput,
  type BackendHealthStatus,
  type MultimodalAnalysisProvider,
} from "./types";

const ALLOWED_SUPPLEMENTAL_ROLES: SamplePhotoRole[] = [
  "cross_section",
  "supplemental_defect",
  "supplemental_lighting",
];

export async function checkBackendHealth(): Promise<BackendHealthStatus> {
  try {
    const response = await fetch("/api/health", { method: "GET" });
    if (!response.ok) {
      return { status: "offline", geminiConfigured: false };
    }
    const data = (await response.json()) as {
      status?: string;
      geminiConfigured?: boolean;
      timestamp?: string;
    };
    return {
      status: data.status === "ok" ? "ok" : "offline",
      geminiConfigured: Boolean(data.geminiConfigured),
      timestamp: data.timestamp,
    };
  } catch {
    return { status: "offline", geminiConfigured: false };
  }
}

export const geminiBackendProvider: MultimodalAnalysisProvider = {
  id: "gemini_backend",
  label: "Gemini Multimodale (Backend Protetto)",

  async analyzeSample(input: AiAnalysisInput): Promise<AiAnalysisOutput> {
    input.onProgress?.({
      stepIndex: 1,
      totalSteps: 4,
      label: "Preparazione immagini campione",
      detail: "Codifica sicura delle fotografie acquisite",
      progressPct: 22,
    });

    const encodedPhotos = await Promise.all(
      input.photos.slice(0, 6).map(async (item) => ({
        role: item.asset.role,
        mimeType: item.asset.mimeType,
        base64Data: await blobToBase64(item.blob),
      }))
    );

    input.onProgress?.({
      stepIndex: 2,
      totalSteps: 4,
      label: "Invio al backend protetto OLIVESTIMA",
      detail: "Chiamata server-side verso Gemini multimodale",
      progressPct: 55,
    });

    const response = await fetch("/api/analyze-olive-sample", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        cultivar: input.cultivar,
        sampleWeightGrams: input.sampleWeightGrams,
        lotWeightKg: input.lotWeightKg,
        groveLocation: input.groveLocation,
        photos: encodedPhotos,
      }),
    });

    if (!response.ok) {
      let message = "Servizio Gemini backend non disponibile.";
      try {
        const errPayload = (await response.json()) as { message?: string };
        if (errPayload.message) message = errPayload.message;
      } catch {
        // Keep fallback message
      }
      throw new Error(message);
    }

    input.onProgress?.({
      stepIndex: 3,
      totalSteps: 4,
      label: "Elaborazione descrittori visivi",
      detail: "Normalizzazione invaiatura, turgore e rapporto polpa/nocciolo",
      progressPct: 84,
    });

    const payload = (await response.json()) as {
      provider: string;
      features: {
        veraisonIndex: number;
        greenPct: number;
        turningPct: number;
        blackPct: number;
        turgorScore: number;
        pulpToPitEstimate: number;
        defectSeverity: number;
        leafDebrisPct: number;
        varietyHint: string;
        confidence: number;
        summaryNote: string;
        recommendedSupplementalRoles?: string[];
      };
    };

    const raw = payload.features;
    const features: VisualMorphologyFeatures = {
      veraisonIndex: Number(raw.veraisonIndex ?? 2.5),
      greenPct: Number(raw.greenPct ?? 40),
      turningPct: Number(raw.turningPct ?? 35),
      blackPct: Number(raw.blackPct ?? 25),
      turgorScore: Number(raw.turgorScore ?? 0.72),
      pulpToPitEstimate: Number(raw.pulpToPitEstimate ?? 4.3),
      defectSeverity: Number(raw.defectSeverity ?? 0.05),
      leafDebrisPct: Number(raw.leafDebrisPct ?? 1),
      varietyHint: raw.varietyHint || `Profilo osservato compatibile con ${input.cultivar}`,
      confidence: Number(raw.confidence ?? 0.74),
      summaryNote:
        raw.summaryNote || "Analisi visiva completata tramite backend protetto Gemini.",
      isSimulated: false,
    };

    const existingRoles = new Set(input.photos.map((p) => p.asset.role));
    const supplementalRequests: SupplementalPhotoRequest[] = (
      raw.recommendedSupplementalRoles ?? []
    )
      .filter((r): r is SamplePhotoRole =>
        ALLOWED_SUPPLEMENTAL_ROLES.includes(r as SamplePhotoRole)
      )
      .filter((role) => !existingRoles.has(role))
      .map((role) =>
        buildSupplementalRequest(
          role,
          "Richiesta suggerita dall'analisi visiva multimodale per ridurre l'incertezza della stima."
        )
      );

    input.onProgress?.({
      stepIndex: 4,
      totalSteps: 4,
      label: "Analisi completata",
      detail: "Passaggio al motore statistico di resa",
      progressPct: 100,
    });

    return {
      features,
      supplementalRequests,
      providerLabel: this.label,
      dataOrigin: "gemini_backend",
    };
  },
};
