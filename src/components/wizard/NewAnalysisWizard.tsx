import { useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Camera,
  CheckCircle2,
  ImagePlus,
  Loader2,
  Sparkles,
  Trash2,
} from "lucide-react";
import {
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
  processPublicImageAsset,
  type ProcessedPhotoResult,
} from "../../services/photos/photoManager";
import { computeYieldPrediction } from "../../services/prediction/yieldEngine";
import type {
  AiEngineMode,
  OliveAnalysisRecord,
  OliveCultivar,
  SamplePhotoRole,
  SupplementalPhotoRequest,
} from "../../types/analysis";
import { CULTIVAR_OPTIONS, PHOTO_ROLE_LABELS } from "../../types/analysis";
import { getPhotoQualityLabel } from "../../utils/formatters";
import { CameraCaptureModal } from "../camera/CameraCaptureModal";

interface NewAnalysisWizardProps {
  aiMode: AiEngineMode;
  onComplete: (analysisId: string) => void;
  onCancel: () => void;
}

type WizardStep = "metadata" | "photos" | "analyzing" | "supplemental";

const GUIDE_CARDS: Array<{
  role: SamplePhotoRole;
  title: string;
  requiredLabel: string;
  imageUrl: string;
  instruction: string;
}> = [
  {
    role: "overview",
    title: "1. Panoramica campione",
    requiredLabel: "Obbligatoria",
    imageUrl: "/src/assets/images/guide_sample_overview_1795170879644.jpg",
    instruction:
      "Stendi le olive pesate in un unico strato su un piano chiaro e scatta dall'alto con luce naturale diffusa.",
  },
  {
    role: "closeup",
    title: "2. Dettaglio ravvicinato",
    requiredLabel: "Consigliata",
    imageUrl: "/src/assets/images/guide_sample_closeup_1795170880646.jpg",
    instruction:
      "Inquadra 6–8 olive da vicino (15–20 cm) per mostrare turgore, colore di invaiatura e integrità della buccia.",
  },
  {
    role: "cross_section",
    title: "3. Sezione polpa / nocciolo",
    requiredLabel: "Opzionale",
    imageUrl: "/src/assets/images/guide_sample_cut_1795170879980.jpg",
    instruction:
      "Taglia 3 olive a metà per lungo: permette di ridurre l'intervallo di incertezza stimando lo spessore della polpa.",
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
  onComplete,
  onCancel,
}: NewAnalysisWizardProps) {
  const analysisId = useMemo(() => createAnalysisId(), []);
  const saveMutation = useSaveAnalysisMutation();
  const updateSettingsMutation = useUpdateSettingsMutation();

  const [step, setStep] = useState<WizardStep>("metadata");

  // Step 1: Sample metadata & weight in grams
  const [title, setTitle] = useState("Lotto Raccolta Oliva");
  const [cultivar, setCultivar] = useState<OliveCultivar>("Frantoio");
  const [groveLocation, setGroveLocation] = useState("");
  const [harvestDate, setHarvestDate] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [sampleWeightGrams, setSampleWeightGrams] = useState<number>(500);
  const [lotWeightKg, setLotWeightKg] = useState<number>(350);
  const [formError, setFormError] = useState<string>("");

  // Step 2: Captured/uploaded photos
  const [photos, setPhotos] = useState<ProcessedPhotoResult[]>([]);
  const [photoBusy, setPhotoBusy] = useState<boolean>(false);
  const [cameraModalRole, setCameraModalRole] =
    useState<SamplePhotoRole | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [pendingUploadRole, setPendingUploadRole] =
    useState<SamplePhotoRole>("overview");

  // Step 3 & 4: AI Analysis Progress & Supplemental Requests
  const [progress, setProgress] = useState<AiAnalysisProgressEvent>({
    stepIndex: 0,
    totalSteps: 5,
    label: "Avvio analisi",
    detail: "Preparazione del campione",
    progressPct: 0,
  });
  const [analysisError, setAnalysisError] = useState<string>("");
  const [aiOutput, setAiOutput] = useState<AiAnalysisOutput | null>(null);
  const [supplementalRequests, setSupplementalRequests] = useState<
    SupplementalPhotoRequest[]
  >([]);

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

      setPhotos((prev) => {
        // Replace existing photo for the same role if user re-captures it
        const filtered = prev.filter((item) => item.asset.role !== role);
        return [...filtered, processed];
      });

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

  async function handleLoadDemoSampleSet() {
    setPhotoBusy(true);
    setFormError("");
    try {
      const overview = await processPublicImageAsset({
        url: "/src/assets/images/guide_sample_overview_1795170879644.jpg",
        analysisId,
        role: "overview",
        source: "demo",
      });
      const closeup = await processPublicImageAsset({
        url: "/src/assets/images/guide_sample_closeup_1795170880646.jpg",
        analysisId,
        role: "closeup",
        source: "demo",
      });
      setPhotos([overview, closeup]);
    } catch {
      setFormError("Impossibile caricare le foto di prova.");
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

  async function executeAnalysis(
    modeOverride?: AiEngineMode,
    skipSupplementalScreen = false
  ) {
    if (photos.length === 0) {
      setFormError("Acquisisci almeno una foto del campione prima di procedere.");
      return;
    }

    const activeMode = modeOverride ?? aiMode;
    setAnalysisError("");
    setStep("analyzing");

    try {
      const result = await runOliveSampleAnalysis(activeMode, {
        cultivar,
        sampleWeightGrams,
        lotWeightKg,
        groveLocation,
        photos: photos.map((p) => ({ asset: p.asset, blob: p.blob })),
        onProgress: (ev) => setProgress(ev),
      });

      setAiOutput(result);
      setSupplementalRequests(result.supplementalRequests);

      const unfulfilled = result.supplementalRequests.filter(
        (r) => !photos.some((p) => p.asset.role === r.role)
      );

      if (!skipSupplementalScreen && unfulfilled.length > 0) {
        setStep("supplemental");
        return;
      }

      await persistAndFinish(result, unfulfilled);
    } catch (err) {
      setAnalysisError(
        err instanceof Error
          ? err.message
          : "Errore imprevisto durante l'analisi del campione."
      );
    }
  }

  async function persistAndFinish(
    output: AiAnalysisOutput,
    remainingRequests: SupplementalPhotoRequest[]
  ) {
    const code = await getNextAnalysisCode();
    const assets = photos.map((p) => p.asset);
    const prediction = computeYieldPrediction({
      cultivar,
      sampleWeightGrams,
      lotWeightKg,
      photos: assets,
      features: output.features,
    });

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
      status: remainingRequests.length > 0 ? "richiesta_foto" : "completata",
      photos: assets,
      supplementalRequests: remainingRequests,
      visualFeatures: output.features,
      prediction,
      dataOrigin: output.dataOrigin,
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

  const previewPrediction = useMemo(() => {
    if (!aiOutput) return null;
    return computeYieldPrediction({
      cultivar,
      sampleWeightGrams,
      lotWeightKg,
      photos: photos.map((p) => p.asset),
      features: aiOutput.features,
    });
  }, [aiOutput, cultivar, sampleWeightGrams, lotWeightKg, photos]);

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
                : step === "supplemental"
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
              Passo {currentStepIndex} di 4 · Procedura guidata
            </p>
            <h1 className="font-display text-xl md:text-2xl font-semibold text-forest-950">
              {step === "metadata" && "Dati campione e peso"}
              {step === "photos" && "Fotografia del campione"}
              {step === "analyzing" && "Elaborazione campione"}
              {step === "supplemental" && "Scatti supplementari consigliati"}
            </h1>
          </div>
        </div>

        {/* Clean segmented step bar */}
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

      {/* STEP 1: METADATA & WEIGHT IN GRAMS */}
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
                Cultivar prevalente
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
                Data campionamento
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

          {/* Sample weight in grams & Lot weight in kg */}
          <div className="grid md:grid-cols-2 gap-6">
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="sample-grams"
                  className="text-xs font-semibold text-forest-900"
                >
                  Peso del campione fotografato (grammi)
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
                {[250, 500, 750, 1000].map((preset) => (
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
                    {preset} g
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-forest-800/65">
                Consigliato almeno 500 g di olive rappresentative prelevate da più piante.
              </p>
            </div>

            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="lot-kg"
                  className="text-xs font-semibold text-forest-900"
                >
                  Peso totale del lotto da molire (kg)
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
                {[150, 350, 500, 1000].map((preset) => (
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
              <p className="text-[11px] text-forest-800/65">
                Utilizzato dal motore statistico per stimare i chilogrammi e i litri totali di olio attesi.
              </p>
            </div>
          </div>

          <div className="flex items-center justify-end pt-2">
            <button
              type="button"
              onClick={validateStep1AndAdvance}
              className="w-full sm:w-auto min-h-[46px] px-6 py-3 rounded-xl bg-forest-900 hover:bg-forest-800 text-white text-sm font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer whitespace-nowrap"
            >
              Prosegui alla guida fotografica
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* STEP 2: GUIDED PHOTOGRAPHY & ACQUISITION */}
      {step === "photos" && (
        <div className="space-y-5">
          {/* Quick desktop demo-set loader */}
          <div className="bg-white rounded-2xl border border-mineral-200 p-4 md:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-forest-950">
                Acquisizione guidata del campione ({sampleWeightGrams} g · {cultivar})
              </p>
              <p className="text-xs text-forest-800/70">
                Scatta con lo smartphone o carica le immagini dalla galleria. La panoramica è obbligatoria.
              </p>
            </div>
            <button
              type="button"
              disabled={photoBusy}
              onClick={handleLoadDemoSampleSet}
              className="min-h-[40px] px-3.5 py-2 rounded-xl bg-gold-50 hover:bg-gold-200/60 border border-gold-200 text-forest-950 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <Sparkles className="w-3.5 h-3.5 text-gold-700" />
              Usa foto campione demo
            </button>
          </div>

          {/* 3 Guided Slots */}
          <div className="grid md:grid-cols-3 gap-4">
            {GUIDE_CARDS.map((card) => {
              const captured = photos.find((p) => p.asset.role === card.role);

              return (
                <div
                  key={card.role}
                  className="bg-white rounded-2xl border border-mineral-200 overflow-hidden flex flex-col justify-between"
                >
                  <div>
                    <div className="relative aspect-[4/3] bg-mineral-100 overflow-hidden">
                      <img
                        src={captured?.previewUrl ?? card.imageUrl}
                        alt={captured ? `Foto acquisita: ${card.title}` : `Esempio guida: ${card.title}`}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-x-0 bottom-0 p-2.5 bg-gradient-to-t from-forest-950/80 via-forest-950/30 to-transparent flex items-center justify-between text-[11px] text-white">
                        <span className="font-medium">
                          {captured ? "Foto acquisita" : `Esempio · ${card.requiredLabel}`}
                        </span>
                        {captured && (
                          <span className="font-mono tabular-nums">
                            {formatBytes(captured.asset.sizeBytes)}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="p-4 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="text-sm font-semibold text-forest-950">
                          {card.title}
                        </h3>
                        {captured && (
                          <CheckCircle2 className="w-4 h-4 text-olive-600 shrink-0" />
                        )}
                      </div>
                      <p className="text-xs text-forest-800/75 leading-relaxed">
                        {card.instruction}
                      </p>
                      {captured && (
                        <p className="text-[11px] font-medium text-forest-900 pt-1">
                          {getPhotoQualityLabel(captured.asset.quality.qualityFlag)} · Luminosità{" "}
                          <span className="font-mono tabular-nums">
                            {captured.asset.quality.meanLuminance}
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
                      {captured ? "Riscatta" : "Fotocamera"}
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
                    {captured && (
                      <button
                        type="button"
                        aria-label={`Rimuovi ${card.title}`}
                        onClick={() => handleRemovePhoto(captured.asset.id)}
                        className="min-h-[44px] min-w-[44px] rounded-xl bg-mineral-100 hover:bg-red-50 text-forest-800 hover:text-red-700 flex items-center justify-center transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
            <p className="text-xs text-forest-800/70">
              {photos.length === 0
                ? "Acquisisci almeno la foto panoramica per avviare la stima."
                : `${photos.length} foto pronte per l'analisi.`}
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
              Avvia analisi campione
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* STEP 3: AI ANALYSIS PROGRESS SCREEN */}
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
                      ? "Analisi Gemini multimodale in corso"
                      : "Analisi statistica locale simulata"}
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

              <div className="space-y-2 pt-2 text-xs text-forest-800/75">
                <p>
                  Campione: <strong className="text-forest-950">{title}</strong> ·{" "}
                  {cultivar} · {sampleWeightGrams} g ({photos.length} foto)
                </p>
              </div>
            </>
          ) : (
            <div className="space-y-4">
              <div className="flex items-start gap-3 text-red-900">
                <AlertCircle className="w-5 h-5 text-red-700 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <h2 className="font-display text-lg font-semibold">
                    Servizio Gemini backend non disponibile
                  </h2>
                  <p className="text-sm text-forest-800/80 leading-relaxed">
                    {analysisError}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-3 pt-2">
                <button
                  type="button"
                  onClick={async () => {
                    await updateSettingsMutation.mutateAsync({
                      aiMode: "simulato_locale",
                    });
                    executeAnalysis("simulato_locale");
                  }}
                  className="min-h-[44px] px-5 py-2.5 rounded-xl bg-forest-900 text-white text-sm font-semibold hover:bg-forest-800 transition-colors cursor-pointer"
                >
                  Passa a modalità offline simulata e continua
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

      {/* STEP 4: DYNAMIC SUPPLEMENTAL PHOTO REQUESTS */}
      {step === "supplemental" && aiOutput && (
        <div className="space-y-5">
          <div className="bg-white rounded-2xl border border-mineral-200 p-5 md:p-6 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold text-gold-700">
                  Richiesta dinamica di affinamento
                </p>
                <h2 className="font-display text-xl font-semibold text-forest-950">
                  Foto supplementari consigliate per ridurre l&apos;incertezza
                </h2>
              </div>
              {previewPrediction && (
                <div className="text-left sm:text-right shrink-0">
                  <p className="text-xs text-forest-800/70">Stima preliminare</p>
                  <p className="font-mono text-lg font-semibold text-forest-950 tabular-nums">
                    {previewPrediction.predictedYieldPct.toFixed(1)}% (±
                    {previewPrediction.marginPct.toFixed(1)}%)
                  </p>
                </div>
              )}
            </div>
            <p className="text-sm text-forest-800/80 leading-relaxed">
              {aiOutput.features.summaryNote}
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            {supplementalRequests.map((req) => {
              const fulfilled = photos.find((p) => p.asset.role === req.role);
              return (
                <div
                  key={req.id}
                  className="bg-white rounded-2xl border border-mineral-200 p-5 flex flex-col justify-between gap-4"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-base font-semibold text-forest-950">
                        {req.title}
                      </h3>
                      <span className="font-mono text-xs font-semibold text-olive-700 tabular-nums shrink-0">
                        -{req.expectedUncertaintyReductionPct.toFixed(1)}% margine
                      </span>
                    </div>
                    <p className="text-xs text-forest-800/75 leading-relaxed">
                      {req.reason}
                    </p>
                    <p className="text-xs font-medium text-forest-950 pt-1">
                      Come scattare: {req.instruction}
                    </p>

                    {fulfilled && fulfilled.previewUrl && (
                      <div className="mt-3 flex items-center gap-3 p-2.5 rounded-xl bg-olive-50 border border-olive-100">
                        <img
                          src={fulfilled.previewUrl}
                          alt={req.title}
                          className="w-14 h-14 rounded-lg object-cover shrink-0"
                        />
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-forest-950 flex items-center gap-1.5">
                            <CheckCircle2 className="w-4 h-4 text-olive-600" />
                            Scatto acquisito
                          </p>
                          <p className="text-[11px] text-forest-800/70">
                            {PHOTO_ROLE_LABELS[fulfilled.asset.role]}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setCameraModalRole(req.role)}
                      className="flex-1 min-h-[44px] px-4 py-2 rounded-xl bg-forest-900 hover:bg-forest-800 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <Camera className="w-4 h-4" />
                      {fulfilled ? "Riscatta" : "Scatta ora"}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleTriggerUpload(req.role)}
                      className="min-h-[44px] px-4 py-2 rounded-xl bg-mineral-100 hover:bg-olive-100 text-forest-950 text-xs font-medium flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <ImagePlus className="w-4 h-4" />
                      Carica
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
            <button
              type="button"
              disabled={saveMutation.isPending}
              onClick={() => {
                const remaining = supplementalRequests.filter(
                  (r) => !photos.some((p) => p.asset.role === r.role)
                );
                persistAndFinish(aiOutput, remaining);
              }}
              className="w-full sm:w-auto min-h-[46px] px-5 py-3 rounded-xl bg-mineral-100 hover:bg-mineral-200 text-forest-950 text-sm font-medium transition-colors cursor-pointer"
            >
              Procedi con i risultati attuali
            </button>

            <button
              type="button"
              disabled={saveMutation.isPending}
              onClick={() => executeAnalysis(undefined, true)}
              className="w-full sm:w-auto min-h-[46px] px-6 py-3 rounded-xl bg-gold-500 hover:bg-gold-200 text-forest-950 text-sm font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              {saveMutation.isPending
                ? "Salvataggio..."
                : "Rielabora stima e salva risultati"}
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Hidden File Input for gallery upload */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) {
            handleAddBlob(file, pendingUploadRole, "upload");
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
