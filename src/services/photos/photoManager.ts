import type {
  PhotoAsset,
  PhotoQualityMetrics,
  PhotoSource,
  SamplePhotoRole,
} from "../../types/analysis";
import { PHOTO_ROLE_LABELS } from "../../types/analysis";

export interface ProcessedPhotoResult {
  asset: PhotoAsset;
  blob: Blob;
  previewUrl: string;
}

const MAX_DIMENSION_PX = 1280;
const JPEG_QUALITY = 0.84;

function generateId(prefix: string): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Impossibile decodificare l'immagine selezionata."));
    img.src = src;
  });
}

/**
 * Computes real pixel-level brightness, contrast spread, and edge gradient sharpness
 * directly in the browser via Canvas 2D without external network calls.
 */
function analyzeCanvasPixels(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number
): PhotoQualityMetrics {
  const sampleW = Math.min(width, 240);
  const sampleH = Math.max(1, Math.round((height / width) * sampleW));
  const offscreen = document.createElement("canvas");
  offscreen.width = sampleW;
  offscreen.height = sampleH;
  const offCtx = offscreen.getContext("2d");

  if (!offCtx) {
    return {
      meanLuminance: 128,
      contrastSpread: 45,
      sharpnessScore: 60,
      qualityFlag: "accettabile",
    };
  }

  offCtx.drawImage(ctx.canvas, 0, 0, sampleW, sampleH);
  const { data } = offCtx.getImageData(0, 0, sampleW, sampleH);
  const totalPixels = sampleW * sampleH;
  const lum = new Float32Array(totalPixels);

  let sum = 0;
  for (let i = 0; i < totalPixels; i++) {
    const idx = i * 4;
    const y = 0.2126 * data[idx] + 0.7152 * data[idx + 1] + 0.0722 * data[idx + 2];
    lum[i] = y;
    sum += y;
  }

  const meanLuminance = sum / totalPixels;

  let varianceSum = 0;
  let edgeSum = 0;
  let edgeCount = 0;

  for (let row = 0; row < sampleH; row++) {
    for (let col = 0; col < sampleW; col++) {
      const idx = row * sampleW + col;
      const diff = lum[idx] - meanLuminance;
      varianceSum += diff * diff;

      if (col < sampleW - 1 && row < sampleH - 1) {
        const gx = Math.abs(lum[idx] - lum[idx + 1]);
        const gy = Math.abs(lum[idx] - lum[idx + sampleW]);
        edgeSum += gx + gy;
        edgeCount++;
      }
    }
  }

  const stdDev = Math.sqrt(varianceSum / totalPixels);
  const contrastSpread = Math.min(100, Math.round((stdDev / 72) * 100));
  const meanEdge = edgeCount > 0 ? edgeSum / edgeCount : 10;
  const sharpnessScore = Math.min(100, Math.round((meanEdge / 26) * 100));

  let qualityFlag: PhotoQualityMetrics["qualityFlag"] = "accettabile";
  if (meanLuminance < 58 || meanLuminance > 228) {
    qualityFlag = "scarsa_luce";
  } else if (sharpnessScore < 22) {
    qualityFlag = "sfocata";
  } else if (contrastSpread >= 40 && sharpnessScore >= 42) {
    qualityFlag = "ottima";
  }

  return {
    meanLuminance: Math.round(meanLuminance),
    contrastSpread,
    sharpnessScore,
    qualityFlag,
  };
}

function canvasToJpegBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Compressione JPEG non riuscita."));
          return;
        }
        resolve(blob);
      },
      "image/jpeg",
      JPEG_QUALITY
    );
  });
}

export async function processImageBlob(params: {
  blob: Blob;
  analysisId: string;
  role: SamplePhotoRole;
  source: PhotoSource;
}): Promise<ProcessedPhotoResult> {
  const objectUrl = URL.createObjectURL(params.blob);
  try {
    const img = await loadImageElement(objectUrl);
    const scale = Math.min(1, MAX_DIMENSION_PX / Math.max(img.width, img.height));
    const width = Math.max(1, Math.round(img.width * scale));
    const height = Math.max(1, Math.round(img.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Contesto Canvas non disponibile.");
    }

    ctx.drawImage(img, 0, 0, width, height);
    const quality = analyzeCanvasPixels(ctx, width, height);
    const compressedBlob = await canvasToJpegBlob(canvas);
    const previewUrl = URL.createObjectURL(compressedBlob);

    const asset: PhotoAsset = {
      id: generateId("photo"),
      analysisId: params.analysisId,
      role: params.role,
      label: PHOTO_ROLE_LABELS[params.role],
      source: params.source,
      mimeType: "image/jpeg",
      width,
      height,
      sizeBytes: compressedBlob.size,
      capturedAt: new Date().toISOString(),
      quality,
      previewUrl,
    };

    return {
      asset,
      blob: compressedBlob,
      previewUrl,
    };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export async function processPublicImageAsset(params: {
  url: string;
  analysisId: string;
  role: SamplePhotoRole;
  source?: PhotoSource;
}): Promise<ProcessedPhotoResult> {
  const response = await fetch(params.url);
  if (!response.ok) {
    throw new Error(`Impossibile caricare l'immagine di riferimento: ${params.url}`);
  }
  const blob = await response.blob();
  return processImageBlob({
    blob,
    analysisId: params.analysisId,
    role: params.role,
    source: params.source ?? "demo",
  });
}

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      const commaIdx = result.indexOf(",");
      resolve(commaIdx >= 0 ? result.slice(commaIdx + 1) : result);
    };
    reader.onerror = () => reject(new Error("Errore nella lettura del file immagine."));
    reader.readAsDataURL(blob);
  });
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
