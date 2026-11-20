import type {
  DehydrationLevel,
  MaturationUniformity,
  OliveConsistency,
  OliveSizeCategory,
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
  "closeup",
  "supplemental_defect",
  "supplemental_lighting",
];

function clamp(val: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, val));
}

function normalizeEnum<T extends string>(
  raw: unknown,
  allowed: readonly T[],
  fallback: T
): T {
  if (typeof raw === "string") {
    const clean = raw.trim().toLowerCase() as T;
    if (allowed.includes(clean)) return clean;
  }
  return fallback;
}

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
  label: "Gemini Vision (Backend Protetto)",

  async analyzeSample(input: AiAnalysisInput): Promise<AiAnalysisOutput> {
    input.onProgress?.({
      stepIndex: 1,
      totalSteps: 4,
      label: "Preparazione immagini campione",
      detail: `Codifica di ${input.photos.length} fotografie per Gemini Vision`,
      progressPct: 20,
    });

    const encodedPhotos = await Promise.all(
      input.photos.slice(0, 8).map(async (item) => ({
        role: item.asset.role,
        mimeType: item.asset.mimeType,
        base64Data: await blobToBase64(item.blob),
      }))
    );

    input.onProgress?.({
      stepIndex: 2,
      totalSteps: 4,
      label: "Analisi fotografica con Gemini Vision in corso",
      detail:
        "Riconoscimento maturazione, difetti, segni di mosca, disidratazione e qualità scatti",
      progressPct: 55,
    });

    const response = await fetch("/api/analyze-olive-sample", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        cultivar: input.cultivar,
        sampleWeightGrams: input.sampleWeightGrams,
        lotWeightKg: input.lotWeightKg,
        oliveCount: input.oliveCount,
        groveLocation: input.groveLocation,
        photos: encodedPhotos,
      }),
    });

    if (!response.ok) {
      let message = "Servizio Gemini Vision non disponibile.";
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
      label: "Verifica parametri visivi estratti",
      detail: "Normalizzazione intervalli e controllo qualità fotografica",
      progressPct: 86,
    });

    const payload = (await response.json()) as {
      provider: string;
      features: Record<string, unknown>;
    };

    const raw = payload.features ?? {};

    // Normalize color percentages strictly to sum to 100
    const gRaw = Math.max(0, Number(raw.greenPct ?? 0));
    const tRaw = Math.max(0, Number(raw.turningPct ?? 0));
    const bRaw = Math.max(0, Number(raw.blackPct ?? 0));
    const sumPct = gRaw + tRaw + bRaw;
    const greenPct = sumPct > 0 ? Math.round((gRaw / sumPct) * 100) : 40;
    const turningPct = sumPct > 0 ? Math.round((tRaw / sumPct) * 100) : 35;
    const blackPct = Math.max(0, 100 - greenPct - turningPct);

    const pulpToPitObservable = Boolean(raw.pulpToPitObservable);
    const rawPulp = Number(raw.pulpToPitEstimate ?? 0);
    const pulpToPitEstimate =
      pulpToPitObservable && rawPulp > 1.5
        ? Math.round(clamp(rawPulp, 2.2, 7.5) * 10) / 10
        : null;

    const visibleDefectsPct = clamp(Number(raw.visibleDefectsPct ?? 0), 0, 100);
    const oliveFlySignsPct = clamp(Number(raw.oliveFlySignsPct ?? 0), 0, 100);
    const estimatedCountRaw = Number(raw.estimatedVisibleCount ?? 0);
    const estimatedVisibleCount =
      Number.isFinite(estimatedCountRaw) && estimatedCountRaw > 0
        ? Math.round(estimatedCountRaw)
        : undefined;

    const qualityIssues = Array.isArray(raw.qualityIssues)
      ? raw.qualityIssues.filter((x): x is string => typeof x === "string" && x.trim().length > 0)
      : [];

    const imageQualitySufficient =
      raw.imageQualitySufficient !== undefined
        ? Boolean(raw.imageQualitySufficient)
        : qualityIssues.length === 0;

    const features: VisualMorphologyFeatures = {
      veraisonIndex: Math.round(clamp(Number(raw.veraisonIndex ?? 2.5), 0, 5) * 10) / 10,
      greenPct,
      turningPct,
      blackPct,
      maturationUniformity: normalizeEnum<MaturationUniformity>(
        raw.maturationUniformity,
        ["alta", "media", "bassa"],
        "media"
      ),
      apparentAverageSize: normalizeEnum<OliveSizeCategory>(
        raw.apparentAverageSize,
        ["piccola", "media", "grande"],
        "media"
      ),
      estimatedVisibleCount,
      consistency: normalizeEnum<OliveConsistency>(
        raw.consistency,
        ["soda", "media", "molle"],
        "media"
      ),
      shrivelingDetected: Boolean(raw.shrivelingDetected),
      dehydrationLevel: normalizeEnum<DehydrationLevel>(
        raw.dehydrationLevel,
        ["assente", "lieve", "moderata", "marcata"],
        "assente"
      ),
      turgorScore: Math.round(clamp(Number(raw.turgorScore ?? 0.72), 0.2, 0.95) * 100) / 100,
      pulpToPitObservable,
      pulpToPitEstimate,
      visibleDefectsPct,
      oliveFlySignsPct,
      defectSeverity: Math.round(clamp(Number(raw.defectSeverity ?? 0.05), 0, 1) * 100) / 100,
      leafDebrisPct: Math.round(clamp(Number(raw.leafDebrisPct ?? 0), 0, 25) * 10) / 10,
      varietyHint:
        typeof raw.varietyHint === "string" && raw.varietyHint.trim()
          ? raw.varietyHint.trim()
          : `Profilo osservato compatibile con ${input.cultivar}`,
      confidence: Math.round(clamp(Number(raw.confidence ?? 0.72), 0.3, 0.95) * 100) / 100,
      imageQualitySufficient,
      qualityIssues,
      summaryNote:
        typeof raw.summaryNote === "string" && raw.summaryNote.trim()
          ? raw.summaryNote.trim()
          : "Analisi visiva completata tramite Gemini Vision sul backend protetto.",
      parameterSources: {
        maturation: "valutazione_visiva",
        apparentAverageSize: "valutazione_visiva",
        consistency: "valutazione_visiva",
        dehydrationLevel: "valutazione_visiva",
        visibleDefectsPct: "valutazione_visiva",
        oliveFlySignsPct: "valutazione_visiva",
        pulpToPitEstimate: pulpToPitObservable
          ? "valutazione_visiva"
          : "non_rilevabile",
        estimatedVisibleCount: estimatedVisibleCount
          ? "valutazione_visiva"
          : "non_rilevabile",
      },
      isSimulated: false,
    };

    const existingRoles = new Set(input.photos.map((p) => p.asset.role));
    const recommendedRaw = Array.isArray(raw.recommendedSupplementalRoles)
      ? raw.recommendedSupplementalRoles
      : [];

    const supplementalRequests: SupplementalPhotoRequest[] = recommendedRaw
      .filter((r): r is SamplePhotoRole =>
        typeof r === "string" && ALLOWED_SUPPLEMENTAL_ROLES.includes(r as SamplePhotoRole)
      )
      .filter((role) => !existingRoles.has(role) || !imageQualitySufficient)
      .filter((role, idx, arr) => arr.indexOf(role) === idx)
      .map((role) =>
        buildSupplementalRequest(
          role,
          qualityIssues.length > 0
            ? qualityIssues[0]
            : "Scatto suggerito da Gemini Vision per aumentare la precisione della valutazione visiva."
        )
      );

    input.onProgress?.({
      stepIndex: 4,
      totalSteps: 4,
      label: "Analisi visiva completata",
      detail: "Verifica i parametri rilevati prima del calcolo finale",
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
