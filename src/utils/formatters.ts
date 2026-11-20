import type {
  AnalysisDataOrigin,
  AnalysisStatus,
  DehydrationLevel,
  MaturationUniformity,
  MillEfficiencyPreference,
  MillExtractionMethod,
  OliveConsistency,
  OliveSizeCategory,
  ParameterSource,
  PhotoQualityMetrics,
} from "../types/analysis";

export function formatNumberIt(value: number, decimals = 1): string {
  return value.toLocaleString("it-IT", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function formatPct(value: number, decimals = 1): string {
  return `${formatNumberIt(value, decimals)}%`;
}

export function formatSignedPct(value: number, decimals = 1): string {
  const prefix = value > 0 ? "+" : "";
  return `${prefix}${formatNumberIt(value, decimals)}%`;
}

export function formatKg(value: number, decimals = 1): string {
  return `${formatNumberIt(value, decimals)} kg`;
}

export function formatLiters(value: number, decimals = 1): string {
  return `${formatNumberIt(value, decimals)} L`;
}

export function formatGrams(value: number): string {
  return `${Math.round(value).toLocaleString("it-IT")} g`;
}

export function formatDateIt(isoOrDate: string): string {
  const date = new Date(isoOrDate);
  if (Number.isNaN(date.getTime())) return isoOrDate;
  return date.toLocaleDateString("it-IT", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function getStatusLabel(status: AnalysisStatus): string {
  switch (status) {
    case "bozza":
      return "Bozza";
    case "richiesta_foto":
      return "Foto aggiuntive suggerite";
    case "completata":
      return "Stima completata";
    case "verificata_frantoio":
      return "Verificata al frantoio";
  }
}

export function getOriginLabel(origin: AnalysisDataOrigin): string {
  switch (origin) {
    case "simulato_demo":
      return "Demo simulato";
    case "stima_locale":
      return "Fallback locale simulato";
    case "gemini_backend":
      return "Gemini Vision (reale)";
  }
}

export function getExtractionMethodLabel(method: MillExtractionMethod): string {
  switch (method) {
    case "continuo_2_fasi":
      return "Ciclo continuo a 2 fasi";
    case "continuo_3_fasi":
      return "Ciclo continuo a 3 fasi";
    case "tradizionale":
      return "Estrazione tradizionale a pressione";
  }
}

export function getPhotoQualityLabel(
  flag: PhotoQualityMetrics["qualityFlag"]
): string {
  switch (flag) {
    case "ottima":
      return "Qualità ottima";
    case "accettabile":
      return "Qualità adeguata";
    case "scarsa_luce":
      return "Luce non uniforme";
    case "sfocata":
      return "Nitidezza ridotta";
  }
}

export function getParameterSourceLabel(source?: ParameterSource): string {
  switch (source) {
    case "misurazione_utente":
      return "Misurazione / dato utente";
    case "non_rilevabile":
      return "Non rilevabile da foto";
    case "valutazione_visiva":
    default:
      return "Valutazione visiva AI";
  }
}

export function getSizeLabel(size?: OliveSizeCategory): string {
  switch (size) {
    case "piccola":
      return "Piccola";
    case "grande":
      return "Grande";
    case "media":
    default:
      return "Media";
  }
}

export function getConsistencyLabel(c?: OliveConsistency): string {
  switch (c) {
    case "soda":
      return "Soda";
    case "molle":
      return "Molle";
    case "media":
    default:
      return "Media";
  }
}

export function getDehydrationLabel(d?: DehydrationLevel): string {
  switch (d) {
    case "lieve":
      return "Lieve";
    case "moderata":
      return "Moderata";
    case "marcata":
      return "Marcata";
    case "assente":
    default:
      return "Assente";
  }
}

export function getUniformityLabel(u?: MaturationUniformity): string {
  switch (u) {
    case "alta":
      return "Alta";
    case "bassa":
      return "Bassa";
    case "media":
    default:
      return "Media";
  }
}

export function getMillEfficiencyPrefLabel(p?: MillEfficiencyPreference): string {
  switch (p) {
    case "alta":
      return "Alta (impianto 2 fasi ottimizzato)";
    case "bassa":
      return "Bassa / tradizionale";
    case "standard":
      return "Standard (~84-85%)";
    case "sconosciuta":
    default:
      return "Non conosciuta";
  }
}
