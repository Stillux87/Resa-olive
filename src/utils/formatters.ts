import type {
  AnalysisDataOrigin,
  AnalysisStatus,
  MillExtractionMethod,
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
      return "Simulato (Demo)";
    case "stima_locale":
      return "Stima locale simulata";
    case "gemini_backend":
      return "Gemini multimodale";
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
