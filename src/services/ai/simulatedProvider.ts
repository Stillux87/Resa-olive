import type {
  SupplementalPhotoRequest,
  VisualMorphologyFeatures,
} from "../../types/analysis";
import {
  buildSupplementalRequest,
  type AiAnalysisInput,
  type AiAnalysisOutput,
  type MultimodalAnalysisProvider,
} from "./types";

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function hashSeed(text: string): number {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash);
}

/**
 * Offline simulated fallback analyzer (ONLY used when Gemini Vision API is unreachable
 * or when the user explicitly selects offline simulation mode).
 * Every output is explicitly stamped `isSimulated: true`.
 */
export const simulatedLocalProvider: MultimodalAnalysisProvider = {
  id: "simulato_locale",
  label: "Simulatore Locale Offline (Solo fallback dimostrativo)",

  async analyzeSample(input: AiAnalysisInput): Promise<AiAnalysisOutput> {
    const steps = [
      {
        label: "Verifica nitidezza ed esposizione locale",
        detail: `Controllo pixel su ${input.photos.length} immagini`,
        pct: 25,
      },
      {
        label: "Generazione descrittori simulati offline",
        detail: "Modalità offline attiva: nessuna chiamata a Gemini Vision",
        pct: 65,
      },
      {
        label: "Calcolo stima prudenziale preliminare",
        detail: "Applicazione modello statistico su dati simulati",
        pct: 100,
      },
    ];

    for (let i = 0; i < steps.length; i++) {
      input.onProgress?.({
        stepIndex: i + 1,
        totalSteps: steps.length,
        label: steps[i].label,
        detail: steps[i].detail,
        progressPct: steps[i].pct,
      });
      await wait(280);
    }

    const totalSize = input.photos.reduce((s, p) => s + p.asset.sizeBytes, 0);
    const avgLum =
      input.photos.reduce((s, p) => s + p.asset.quality.meanLuminance, 0) /
      Math.max(1, input.photos.length);
    const avgSharp =
      input.photos.reduce((s, p) => s + p.asset.quality.sharpnessScore, 0) /
      Math.max(1, input.photos.length);

    const seed = hashSeed(
      `${input.cultivar}-${input.sampleWeightGrams}-${totalSize}-${Math.round(avgLum)}`
    );

    const veraisonBase = 1.9 + ((seed % 22) / 10);
    const veraisonIndex = Math.round(veraisonBase * 10) / 10;

    const blackPct = Math.min(72, Math.max(8, Math.round((veraisonIndex - 1.2) * 20)));
    const greenPct = Math.min(76, Math.max(8, Math.round((4.5 - veraisonIndex) * 21)));
    const turningPct = Math.max(5, 100 - blackPct - greenPct);

    const rolesPresent = new Set(input.photos.map((p) => p.asset.role));
    const hasCut = rolesPresent.has("cross_section");
    const hasLowQuality = input.photos.some(
      (p) =>
        p.asset.quality.qualityFlag === "scarsa_luce" ||
        p.asset.quality.qualityFlag === "sfocata"
    );

    const turgorScore = Math.round((0.66 + ((seed >> 3) % 22) / 100) * 100) / 100;
    const pulpToPitEstimate = hasCut
      ? Math.round((4.0 + ((seed >> 5) % 14) / 10) * 10) / 10
      : null;
    const visibleDefectsPct = (seed >> 7) % 8;
    const oliveFlySignsPct = (seed >> 8) % 5;
    const leafDebrisPct = (seed >> 9) % 4;

    const supplementalRequests: SupplementalPhotoRequest[] = [];
    if (!hasCut) {
      supplementalRequests.push(
        buildSupplementalRequest(
          "cross_section",
          "Manca una fotografia di olive tagliate a metà: impossibile stimare il rapporto polpa/nocciolo."
        )
      );
    }
    if (hasLowQuality && !rolesPresent.has("supplemental_lighting")) {
      supplementalRequests.push(
        buildSupplementalRequest(
          "supplemental_lighting",
          "Qualità luminosa o nitidezza migliorabile: consigliato uno scatto a luce diffusa."
        )
      );
    } else if (!rolesPresent.has("closeup")) {
      supplementalRequests.push(
        buildSupplementalRequest(
          "closeup",
          "Uno scatto ravvicinato consente di verificare meglio eventuali punture di mosca o difetti superficiali."
        )
      );
    }

    const baseConfidence =
      0.52 +
      (rolesPresent.has("overview") ? 0.08 : 0) +
      (rolesPresent.has("closeup") ? 0.08 : 0) +
      (hasCut ? 0.1 : 0) +
      (avgSharp >= 40 ? 0.04 : -0.05) -
      (hasLowQuality ? 0.08 : 0);

    const features: VisualMorphologyFeatures = {
      veraisonIndex,
      greenPct,
      turningPct,
      blackPct,
      maturationUniformity: "media",
      apparentAverageSize: "media",
      estimatedVisibleCount: undefined,
      consistency: "media",
      shrivelingDetected: false,
      dehydrationLevel: "assente",
      turgorScore,
      pulpToPitObservable: hasCut,
      pulpToPitEstimate,
      visibleDefectsPct,
      oliveFlySignsPct,
      defectSeverity: Math.round(((visibleDefectsPct + oliveFlySignsPct) / 100) * 100) / 100,
      leafDebrisPct,
      varietyHint: `Simulazione offline compatibile con ${input.cultivar} (usa Gemini Vision per analisi visiva reale)`,
      confidence: Math.min(0.84, Math.max(0.42, Math.round(baseConfidence * 100) / 100)),
      imageQualitySufficient: !hasLowQuality,
      qualityIssues: hasLowQuality
        ? ["Luminosità o nitidezza non ottimali rilevate dal controllo locale."]
        : [],
      summaryNote:
        "Valori morfologici generati in modalità simulata offline (non analizzati da Gemini Vision): verifica e correggi manualmente i parametri prima di salvare.",
      parameterSources: {
        maturation: "valutazione_visiva",
        apparentAverageSize: "valutazione_visiva",
        consistency: "valutazione_visiva",
        dehydrationLevel: "valutazione_visiva",
        visibleDefectsPct: "valutazione_visiva",
        oliveFlySignsPct: "valutazione_visiva",
        pulpToPitEstimate: hasCut ? "valutazione_visiva" : "non_rilevabile",
        estimatedVisibleCount: "non_rilevabile",
      },
      isSimulated: true,
    };

    return {
      features,
      supplementalRequests,
      providerLabel: this.label,
      dataOrigin: "stima_locale",
    };
  },
};
