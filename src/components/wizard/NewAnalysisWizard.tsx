import { useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Camera,
  CheckCircle2,
  ImagePlus,
  Loader2,
  Plus,
  Trash2,
} from "lucide-react";
import {
  useAnalysesQuery,
  useSaveAnalysisMutation,
  useUpdateSettingsMutation,
} from "../../hooks/useOlivestimaQueries";
import {
  runOliveSampleAnalysis,
  type AiAnalysisOutput,
  type AiAnalysisProgressEvent,
} from "../../services/ai";
import { getNextAnalysisCode } from "../../services/persistence/indexedDb";
import {
  formatBytes,
  processImageBlob,
  type ProcessedPhotoResult,
} from "../../services/photos/photoManager";
import { isDemoAnalysis } from "../../services/prediction/calibration";
import {
  buildDefaultSampleData,
  computeYieldPrediction,
} from "../../services/prediction/yieldEngine";
import type {
  AiEngineMode,
  DehydrationLevel,
  MillEfficiencyPreference,
  OliveAnalysisRecord,
  OliveConsistency,
  OliveCultivar,
  OliveSizeCategory,
  SamplePhotoRole,
  SamplePhysicalData,
  SupplementalPhotoRequest,
  VisualMorphologyFeatures,
} from "../../types/analysis";
import {
  CULTIVAR_OPTIONS,
  OLIVE_OIL_DENSITY_KG_PER_LITER,
  PHOTO_ROLE_LABELS,
} from "../../types/analysis";
import {
  formatLiters,
  formatPct,
  getParameterSourceLabel,
  getPhotoQualityLabel,
} from "../../utils/formatters";
import { CameraCaptureModal } from "../camera/CameraCaptureModal";

interface NewAnalysisWizardProps {
  aiMode: AiEngineMode;
  densityKgPerLiter?: number;
  onComplete: (analysisId: string) => void;
  onCancel: () => void;
}

type WizardStep = "metadata" | "photos" | "analyzing" | "review";

const GUIDE_CARDS: Array<{
  role: SamplePhotoRole;
  title: string;
  requiredLabel: string;
  imageUrl: string;
  instruction: string;
}> = [
  {
    role: "overview",
    title: "1. Vista dall'alto (panoramica)",
    requiredLabel: "Obbligatoria",
    imageUrl: "/src/assets/images/guide_sample_overview_1795170879644.jpg",
    instruction:
      "Stendi il campione (~1 kg) in un unico strato su sfondo chiaro e fotografa dall'alto con luce naturale diffusa.",
  },
  {
    role: "closeup",
    title: "2. Vista ravvicinata",
    requiredLabel: "Consigliata",
    imageUrl: "/src/assets/images/guide_sample_closeup_1795170880646.jpg",
    instruction:
      "Inquadra 6–10 olive a 15–20 cm per rendere visibili buccia, raggrinzimenti, difetti e punture di mosca.",
  },
  {
    role: "cross_section",
    title: "3. Olive tagliate a metà",
    requiredLabel: "Opzionale",
    imageUrl: "/src/assets/images/guide_sample_cut_1795170879980.jpg",
    instruction:
      "Taglia 3 olive a metà per lungo: permette a Gemini Vision di valutare il rapporto polpa/nocciolo e ridurre l'incertezza.",
  },
];

function createAnalysisId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `os_${crypto.randomUUID()}`;
  }
  return `os_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function NewAnalysisWizard({
  aiMode,
  densityKgPerLiter = OLIVE_OIL_DENSITY_KG_PER_LITER,
  onComplete,
  onCancel,
}: NewAnalysisWizardProps) {
  const analysisId = useMemo(() => createAnalysisId(), []);
  const analysesQuery = useAnalysesQuery();
  const saveMutation = useSaveAnalysisMutation();
  const updateSettingsMutation = useUpdateSettingsMutation();

  const realHistoricalRecords = useMemo(
    () => (analysesQuery.data ?? []).filter((r) => !isDemoAnalysis(r)),
    [analysesQuery.data]
  );

  const [step, setStep] = useState<WizardStep>("metadata");

  // Step 1: Sample metadata & quantitative physical inputs
  const [title, setTitle] = useState("Lotto Raccolta Oliva");
  const [cultivar, setCultivar] = useState<OliveCultivar>("Frantoio");
  const [groveLocation, setGroveLocation] = useState("");
  const [harvestDate, setHarvestDate] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [sampleWeightGrams, setSampleWeightGrams] = useState<number>(1000);
  const [lotWeightKg, setLotWeightKg] = useState<number>(350);
  const [oliveCountInput, setOliveCountInput] = useState<string>("");
  const [millEfficiencyPref, setMillEfficiencyPref] =
    useState<MillEfficiencyPreference>("standard");
  const [notesInput, setNotesInput] = useState<string>("");
  const [formError, setFormError] = useState<string>("");

  // Step 2: Captured/uploaded photos (supports multiple photos per sample!)
  const [photos, setPhotos] = useState<ProcessedPhotoResult[]>([]);
  const [photoBusy, setPhotoBusy] = useState<boolean>(false);
  const [cameraModalRole, setCameraModalRole] =
    useState<SamplePhotoRole | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [pendingUploadRole, setPendingUploadRole] =
    useState<SamplePhotoRole>("overview");

  // Step 3: AI Analysis Progress
  const [progress, setProgress] = useState<AiAnalysisProgressEvent>({
    stepIndex: 0,
    totalSteps: 4,
    label: "Avvio analisi",
    detail: "Preparazione del campione",
    progressPct: 0,
  });
  const [analysisError, setAnalysisError] = useState<string>("");
  const [aiOutput, setAiOutput] = useState<AiAnalysisOutput | null>(null);
  const [supplementalRequests, setSupplementalRequests] = useState<
    SupplementalPhotoRequest[]
  >([]);

  // Step 4: Editable AI + User Physical Parameters
  const [editableFeatures, setEditableFeatures] =
    useState<VisualMorphologyFeatures | null>(null);
  const [editableSampleData, setEditableSampleData] =
    useState<SamplePhysicalData | null>(null);

  const hasOverview = photos.some((p) => p.asset.role === "overview");

  async function handleAddBlob(
    blob: Blob,
    role: SamplePhotoRole,
    source: "camera" | "upload"
  ) {
    setPhotoBusy(true);
    setFormError("");
    try {
      const processed = await processImageBlob({
        blob,
        analysisId,
        role,
        source,
      });

      // Allow multiple photos for the same sample (even same role if user wants multiple angles)
      setPhotos((prev) => [...prev, processed]);

      setSupplementalRequests((prev) =>
        prev.map((req) =>
          req.role === role
            ? { ...req, fulfilledPhotoId: processed.asset.id }
            : req
        )
      );
    } catch (err) {
      setFormError(
        err instanceof Error
          ? err.message
          : "Impossibile elaborare l'immagine selezionata."
      );
    } finally {
      setPhotoBusy(false);
    }
  }

  function handleRemovePhoto(photoId: string) {
    setPhotos((prev) => prev.filter((p) => p.asset.id !== photoId));
  }

  function handleTriggerUpload(role: SamplePhotoRole) {
    setPendingUploadRole(role);
    fileInputRef.current?.click();
  }

  function validateStep1AndAdvance() {
    if (!title.trim()) {
      setFormError("Inserisci un nome identificativo per il lotto o oliveto.");
      return;
    }
    if (!Number.isFinite(sampleWeightGrams) || sampleWeightGrams < 50) {
      setFormError("Inserisci un peso campione valido (almeno 50 grammi).");
      return;
    }
    if (!Number.isFinite(lotWeightKg) || lotWeightKg < 1) {
      setFormError("Inserisci il peso stimato del lotto di raccolta in kg.");
      return;
    }
    setFormError("");
    setStep("photos");
  }

  async function executeAnalysis(modeOverride?: AiEngineMode) {
    if (photos.length === 0) {
      setFormError("Acquisisci almeno una foto del campione prima di procedere.");
      return;
    }

    const activeMode = modeOverride ?? aiMode;
    setAnalysisError("");
    setStep("analyzing");

    const parsedOliveCount = oliveCountInput.trim()
      ? Math.max(1, Math.round(Number(oliveCountInput)))
      : undefined;

    try {
      const result = await runOliveSampleAnalysis(activeMode, {
        cultivar,
        sampleWeightGrams,
        lotWeightKg,
        oliveCount: parsedOliveCount,
        groveLocation,
        photos: photos.map((p) => ({ asset: p.asset, blob: p.blob })),
        onProgress: (ev) => setProgress(ev),
      });

      setAiOutput(result);
      setSupplementalRequests(result.supplementalRequests);

      const baseSampleData = buildDefaultSampleData(result.features);
      if (parsedOliveCount) {
        baseSampleData.oliveCount = parsedOliveCount;
        baseSampleData.fieldSources.oliveCount = "misurazione_utente";
      }
      baseSampleData.millEfficiencyPreference = millEfficiencyPref;
      baseSampleData.notes = notesInput.trim();

      setEditableFeatures(result.features);
      setEditableSampleData(baseSampleData);
      setStep("review");
    } catch (err) {
      setAnalysisError(
        err instanceof Error
          ? err.message
          : "Errore imprevisto durante l'analisi del campione."
      );
    }
  }

  async function persistAndFinish() {
    if (!aiOutput || !editableFeatures || !editableSampleData) return;

    const code = await getNextAnalysisCode();
    const assets = photos.map((p) => p.asset);
    const prediction = computeYieldPrediction({
      cultivar,
      sampleWeightGrams,
      lotWeightKg,
      photos: assets,
      features: editableFeatures,
      sampleData: editableSampleData,
      realHistoricalRecords,
      densityKgPerLiter,
    });

    const remainingRequests = supplementalRequests.filter(
      (r) => !photos.some((p) => p.asset.role === r.role)
    );

    const now = new Date().toISOString();
    const record: OliveAnalysisRecord = {
      id: analysisId,
      code,
      title: title.trim(),
      cultivar,
      groveLocation: groveLocation.trim() || "Località non specificata",
      harvestDate,
      sampleWeightGrams,
      lotWeightKg,
      isDemo: false,
      status: remainingRequests.length > 0 ? "richiesta_foto" : "completata",
      photos: assets,
      supplementalRequests: remainingRequests,
      sampleData: editableSampleData,
      visualFeatures: editableFeatures,
      prediction,
      dataOrigin: aiOutput.dataOrigin,
      createdAt: now,
      updatedAt: now,
    };

    await saveMutation.mutateAsync({
      record,
      photos: photos.map((p) => ({ asset: p.asset, blob: p.blob })),
    });

    onComplete(record.id);
  }

  const currentStepIndex =
    step === "metadata"
      ? 1
      : step === "photos"
      ? 2
      : step === "analyzing"
      ? 3
      : 4;

  const livePreviewPrediction = useMemo(() => {
    if (!editableFeatures || !editableSampleData) return null;
    return computeYieldPrediction({
      cultivar,
      sampleWeightGrams,
      lotWeightKg,
      photos: photos.map((p) => p.asset),
      features: editableFeatures,
      sampleData: editableSampleData,
      realHistoricalRecords,
      densityKgPerLiter,
    });
  }, [
    editableFeatures,
    editableSampleData,
    cultivar,
    sampleWeightGrams,
    lotWeightKg,
    photos,
    realHistoricalRecords,
    densityKgPerLiter,
  ]);

  function updateGreenTurningBlack(field: "greenPct" | "turningPct" | "blackPct", val: number) {
    if (!editableFeatures || !editableSampleData) return;
    const clamped = Math.min(100, Math.max(0, Math.round(val)));
    let g = editableFeatures.greenPct;
    let t = editableFeatures.turningPct;
    let b = editableFeatures.blackPct;

    if (field === "greenPct") {
      g = clamped;
      const rem = 100 - g;
      const tb = t + b;
      t = tb > 0 ? Math.round((t / tb) * rem) : Math.round(rem / 2);
      b = Math.max(0, 100 - g - t);
    } else if (field === "turningPct") {
      t = clamped;
      const rem = 100 - t;
      const gb = g + b;
      g = gb > 0 ? Math.round((g / gb) * rem) : Math.round(rem / 2);
      b = Math.max(0, 100 - g - t);
    } else {
      b = clamped;
      const rem = 100 - b;
      const gt = g + t;
      g = gt > 0 ? Math.round((g / gt) * rem) : Math.round(rem / 2);
      t = Math.max(0, 100 - g - b);
    }

    // Recompute Jaen veraison index coherently (0*g + 2.5*t + 5*b)/100
    const veraisonIndex =
      Math.round(((t * 2.5 + b * 5.0) / 100) * 10) / 10;

    setEditableFeatures({
      ...editableFeatures,
      greenPct: g,
      turningPct: t,
      blackPct: b,
      veraisonIndex,
    });
    setEditableSampleData({
      ...editableSampleData,
      fieldSources: {
        ...editableSampleData.fieldSources,
        maturation: "misurazione_utente",
      },
    });
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header + Step Progress */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={
              step === "photos"
                ? () => setStep("metadata")
                : step === "review"
                ? () => setStep("photos")
                : onCancel
            }
            className="min-h-[44px] min-w-[44px] rounded-xl bg-white border border-mineral-200 flex items-center justify-center text-forest-900 hover:bg-mineral-100 transition-colors cursor-pointer"
            aria-label="Indietro"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <p className="text-xs text-forest-800/65">
              Passo {currentStepIndex} di 4 · Procedura guidata campione
            </p>
            <h1 className="font-display text-xl md:text-2xl font-semibold text-forest-950">
              {step === "metadata" && "Dati quantitativi del campione"}
              {step === "photos" && "Fotografie del campione"}
              {step === "analyzing" &&
                (aiMode === "gemini_backend"
                  ? "Gemini Vision sta analizzando le fotografie..."
                  : "Elaborazione locale del campione...")}
              {step === "review" && "Verifica parametri e stima resa"}
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-1.5" aria-hidden="true">
          {[1, 2, 3, 4].map((idx) => (
            <span
              key={idx}
              className={`h-1.5 w-8 rounded-full transition-colors ${
                idx <= currentStepIndex ? "bg-gold-500" : "bg-mineral-200"
              }`}
            />
          ))}
        </div>
      </div>

      {formError && (
        <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-900 flex items-start gap-2.5">
          <AlertCircle className="w-4 h-4 text-red-700 shrink-0 mt-0.5" />
          <span>{formError}</span>
        </div>
      )}

      {/* STEP 1: METADATA & QUANTITATIVE DATA */}
      {step === "metadata" && (
        <div className="bg-white rounded-2xl border border-mineral-200 p-5 md:p-7 space-y-6">
          <div className="grid md:grid-cols-2 gap-5">
            <div className="space-y-1.5">
              <label
                htmlFor="lot-title"
                className="block text-xs font-semibold text-forest-900"
              >
                Nome lotto o appezzamento
              </label>
              <input
                id="lot-title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Es. Uliveto Collina Est"
                className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl border border-mineral-200 bg-mineral-50 text-sm text-forest-950 focus:outline-none focus:border-forest-900"
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="cultivar"
                className="block text-xs font-semibold text-forest-900"
              >
                Varietà (cultivar), se conosciuta
              </label>
              <select
                id="cultivar"
                value={cultivar}
                onChange={(e) => setCultivar(e.target.value as OliveCultivar)}
                className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl border border-mineral-200 bg-mineral-50 text-sm text-forest-950 focus:outline-none focus:border-forest-900"
              >
                {CULTIVAR_OPTIONS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="location"
                className="block text-xs font-semibold text-forest-900"
              >
                Località (comune / zona)
              </label>
              <input
                id="location"
                type="text"
                value={groveLocation}
                onChange={(e) => setGroveLocation(e.target.value)}
                placeholder="Es. Montefalco (PG)"
                className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl border border-mineral-200 bg-mineral-50 text-sm text-forest-950 focus:outline-none focus:border-forest-900"
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="harvest-date"
                className="block text-xs font-semibold text-forest-900"
              >
                Data del prelievo
              </label>
              <input
                id="harvest-date"
                type="date"
                value={harvestDate}
                onChange={(e) => setHarvestDate(e.target.value)}
                className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl border border-mineral-200 bg-mineral-50 text-sm text-forest-950 focus:outline-none focus:border-forest-900"
              />
            </div>
          </div>

          <hr className="border-mineral-100" />

          {/* Sample weight (~1 kg), Olive count, Lot weight & Mill efficiency */}
          <div className="grid md:grid-cols-2 gap-6">
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="sample-grams"
                  className="text-xs font-semibold text-forest-900"
                >
                  Peso totale del campione (indicativamente 1 kg)
                </label>
                <span className="font-mono text-xs text-gold-700 font-semibold tabular-nums">
                  {sampleWeightGrams} g
                </span>
              </div>
              <input
                id="sample-grams"
                type="number"
                min={50}
                max={10000}
                step={10}
                value={sampleWeightGrams}
                onChange={(e) => setSampleWeightGrams(Number(e.target.value))}
                className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl border border-mineral-200 bg-mineral-50 font-mono text-base font-semibold text-forest-950 tabular-nums focus:outline-none focus:border-forest-900"
              />
              <div className="flex flex-wrap gap-2">
                {[500, 1000, 1500, 2000].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setSampleWeightGrams(preset)}
                    className={`min-h-[36px] px-3 py-1 rounded-lg text-xs font-mono font-medium transition-colors cursor-pointer ${
                      sampleWeightGrams === preset
                        ? "bg-forest-900 text-white"
                        : "bg-mineral-100 text-forest-900 hover:bg-olive-100"
                    }`}
                  >
                    {preset === 1000 ? "1000 g (1 kg)" : `${preset} g`}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="lot-kg"
                  className="text-xs font-semibold text-forest-900"
                >
                  Peso previsto del conferimento (kg)
                </label>
                <span className="font-mono text-xs text-forest-800 font-semibold tabular-nums">
                  {lotWeightKg} kg
                </span>
              </div>
              <input
                id="lot-kg"
                type="number"
                min={1}
                max={100000}
                step={10}
                value={lotWeightKg}
                onChange={(e) => setLotWeightKg(Number(e.target.value))}
                className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl border border-mineral-200 bg-mineral-50 font-mono text-base font-semibold text-forest-950 tabular-nums focus:outline-none focus:border-forest-900"
              />
              <div className="flex flex-wrap gap-2">
                {[100, 350, 500, 1000].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setLotWeightKg(preset)}
                    className={`min-h-[36px] px-3 py-1 rounded-lg text-xs font-mono font-medium transition-colors cursor-pointer ${
                      lotWeightKg === preset
                        ? "bg-forest-900 text-white"
                        : "bg-mineral-100 text-forest-900 hover:bg-olive-100"
                    }`}
                  >
                    {preset} kg
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="olive-count"
                className="block text-xs font-semibold text-forest-900"
              >
                Numero totale di olive nel campione (opzionale)
              </label>
              <input
                id="olive-count"
                type="number"
                min={1}
                max={5000}
                value={oliveCountInput}
                onChange={(e) => setOliveCountInput(e.target.value)}
                placeholder="Es. 420 olive (aiuta a stimare la pezzatura)"
                className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl border border-mineral-200 bg-mineral-50 font-mono text-sm text-forest-950 focus:outline-none focus:border-forest-900"
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="mill-efficiency"
                className="block text-xs font-semibold text-forest-900"
              >
                Efficienza attesa del frantoio
              </label>
              <select
                id="mill-efficiency"
                value={millEfficiencyPref}
                onChange={(e) =>
                  setMillEfficiencyPref(
                    e.target.value as MillEfficiencyPreference
                  )
                }
                className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl border border-mineral-200 bg-mineral-50 text-sm text-forest-950 focus:outline-none focus:border-forest-900"
              >
                <option value="standard">Standard (~84-85% estraibile)</option>
                <option value="alta">Alta (impianto moderno 2 fasi, ~87%)</option>
                <option value="bassa">Ridotta / tradizionale (~80%)</option>
                <option value="sconosciuta">Non conosciuta (margine prudente)</option>
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="sample-notes"
              className="block text-xs font-semibold text-forest-900"
            >
              Annotazioni sul prelievo (opzionale)
            </label>
            <input
              id="sample-notes"
              type="text"
              value={notesInput}
              onChange={(e) => setNotesInput(e.target.value)}
              placeholder="Es. Prelievo da 10 piante esposte a sud, nessuna pioggia negli ultimi 5 giorni"
              className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl border border-mineral-200 bg-mineral-50 text-sm text-forest-950 focus:outline-none focus:border-forest-900"
            />
          </div>

          <div className="flex items-center justify-end pt-2">
            <button
              type="button"
              onClick={validateStep1AndAdvance}
              className="w-full sm:w-auto min-h-[46px] px-6 py-3 rounded-xl bg-forest-900 hover:bg-forest-800 text-white text-sm font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer whitespace-nowrap"
            >
              Prosegui alle fotografie
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* STEP 2: MULTI-PHOTO ACQUISITION */}
      {step === "photos" && (
        <div className="space-y-5">
          <div className="bg-white rounded-2xl border border-mineral-200 p-4 md:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-forest-950">
                Fotografie del campione ({sampleWeightGrams} g · {cultivar})
              </p>
              <p className="text-xs text-forest-800/70">
                Puoi caricare più fotografie per ciascuna vista dello stesso campione. La vista dall&apos;alto è obbligatoria.
              </p>
            </div>
            <span className="font-mono text-xs font-semibold text-forest-900 tabular-nums shrink-0">
              {photos.length} scatti allegati
            </span>
          </div>

          {/* 3 Role Acquisition Cards */}
          <div className="grid md:grid-cols-3 gap-4">
            {GUIDE_CARDS.map((card) => {
              const rolePhotos = photos.filter((p) => p.asset.role === card.role);
              const latest = rolePhotos[rolePhotos.length - 1];

              return (
                <div
                  key={card.role}
                  className="bg-white rounded-2xl border border-mineral-200 overflow-hidden flex flex-col justify-between"
                >
                  <div>
                    <div className="relative aspect-[4/3] bg-mineral-100 overflow-hidden">
                      <img
                        src={latest?.previewUrl ?? card.imageUrl}
                        alt={
                          latest
                            ? `Foto acquisita: ${card.title}`
                            : `Guida: ${card.title}`
                        }
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-x-0 bottom-0 p-2.5 bg-gradient-to-t from-forest-950/80 via-forest-950/30 to-transparent flex items-center justify-between text-[11px] text-white">
                        <span className="font-medium">
                          {rolePhotos.length > 0
                            ? `${rolePhotos.length} foto acquisita${rolePhotos.length > 1 ? "e" : ""}`
                            : `Esempio · ${card.requiredLabel}`}
                        </span>
                        {latest && (
                          <span className="font-mono tabular-nums">
                            {formatBytes(latest.asset.sizeBytes)}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="p-4 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="text-sm font-semibold text-forest-950">
                          {card.title}
                        </h3>
                        {rolePhotos.length > 0 && (
                          <CheckCircle2 className="w-4 h-4 text-olive-600 shrink-0" />
                        )}
                      </div>
                      <p className="text-xs text-forest-800/75 leading-relaxed">
                        {card.instruction}
                      </p>
                      {latest && (
                        <p className="text-[11px] font-medium text-forest-900 pt-1">
                          {getPhotoQualityLabel(latest.asset.quality.qualityFlag)} · Luminosità{" "}
                          <span className="font-mono tabular-nums">
                            {latest.asset.quality.meanLuminance}
                          </span>
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="px-4 pb-4 flex items-center gap-2">
                    <button
                      type="button"
                      disabled={photoBusy}
                      onClick={() => setCameraModalRole(card.role)}
                      className="flex-1 min-h-[44px] px-3 py-2 rounded-xl bg-forest-900 hover:bg-forest-800 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
                    >
                      <Camera className="w-4 h-4" />
                      {rolePhotos.length > 0 ? "Aggiungi scatto" : "Fotocamera"}
                    </button>
                    <button
                      type="button"
                      disabled={photoBusy}
                      onClick={() => handleTriggerUpload(card.role)}
                      className="min-h-[44px] px-3 py-2 rounded-xl bg-mineral-100 hover:bg-olive-100 text-forest-950 text-xs font-medium flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
                    >
                      <ImagePlus className="w-4 h-4" />
                      Carica
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Attached Photos Strip (shows all photos attached to this sample) */}
          {photos.length > 0 && (
            <div className="bg-white rounded-2xl border border-mineral-200 p-4 space-y-3">
              <p className="text-xs font-semibold text-forest-950">
                Galleria foto associate al campione ({photos.length})
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {photos.map((item) => (
                  <div
                    key={item.asset.id}
                    className="rounded-xl border border-mineral-200 overflow-hidden bg-mineral-50"
                  >
                    <div className="aspect-[4/3] relative">
                      <img
                        src={item.previewUrl}
                        alt={PHOTO_ROLE_LABELS[item.asset.role]}
                        className="w-full h-full object-cover"
                      />
                      <button
                        type="button"
                        aria-label="Rimuovi foto"
                        onClick={() => handleRemovePhoto(item.asset.id)}
                        className="absolute top-1.5 right-1.5 w-8 h-8 rounded-lg bg-forest-950/75 text-white hover:bg-red-700 flex items-center justify-center cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div className="p-2 text-[11px] text-forest-800/80 truncate">
                      {PHOTO_ROLE_LABELS[item.asset.role]}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
            <p className="text-xs text-forest-800/70">
              {!hasOverview
                ? "Acquisisci almeno una foto dall'alto per avviare l'analisi Gemini Vision."
                : `${photos.length} foto pronte per l'invio all'analisi.`}
            </p>
            <button
              type="button"
              disabled={!hasOverview || photoBusy}
              onClick={() => executeAnalysis()}
              className={`w-full sm:w-auto min-h-[48px] px-6 py-3 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-colors whitespace-nowrap ${
                hasOverview && !photoBusy
                  ? "bg-gold-500 hover:bg-gold-200 text-forest-950 cursor-pointer"
                  : "bg-mineral-200 text-forest-800/45 cursor-not-allowed"
              }`}
            >
              Analizza con {aiMode === "gemini_backend" ? "Gemini Vision" : "Motore Locale"}
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* STEP 3: ANALYSIS IN PROGRESS — NO RESULTS SHOWN UNTIL FINISHED */}
      {step === "analyzing" && (
        <div className="bg-white rounded-2xl border border-mineral-200 p-6 md:p-9 max-w-2xl mx-auto space-y-6">
          {!analysisError ? (
            <>
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-olive-50 border border-olive-100 flex items-center justify-center text-forest-900 shrink-0">
                  <Loader2 className="w-6 h-6 animate-spin" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-gold-700 font-semibold">
                    {aiMode === "gemini_backend"
                      ? "Gemini Vision sta elaborando le fotografie"
                      : "Elaborazione locale offline"}
                  </p>
                  <h2 className="font-display text-xl font-semibold text-forest-950">
                    {progress.label}
                  </h2>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-forest-800/75">
                  <span>{progress.detail}</span>
                  <span className="font-mono font-semibold tabular-nums">
                    {progress.progressPct}%
                  </span>
                </div>
                <div className="h-2.5 w-full rounded-full bg-mineral-100 overflow-hidden">
                  <div
                    className="h-full bg-forest-900 transition-all duration-300"
                    style={{ width: `${progress.progressPct}%` }}
                  />
                </div>
              </div>

              <p className="text-xs text-forest-800/75 pt-2">
                Campione: <strong className="text-forest-950">{title}</strong> ·{" "}
                {cultivar} · {sampleWeightGrams} g · {photos.length} foto
              </p>
            </>
          ) : (
            <div className="space-y-4">
              <div className="flex items-start gap-3 text-red-900">
                <AlertCircle className="w-5 h-5 text-red-700 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <h2 className="font-display text-lg font-semibold">
                    Analisi Gemini Vision non riuscita
                  </h2>
                  <p className="text-sm text-forest-800/80 leading-relaxed">
                    {analysisError}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => executeAnalysis("gemini_backend")}
                  className="min-h-[44px] px-5 py-2.5 rounded-xl bg-forest-900 text-white text-sm font-semibold hover:bg-forest-800 transition-colors cursor-pointer"
                >
                  Riprova con Gemini Vision
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    await updateSettingsMutation.mutateAsync({
                      aiMode: "simulato_locale",
                    });
                    executeAnalysis("simulato_locale");
                  }}
                  className="min-h-[44px] px-4 py-2.5 rounded-xl bg-mineral-100 text-forest-950 text-sm font-medium hover:bg-mineral-200 cursor-pointer"
                >
                  Usa fallback locale offline
                </button>
                <button
                  type="button"
                  onClick={() => setStep("photos")}
                  className="min-h-[44px] px-4 py-2.5 rounded-xl bg-mineral-100 text-forest-950 text-sm font-medium cursor-pointer"
                >
                  Torna alle foto
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* STEP 4: REVIEW & MANUAL OVERRIDE + SUPPLEMENTAL PHOTO REQUESTS */}
      {step === "review" &&
        aiOutput &&
        editableFeatures &&
        editableSampleData &&
        livePreviewPrediction && (
          <div className="space-y-6">
            {/* Quality warnings or supplemental photo requests from Gemini */}
            {(editableFeatures.imageQualitySufficient === false ||
              supplementalRequests.length > 0) && (
              <section className="bg-gold-50 border border-gold-200 rounded-2xl p-5 space-y-4">
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-gold-700">
                    {editableFeatures.imageQualitySufficient === false
                      ? "Qualità fotografica insufficiente o incompleta"
                      : "Foto supplementari consigliate per ridurre l'incertezza"}
                  </p>
                  <p className="text-sm text-forest-950 leading-relaxed">
                    {editableFeatures.summaryNote}
                  </p>
                  {editableFeatures.qualityIssues &&
                    editableFeatures.qualityIssues.length > 0 && (
                      <ul className="list-disc list-inside text-xs text-forest-800/85 pt-1 space-y-0.5">
                        {editableFeatures.qualityIssues.map((issue, idx) => (
                          <li key={idx}>{issue}</li>
                        ))}
                      </ul>
                    )}
                </div>

                {supplementalRequests.length > 0 && (
                  <div className="grid sm:grid-cols-2 gap-3">
                    {supplementalRequests.map((req) => {
                      const fulfilled = photos.some(
                        (p) => p.asset.role === req.role
                      );
                      return (
                        <div
                          key={req.id}
                          className="bg-white rounded-xl border border-gold-200 p-4 space-y-2.5"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-xs font-semibold text-forest-950">
                              {req.title}
                            </p>
                            <span className="font-mono text-[11px] text-olive-700 font-semibold">
                              -{req.expectedUncertaintyReductionPct.toFixed(1)}%
                            </span>
                          </div>
                          <p className="text-[11px] text-forest-800/75">
                            {req.instruction}
                          </p>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setCameraModalRole(req.role)}
                              className="flex-1 min-h-[40px] px-3 py-1.5 rounded-lg bg-forest-900 text-white text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
                            >
                              <Camera className="w-3.5 h-3.5" />
                              {fulfilled ? "Aggiungi scatto" : "Scatta"}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleTriggerUpload(req.role)}
                              className="min-h-[40px] px-3 py-1.5 rounded-lg bg-mineral-100 text-forest-950 text-xs font-medium flex items-center justify-center gap-1.5 cursor-pointer"
                            >
                              <Plus className="w-3.5 h-3.5" />
                              Carica
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => executeAnalysis()}
                    className="min-h-[42px] px-4 py-2 rounded-xl bg-forest-900 text-white text-xs font-semibold cursor-pointer"
                  >
                    Rianalizza tutte le foto ({photos.length})
                  </button>
                </div>
              </section>
            )}

            {/* Live Preview of 100kg Extractable Mill Yield */}
            <section className="bg-forest-900 text-white rounded-2xl p-5 md:p-6 grid sm:grid-cols-3 gap-4 items-center">
              <div>
                <p className="text-xs text-gold-200 font-medium">
                  Resa estraibile stimata su 100 kg
                </p>
                <p className="font-display text-3xl md:text-4xl font-semibold tabular-nums mt-1">
                  {formatPct(livePreviewPrediction.predictedYieldPct)}
                </p>
                <p className="text-xs font-mono text-white/75 tabular-nums">
                  Min {formatPct(livePreviewPrediction.minYieldPct ?? 0)} · Max{" "}
                  {formatPct(livePreviewPrediction.maxYieldPct ?? 0)} (±
                  {formatPct(livePreviewPrediction.marginPct)})
                </p>
              </div>
              <div>
                <p className="text-xs text-white/70">Olio da 100 kg di olive</p>
                <p className="font-mono text-xl font-semibold tabular-nums mt-1">
                  {(livePreviewPrediction.oilKgPer100Kg ?? 0).toFixed(1).replace(".", ",")} kg ·{" "}
                  {formatLiters(livePreviewPrediction.oilLitersPer100Kg ?? 0)}
                </p>
                <p className="text-[11px] text-white/65">
                  Densità {densityKgPerLiter.toFixed(3).replace(".", ",")} kg/L
                </p>
              </div>
              <div>
                <p className="text-xs text-white/70">
                  Consiglio raccolta
                </p>
                <p className="text-sm font-semibold text-gold-200 mt-1">
                  {livePreviewPrediction.harvestAdvice?.recommendation}
                </p>
              </div>
            </section>

            {/* Manual Review & Override Form */}
            <section className="bg-white rounded-2xl border border-mineral-200 p-5 md:p-6 space-y-5">
              <div>
                <h2 className="font-display text-lg font-semibold text-forest-950">
                  Verifica e correggi i parametri fisici
                </h2>
                <p className="text-xs text-forest-800/75 mt-0.5">
                  Per ogni voce è indicato se proviene da valutazione visiva AI o da misurazione diretta dell&apos;utente. Ogni modifica aggiorna immediatamente la resa stimata.
                </p>
              </div>

              {/* Maturation Percentages */}
              <div className="space-y-3 p-4 rounded-xl bg-mineral-50 border border-mineral-200">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-forest-950">
                    Colore e maturazione (% verdi / invaiate / nere)
                  </span>
                  <span className="text-[11px] text-forest-800/70">
                    {getParameterSourceLabel(
                      editableSampleData.fieldSources.maturation
                    )}{" "}
                    · Indice Jaén {editableFeatures.veraisonIndex.toFixed(1)}/5
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label
                      htmlFor="rev-green"
                      className="block text-[11px] text-forest-800/75 mb-1"
                    >
                      Verdi (%)
                    </label>
                    <input
                      id="rev-green"
                      type="number"
                      min={0}
                      max={100}
                      value={Math.round(editableFeatures.greenPct)}
                      onChange={(e) =>
                        updateGreenTurningBlack("greenPct", Number(e.target.value))
                      }
                      className="w-full min-h-[40px] px-3 py-1.5 rounded-lg border border-mineral-200 bg-white font-mono text-sm tabular-nums"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="rev-turning"
                      className="block text-[11px] text-forest-800/75 mb-1"
                    >
                      Invaiate (%)
                    </label>
                    <input
                      id="rev-turning"
                      type="number"
                      min={0}
                      max={100}
                      value={Math.round(editableFeatures.turningPct)}
                      onChange={(e) =>
                        updateGreenTurningBlack("turningPct", Number(e.target.value))
                      }
                      className="w-full min-h-[40px] px-3 py-1.5 rounded-lg border border-mineral-200 bg-white font-mono text-sm tabular-nums"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="rev-black"
                      className="block text-[11px] text-forest-800/75 mb-1"
                    >
                      Nere (%)
                    </label>
                    <input
                      id="rev-black"
                      type="number"
                      min={0}
                      max={100}
                      value={Math.round(editableFeatures.blackPct)}
                      onChange={(e) =>
                        updateGreenTurningBlack("blackPct", Number(e.target.value))
                      }
                      className="w-full min-h-[40px] px-3 py-1.5 rounded-lg border border-mineral-200 bg-white font-mono text-sm tabular-nums"
                    />
                  </div>
                </div>
              </div>

              {/* Physical Fields Grid */}
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <div className="space-y-1">
                  <div className="flex justify-between text-[11px]">
                    <label
                      htmlFor="rev-count"
                      className="font-semibold text-forest-900"
                    >
                      Numero olive
                    </label>
                    <span className="text-forest-800/65">
                      {getParameterSourceLabel(
                        editableSampleData.fieldSources.oliveCount
                      )}
                    </span>
                  </div>
                  <input
                    id="rev-count"
                    type="number"
                    min={1}
                    value={editableSampleData.oliveCount ?? ""}
                    placeholder="Non rilevato"
                    onChange={(e) => {
                      const val = e.target.value ? Number(e.target.value) : undefined;
                      setEditableSampleData({
                        ...editableSampleData,
                        oliveCount: val,
                        fieldSources: {
                          ...editableSampleData.fieldSources,
                          oliveCount: val
                            ? "misurazione_utente"
                            : "non_rilevabile",
                        },
                      });
                    }}
                    className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-mineral-200 bg-mineral-50 font-mono text-sm tabular-nums"
                  />
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between text-[11px]">
                    <label
                      htmlFor="rev-size"
                      className="font-semibold text-forest-900"
                    >
                      Dimensione media
                    </label>
                    <span className="text-forest-800/65">
                      {getParameterSourceLabel(
                        editableSampleData.fieldSources.averageSize
                      )}
                    </span>
                  </div>
                  <select
                    id="rev-size"
                    value={editableSampleData.averageSize}
                    onChange={(e) =>
                      setEditableSampleData({
                        ...editableSampleData,
                        averageSize: e.target.value as OliveSizeCategory,
                        fieldSources: {
                          ...editableSampleData.fieldSources,
                          averageSize: "misurazione_utente",
                        },
                      })
                    }
                    className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-mineral-200 bg-mineral-50 text-sm"
                  >
                    <option value="piccola">Piccola</option>
                    <option value="media">Media</option>
                    <option value="grande">Grande</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between text-[11px]">
                    <label
                      htmlFor="rev-consistency"
                      className="font-semibold text-forest-900"
                    >
                      Consistenza
                    </label>
                    <span className="text-forest-800/65">
                      {getParameterSourceLabel(
                        editableSampleData.fieldSources.consistency
                      )}
                    </span>
                  </div>
                  <select
                    id="rev-consistency"
                    value={editableSampleData.consistency}
                    onChange={(e) =>
                      setEditableSampleData({
                        ...editableSampleData,
                        consistency: e.target.value as OliveConsistency,
                        fieldSources: {
                          ...editableSampleData.fieldSources,
                          consistency: "misurazione_utente",
                        },
                      })
                    }
                    className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-mineral-200 bg-mineral-50 text-sm"
                  >
                    <option value="soda">Soda</option>
                    <option value="media">Media</option>
                    <option value="molle">Molle</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between text-[11px]">
                    <label
                      htmlFor="rev-dehydration"
                      className="font-semibold text-forest-900"
                    >
                      Disidratazione
                    </label>
                    <span className="text-forest-800/65">
                      {editableFeatures.shrivelingDetected
                        ? "Raggrinzimento visibile"
                        : "Visiva / utente"}
                    </span>
                  </div>
                  <select
                    id="rev-dehydration"
                    value={editableSampleData.dehydrationLevel}
                    onChange={(e) =>
                      setEditableSampleData({
                        ...editableSampleData,
                        dehydrationLevel: e.target.value as DehydrationLevel,
                      })
                    }
                    className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-mineral-200 bg-mineral-50 text-sm"
                  >
                    <option value="assente">Assente (turgide)</option>
                    <option value="lieve">Lieve</option>
                    <option value="moderata">Moderata</option>
                    <option value="marcata">Marcata</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between text-[11px]">
                    <label
                      htmlFor="rev-damaged"
                      className="font-semibold text-forest-900"
                    >
                      Olive danneggiate (%)
                    </label>
                    <span className="text-forest-800/65">
                      {getParameterSourceLabel(
                        editableSampleData.fieldSources.damagedPct
                      )}
                    </span>
                  </div>
                  <input
                    id="rev-damaged"
                    type="number"
                    min={0}
                    max={100}
                    value={editableSampleData.damagedPct}
                    onChange={(e) =>
                      setEditableSampleData({
                        ...editableSampleData,
                        damagedPct: Number(e.target.value),
                        fieldSources: {
                          ...editableSampleData.fieldSources,
                          damagedPct: "misurazione_utente",
                        },
                      })
                    }
                    className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-mineral-200 bg-mineral-50 font-mono text-sm tabular-nums"
                  />
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between text-[11px]">
                    <label
                      htmlFor="rev-fly"
                      className="font-semibold text-forest-900"
                    >
                      Segni di mosca (%)
                    </label>
                    <span className="text-forest-800/65">
                      {getParameterSourceLabel(
                        editableSampleData.fieldSources.oliveFlyPct
                      )}
                    </span>
                  </div>
                  <input
                    id="rev-fly"
                    type="number"
                    min={0}
                    max={100}
                    value={editableSampleData.oliveFlyPct}
                    onChange={(e) =>
                      setEditableSampleData({
                        ...editableSampleData,
                        oliveFlyPct: Number(e.target.value),
                        fieldSources: {
                          ...editableSampleData.fieldSources,
                          oliveFlyPct: "misurazione_utente",
                        },
                      })
                    }
                    className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-mineral-200 bg-mineral-50 font-mono text-sm tabular-nums"
                  />
                </div>

                <div className="space-y-1 sm:col-span-2 lg:col-span-3">
                  <div className="flex justify-between text-[11px]">
                    <label
                      htmlFor="rev-pulp"
                      className="font-semibold text-forest-900"
                    >
                      Rapporto polpa/nocciolo misurato (es. 4.5 — lascia vuoto se non misurato)
                    </label>
                    <span className="text-forest-800/65">
                      {getParameterSourceLabel(
                        editableSampleData.fieldSources.pulpToPit
                      )}
                    </span>
                  </div>
                  <input
                    id="rev-pulp"
                    type="number"
                    step={0.1}
                    min={2.0}
                    max={8.0}
                    value={editableSampleData.measuredPulpToPit ?? ""}
                    placeholder={
                      editableFeatures.pulpToPitEstimate != null
                        ? `Stimato da foto sezione: ${editableFeatures.pulpToPitEstimate.toFixed(1)}`
                        : "Non rilevabile senza foto sezione o pesatura noccioli"
                    }
                    onChange={(e) => {
                      const val = e.target.value ? Number(e.target.value) : undefined;
                      setEditableSampleData({
                        ...editableSampleData,
                        measuredPulpToPit: val,
                        fieldSources: {
                          ...editableSampleData.fieldSources,
                          pulpToPit: val
                            ? "misurazione_utente"
                            : editableFeatures.pulpToPitObservable
                            ? "valutazione_visiva"
                            : "non_rilevabile",
                        },
                      });
                    }}
                    className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-mineral-200 bg-mineral-50 font-mono text-sm tabular-nums"
                  />
                </div>
              </div>
            </section>

            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
              <button
                type="button"
                onClick={() => setStep("photos")}
                className="w-full sm:w-auto min-h-[46px] px-5 py-3 rounded-xl bg-mineral-100 hover:bg-mineral-200 text-forest-950 text-sm font-medium transition-colors cursor-pointer"
              >
                Modifica foto
              </button>

              <button
                type="button"
                disabled={saveMutation.isPending}
                onClick={persistAndFinish}
                className="w-full sm:w-auto min-h-[48px] px-6 py-3 rounded-xl bg-gold-500 hover:bg-gold-200 text-forest-950 text-sm font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                {saveMutation.isPending
                  ? "Salvataggio..."
                  : "Salva analisi e apri risultati completi"}
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

      {/* Hidden File Input for gallery upload (supports multiple selection!) */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={async (e) => {
          const files = Array.from(e.target.files ?? []);
          for (const file of files) {
            await handleAddBlob(file, pendingUploadRole, "upload");
          }
          e.target.value = "";
        }}
      />

      {/* Smartphone Live Camera Modal */}
      <CameraCaptureModal
        open={cameraModalRole !== null}
        role={cameraModalRole ?? "overview"}
        instruction={
          GUIDE_CARDS.find((c) => c.role === cameraModalRole)?.instruction ??
          supplementalRequests.find((r) => r.role === cameraModalRole)
            ?.instruction ??
          "Inquadra il campione con luce naturale uniforme."
        }
        onCaptureBlob={(blob, source) => {
          const role = cameraModalRole ?? "overview";
          setCameraModalRole(null);
          handleAddBlob(blob, role, source);
        }}
        onClose={() => setCameraModalRole(null)}
      />
    </div>
  );
}
