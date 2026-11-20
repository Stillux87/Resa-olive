import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Camera,
  CheckCircle2,
  Droplets,
  Edit3,
  ImagePlus,
  Info,
  Scale,
  Sprout,
  Trash2,
} from "lucide-react";
import {
  useAnalysesQuery,
  useAnalysisDetailQuery,
  useDeleteAnalysisMutation,
  useRecordMillOutcomeMutation,
  useSaveAnalysisMutation,
} from "../../hooks/useOlivestimaQueries";
import { runOliveSampleAnalysis } from "../../services/ai";
import { getPhotoBlobsForAnalysis } from "../../services/persistence/indexedDb";
import {
  formatBytes,
  processImageBlob,
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
  MillExtractionMethod,
  OliveConsistency,
  OliveCultivar,
  OliveSizeCategory,
  SamplePhotoRole,
  SamplePhysicalData,
  VisualMorphologyFeatures,
} from "../../types/analysis";
import {
  CULTIVAR_OPTIONS,
  OLIVE_OIL_DENSITY_KG_PER_LITER,
  PHOTO_ROLE_LABELS,
} from "../../types/analysis";
import {
  formatDateIt,
  formatGrams,
  formatKg,
  formatLiters,
  formatNumberIt,
  formatPct,
  formatSignedPct,
  getConsistencyLabel,
  getDehydrationLabel,
  getExtractionMethodLabel,
  getMillEfficiencyPrefLabel,
  getOriginLabel,
  getParameterSourceLabel,
  getPhotoQualityLabel,
  getSizeLabel,
  getStatusLabel,
  getUniformityLabel,
} from "../../utils/formatters";
import { CameraCaptureModal } from "../camera/CameraCaptureModal";

interface AnalysisResultsViewProps {
  analysisId: string;
  aiMode: AiEngineMode;
  densityKgPerLiter?: number;
  onBack: () => void;
}

export function AnalysisResultsView({
  analysisId,
  aiMode,
  densityKgPerLiter = OLIVE_OIL_DENSITY_KG_PER_LITER,
  onBack,
}: AnalysisResultsViewProps) {
  const { data: analysis, isLoading } = useAnalysisDetailQuery(analysisId);
  const analysesQuery = useAnalysesQuery();
  const recordMillMutation = useRecordMillOutcomeMutation();
  const saveAnalysisMutation = useSaveAnalysisMutation();
  const deleteMutation = useDeleteAnalysisMutation();

  const realHistoricalRecords = useMemo(
    () =>
      (analysesQuery.data ?? []).filter(
        (r) => !isDemoAnalysis(r) && r.id !== analysisId
      ),
    [analysesQuery.data, analysisId]
  );

  // Mill Outcome Form State
  const [editingMill, setEditingMill] = useState(false);
  const [millHarvestDate, setMillHarvestDate] = useState<string>("");
  const [millLotKg, setMillLotKg] = useState<number>(350);
  const [millOilKg, setMillOilKg] = useState<number>(54);
  const [millOilLiters, setMillOilLiters] = useState<number>(58.9);
  const [litersManuallyEdited, setLitersManuallyEdited] = useState(false);
  const [millName, setMillName] = useState<string>("");
  const [extractionMethod, setExtractionMethod] =
    useState<MillExtractionMethod>("continuo_2_fasi");
  const [millNotes, setMillNotes] = useState<string>("");
  const [millSavedNotice, setMillSavedNotice] = useState(false);

  // Manual sample parameter override state
  const [editingSampleParams, setEditingSampleParams] = useState(false);
  const [editCultivar, setEditCultivar] = useState<OliveCultivar>("Frantoio");
  const [editSampleGrams, setEditSampleGrams] = useState<number>(1000);
  const [editLotKg, setEditLotKg] = useState<number>(350);
  const [editSampleData, setEditSampleData] = useState<SamplePhysicalData>(() =>
    buildDefaultSampleData()
  );
  const [editGreenPct, setEditGreenPct] = useState<number>(35);
  const [editTurningPct, setEditTurningPct] = useState<number>(40);
  const [editBlackPct, setEditBlackPct] = useState<number>(25);
  const [sampleSavedNotice, setSampleSavedNotice] = useState(false);

  // Supplemental photo capture state
  const [cameraRole, setCameraRole] = useState<SamplePhotoRole | null>(null);
  const [uploadRole, setUploadRole] = useState<SamplePhotoRole>("cross_section");
  const uploadRef = useRef<HTMLInputElement | null>(null);
  const [refining, setRefining] = useState(false);
  const [refineError, setRefineError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const effectiveDensity =
    analysis?.prediction?.oilDensityKgPerLiter ?? densityKgPerLiter;

  useEffect(() => {
    if (!analysis) return;
    if (analysis.millOutcome) {
      setMillHarvestDate(
        analysis.millOutcome.harvestDate ?? analysis.harvestDate
      );
      setMillLotKg(analysis.millOutcome.lotWeightKg);
      setMillOilKg(analysis.millOutcome.actualOilKg);
      setMillOilLiters(analysis.millOutcome.actualOilLiters);
      setLitersManuallyEdited(false);
      setMillName(analysis.millOutcome.millName ?? "");
      setExtractionMethod(analysis.millOutcome.extractionMethod);
      setMillNotes(analysis.millOutcome.notes ?? "");
    } else {
      const defaultOilKg =
        analysis.prediction?.estimatedOilKg ??
        Math.round(analysis.lotWeightKg * 0.15 * 10) / 10;
      setMillHarvestDate(analysis.harvestDate);
      setMillLotKg(analysis.lotWeightKg);
      setMillOilKg(defaultOilKg);
      setMillOilLiters(
        Math.round((defaultOilKg / effectiveDensity) * 10) / 10
      );
      setLitersManuallyEdited(false);
      setMillName("");
      setMillNotes("");
    }

    setEditCultivar(analysis.cultivar);
    setEditSampleGrams(analysis.sampleWeightGrams);
    setEditLotKg(analysis.lotWeightKg);
    setEditSampleData(
      analysis.sampleData ?? buildDefaultSampleData(analysis.visualFeatures)
    );
    setEditGreenPct(Math.round(analysis.visualFeatures?.greenPct ?? 35));
    setEditTurningPct(Math.round(analysis.visualFeatures?.turningPct ?? 40));
    setEditBlackPct(Math.round(analysis.visualFeatures?.blackPct ?? 25));
  }, [analysis, effectiveDensity]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-12 w-48 rounded-xl bg-mineral-200 animate-pulse" />
        <div className="h-56 rounded-2xl bg-mineral-200 animate-pulse" />
      </div>
    );
  }

  if (!analysis) {
    return (
      <div className="bg-white rounded-2xl border border-mineral-200 p-8 text-center space-y-4">
        <p className="text-sm text-forest-800/80">
          Analisi non trovata nell&apos;archivio locale.
        </p>
        <button
          type="button"
          onClick={onBack}
          className="min-h-[44px] px-5 py-2.5 rounded-xl bg-forest-900 text-white text-sm font-medium cursor-pointer"
        >
          Torna allo storico
        </button>
      </div>
    );
  }

  const pred = analysis.prediction;
  const features = analysis.visualFeatures;
  const sampleData = analysis.sampleData ?? buildDefaultSampleData(features);
  const mill = analysis.millOutcome;

  const computedYieldPct =
    millLotKg > 0 ? Math.round((millOilKg / millLotKg) * 1000) / 10 : 0;

  function handleMillOilKgChange(nextKg: number) {
    setMillOilKg(nextKg);
    if (!litersManuallyEdited) {
      setMillOilLiters(
        Math.round((nextKg / effectiveDensity) * 10) / 10
      );
    }
  }

  function handleEditColorChange(
    channel: "green" | "turning" | "black",
    value: number
  ) {
    const clamped = Math.max(0, Math.min(100, Math.round(value)));
    if (channel === "green") {
      const rem = 100 - clamped;
      const prevSum = editTurningPct + editBlackPct;
      const t =
        prevSum > 0 ? Math.round((editTurningPct / prevSum) * rem) : Math.round(rem / 2);
      setEditGreenPct(clamped);
      setEditTurningPct(t);
      setEditBlackPct(Math.max(0, rem - t));
    } else if (channel === "turning") {
      const rem = 100 - clamped;
      const prevSum = editGreenPct + editBlackPct;
      const g =
        prevSum > 0 ? Math.round((editGreenPct / prevSum) * rem) : Math.round(rem / 2);
      setEditTurningPct(clamped);
      setEditGreenPct(g);
      setEditBlackPct(Math.max(0, rem - g));
    } else {
      const rem = 100 - clamped;
      const prevSum = editGreenPct + editTurningPct;
      const g =
        prevSum > 0 ? Math.round((editGreenPct / prevSum) * rem) : Math.round(rem / 2);
      setEditBlackPct(clamped);
      setEditGreenPct(g);
      setEditTurningPct(Math.max(0, rem - g));
    }
    setEditSampleData((prev) => ({
      ...prev,
      fieldSources: {
        ...prev.fieldSources,
        maturation: "misurazione_utente",
      },
    }));
  }

  async function handleSaveSampleOverrides(e: React.FormEvent) {
    e.preventDefault();
    if (!analysis || !features) return;

    const total = editGreenPct + editTurningPct + editBlackPct || 100;
    const g = Math.round((editGreenPct / total) * 100);
    const t = Math.round((editTurningPct / total) * 100);
    const b = Math.max(0, 100 - g - t);
    const updatedVeraison =
      Math.round(((g * 0.4 + t * 2.5 + b * 4.5) / 100) * 10) / 10;

    const updatedFeatures: VisualMorphologyFeatures = {
      ...features,
      greenPct: g,
      turningPct: t,
      blackPct: b,
      veraisonIndex: updatedVeraison,
      apparentAverageSize: editSampleData.averageSize,
      consistency: editSampleData.consistency,
      dehydrationLevel: editSampleData.dehydrationLevel,
      visibleDefectsPct: editSampleData.damagedPct,
      oliveFlySignsPct: editSampleData.oliveFlyPct,
      pulpToPitEstimate:
        editSampleData.measuredPulpToPit ?? features.pulpToPitEstimate,
    };

    const newPrediction = computeYieldPrediction({
      cultivar: editCultivar,
      sampleWeightGrams: Math.max(50, editSampleGrams),
      lotWeightKg: Math.max(1, editLotKg),
      photos: analysis.photos,
      features: updatedFeatures,
      sampleData: editSampleData,
      realHistoricalRecords: isDemoAnalysis(analysis)
        ? []
        : realHistoricalRecords,
      densityKgPerLiter: effectiveDensity,
    });

    await saveAnalysisMutation.mutateAsync({
      record: {
        ...analysis,
        cultivar: editCultivar,
        sampleWeightGrams: Math.max(50, editSampleGrams),
        lotWeightKg: Math.max(1, editLotKg),
        sampleData: editSampleData,
        visualFeatures: updatedFeatures,
        prediction: newPrediction,
        updatedAt: new Date().toISOString(),
      },
      photos: [],
    });

    setEditingSampleParams(false);
    setSampleSavedNotice(true);
    setTimeout(() => setSampleSavedNotice(false), 3500);
  }

  async function handleAddSupplementalPhoto(
    blob: Blob,
    role: SamplePhotoRole,
    source: "camera" | "upload"
  ) {
    if (!analysis) return;
    setRefining(true);
    setRefineError(null);
    try {
      const processed = await processImageBlob({
        blob,
        analysisId: analysis.id,
        role,
        source,
      });

      const existingBlobs = await getPhotoBlobsForAnalysis(analysis.id);
      const merged = [
        ...existingBlobs,
        { asset: processed.asset, blob: processed.blob },
      ];

      const effectiveMode =
        analysis.dataOrigin === "gemini_backend" ? "gemini_backend" : aiMode;

      const aiResult = await runOliveSampleAnalysis(effectiveMode, {
        cultivar: analysis.cultivar,
        sampleWeightGrams: analysis.sampleWeightGrams,
        oliveCount: sampleData.oliveCount,
        lotWeightKg: analysis.lotWeightKg,
        groveLocation: analysis.groveLocation,
        photos: merged,
      });

      const updatedSampleData: SamplePhysicalData = {
        ...sampleData,
        averageSize:
          sampleData.fieldSources.averageSize === "misurazione_utente"
            ? sampleData.averageSize
            : aiResult.features.apparentAverageSize ?? sampleData.averageSize,
        consistency:
          sampleData.fieldSources.consistency === "misurazione_utente"
            ? sampleData.consistency
            : aiResult.features.consistency ?? sampleData.consistency,
        dehydrationLevel:
          aiResult.features.dehydrationLevel ?? sampleData.dehydrationLevel,
        damagedPct:
          sampleData.fieldSources.damagedPct === "misurazione_utente"
            ? sampleData.damagedPct
            : Math.round(aiResult.features.visibleDefectsPct ?? sampleData.damagedPct),
        oliveFlyPct:
          sampleData.fieldSources.oliveFlyPct === "misurazione_utente"
            ? sampleData.oliveFlyPct
            : Math.round(aiResult.features.oliveFlySignsPct ?? sampleData.oliveFlyPct),
        fieldSources: {
          ...sampleData.fieldSources,
          pulpToPit:
            sampleData.fieldSources.pulpToPit === "misurazione_utente"
              ? "misurazione_utente"
              : aiResult.features.pulpToPitObservable &&
                aiResult.features.pulpToPitEstimate != null
              ? "valutazione_visiva"
              : sampleData.fieldSources.pulpToPit,
        },
      };

      const newPrediction = computeYieldPrediction({
        cultivar: analysis.cultivar,
        sampleWeightGrams: analysis.sampleWeightGrams,
        lotWeightKg: analysis.lotWeightKg,
        photos: merged.map((m) => m.asset),
        features: aiResult.features,
        sampleData: updatedSampleData,
        realHistoricalRecords: isDemoAnalysis(analysis)
          ? []
          : realHistoricalRecords,
        densityKgPerLiter: effectiveDensity,
      });

      const remainingRequests = aiResult.supplementalRequests.filter(
        (r) => !merged.some((m) => m.asset.role === r.role)
      );

      await saveAnalysisMutation.mutateAsync({
        record: {
          ...analysis,
          photos: merged.map((m) => m.asset),
          sampleData: updatedSampleData,
          visualFeatures: aiResult.features,
          prediction: newPrediction,
          supplementalRequests: remainingRequests,
          status: analysis.millOutcome
            ? "verificata_frantoio"
            : remainingRequests.length > 0
            ? "richiesta_foto"
            : "completata",
          updatedAt: new Date().toISOString(),
        },
        photos: [{ asset: processed.asset, blob: processed.blob }],
      });
    } catch (err) {
      setRefineError(
        err instanceof Error
          ? err.message
          : "Errore durante la nuova analisi fotografica."
      );
    } finally {
      setRefining(false);
    }
  }

  async function handleSubmitMillOutcome(e: React.FormEvent) {
    e.preventDefault();
    if (!analysis || millLotKg <= 0 || millOilKg <= 0) return;

    await recordMillMutation.mutateAsync({
      analysisId: analysis.id,
      outcome: {
        harvestDate: millHarvestDate || analysis.harvestDate,
        lotWeightKg: millLotKg,
        actualOilKg: Math.round(millOilKg * 10) / 10,
        actualOilLiters: Math.round(millOilLiters * 10) / 10,
        actualYieldPct: computedYieldPct,
        millName: millName.trim() || undefined,
        extractionMethod,
        recordedAt: new Date().toISOString(),
        notes: millNotes.trim() || undefined,
      },
    });
    setEditingMill(false);
    setMillSavedNotice(true);
    setTimeout(() => setMillSavedNotice(false), 3500);
  }

  // Gauge scale 8% .. 25%
  const scaleMin = 8;
  const scaleMax = 25;
  const toScalePct = (val: number) =>
    Math.min(100, Math.max(0, ((val - scaleMin) / (scaleMax - scaleMin)) * 100));

  const deltaYieldPct =
    pred && mill
      ? Math.round((mill.actualYieldPct - pred.predictedYieldPct) * 10) / 10
      : null;
  const deltaOilKg =
    pred && mill
      ? Math.round((mill.actualOilKg - pred.estimatedOilKg) * 10) / 10
      : null;
  const insideInterval =
    pred && mill
      ? mill.actualYieldPct >= pred.uncertaintyIntervalPct[0] &&
        mill.actualYieldPct <= pred.uncertaintyIntervalPct[1]
      : null;

  const oilKgPer100 = pred?.oilKgPer100Kg ?? pred?.predictedYieldPct ?? 0;
  const oilLitersPer100 =
    pred?.oilLitersPer100Kg ??
    Math.round((oilKgPer100 / effectiveDensity) * 10) / 10;
  const minYieldPct =
    pred?.minYieldPct ?? pred?.uncertaintyIntervalPct[0] ?? 0;
  const maxYieldPct =
    pred?.maxYieldPct ?? pred?.uncertaintyIntervalPct[1] ?? 0;

  return (
    <div className="space-y-6">
      {/* Header Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={onBack}
            aria-label="Torna indietro"
            className="min-h-[44px] min-w-[44px] rounded-xl bg-white border border-mineral-200 flex items-center justify-center text-forest-900 hover:bg-mineral-100 transition-colors cursor-pointer shrink-0"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="min-w-0">
            <p className="text-xs text-forest-800/65 truncate">
              {analysis.code} · {analysis.cultivar} · {analysis.groveLocation} ·{" "}
              {formatDateIt(analysis.harvestDate)}
            </p>
            <h1 className="font-display text-xl md:text-2xl font-semibold text-forest-950 truncate">
              {analysis.title}
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {!confirmDelete ? (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="min-h-[40px] px-3.5 py-2 rounded-xl bg-white border border-mineral-200 hover:border-red-300 text-xs font-medium text-forest-800 hover:text-red-700 flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Elimina
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={async () => {
                  await deleteMutation.mutateAsync(analysis.id);
                  onBack();
                }}
                className="min-h-[40px] px-3.5 py-2 rounded-xl bg-red-700 text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
              >
                Conferma eliminazione
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="min-h-[40px] px-3 py-2 rounded-xl bg-mineral-100 text-forest-950 text-xs font-medium cursor-pointer whitespace-nowrap"
              >
                Annulla
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Origin & Disclaimer Banner */}
      <div
        className={`rounded-xl border px-4 py-3 flex items-start gap-3 text-xs text-forest-950 ${
          isDemoAnalysis(analysis)
            ? "bg-gold-50 border-gold-200"
            : "bg-olive-50 border-olive-200"
        }`}
      >
        <Info className="w-4 h-4 text-gold-700 shrink-0 mt-0.5" />
        <div className="space-y-0.5 leading-relaxed">
          <p>
            <strong className="font-semibold">
              {getOriginLabel(analysis.dataOrigin)} ·{" "}
              {getStatusLabel(analysis.status)}:
            </strong>{" "}
            {pred?.disclaimer ??
              "Stima statistica della resa estraibile su 100 kg di olive."}
          </p>
          {pred?.calibration && (
            <p className="text-forest-800/80">
              <strong className="font-semibold">Calibrazione:</strong>{" "}
              {pred.calibration.reason}
            </p>
          )}
        </div>
      </div>

      {refineError && (
        <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-xs text-red-900">
          {refineError}
        </div>
      )}

      {/* Main Results Grid */}
      {pred && (
        <div className="grid lg:grid-cols-12 gap-6 items-start">
          {/* Primary Yield & Per-100kg Extractable Card */}
          <section className="lg:col-span-7 bg-forest-900 text-white rounded-2xl p-6 md:p-7 space-y-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs text-gold-200 font-medium">
                  Resa effettiva stimata al frantoio (su 100 kg di olive)
                </p>
                <div className="flex items-baseline gap-3 mt-1">
                  <span className="font-display text-5xl md:text-6xl font-semibold tracking-tight tabular-nums">
                    {formatPct(pred.predictedYieldPct)}
                  </span>
                  <span className="font-mono text-sm text-gold-200 tabular-nums">
                    ± {formatPct(pred.marginPct)}
                  </span>
                </div>
              </div>
              <div className="text-right text-xs text-white/75">
                <p>Campione: {formatGrams(analysis.sampleWeightGrams)}</p>
                {sampleData.oliveCount && (
                  <p className="mt-0.5">{sampleData.oliveCount} olive</p>
                )}
                <p className="mt-0.5">
                  Lotto: {formatKg(analysis.lotWeightKg, 0)}
                </p>
              </div>
            </div>

            {/* Min / Probable / Max + Per 100kg Summary */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-white/15 text-xs">
              <div>
                <span className="text-white/65">Minima</span>
                <p className="font-mono text-base font-semibold tabular-nums mt-0.5">
                  {formatPct(minYieldPct)}
                </p>
              </div>
              <div>
                <span className="text-white/65">Più probabile</span>
                <p className="font-mono text-base font-semibold text-gold-200 tabular-nums mt-0.5">
                  {formatPct(pred.predictedYieldPct)}
                </p>
              </div>
              <div>
                <span className="text-white/65">Massima</span>
                <p className="font-mono text-base font-semibold tabular-nums mt-0.5">
                  {formatPct(maxYieldPct)}
                </p>
              </div>
              <div>
                <span className="text-white/65">Da 100 kg olive</span>
                <p className="font-mono text-base font-semibold tabular-nums mt-0.5">
                  {formatNumberIt(oilKgPer100)} kg · ~{formatNumberIt(oilLitersPer100)} L
                </p>
              </div>
            </div>

            {/* Theoretical fruit oil vs Extractable Mill Efficiency */}
            {pred.theoreticalFruitOilPct !== undefined &&
              pred.millExtractionEfficiencyPct !== undefined && (
                <div className="grid grid-cols-2 gap-3 rounded-xl bg-white/10 px-4 py-3 text-xs">
                  <div>
                    <span className="text-white/70">
                      Olio teorico nella drupa
                    </span>
                    <p className="font-mono font-semibold text-white tabular-nums mt-0.5">
                      {formatPct(pred.theoreticalFruitOilPct)}
                    </p>
                  </div>
                  <div>
                    <span className="text-white/70">
                      Efficienza frantoio applicata
                    </span>
                    <p className="font-mono font-semibold text-gold-200 tabular-nums mt-0.5">
                      {formatPct(pred.millExtractionEfficiencyPct)}
                    </p>
                  </div>
                </div>
              )}

            {/* Visual Uncertainty Interval Gauge */}
            <div className="space-y-2 pt-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-white/75">
                  Intervallo di incertezza (confidenza {pred.confidenceLevel})
                </span>
                <span className="font-mono font-semibold text-gold-200 tabular-nums">
                  {formatPct(pred.uncertaintyIntervalPct[0])} –{" "}
                  {formatPct(pred.uncertaintyIntervalPct[1])}
                </span>
              </div>
              <div className="relative h-3 rounded-full bg-white/15 overflow-hidden">
                <div
                  className="absolute top-0 bottom-0 rounded-full bg-gold-500/80"
                  style={{
                    left: `${toScalePct(pred.uncertaintyIntervalPct[0])}%`,
                    width: `${Math.max(
                      4,
                      toScalePct(pred.uncertaintyIntervalPct[1]) -
                        toScalePct(pred.uncertaintyIntervalPct[0])
                    )}%`,
                  }}
                />
                <div
                  className="absolute top-0 bottom-0 w-1 bg-white"
                  style={{ left: `${toScalePct(pred.predictedYieldPct)}%` }}
                />
                {mill && (
                  <div
                    title={`Resa reale frantoio: ${formatPct(mill.actualYieldPct)}`}
                    className="absolute -top-0.5 -bottom-0.5 w-1.5 bg-emerald-300"
                    style={{ left: `${toScalePct(mill.actualYieldPct)}%` }}
                  />
                )}
              </div>
              <div className="flex justify-between text-[10px] font-mono text-white/50 tabular-nums">
                <span>8%</span>
                <span>14%</span>
                <span>20%</span>
                <span>25%</span>
              </div>
            </div>

            {/* Total Lot Kg and Liters Estimated */}
            <div className="grid grid-cols-2 gap-4 pt-2 border-t border-white/15">
              <div>
                <p className="text-xs text-white/70 flex items-center gap-1.5">
                  <Scale className="w-3.5 h-3.5 text-gold-200" />
                  Olio stimato sul lotto (kg)
                </p>
                <p className="font-mono text-2xl font-semibold mt-1 tabular-nums">
                  {formatKg(pred.estimatedOilKg)}
                </p>
                <p className="text-[11px] font-mono text-white/65 tabular-nums mt-0.5">
                  Range {formatNumberIt(pred.oilKgRange[0])} –{" "}
                  {formatNumberIt(pred.oilKgRange[1])} kg
                </p>
              </div>
              <div>
                <p className="text-xs text-white/70 flex items-center gap-1.5">
                  <Droplets className="w-3.5 h-3.5 text-gold-200" />
                  Olio stimato sul lotto (litri)
                </p>
                <p className="font-mono text-2xl font-semibold mt-1 tabular-nums">
                  {formatLiters(pred.estimatedOilLiters)}
                </p>
                <p className="text-[11px] font-mono text-white/65 tabular-nums mt-0.5">
                  Range {formatNumberIt(pred.oilLitersRange[0])} –{" "}
                  {formatNumberIt(pred.oilLitersRange[1])} L (densità{" "}
                  {formatNumberIt(effectiveDensity, 3)} kg/L)
                </p>
              </div>
            </div>
          </section>

          {/* Right Column: Harvest Advice + Actual Mill Result */}
          <div className="lg:col-span-5 space-y-5">
            {pred.harvestAdvice && (
              <section
                className={`rounded-2xl border p-5 space-y-2 ${
                  pred.harvestAdvice.urgencyLevel === "rischio"
                    ? "bg-amber-50 border-amber-200"
                    : pred.harvestAdvice.urgencyLevel === "raccogliere"
                    ? "bg-olive-50 border-olive-200"
                    : "bg-white border-mineral-200"
                }`}
              >
                <div className="flex items-center gap-2 text-xs font-semibold text-forest-800/75">
                  <Sprout className="w-4 h-4 text-olive-700 shrink-0" />
                  <span>Consiglio sulla raccolta</span>
                </div>
                <p className="font-display text-lg font-semibold text-forest-950">
                  {pred.harvestAdvice.recommendation}
                </p>
                <p className="text-xs text-forest-800/80 leading-relaxed">
                  {pred.harvestAdvice.rationale}
                </p>
              </section>
            )}

            {/* Actual Mill Result / Comparison Card */}
            <section className="bg-white rounded-2xl border border-mineral-200 p-5 md:p-6 space-y-4">
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-display text-lg font-semibold text-forest-950">
                  Risultato reale del frantoio
                </h2>
                {mill && !editingMill && (
                  <button
                    type="button"
                    onClick={() => setEditingMill(true)}
                    className="text-xs font-semibold text-forest-900 hover:text-gold-700 cursor-pointer"
                  >
                    Modifica
                  </button>
                )}
              </div>

              {millSavedNotice && (
                <div className="rounded-xl bg-olive-50 border border-olive-100 px-3 py-2 text-xs text-forest-950 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-olive-600 shrink-0" />
                  <span>
                    Resa reale del frantoio salvata e inclusa nello storico di taratura.
                  </span>
                </div>
              )}

              {mill && !editingMill ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-3 gap-3 py-3 border-y border-mineral-100">
                    <div>
                      <p className="text-[11px] text-forest-800/65">
                        Resa reale
                      </p>
                      <p className="font-mono text-xl font-semibold text-forest-950 tabular-nums">
                        {formatPct(mill.actualYieldPct)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] text-forest-800/65">
                        Olio reale
                      </p>
                      <p className="font-mono text-xl font-semibold text-forest-950 tabular-nums">
                        {formatKg(mill.actualOilKg)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] text-forest-800/65">
                        Litri reali
                      </p>
                      <p className="font-mono text-xl font-semibold text-forest-950 tabular-nums">
                        {formatLiters(mill.actualOilLiters)}
                      </p>
                    </div>
                  </div>

                  {/* Comparison Summary */}
                  <div className="space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-forest-800/75">
                        Scostamento dalla stima
                      </span>
                      <span className="font-mono font-semibold text-forest-950 tabular-nums">
                        {deltaYieldPct !== null
                          ? formatSignedPct(deltaYieldPct)
                          : "—"}{" "}
                        (
                        {deltaOilKg !== null
                          ? `${deltaOilKg > 0 ? "+" : ""}${formatNumberIt(deltaOilKg)} kg`
                          : ""}
                        )
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-forest-800/75">
                        Copertura intervallo stimato
                      </span>
                      <span className="font-semibold text-forest-950">
                        {insideInterval
                          ? "Dentro l'intervallo previsto"
                          : "Fuori dall'intervallo previsto"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-forest-800/75">
                        Olive conferite · Data
                      </span>
                      <span className="font-medium text-forest-950 tabular-nums">
                        {formatKg(mill.lotWeightKg, 0)} ·{" "}
                        {formatDateIt(mill.harvestDate ?? analysis.harvestDate)}
                      </span>
                    </div>
                    {mill.millName && (
                      <div className="flex items-center justify-between">
                        <span className="text-forest-800/75">Frantoio</span>
                        <span className="font-medium text-forest-950">
                          {mill.millName}
                        </span>
                      </div>
                    )}
                    <div className="flex items-center justify-between">
                      <span className="text-forest-800/75">Impianto</span>
                      <span className="font-medium text-forest-950">
                        {getExtractionMethodLabel(mill.extractionMethod)}
                      </span>
                    </div>
                  </div>

                  {mill.notes && (
                    <p className="text-xs text-forest-800/75 pt-2 border-t border-mineral-100">
                      {mill.notes}
                    </p>
                  )}
                </div>
              ) : (
                <form
                  onSubmit={handleSubmitMillOutcome}
                  className="space-y-3.5"
                >
                  <p className="text-xs text-forest-800/75">
                    Registra i dati effettivi di molitura per confrontare la stima iniziale con la resa reale e alimentare la calibrazione progressiva.
                  </p>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label
                        htmlFor="mill-harvest-date"
                        className="block text-[11px] font-semibold text-forest-900"
                      >
                        Data raccolta / conferimento
                      </label>
                      <input
                        id="mill-harvest-date"
                        type="date"
                        value={millHarvestDate}
                        onChange={(e) => setMillHarvestDate(e.target.value)}
                        className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-mineral-200 bg-mineral-50 text-xs font-medium"
                      />
                    </div>
                    <div className="space-y-1">
                      <label
                        htmlFor="mill-lot-kg"
                        className="block text-[11px] font-semibold text-forest-900"
                      >
                        Peso olive conferite (kg)
                      </label>
                      <input
                        id="mill-lot-kg"
                        type="number"
                        min={1}
                        step={1}
                        value={millLotKg}
                        onChange={(e) => setMillLotKg(Number(e.target.value))}
                        className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-mineral-200 bg-mineral-50 font-mono text-sm font-semibold tabular-nums"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label
                        htmlFor="mill-oil-kg"
                        className="block text-[11px] font-semibold text-forest-900"
                      >
                        Kg effettivi di olio
                      </label>
                      <input
                        id="mill-oil-kg"
                        type="number"
                        min={0.5}
                        step={0.1}
                        value={millOilKg}
                        onChange={(e) =>
                          handleMillOilKgChange(Number(e.target.value))
                        }
                        className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-mineral-200 bg-mineral-50 font-mono text-sm font-semibold tabular-nums"
                      />
                    </div>
                    <div className="space-y-1">
                      <label
                        htmlFor="mill-oil-liters"
                        className="block text-[11px] font-semibold text-forest-900"
                      >
                        Litri effettivi di olio
                      </label>
                      <input
                        id="mill-oil-liters"
                        type="number"
                        min={0.5}
                        step={0.1}
                        value={millOilLiters}
                        onChange={(e) => {
                          setLitersManuallyEdited(true);
                          setMillOilLiters(Number(e.target.value));
                        }}
                        className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-mineral-200 bg-mineral-50 font-mono text-sm font-semibold tabular-nums"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-mineral-100 text-xs">
                    <span className="text-forest-800/75">
                      Resa reale calcolata:
                    </span>
                    <span className="font-mono font-semibold text-forest-950 tabular-nums">
                      {formatPct(computedYieldPct)} ·{" "}
                      {formatLiters(millOilLiters)}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label
                        htmlFor="mill-name"
                        className="block text-[11px] font-semibold text-forest-900"
                      >
                        Frantoio (opzionale)
                      </label>
                      <input
                        id="mill-name"
                        type="text"
                        value={millName}
                        onChange={(e) => setMillName(e.target.value)}
                        placeholder="Es. Frantoio San Michele"
                        className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-mineral-200 bg-mineral-50 text-xs"
                      />
                    </div>
                    <div className="space-y-1">
                      <label
                        htmlFor="mill-method"
                        className="block text-[11px] font-semibold text-forest-900"
                      >
                        Metodo estrazione
                      </label>
                      <select
                        id="mill-method"
                        value={extractionMethod}
                        onChange={(e) =>
                          setExtractionMethod(
                            e.target.value as MillExtractionMethod
                          )
                        }
                        className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-mineral-200 bg-mineral-50 text-xs"
                      >
                        <option value="continuo_2_fasi">Continuo 2 fasi</option>
                        <option value="continuo_3_fasi">Continuo 3 fasi</option>
                        <option value="tradizionale">Tradizionale</option>
                      </select>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label
                      htmlFor="mill-notes"
                      className="block text-[11px] font-semibold text-forest-900"
                    >
                      Note molitura (opzionale)
                    </label>
                    <input
                      id="mill-notes"
                      type="text"
                      value={millNotes}
                      onChange={(e) => setMillNotes(e.target.value)}
                      placeholder="Es. Temperatura gramolazione 25°C, olive asciutte"
                      className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-mineral-200 bg-mineral-50 text-xs"
                    />
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="submit"
                      disabled={recordMillMutation.isPending}
                      className="flex-1 min-h-[44px] px-4 py-2.5 rounded-xl bg-forest-900 hover:bg-forest-800 text-white text-xs font-semibold transition-colors cursor-pointer"
                    >
                      {recordMillMutation.isPending
                        ? "Salvataggio..."
                        : "Registra resa reale"}
                    </button>
                    {editingMill && (
                      <button
                        type="button"
                        onClick={() => setEditingMill(false)}
                        className="min-h-[44px] px-4 py-2.5 rounded-xl bg-mineral-100 text-forest-950 text-xs font-medium cursor-pointer"
                      >
                        Annulla
                      </button>
                    )}
                  </div>
                </form>
              )}
            </section>
          </div>
        </div>
      )}

      {/* Sample Quantitative Parameters & Manual Override Section */}
      {pred && features && (
        <section className="bg-white rounded-2xl border border-mineral-200 p-5 md:p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-lg font-semibold text-forest-950">
                Caratteristiche fisiche del campione e modifica manuale
              </h2>
              <p className="text-xs text-forest-800/70">
                Ogni parametro indica se deriva da stima visiva AI o da misurazione diretta dell&apos;utente.
              </p>
            </div>
            {!editingSampleParams && (
              <button
                type="button"
                onClick={() => setEditingSampleParams(true)}
                className="min-h-[40px] px-3.5 py-2 rounded-xl bg-mineral-100 hover:bg-olive-100 text-forest-950 text-xs font-semibold flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
              >
                <Edit3 className="w-3.5 h-3.5" />
                Modifica dati campione
              </button>
            )}
          </div>

          {sampleSavedNotice && (
            <div className="rounded-xl bg-olive-50 border border-olive-100 px-3 py-2 text-xs text-forest-950 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-olive-600 shrink-0" />
              <span>
                Parametri aggiornati e resa olearia ricalcolata.
              </span>
            </div>
          )}

          {!editingSampleParams ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-2 border-t border-mineral-100 text-xs">
              <div>
                <span className="text-forest-800/65">Numero olive</span>
                <p className="font-mono font-semibold text-forest-950 mt-0.5 tabular-nums">
                  {sampleData.oliveCount ?? "Non rilevato"}
                </p>
                <p className="text-[11px] text-forest-800/60">
                  {getParameterSourceLabel(sampleData.fieldSources.oliveCount)}
                </p>
              </div>
              <div>
                <span className="text-forest-800/65">Dimensione e consistenza</span>
                <p className="font-semibold text-forest-950 mt-0.5">
                  {getSizeLabel(sampleData.averageSize)} ·{" "}
                  {getConsistencyLabel(sampleData.consistency)}
                </p>
                <p className="text-[11px] text-forest-800/60">
                  {getParameterSourceLabel(sampleData.fieldSources.consistency)}
                </p>
              </div>
              <div>
                <span className="text-forest-800/65">
                  Disidratazione e uniformità
                </span>
                <p className="font-semibold text-forest-950 mt-0.5">
                  {getDehydrationLabel(sampleData.dehydrationLevel)} · Unif.{" "}
                  {getUniformityLabel(features.maturationUniformity)}
                </p>
                <p className="text-[11px] text-forest-800/60">
                  {features.shrivelingDetected
                    ? "Segni di raggrinzimento rilevati"
                    : "Nessun raggrinzimento marcato"}
                </p>
              </div>
              <div>
                <span className="text-forest-800/65">Danni e mosca</span>
                <p className="font-mono font-semibold text-forest-950 mt-0.5 tabular-nums">
                  Danni {Math.round(sampleData.damagedPct)}% · Mosca{" "}
                  {Math.round(sampleData.oliveFlyPct)}%
                </p>
                <p className="text-[11px] text-forest-800/60">
                  {getParameterSourceLabel(sampleData.fieldSources.damagedPct)}
                </p>
              </div>
              <div>
                <span className="text-forest-800/65">Rapporto polpa/nocciolo</span>
                <p className="font-mono font-semibold text-forest-950 mt-0.5 tabular-nums">
                  {sampleData.measuredPulpToPit !== undefined
                    ? `${sampleData.measuredPulpToPit.toFixed(1)} : 1`
                    : features.pulpToPitObservable &&
                      features.pulpToPitEstimate != null
                    ? `${features.pulpToPitEstimate.toFixed(1)} : 1`
                    : "Non misurato / non tagliate"}
                </p>
                <p className="text-[11px] text-forest-800/60">
                  {getParameterSourceLabel(sampleData.fieldSources.pulpToPit)}
                </p>
              </div>
              <div>
                <span className="text-forest-800/65">Efficienza frantoio</span>
                <p className="font-semibold text-forest-950 mt-0.5">
                  {getMillEfficiencyPrefLabel(
                    sampleData.millEfficiencyPreference
                  )}
                </p>
              </div>
              {sampleData.notes && (
                <div className="col-span-2">
                  <span className="text-forest-800/65">Annotazioni campione</span>
                  <p className="text-forest-950 mt-0.5">{sampleData.notes}</p>
                </div>
              )}
            </div>
          ) : (
            <form
              onSubmit={handleSaveSampleOverrides}
              className="space-y-4 pt-2 border-t border-mineral-100"
            >
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="block text-[11px] font-semibold text-forest-900">
                    Varietà (cultivar)
                  </label>
                  <select
                    value={editCultivar}
                    onChange={(e) =>
                      setEditCultivar(e.target.value as OliveCultivar)
                    }
                    className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-mineral-200 bg-mineral-50 text-xs font-medium"
                  >
                    {CULTIVAR_OPTIONS.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="block text-[11px] font-semibold text-forest-900">
                    Peso campione (g)
                  </label>
                  <input
                    type="number"
                    min={50}
                    max={25000}
                    value={editSampleGrams}
                    onChange={(e) => setEditSampleGrams(Number(e.target.value))}
                    className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-mineral-200 bg-mineral-50 font-mono text-xs font-semibold tabular-nums"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-[11px] font-semibold text-forest-900">
                    Lotto stimato (kg)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={500000}
                    value={editLotKg}
                    onChange={(e) => setEditLotKg(Number(e.target.value))}
                    className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-mineral-200 bg-mineral-50 font-mono text-xs font-semibold tabular-nums"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="space-y-1">
                  <label className="block text-[11px] font-semibold text-forest-900">
                    Numero olive
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={5000}
                    value={editSampleData.oliveCount ?? ""}
                    onChange={(e) =>
                      setEditSampleData((prev) => ({
                        ...prev,
                        oliveCount: e.target.value
                          ? Number(e.target.value)
                          : undefined,
                        fieldSources: {
                          ...prev.fieldSources,
                          oliveCount: e.target.value
                            ? "misurazione_utente"
                            : "non_rilevabile",
                        },
                      }))
                    }
                    placeholder="Es. 380"
                    className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-mineral-200 bg-mineral-50 font-mono text-xs tabular-nums"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-[11px] font-semibold text-forest-900">
                    Dimensione media
                  </label>
                  <select
                    value={editSampleData.averageSize}
                    onChange={(e) =>
                      setEditSampleData((prev) => ({
                        ...prev,
                        averageSize: e.target.value as OliveSizeCategory,
                        fieldSources: {
                          ...prev.fieldSources,
                          averageSize: "misurazione_utente",
                        },
                      }))
                    }
                    className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-mineral-200 bg-mineral-50 text-xs"
                  >
                    <option value="piccola">Piccola</option>
                    <option value="media">Media</option>
                    <option value="grande">Grande</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="block text-[11px] font-semibold text-forest-900">
                    Consistenza
                  </label>
                  <select
                    value={editSampleData.consistency}
                    onChange={(e) =>
                      setEditSampleData((prev) => ({
                        ...prev,
                        consistency: e.target.value as OliveConsistency,
                        fieldSources: {
                          ...prev.fieldSources,
                          consistency: "misurazione_utente",
                        },
                      }))
                    }
                    className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-mineral-200 bg-mineral-50 text-xs"
                  >
                    <option value="soda">Soda</option>
                    <option value="media">Media</option>
                    <option value="molle">Molle</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="block text-[11px] font-semibold text-forest-900">
                    Disidratazione
                  </label>
                  <select
                    value={editSampleData.dehydrationLevel}
                    onChange={(e) =>
                      setEditSampleData((prev) => ({
                        ...prev,
                        dehydrationLevel: e.target.value as DehydrationLevel,
                      }))
                    }
                    className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-mineral-200 bg-mineral-50 text-xs"
                  >
                    <option value="assente">Assente</option>
                    <option value="lieve">Lieve</option>
                    <option value="moderata">Moderata</option>
                    <option value="marcata">Marcata</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="space-y-1">
                  <label className="block text-[11px] font-semibold text-forest-900">
                    % danneggiate
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={editSampleData.damagedPct}
                    onChange={(e) =>
                      setEditSampleData((prev) => ({
                        ...prev,
                        damagedPct: Number(e.target.value),
                        fieldSources: {
                          ...prev.fieldSources,
                          damagedPct: "misurazione_utente",
                        },
                      }))
                    }
                    className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-mineral-200 bg-mineral-50 font-mono text-xs tabular-nums"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-[11px] font-semibold text-forest-900">
                    % segni di mosca
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={editSampleData.oliveFlyPct}
                    onChange={(e) =>
                      setEditSampleData((prev) => ({
                        ...prev,
                        oliveFlyPct: Number(e.target.value),
                        fieldSources: {
                          ...prev.fieldSources,
                          oliveFlyPct: "misurazione_utente",
                        },
                      }))
                    }
                    className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-mineral-200 bg-mineral-50 font-mono text-xs tabular-nums"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-[11px] font-semibold text-forest-900">
                    Polpa/nocciolo misurato
                  </label>
                  <input
                    type="number"
                    min={1.5}
                    max={9}
                    step={0.1}
                    value={editSampleData.measuredPulpToPit ?? ""}
                    onChange={(e) =>
                      setEditSampleData((prev) => ({
                        ...prev,
                        measuredPulpToPit: e.target.value
                          ? Number(e.target.value)
                          : undefined,
                        fieldSources: {
                          ...prev.fieldSources,
                          pulpToPit: e.target.value
                            ? "misurazione_utente"
                            : "non_rilevabile",
                        },
                      }))
                    }
                    placeholder="Es. 4.5"
                    className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-mineral-200 bg-mineral-50 font-mono text-xs tabular-nums"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-[11px] font-semibold text-forest-900">
                    Efficienza frantoio
                  </label>
                  <select
                    value={editSampleData.millEfficiencyPreference}
                    onChange={(e) =>
                      setEditSampleData((prev) => ({
                        ...prev,
                        millEfficiencyPreference: e.target
                          .value as MillEfficiencyPreference,
                      }))
                    }
                    className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-mineral-200 bg-mineral-50 text-xs"
                  >
                    <option value="standard">Standard (~84-85%)</option>
                    <option value="alta">Alta (2 fasi ~87%)</option>
                    <option value="bassa">Bassa (~80%)</option>
                    <option value="sconosciuta">Non conosciuta</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="block text-[11px] font-semibold text-forest-900">
                    Verdi (%)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={editGreenPct}
                    onChange={(e) =>
                      handleEditColorChange("green", Number(e.target.value))
                    }
                    className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-mineral-200 bg-mineral-50 font-mono text-xs tabular-nums"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-[11px] font-semibold text-forest-900">
                    Invaiate (%)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={editTurningPct}
                    onChange={(e) =>
                      handleEditColorChange("turning", Number(e.target.value))
                    }
                    className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-mineral-200 bg-mineral-50 font-mono text-xs tabular-nums"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-[11px] font-semibold text-forest-900">
                    Nere (%)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={editBlackPct}
                    onChange={(e) =>
                      handleEditColorChange("black", Number(e.target.value))
                    }
                    className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-mineral-200 bg-mineral-50 font-mono text-xs tabular-nums"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="block text-[11px] font-semibold text-forest-900">
                  Annotazioni sul campione
                </label>
                <input
                  type="text"
                  value={editSampleData.notes ?? ""}
                  onChange={(e) =>
                    setEditSampleData((prev) => ({
                      ...prev,
                      notes: e.target.value,
                    }))
                  }
                  placeholder="Note agronomiche sul prelievo..."
                  className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-mineral-200 bg-mineral-50 text-xs"
                />
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="submit"
                  disabled={saveAnalysisMutation.isPending}
                  className="min-h-[44px] px-5 py-2.5 rounded-xl bg-forest-900 hover:bg-forest-800 text-white text-xs font-semibold cursor-pointer"
                >
                  {saveAnalysisMutation.isPending
                    ? "Ricalcolo in corso..."
                    : "Salva e ricalcola resa"}
                </button>
                <button
                  type="button"
                  onClick={() => setEditingSampleParams(false)}
                  className="min-h-[44px] px-4 py-2.5 rounded-xl bg-mineral-100 text-forest-950 text-xs font-medium cursor-pointer"
                >
                  Annulla
                </button>
              </div>
            </form>
          )}
        </section>
      )}

      {/* Visual Morphology & Statistical Breakdown */}
      {pred && features && (
        <div className="grid lg:grid-cols-12 gap-6 items-start">
          {/* Factor Table */}
          <section className="lg:col-span-7 bg-white rounded-2xl border border-mineral-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-mineral-100">
              <h2 className="font-display text-lg font-semibold text-forest-950">
                Fattori del modello di resa estraibile
              </h2>
              <p className="text-xs text-forest-800/70 mt-0.5">
                {features.summaryNote}
              </p>
            </div>
            <div className="divide-y divide-mineral-100">
              {pred.factors.map((factor) => (
                <div
                  key={factor.id}
                  className="px-5 py-3.5 flex items-center justify-between gap-4"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-forest-950">
                      {factor.label}
                    </p>
                    <p className="text-xs text-forest-800/65 mt-0.5">
                      {factor.observedValue}
                      {factor.source
                        ? ` · ${getParameterSourceLabel(factor.source)}`
                        : ""}
                    </p>
                    <p className="text-[11px] text-forest-800/60 mt-0.5">
                      {factor.note}
                    </p>
                  </div>
                  <span className="font-mono text-sm font-semibold text-forest-950 tabular-nums shrink-0">
                    {factor.id === "theoretical_fruit_oil" ||
                    factor.id === "cultivar_prior"
                      ? formatPct(factor.impactPct)
                      : formatSignedPct(factor.impactPct)}
                  </span>
                </div>
              ))}
            </div>
          </section>

          {/* Veraison Distribution & Supplemental Photos */}
          <section className="lg:col-span-5 space-y-4">
            <div className="bg-white rounded-2xl border border-mineral-200 p-5 space-y-4">
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-display text-lg font-semibold text-forest-950">
                  Maturazione e stato cromatico
                </h2>
                <span className="font-mono text-xs font-semibold text-forest-900 tabular-nums">
                  Jaén {features.veraisonIndex.toFixed(1)}/5
                </span>
              </div>
              <div className="h-3 rounded-full overflow-hidden flex bg-mineral-100">
                <div
                  style={{ width: `${features.greenPct}%` }}
                  className="bg-olive-500"
                  title={`Verdi ${Math.round(features.greenPct)}%`}
                />
                <div
                  style={{ width: `${features.turningPct}%` }}
                  className="bg-gold-500"
                  title={`Invaiate ${Math.round(features.turningPct)}%`}
                />
                <div
                  style={{ width: `${features.blackPct}%` }}
                  className="bg-forest-950"
                  title={`Nere ${Math.round(features.blackPct)}%`}
                />
              </div>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div>
                  <span className="text-forest-800/65">Verdi</span>
                  <p className="font-mono font-semibold text-forest-950 tabular-nums">
                    {Math.round(features.greenPct)}%
                  </p>
                </div>
                <div>
                  <span className="text-forest-800/65">Invaiate</span>
                  <p className="font-mono font-semibold text-forest-950 tabular-nums">
                    {Math.round(features.turningPct)}%
                  </p>
                </div>
                <div>
                  <span className="text-forest-800/65">Nere</span>
                  <p className="font-mono font-semibold text-forest-950 tabular-nums">
                    {Math.round(features.blackPct)}%
                  </p>
                </div>
              </div>
            </div>

            {analysis.supplementalRequests.length > 0 && (
              <div className="bg-white rounded-2xl border border-gold-200 p-5 space-y-3">
                <h3 className="font-display text-base font-semibold text-forest-950">
                  Foto supplementari consigliate
                </h3>
                {analysis.supplementalRequests.map((req) => (
                  <div key={req.id} className="space-y-2.5 pt-1">
                    <p className="text-xs font-semibold text-forest-950">
                      {req.title} (-
                      {req.expectedUncertaintyReductionPct.toFixed(1)}% margine)
                    </p>
                    <p className="text-xs text-forest-800/75">{req.reason}</p>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={refining}
                        onClick={() => setCameraRole(req.role)}
                        className="flex-1 min-h-[42px] px-3 py-2 rounded-xl bg-forest-900 text-white text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <Camera className="w-4 h-4" />
                        Scatta ora
                      </button>
                      <button
                        type="button"
                        disabled={refining}
                        onClick={() => {
                          setUploadRole(req.role);
                          uploadRef.current?.click();
                        }}
                        className="min-h-[42px] px-3 py-2 rounded-xl bg-mineral-100 text-forest-950 text-xs font-medium flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <ImagePlus className="w-4 h-4" />
                        Carica
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {/* Stored Photos Gallery */}
      <section className="bg-white rounded-2xl border border-mineral-200 p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-lg font-semibold text-forest-950">
            Fotografie del campione ({analysis.photos.length})
          </h2>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={refining}
              onClick={() => setCameraRole("cross_section")}
              className="min-h-[40px] px-3.5 py-2 rounded-xl bg-mineral-100 hover:bg-olive-100 text-forest-950 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
            >
              <Camera className="w-3.5 h-3.5" />
              {refining ? "Analisi..." : "Scatta foto"}
            </button>
            <button
              type="button"
              disabled={refining}
              onClick={() => {
                setUploadRole("closeup");
                uploadRef.current?.click();
              }}
              className="min-h-[40px] px-3.5 py-2 rounded-xl bg-mineral-100 hover:bg-olive-100 text-forest-950 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
            >
              <ImagePlus className="w-3.5 h-3.5" />
              Carica immagine
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {analysis.photos.map((photo) => (
            <div
              key={photo.id}
              className="rounded-xl border border-mineral-200 overflow-hidden bg-mineral-50"
            >
              <div className="aspect-[4/3] bg-mineral-100">
                {photo.previewUrl && (
                  <img
                    src={photo.previewUrl}
                    alt={PHOTO_ROLE_LABELS[photo.role]}
                    className="w-full h-full object-cover"
                  />
                )}
              </div>
              <div className="p-3 space-y-0.5">
                <p className="text-xs font-semibold text-forest-950">
                  {PHOTO_ROLE_LABELS[photo.role]}
                </p>
                <p className="text-[11px] text-forest-800/70">
                  {getPhotoQualityLabel(photo.quality.qualityFlag)} ·{" "}
                  <span className="font-mono tabular-nums">
                    {photo.width}×{photo.height} · {formatBytes(photo.sizeBytes)}
                  </span>
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <input
        ref={uploadRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) {
            handleAddSupplementalPhoto(file, uploadRole, "upload");
          }
          e.target.value = "";
        }}
      />

      <CameraCaptureModal
        open={cameraRole !== null}
        role={cameraRole ?? "cross_section"}
        instruction="Acquisisci una fotografia nitida e ben illuminata per affinare la stima del campione."
        onCaptureBlob={(blob, source) => {
          const role = cameraRole ?? "cross_section";
          setCameraRole(null);
          handleAddSupplementalPhoto(blob, role, source);
        }}
        onClose={() => setCameraRole(null)}
      />
    </div>
  );
}
