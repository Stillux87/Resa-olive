import type {
  HarvestAdvice,
  OliveCultivar,
  SamplePhysicalData,
  VisualMorphologyFeatures,
} from "../../types/analysis";

export interface HarvestAdviceInput {
  cultivar: OliveCultivar;
  predictedYieldPct: number;
  cultivarBaseYieldPct: number;
  features: VisualMorphologyFeatures;
  sampleData: SamplePhysicalData;
}

/**
 * Computes agronomic harvest timing advice combining predicted yield,
 * maturation state, physical consistency, dehydration, defects, and olive fly risk.
 * Never relies solely on olive color.
 */
export function computeHarvestAdvice(input: HarvestAdviceInput): HarvestAdvice {
  const { features, sampleData, predictedYieldPct, cultivarBaseYieldPct } = input;
  const flyPct = sampleData.oliveFlyPct ?? features.oliveFlySignsPct ?? 0;
  const damagedPct = sampleData.damagedPct ?? features.visibleDefectsPct ?? 0;
  const dehydration = sampleData.dehydrationLevel ?? features.dehydrationLevel ?? "assente";
  const consistency = sampleData.consistency ?? features.consistency ?? "media";
  const veraison = features.veraisonIndex;
  const blackPct = features.blackPct;
  const greenPct = features.greenPct;

  // 1. High deterioration / phytosanitary risk takes priority over waiting for more oil
  const highPhytosanitaryRisk =
    flyPct >= 12 ||
    damagedPct >= 18 ||
    (consistency === "molle" && (damagedPct >= 10 || flyPct >= 6)) ||
    dehydration === "marcata";

  if (highPhytosanitaryRisk) {
    const triggers: string[] = [];
    if (flyPct >= 12) triggers.push(`segni compatibili con mosca (${Math.round(flyPct)}%)`);
    if (damagedPct >= 18) triggers.push(`drupe danneggiate (${Math.round(damagedPct)}%)`);
    if (consistency === "molle") triggers.push("consistenza molle della polpa");
    if (dehydration === "marcata") triggers.push("disidratazione marcata");

    return {
      recommendation:
        "Il rischio di deterioramento potrebbe rendere sconsigliabile attendere",
      urgencyLevel: "rischio",
      rationale: `Le condizioni fisiche osservate (${triggers.join(", ")}) aumentano il rischio di degradazione qualitativa e perdita di resa estraibile al frantoio rispetto a un eventuale lieve incremento lipidico.`,
    };
  }

  // 2. Advanced maturation without acute collapse yet, but diminishing marginal gain
  const advancedMaturation =
    veraison >= 3.7 ||
    blackPct >= 65 ||
    (consistency === "molle" && veraison >= 3.1);

  if (advancedMaturation) {
    return {
      recommendation: "La maturazione appare già avanzata",
      urgencyLevel: "avanzata",
      rationale: `Con indice di invaiatura ${veraison.toFixed(1)}/5 (${Math.round(blackPct)}% drupe scure) e consistenza ${consistency}, l'accumulo di olio è sostanzialmente completo e ulteriori attese espongono a cascola o ossidazione.`,
    };
  }

  // 3. Early maturation with healthy, firm/medium olives where oil synthesis is still active
  const canWaitSafely =
    veraison < 2.2 &&
    greenPct >= 55 &&
    consistency !== "molle" &&
    (dehydration === "assente" || dehydration === "lieve") &&
    flyPct < 5 &&
    damagedPct < 8 &&
    predictedYieldPct < cultivarBaseYieldPct - 0.8;

  if (canWaitSafely) {
    return {
      recommendation: "Potrebbe convenire attendere",
      urgencyLevel: "attendere",
      rationale: `Le drupe risultano sode e sane (difetti ${Math.round(damagedPct)}%, mosca ${Math.round(flyPct)}%) ma ancora prevalentemente verdi (${Math.round(greenPct)}%): salvo esigenze di raccolta precoce per profili aromatici verdi, la resa al frantoio (${predictedYieldPct.toFixed(1)}%) può ancora crescere.`,
    };
  }

  // 4. Optimal balanced harvest window
  return {
    recommendation: "Conviene raccogliere adesso",
    urgencyLevel: "raccogliere",
    rationale: `Buon equilibrio tra resa estraibile stimata (${predictedYieldPct.toFixed(1)}%), stato di invaiatura (${veraison.toFixed(1)}/5) e tenuta fisica del campione (consistenza ${consistency}, danni ${Math.round(damagedPct)}%).`,
  };
}
