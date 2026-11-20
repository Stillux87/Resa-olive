import type {
  AppSettings,
  MillOutcome,
  OliveAnalysisRecord,
  PhotoAsset,
  PredictionResult,
  SupplementalPhotoRequest,
  VisualMorphologyFeatures,
} from "../../types/analysis";
import { OLIVE_OIL_DENSITY_KG_PER_LITER } from "../../types/analysis";
import { processPublicImageAsset } from "../photos/photoManager";
import { isDemoAnalysis } from "../prediction/calibration";
import { computeHarvestAdvice } from "../prediction/harvestAdvice";
import {
  buildDefaultSampleData,
  computeYieldPrediction,
} from "../prediction/yieldEngine";

const DB_NAME = "olivestima_db";
const DB_VERSION = 1;
const STORE_ANALYSES = "analyses";
const STORE_PHOTOS = "photos";
const STORE_SETTINGS = "settings";

const DEFAULT_SETTINGS: AppSettings = {
  aiMode: "gemini_backend",
  defaultDensityKgPerLiter: OLIVE_OIL_DENSITY_KG_PER_LITER,
  seededDemoVersion: 2,
};

interface StoredPhotoRow {
  id: string;
  analysisId: string;
  blob: Blob;
  asset: Omit<PhotoAsset, "previewUrl">;
}

interface StoredSettingRow {
  key: string;
  value: unknown;
}

const previewUrlMap = new Map<string, string>();

function getOrCreatePreviewUrl(photoId: string, blob: Blob): string {
  const existing = previewUrlMap.get(photoId);
  if (existing) {
    return existing;
  }
  const url = URL.createObjectURL(blob);
  previewUrlMap.set(photoId, url);
  return url;
}

function revokePreviewUrl(photoId: string): void {
  const existing = previewUrlMap.get(photoId);
  if (existing) {
    URL.revokeObjectURL(existing);
    previewUrlMap.delete(photoId);
  }
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_ANALYSES)) {
        const store = db.createObjectStore(STORE_ANALYSES, { keyPath: "id" });
        store.createIndex("createdAt", "createdAt", { unique: false });
        store.createIndex("status", "status", { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_PHOTOS)) {
        const photoStore = db.createObjectStore(STORE_PHOTOS, { keyPath: "id" });
        photoStore.createIndex("analysisId", "analysisId", { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_SETTINGS)) {
        db.createObjectStore(STORE_SETTINGS, { keyPath: "key" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("Errore apertura archivio IndexedDB."));
  });
}

function txPromise<T>(
  tx: IDBTransaction,
  request?: IDBRequest<T>
): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    let resultValue: T | undefined;
    if (request) {
      request.onsuccess = () => {
        resultValue = request.result;
      };
      request.onerror = () => {
        reject(request.error ?? new Error("Errore operazione IndexedDB."));
      };
    }
    tx.oncomplete = () => resolve(resultValue);
    tx.onerror = () =>
      reject(tx.error ?? new Error("Transazione IndexedDB fallita."));
    tx.onabort = () =>
      reject(tx.error ?? new Error("Transazione IndexedDB annullata."));
  });
}

async function getSettingValue<T>(key: string): Promise<T | undefined> {
  const db = await openDatabase();
  const tx = db.transaction(STORE_SETTINGS, "readonly");
  const req = tx.objectStore(STORE_SETTINGS).get(key);
  const row = (await txPromise<StoredSettingRow | undefined>(tx, req)) as
    | StoredSettingRow
    | undefined;
  return row?.value as T | undefined;
}

async function setSettingValue(key: string, value: unknown): Promise<void> {
  const db = await openDatabase();
  const tx = db.transaction(STORE_SETTINGS, "readwrite");
  tx.objectStore(STORE_SETTINGS).put({ key, value });
  await txPromise(tx);
}

export async function getAppSettings(): Promise<AppSettings> {
  const stored = await getSettingValue<Partial<AppSettings>>("app_settings");
  if (!stored) {
    return { ...DEFAULT_SETTINGS };
  }
  return {
    ...DEFAULT_SETTINGS,
    ...stored,
  };
}

export async function updateAppSettings(
  patch: Partial<AppSettings>
): Promise<AppSettings> {
  const current = await getAppSettings();
  const next: AppSettings = { ...current, ...patch };
  await setSettingValue("app_settings", next);
  return next;
}

/**
 * Non-destructive record hydration for V1 -> V2 compatibility.
 * Preserves all original stored values and measurements.
 */
function normalizeAnalysisRecord(
  record: OliveAnalysisRecord,
  hydratedPhotos?: PhotoAsset[]
): OliveAnalysisRecord {
  const isDemo = isDemoAnalysis(record);
  const sampleData =
    record.sampleData ?? buildDefaultSampleData(record.visualFeatures);

  let prediction = record.prediction;
  if (prediction) {
    const density =
      prediction.oilDensityKgPerLiter || OLIVE_OIL_DENSITY_KG_PER_LITER;
    const minYieldPct =
      prediction.minYieldPct ?? prediction.uncertaintyIntervalPct[0];
    const maxYieldPct =
      prediction.maxYieldPct ?? prediction.uncertaintyIntervalPct[1];
    const oilKgPer100Kg =
      prediction.oilKgPer100Kg ?? prediction.predictedYieldPct;
    const oilLitersPer100Kg =
      prediction.oilLitersPer100Kg ??
      Math.round((oilKgPer100Kg / density) * 10) / 10;
    const oilKgPer100KgRange: [number, number] =
      prediction.oilKgPer100KgRange ?? [minYieldPct, maxYieldPct];
    const oilLitersPer100KgRange: [number, number] =
      prediction.oilLitersPer100KgRange ?? [
        Math.round((minYieldPct / density) * 10) / 10,
        Math.round((maxYieldPct / density) * 10) / 10,
      ];

    const harvestAdvice =
      prediction.harvestAdvice ??
      (record.visualFeatures
        ? computeHarvestAdvice({
            cultivar: record.cultivar,
            predictedYieldPct: prediction.predictedYieldPct,
            cultivarBaseYieldPct: 15.5,
            features: record.visualFeatures,
            sampleData,
          })
        : undefined);

    prediction = {
      ...prediction,
      minYieldPct,
      maxYieldPct,
      oilKgPer100Kg,
      oilLitersPer100Kg,
      oilKgPer100KgRange,
      oilLitersPer100KgRange,
      harvestAdvice,
    };
  }

  return {
    ...record,
    isDemo,
    sampleData,
    prediction,
    photos:
      hydratedPhotos && hydratedPhotos.length > 0
        ? hydratedPhotos
        : record.photos,
  };
}

const DEMO_OVERVIEW_URL =
  "/src/assets/images/guide_sample_overview_1795170879644.jpg";
const DEMO_CLOSEUP_URL =
  "/src/assets/images/guide_sample_closeup_1795170880646.jpg";
const DEMO_CUT_URL = "/src/assets/images/guide_sample_cut_1795170879980.jpg";

async function safeDemoPhoto(
  url: string,
  analysisId: string,
  role: PhotoAsset["role"]
) {
  try {
    return await processPublicImageAsset({
      url,
      analysisId,
      role,
      source: "demo",
    });
  } catch {
    const canvas = document.createElement("canvas");
    canvas.width = 640;
    canvas.height = 480;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.fillStyle = "#EFF2EC";
      ctx.fillRect(0, 0, 640, 480);
      ctx.fillStyle = "#425E36";
      for (let i = 0; i < 18; i++) {
        ctx.beginPath();
        ctx.ellipse(
          90 + (i % 6) * 90,
          120 + Math.floor(i / 6) * 110,
          24,
          16,
          0.3,
          0,
          Math.PI * 2
        );
        ctx.fill();
      }
    }
    const blob = await new Promise<Blob>((resolve) =>
      canvas.toBlob((b) => resolve(b ?? new Blob()), "image/jpeg", 0.85)
    );
    const previewUrl = URL.createObjectURL(blob);
    return {
      asset: {
        id: `photo_${analysisId}_${role}`,
        analysisId,
        role,
        label: role,
        source: "demo" as const,
        mimeType: "image/jpeg",
        width: 640,
        height: 480,
        sizeBytes: blob.size,
        capturedAt: new Date().toISOString(),
        quality: {
          meanLuminance: 145,
          contrastSpread: 55,
          sharpnessScore: 68,
          qualityFlag: "ottima" as const,
        },
        previewUrl,
      },
      blob,
      previewUrl,
    };
  }
}

/**
 * Seeds initial demo samples ONLY on fresh install when DB is empty,
 * or restores demo samples WITHOUT touching any real user analyses.
 */
export async function seedDemoDataIfEmpty(forceRestoreDemo = false): Promise<void> {
  const alreadySeeded = await getSettingValue<boolean>("demo_seeded_v1");
  if (alreadySeeded && !forceRestoreDemo) {
    return;
  }

  const db = await openDatabase();

  if (!forceRestoreDemo) {
    const countTx = db.transaction(STORE_ANALYSES, "readonly");
    const countReq = countTx.objectStore(STORE_ANALYSES).count();
    const existingCount = (await txPromise<number>(countTx, countReq)) ?? 0;
    if (existingCount > 0) {
      await setSettingValue("demo_seeded_v1", true);
      return;
    }
  } else {
    // Only delete existing demo records; preserve all real user analyses!
    await deleteAllDemoAnalyses();
  }

  const demoSpecs: Array<{
    id: string;
    code: string;
    title: string;
    cultivar: OliveAnalysisRecord["cultivar"];
    groveLocation: string;
    harvestDate: string;
    createdAt: string;
    sampleWeightGrams: number;
    lotWeightKg: number;
    oliveCount: number;
    roles: Array<{ role: PhotoAsset["role"]; url: string }>;
    features: VisualMorphologyFeatures;
    status: OliveAnalysisRecord["status"];
    supplementalRequests: SupplementalPhotoRequest[];
    millOutcome?: MillOutcome;
  }> = [
    {
      id: "demo_os_2026_001",
      code: "DEMO-001",
      title: "Podere San Lorenzo · Collina Nord (Demo)",
      cultivar: "Frantoio",
      groveLocation: "Greve in Chianti (FI)",
      harvestDate: "2026-10-28",
      createdAt: "2026-10-28T09:15:00.000Z",
      sampleWeightGrams: 1000,
      lotWeightKg: 480,
      oliveCount: 410,
      roles: [
        { role: "overview", url: DEMO_OVERVIEW_URL },
        { role: "closeup", url: DEMO_CLOSEUP_URL },
        { role: "cross_section", url: DEMO_CUT_URL },
      ],
      features: {
        veraisonIndex: 2.9,
        greenPct: 36,
        turningPct: 44,
        blackPct: 20,
        maturationUniformity: "media",
        apparentAverageSize: "media",
        consistency: "soda",
        shrivelingDetected: false,
        dehydrationLevel: "assente",
        turgorScore: 0.78,
        pulpToPitObservable: true,
        pulpToPitEstimate: 4.6,
        visibleDefectsPct: 3,
        oliveFlySignsPct: 1,
        defectSeverity: 0.03,
        leafDebrisPct: 1,
        varietyHint: "Drupe ellissoidali medie tipiche di Frantoio (dato dimostrativo)",
        confidence: 0.84,
        imageQualitySufficient: true,
        qualityIssues: [],
        summaryNote:
          "Campione dimostrativo simulato: invaiatura equilibrata (64% invaiate/scure) e polpa soda.",
        isSimulated: true,
      },
      status: "verificata_frantoio",
      supplementalRequests: [],
      millOutcome: {
        actualYieldPct: 16.4,
        actualOilKg: 78.7,
        actualOilLiters: 85.9,
        lotWeightKg: 480,
        harvestDate: "2026-10-29",
        millName: "Frantoio Sociale del Chianti (Demo)",
        extractionMethod: "continuo_2_fasi",
        recordedAt: "2026-10-29T18:20:00.000Z",
        notes: "Molitura dimostrativa simulata entro 10 ore dalla raccolta.",
      },
    },
    {
      id: "demo_os_2026_002",
      code: "DEMO-002",
      title: "Tenuta Valle Chiara · Particella 4 (Demo)",
      cultivar: "Coratina",
      groveLocation: "Andria (BT)",
      harvestDate: "2026-11-04",
      createdAt: "2026-11-04T11:30:00.000Z",
      sampleWeightGrams: 980,
      lotWeightKg: 850,
      oliveCount: 315,
      roles: [
        { role: "overview", url: DEMO_OVERVIEW_URL },
        { role: "closeup", url: DEMO_CLOSEUP_URL },
        { role: "cross_section", url: DEMO_CUT_URL },
      ],
      features: {
        veraisonIndex: 3.3,
        greenPct: 24,
        turningPct: 46,
        blackPct: 30,
        maturationUniformity: "alta",
        apparentAverageSize: "grande",
        consistency: "soda",
        shrivelingDetected: false,
        dehydrationLevel: "lieve",
        turgorScore: 0.74,
        pulpToPitObservable: true,
        pulpToPitEstimate: 4.9,
        visibleDefectsPct: 4,
        oliveFlySignsPct: 2,
        defectSeverity: 0.04,
        leafDebrisPct: 1.5,
        varietyHint: "Calibro regolare e polpa compatta (dato dimostrativo)",
        confidence: 0.86,
        imageQualitySufficient: true,
        qualityIssues: [],
        summaryNote:
          "Campione dimostrativo simulato: elevato potenziale lipidico su Coratina in piena invaiatura.",
        isSimulated: true,
      },
      status: "verificata_frantoio",
      supplementalRequests: [],
      millOutcome: {
        actualYieldPct: 18.8,
        actualOilKg: 159.8,
        actualOilLiters: 174.5,
        lotWeightKg: 850,
        harvestDate: "2026-11-05",
        millName: "Oleificio Murgia Alta (Demo)",
        extractionMethod: "continuo_2_fasi",
        recordedAt: "2026-11-05T17:40:00.000Z",
        notes: "Partita asciutta dimostrativa.",
      },
    },
    {
      id: "demo_os_2026_003",
      code: "DEMO-003",
      title: "Oliveto Terrazze Ovest (Demo)",
      cultivar: "Moraiolo",
      groveLocation: "Spoleto (PG)",
      harvestDate: "2026-11-11",
      createdAt: "2026-11-11T15:05:00.000Z",
      sampleWeightGrams: 1020,
      lotWeightKg: 260,
      oliveCount: 510,
      roles: [{ role: "overview", url: DEMO_OVERVIEW_URL }],
      features: {
        veraisonIndex: 2.5,
        greenPct: 48,
        turningPct: 36,
        blackPct: 16,
        maturationUniformity: "media",
        apparentAverageSize: "piccola",
        consistency: "media",
        shrivelingDetected: false,
        dehydrationLevel: "assente",
        turgorScore: 0.7,
        pulpToPitObservable: false,
        pulpToPitEstimate: null,
        visibleDefectsPct: 6,
        oliveFlySignsPct: 4,
        defectSeverity: 0.06,
        leafDebrisPct: 2,
        varietyHint: "Drupe piccole sferiche (dato dimostrativo)",
        confidence: 0.64,
        imageQualitySufficient: true,
        qualityIssues: ["Manca foto di olive tagliate per il rapporto polpa/nocciolo."],
        summaryNote:
          "Campione dimostrativo simulato: solo vista dall'alto presente, intervallo più ampio.",
        isSimulated: true,
      },
      status: "richiesta_foto",
      supplementalRequests: [
        {
          id: "req_cross_section",
          role: "cross_section",
          title: "Olive tagliate a metà (polpa/nocciolo)",
          instruction:
            "Taglia a metà nel senso della lunghezza 3 olive rappresentative e fotografale dall'alto su fondo chiaro.",
          reason:
            "Manca la sezione interna: aggiungerla aiuta a calibrare il rapporto polpa/nocciolo e ridurre l'intervallo di incertezza.",
          expectedUncertaintyReductionPct: 0.5,
          required: false,
        },
      ],
    },
    {
      id: "demo_os_2026_004",
      code: "DEMO-004",
      title: "Campo Ulivi Sud · Raccolta Precoce (Demo)",
      cultivar: "Leccino",
      groveLocation: "Ostuni (BR)",
      harvestDate: "2026-11-16",
      createdAt: "2026-11-16T08:45:00.000Z",
      sampleWeightGrams: 990,
      lotWeightKg: 410,
      oliveCount: 440,
      roles: [
        { role: "overview", url: DEMO_OVERVIEW_URL },
        { role: "closeup", url: DEMO_CLOSEUP_URL },
      ],
      features: {
        veraisonIndex: 2.0,
        greenPct: 58,
        turningPct: 30,
        blackPct: 12,
        maturationUniformity: "alta",
        apparentAverageSize: "media",
        consistency: "soda",
        shrivelingDetected: false,
        dehydrationLevel: "assente",
        turgorScore: 0.81,
        pulpToPitObservable: false,
        pulpToPitEstimate: null,
        visibleDefectsPct: 2,
        oliveFlySignsPct: 1,
        defectSeverity: 0.02,
        leafDebrisPct: 1,
        varietyHint: "Invaiatura precoce omogenea (dato dimostrativo)",
        confidence: 0.77,
        imageQualitySufficient: true,
        qualityIssues: [],
        summaryNote:
          "Campione dimostrativo simulato: raccolta precoce per olio fruttato intenso.",
        isSimulated: true,
      },
      status: "completata",
      supplementalRequests: [],
    },
  ];

  for (const spec of demoSpecs) {
    const processedPhotos = await Promise.all(
      spec.roles.map((r) => safeDemoPhoto(r.url, spec.id, r.role))
    );

    const assets = processedPhotos.map((p) => p.asset);
    const sampleData = {
      ...buildDefaultSampleData(spec.features),
      oliveCount: spec.oliveCount,
    };

    const prediction: PredictionResult = computeYieldPrediction({
      cultivar: spec.cultivar,
      sampleWeightGrams: spec.sampleWeightGrams,
      lotWeightKg: spec.lotWeightKg,
      photos: assets,
      features: spec.features,
      sampleData,
    });

    const record: OliveAnalysisRecord = {
      id: spec.id,
      code: spec.code,
      title: spec.title,
      cultivar: spec.cultivar,
      groveLocation: spec.groveLocation,
      harvestDate: spec.harvestDate,
      sampleWeightGrams: spec.sampleWeightGrams,
      lotWeightKg: spec.lotWeightKg,
      isDemo: true,
      status: spec.status,
      photos: assets.map(({ previewUrl: _omit, ...rest }) => rest),
      supplementalRequests: spec.supplementalRequests,
      sampleData,
      visualFeatures: spec.features,
      prediction,
      millOutcome: spec.millOutcome,
      dataOrigin: "simulato_demo",
      createdAt: spec.createdAt,
      updatedAt: spec.createdAt,
    };

    await saveAnalysisWithPhotos(
      record,
      processedPhotos.map((p) => ({ asset: p.asset, blob: p.blob }))
    );
  }

  await setSettingValue("demo_seeded_v1", true);
}

export async function deleteAllDemoAnalyses(): Promise<number> {
  const all = await listAnalysesRaw();
  const demos = all.filter((r) => isDemoAnalysis(r));
  for (const d of demos) {
    await deleteAnalysisFromDb(d.id);
  }
  await setSettingValue("demo_seeded_v1", true);
  return demos.length;
}

export async function saveAnalysisWithPhotos(
  record: OliveAnalysisRecord,
  photoPayloads: Array<{ asset: PhotoAsset; blob: Blob }>
): Promise<void> {
  const db = await openDatabase();
  const tx = db.transaction([STORE_ANALYSES, STORE_PHOTOS], "readwrite");
  const analysesStore = tx.objectStore(STORE_ANALYSES);
  const photosStore = tx.objectStore(STORE_PHOTOS);

  const sanitizedPhotos = record.photos.map(({ previewUrl: _omit, ...rest }) => rest);
  analysesStore.put({
    ...record,
    isDemo: isDemoAnalysis(record),
    photos: sanitizedPhotos,
  });

  for (const item of photoPayloads) {
    const { previewUrl: _omit, ...cleanAsset } = item.asset;
    const row: StoredPhotoRow = {
      id: item.asset.id,
      analysisId: record.id,
      blob: item.blob,
      asset: cleanAsset,
    };
    photosStore.put(row);
    getOrCreatePreviewUrl(item.asset.id, item.blob);
  }

  await txPromise(tx);
}

async function listAnalysesRaw(): Promise<OliveAnalysisRecord[]> {
  const db = await openDatabase();
  const tx = db.transaction([STORE_ANALYSES, STORE_PHOTOS], "readonly");
  const analysesReq = tx.objectStore(STORE_ANALYSES).getAll();
  const photosReq = tx.objectStore(STORE_PHOTOS).getAll();

  const [analysesRaw, photosRaw] = await Promise.all([
    txPromise<OliveAnalysisRecord[]>(tx, analysesReq),
    txPromise<StoredPhotoRow[]>(tx, photosReq),
  ]);

  const photosByAnalysis = new Map<string, PhotoAsset[]>();
  for (const row of photosRaw ?? []) {
    const url = getOrCreatePreviewUrl(row.id, row.blob);
    const list = photosByAnalysis.get(row.analysisId) ?? [];
    list.push({
      ...row.asset,
      previewUrl: url,
    });
    photosByAnalysis.set(row.analysisId, list);
  }

  const list = (analysesRaw ?? []).map((record) =>
    normalizeAnalysisRecord(record, photosByAnalysis.get(record.id))
  );

  list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return list;
}

export async function listAnalyses(): Promise<OliveAnalysisRecord[]> {
  await seedDemoDataIfEmpty(false);
  return listAnalysesRaw();
}

export async function listRealAnalyses(): Promise<OliveAnalysisRecord[]> {
  const all = await listAnalyses();
  return all.filter((r) => !isDemoAnalysis(r));
}

export async function getAnalysisById(
  id: string
): Promise<OliveAnalysisRecord | null> {
  await seedDemoDataIfEmpty(false);
  const db = await openDatabase();
  const tx = db.transaction([STORE_ANALYSES, STORE_PHOTOS], "readonly");
  const analysisReq = tx.objectStore(STORE_ANALYSES).get(id);
  const photosIndex = tx.objectStore(STORE_PHOTOS).index("analysisId");
  const photosReq = photosIndex.getAll(id);

  const [record, photoRows] = await Promise.all([
    txPromise<OliveAnalysisRecord | undefined>(tx, analysisReq),
    txPromise<StoredPhotoRow[]>(tx, photosReq),
  ]);

  if (!record) return null;

  const hydratedPhotos: PhotoAsset[] = (photoRows ?? []).map((row) => ({
    ...row.asset,
    previewUrl: getOrCreatePreviewUrl(row.id, row.blob),
  }));

  return normalizeAnalysisRecord(record, hydratedPhotos);
}

export async function getPhotoBlobsForAnalysis(
  analysisId: string
): Promise<Array<{ asset: PhotoAsset; blob: Blob }>> {
  const db = await openDatabase();
  const tx = db.transaction(STORE_PHOTOS, "readonly");
  const index = tx.objectStore(STORE_PHOTOS).index("analysisId");
  const req = index.getAll(analysisId);
  const rows = (await txPromise<StoredPhotoRow[]>(tx, req)) ?? [];

  return rows.map((row) => ({
    asset: {
      ...row.asset,
      previewUrl: getOrCreatePreviewUrl(row.id, row.blob),
    },
    blob: row.blob,
  }));
}

export async function updateMillOutcomeInDb(
  analysisId: string,
  outcome: MillOutcome
): Promise<OliveAnalysisRecord> {
  const existing = await getAnalysisById(analysisId);
  if (!existing) {
    throw new Error("Analisi non trovata nell'archivio locale.");
  }

  const updated: OliveAnalysisRecord = {
    ...existing,
    millOutcome: outcome,
    status: "verificata_frantoio",
    updatedAt: new Date().toISOString(),
  };

  await saveAnalysisWithPhotos(updated, []);
  return updated;
}

export async function deleteAnalysisFromDb(analysisId: string): Promise<void> {
  const db = await openDatabase();
  const readTx = db.transaction(STORE_PHOTOS, "readonly");
  const photoRows =
    (await txPromise<StoredPhotoRow[]>(
      readTx,
      readTx.objectStore(STORE_PHOTOS).index("analysisId").getAll(analysisId)
    )) ?? [];

  const writeTx = db.transaction([STORE_ANALYSES, STORE_PHOTOS], "readwrite");
  writeTx.objectStore(STORE_ANALYSES).delete(analysisId);
  const photoStore = writeTx.objectStore(STORE_PHOTOS);
  for (const row of photoRows) {
    photoStore.delete(row.id);
    revokePreviewUrl(row.id);
  }
  await txPromise(writeTx);
}

export async function getNextAnalysisCode(): Promise<string> {
  const allReal = await listRealAnalyses();
  const year = new Date().getFullYear();
  const nextNum = allReal.length + 1;
  return `OS-${year}-${String(nextNum).padStart(3, "0")}`;
}

export async function getIndexedDbStorageSummary(): Promise<{
  analysesCount: number;
  realCount: number;
  demoCount: number;
  photosCount: number;
  totalPhotoBytes: number;
}> {
  const all = await listAnalyses();
  const realCount = all.filter((r) => !isDemoAnalysis(r)).length;
  const demoCount = all.length - realCount;

  const db = await openDatabase();
  const tx = db.transaction(STORE_PHOTOS, "readonly");
  const photosReq = tx.objectStore(STORE_PHOTOS).getAll();
  const photoRows = (await txPromise<StoredPhotoRow[]>(tx, photosReq)) ?? [];
  const totalPhotoBytes = photoRows.reduce((sum, r) => sum + (r.blob?.size ?? 0), 0);

  return {
    analysesCount: all.length,
    realCount,
    demoCount,
    photosCount: photoRows.length,
    totalPhotoBytes,
  };
}

export async function exportAnalysesJson(): Promise<string> {
  const list = await listAnalyses();
  const clean = list.map((item) => ({
    ...item,
    photos: item.photos.map(({ previewUrl: _omit, ...rest }) => rest),
  }));
  return JSON.stringify(clean, null, 2);
}
