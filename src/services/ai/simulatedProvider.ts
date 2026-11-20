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
 * Offline simulated multimodal analyzer.
 * Uses real canvas pixel metrics (luminance, contrast, sharpness) combined with sample metadata
 * to produce deterministic, clearly flagged simulated morphology descriptors and dynamic photo requests.
 */
export const simulatedLocalProvider: MultimodalAnalysisProvider = {
  id: "simulato_locale",
  label: "Motore Statistico Locale (Simulazione Offline)",

  async analyzeSample(input: AiAnalysisInput): Promise<AiAnalysisOutput> {
    const steps = [
      {
        label: "Verifica nitidezza ed esposizione",
        detail: `Controllo qualità su ${input.photos.length} immagini acquisite`,
        pct: 18,
      },
      {
        label: "Segmentazione drupe e scala cromatica",
        detail: "Stima simulata dell'indice di invaiatura su verde, violaceo e nero",
        pct: 42,
      },
      {
        label: "Valutazione turgore e rapporto polpa/nocciolo",
        detail: "Analisi morfologica delle superfici e degli eventuali scatti in sezione",
        pct: 68,
      },
      {
        label: "Valutazione incertezza e scatti supplementari",
        detail: "Verifica della copertura angolare del campione",
        pct: 86,
      },
      {
        label: "Calcolo stima statistica finale",
        detail: "Generazione intervallo di confidenza e conversione in kg/litri",
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
      await wait(340);
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

    const veraisonBase = 1.9 + ((seed % 24) / 10); // 1.9 .. 4.2
    const veraisonIndex = Math.round(veraisonBase * 10) / 10;

    // Derive coherent green / turning / black distribution from veraisonIndex
    const blackPct = Math.min(75, Math.max(8, Math.round((veraisonIndex - 1.2) * 20)));
    const greenPct = Math.min(78, Math.max(8, Math.round((4.5 - veraisonIndex) * 21)));
    const turningPct = Math.max(5, 100 - blackPct - greenPct);

    const turgorScore = Math.round((0.64 + ((seed >> 3) % 25) / 100) * 100) / 100;
    const pulpToPitEstimate = Math.round((3.9 + ((seed >> 5) % 16) / 10) * 10) / 10;
    const defectSeverity = Math.round((((seed >> 7) % 12) / 100) * 100) / 100;
    const leafDebrisPct = (seed >> 9) % 5;

    const rolesPresent = new Set(input.photos.map((p) => p.asset.role));
    const hasLowQuality = input.photos.some(
      (p) =>
        p.asset.quality.qualityFlag === "scarsa_luce" ||
        p.asset.quality.qualityFlag === "sfocata"
    );

    // Dynamic supplemental photo requests
    const supplementalRequests: SupplementalPhotoRequest[] = [];

    if (!rolesPresent.has("cross_section")) {
      supplementalRequests.push(
        buildSupplementalRequest(
          "cross_section",
          "Manca una foto in sezione delle olive tagliate: aggiungerla consente di stimare il rapporto polpa/nocciolo e ridurre il margine di incertezza."
        )
      );
    }

    if (hasLowQuality && !rolesPresent.has("supplemental_lighting")) {
      supplementalRequests.push(
        buildSupplementalRequest(
          "supplemental_lighting",
          "Almeno una foto presenta illuminazione non ottimale o nitidezza ridotta: uno scatto a luce diffusa migliora la lettura dell'invaiatura."
        )
      );
    } else if (
      !rolesPresent.has("closeup") &&
      !rolesPresent.has("supplemental_defect")
    ) {
      supplementalRequests.push(
        buildSupplementalRequest(
          "supplemental_defect",
          "È stato acquisito solo il campo panoramico: un dettaglio ravvicinato aiuta a verificare turgore e assenza di punture."
        )
      );
    }

    const baseConfidence =
      0.56 +
      (rolesPresent.has("overview") ? 0.1 : 0) +
      (rolesPresent.has("closeup") ? 0.1 : 0) +
      (rolesPresent.has("cross_section") ? 0.12 : 0) +
      (avgSharp >= 40 ? 0.05 : -0.05) -
      (hasLowQuality ? 0.08 : 0);

    const confidence = Math.min(0.92, Math.max(0.45, Math.round(baseConfidence * 100) / 100));

    const features: VisualMorphologyFeatures = {
      veraisonIndex,
      greenPct,
      turningPct,
      blackPct,
      turgorScore,
      pulpToPitEstimate,
      defectSeverity,
      leafDebrisPct,
      varietyHint: `Profilo morfologico compatibile con ${input.cultivar} (simulazione locale)`,
      confidence,
      summaryNote: `Analisi simulata su ${input.photos.length} scatti (${input.sampleWeightGrams} g): invaiatura stimata ${veraisonIndex.toFixed(1)}/5 con prevalenza di drupe ${
        greenPct >= blackPct ? "verdi e in invaiatura" : "invaiate e scure"
      }.`,
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
