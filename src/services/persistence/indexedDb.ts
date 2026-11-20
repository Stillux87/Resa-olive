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
import { computeYieldPrediction } from "../prediction/yieldEngine";

const DB_NAME = "olivestima_db";
const DB_VERSION = 1;
const STORE_ANALYSES = "analyses";
const STORE_PHOTOS = "photos";
const STORE_SETTINGS = "settings";

const DEFAULT_SETTINGS: AppSettings = {
  aiMode: "simulato_locale",
  defaultDensityKgPerLiter: OLIVE_OIL_DENSITY_KG_PER_LITER,
  seededDemoVersion: 1,
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

const DEMO_OVERVIEW_URL = "/src/assets/images/guide_sample_overview_1795170879644.jpg";
const DEMO_CLOSEUP_URL = "/src/assets/images/guide_sample_closeup_1795170880646.jpg";
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
    // Fallback synthetic canvas image if asset cannot be fetched
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

export async function seedDemoDataIfEmpty(forceReset = false): Promise<void> {
  const alreadySeeded = await getSettingValue<boolean>("demo_seeded_v1");
  if (alreadySeeded && !forceReset) {
    return;
  }

  const db = await openDatabase();

  if (forceReset) {
    const clearTx = db.transaction([STORE_ANALYSES, STORE_PHOTOS], "readwrite");
    clearTx.objectStore(STORE_ANALYSES).clear();
    clearTx.objectStore(STORE_PHOTOS).clear();
    await txPromise(clearTx);
    for (const key of previewUrlMap.keys()) {
      revokePreviewUrl(key);
    }
  } else {
    const countTx = db.transaction(STORE_ANALYSES, "readonly");
    const countReq = countTx.objectStore(STORE_ANALYSES).count();
    const existingCount = (await txPromise<number>(countTx, countReq)) ?? 0;
    if (existingCount > 0) {
      await setSettingValue("demo_seeded_v1", true);
      return;
    }
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
    roles: Array<{ role: PhotoAsset["role"]; url: string }>;
    features: VisualMorphologyFeatures;
    status: OliveAnalysisRecord["status"];
    supplementalRequests: SupplementalPhotoRequest[];
    millOutcome?: MillOutcome;
  }> = [
    {
      id: "demo_os_2026_001",
      code: "OS-2026-001",
      title: "Podere San Lorenzo · Collina Nord",
      cultivar: "Frantoio",
      groveLocation: "Greve in Chianti (FI)",
      harvestDate: "2026-10-28",
      createdAt: "2026-10-28T09:15:00.000Z",
      sampleWeightGrams: 620,
      lotWeightKg: 480,
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
        turgorScore: 0.78,
        pulpToPitEstimate: 4.6,
        defectSeverity: 0.03,
        leafDebrisPct: 1,
        varietyHint: "Drupe ellissoidali medie tipiche di Frantoio (dati simulati)",
        confidence: 0.84,
        summaryNote:
          "Campione dimostrativo simulato: invaiatura ottimale al 64% tra violacee e scure con polpa soda.",
        isSimulated: true,
      },
      status: "verificata_frantoio",
      supplementalRequests: [],
      millOutcome: {
        actualYieldPct: 16.4,
        actualOilKg: 78.7,
        actualOilLiters: 85.9,
        lotWeightKg: 480,
        millName: "Frantoio Sociale del Chianti",
        extractionMethod: "continuo_2_fasi",
        recordedAt: "2026-10-29T18:20:00.000Z",
        notes: "Molitura a freddo entro 10 ore dalla raccolta (dato dimostrativo simulato).",
      },
    },
    {
      id: "demo_os_2026_002",
      code: "OS-2026-002",
      title: "Tenuta Valle Chiara · Particella 4",
      cultivar: "Coratina",
      groveLocation: "Andria (BT)",
      harvestDate: "2026-11-04",
      createdAt: "2026-11-04T11:30:00.000Z",
      sampleWeightGrams: 540,
      lotWeightKg: 850,
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
        turgorScore: 0.74,
        pulpToPitEstimate: 4.9,
        defectSeverity: 0.04,
        leafDebrisPct: 1.5,
        varietyHint: "Calibro regolare e polpa compatta tipica di Coratina (dati simulati)",
        confidence: 0.86,
        summaryNote:
          "Campione dimostrativo simulato: elevata densità lipidica attesa su lotto Coratina in piena invaiatura.",
        isSimulated: true,
      },
      status: "verificata_frantoio",
      supplementalRequests: [],
      millOutcome: {
        actualYieldPct: 18.8,
        actualOilKg: 159.8,
        actualOilLiters: 174.5,
        lotWeightKg: 850,
        millName: "Oleificio Murgia Alta",
        extractionMethod: "continuo_2_fasi",
        recordedAt: "2026-11-05T17:40:00.000Z",
        notes: "Partita asciutta dopo 6 giorni senza piogge (dato dimostrativo simulato).",
      },
    },
    {
      id: "demo_os_2026_003",
      code: "OS-2026-003",
      title: "Oliveto Terrazze Ovest",
      cultivar: "Moraiolo",
      groveLocation: "Spoleto (PG)",
      harvestDate: "2026-11-11",
      createdAt: "2026-11-11T15:05:00.000Z",
      sampleWeightGrams: 460,
      lotWeightKg: 260,
      roles: [{ role: "overview", url: DEMO_OVERVIEW_URL }],
      features: {
        veraisonIndex: 2.5,
        greenPct: 48,
        turningPct: 36,
        blackPct: 16,
        turgorScore: 0.7,
        pulpToPitEstimate: 4.1,
        defectSeverity: 0.05,
        leafDebrisPct: 2,
        varietyHint: "Drupe piccole sferiche Moraiolo (dati simulati)",
        confidence: 0.64,
        summaryNote:
          "Campione dimostrativo simulato: solo scatto panoramico disponibile; consigliato scatto in sezione per ridurre il margine.",
        isSimulated: true,
      },
      status: "richiesta_foto",
      supplementalRequests: [
        {
          id: "req_cross_section",
          role: "cross_section",
          title: "Sezione trasversale (olive tagliate)",
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
      code: "OS-2026-004",
      title: "Campo Ulivi Sud · Raccolta Precoce",
      cultivar: "Leccino",
      groveLocation: "Ostuni (BR)",
      harvestDate: "2026-11-16",
      createdAt: "2026-11-16T08:45:00.000Z",
      sampleWeightGrams: 550,
      lotWeightKg: 410,
      roles: [
        { role: "overview", url: DEMO_OVERVIEW_URL },
        { role: "closeup", url: DEMO_CLOSEUP_URL },
      ],
      features: {
        veraisonIndex: 2.3,
        greenPct: 52,
        turningPct: 35,
        blackPct: 13,
        turgorScore: 0.81,
        pulpToPitEstimate: 4.4,
        defectSeverity: 0.02,
        leafDebrisPct: 1,
        varietyHint: "Invaiatura precoce omogenea Leccino (dati simulati)",
        confidence: 0.77,
        summaryNote:
          "Campione dimostrativo simulato: raccolta precoce per olio fruttato intenso, in attesa di conferma al frantoio.",
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
    const prediction: PredictionResult = computeYieldPrediction({
      cultivar: spec.cultivar,
      sampleWeightGrams: spec.sampleWeightGrams,
      lotWeightKg: spec.lotWeightKg,
      photos: assets,
      features: spec.features,
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
      status: spec.status,
      photos: assets.map(({ previewUrl: _omit, ...rest }) => rest),
      supplementalRequests: spec.supplementalRequests,
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

export async function listAnalyses(): Promise<OliveAnalysisRecord[]> {
  await seedDemoDataIfEmpty(false);
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

  const list = (analysesRaw ?? []).map((record) => ({
    ...record,
    photos: photosByAnalysis.get(record.id) ?? record.photos,
  }));

  list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return list;
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

  return {
    ...record,
    photos: hydratedPhotos.length > 0 ? hydratedPhotos : record.photos,
  };
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
  const all = await listAnalyses();
  const year = new Date().getFullYear();
  const nextNum = all.length + 1;
  return `OS-${year}-${String(nextNum).padStart(3, "0")}`;
}

export async function getIndexedDbStorageSummary(): Promise<{
  analysesCount: number;
  photosCount: number;
  totalPhotoBytes: number;
}> {
  const db = await openDatabase();
  const tx = db.transaction([STORE_ANALYSES, STORE_PHOTOS], "readonly");
  const analysesReq = tx.objectStore(STORE_ANALYSES).count();
  const photosReq = tx.objectStore(STORE_PHOTOS).getAll();

  const [analysesCount, photoRows] = await Promise.all([
    txPromise<number>(tx, analysesReq),
    txPromise<StoredPhotoRow[]>(tx, photosReq),
  ]);

  const rows = photoRows ?? [];
  const totalPhotoBytes = rows.reduce((sum, r) => sum + (r.blob?.size ?? 0), 0);

  return {
    analysesCount: analysesCount ?? 0,
    photosCount: rows.length,
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
