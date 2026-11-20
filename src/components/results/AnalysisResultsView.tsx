import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Camera,
  CheckCircle2,
  Droplets,
  ImagePlus,
  Info,
  Scale,
  Trash2,
} from "lucide-react";
import {
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
import { computeYieldPrediction } from "../../services/prediction/yieldEngine";
import type {
  AiEngineMode,
  MillExtractionMethod,
  SamplePhotoRole,
} from "../../types/analysis";
import {
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
  getExtractionMethodLabel,
  getOriginLabel,
  getPhotoQualityLabel,
  getStatusLabel,
} from "../../utils/formatters";
import { CameraCaptureModal } from "../camera/CameraCaptureModal";

interface AnalysisResultsViewProps {
  analysisId: string;
  aiMode: AiEngineMode;
  onBack: () => void;
}

export function AnalysisResultsView({
  analysisId,
  aiMode,
  onBack,
}: AnalysisResultsViewProps) {
  const { data: analysis, isLoading } = useAnalysisDetailQuery(analysisId);
  const recordMillMutation = useRecordMillOutcomeMutation();
  const saveAnalysisMutation = useSaveAnalysisMutation();
  const deleteMutation = useDeleteAnalysisMutation();

  // Mill Outcome Form State
  const [editingMill, setEditingMill] = useState(false);
  const [millLotKg, setMillLotKg] = useState<number>(350);
  const [millOilKg, setMillOilKg] = useState<number>(54);
  const [millName, setMillName] = useState<string>("");
  const [extractionMethod, setExtractionMethod] =
    useState<MillExtractionMethod>("continuo_2_fasi");
  const [millNotes, setMillNotes] = useState<string>("");
  const [millSavedNotice, setMillSavedNotice] = useState(false);

  // Supplemental photo capture state
  const [cameraRole, setCameraRole] = useState<SamplePhotoRole | null>(null);
  const [uploadRole, setUploadRole] = useState<SamplePhotoRole>("cross_section");
  const uploadRef = useRef<HTMLInputElement | null>(null);
  const [refining, setRefining] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!analysis) return;
    if (analysis.millOutcome) {
      setMillLotKg(analysis.millOutcome.lotWeightKg);
      setMillOilKg(analysis.millOutcome.actualOilKg);
      setMillName(analysis.millOutcome.millName ?? "");
      setExtractionMethod(analysis.millOutcome.extractionMethod);
      setMillNotes(analysis.millOutcome.notes ?? "");
    } else {
      setMillLotKg(analysis.lotWeightKg);
      setMillOilKg(
        analysis.prediction?.estimatedOilKg ??
          Math.round(analysis.lotWeightKg * 0.15 * 10) / 10
      );
      setMillName("");
      setMillNotes("");
    }
  }, [analysis]);

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
  const mill = analysis.millOutcome;

  const computedYieldPct =
    millLotKg > 0 ? Math.round((millOilKg / millLotKg) * 1000) / 10 : 0;
  const computedLiters =
    Math.round((millOilKg / OLIVE_OIL_DENSITY_KG_PER_LITER) * 10) / 10;

  async function handleAddSupplementalPhoto(
    blob: Blob,
    role: SamplePhotoRole,
    source: "camera" | "upload"
  ) {
    if (!analysis) return;
    setRefining(true);
    try {
      const processed = await processImageBlob({
        blob,
        analysisId: analysis.id,
        role,
        source,
      });

      const existingBlobs = await getPhotoBlobsForAnalysis(analysis.id);
      const merged = [
        ...existingBlobs.filter((item) => item.asset.role !== role),
        { asset: processed.asset, blob: processed.blob },
      ];

      const aiResult = await runOliveSampleAnalysis(
        analysis.dataOrigin === "gemini_backend" ? "gemini_backend" : aiMode,
        {
          cultivar: analysis.cultivar,
          sampleWeightGrams: analysis.sampleWeightGrams,
          lotWeightKg: analysis.lotWeightKg,
          groveLocation: analysis.groveLocation,
          photos: merged,
        }
      );

      const newPrediction = computeYieldPrediction({
        cultivar: analysis.cultivar,
        sampleWeightGrams: analysis.sampleWeightGrams,
        lotWeightKg: analysis.lotWeightKg,
        photos: merged.map((m) => m.asset),
        features: aiResult.features,
      });

      const remainingRequests = aiResult.supplementalRequests.filter(
        (r) => !merged.some((m) => m.asset.role === r.role)
      );

      await saveAnalysisMutation.mutateAsync({
        record: {
          ...analysis,
          photos: merged.map((m) => m.asset),
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
        lotWeightKg: millLotKg,
        actualOilKg: Math.round(millOilKg * 10) / 10,
        actualOilLiters: computedLiters,
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

  // Gauge scale 8% .. 25% for uncertainty bar
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

      {/* Transparent Origin & Statistical Disclaimer */}
      <div className="rounded-xl bg-gold-50 border border-gold-200 px-4 py-3 flex items-start gap-3 text-xs text-forest-950">
        <Info className="w-4 h-4 text-gold-700 shrink-0 mt-0.5" />
        <p className="leading-relaxed">
          <strong className="font-semibold">
            {getOriginLabel(analysis.dataOrigin)} · {getStatusLabel(analysis.status)}:
          </strong>{" "}
          {pred?.disclaimer ??
            "Stima statistica basata su analisi visiva del campione."}
        </p>
      </div>

      {/* Main Results Grid */}
      {pred && (
        <div className="grid lg:grid-cols-12 gap-6 items-start">
          {/* Primary Yield & Uncertainty Card */}
          <section className="lg:col-span-7 bg-forest-900 text-white rounded-2xl p-6 md:p-7 space-y-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs text-gold-200 font-medium">
                  Resa olearia prevista (stima statistica)
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
                <p className="mt-0.5">
                  Lotto: {formatKg(analysis.lotWeightKg, 0)}
                </p>
              </div>
            </div>

            {/* Visual Uncertainty Interval Gauge */}
            <div className="space-y-2 pt-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-white/75">Intervallo di incertezza</span>
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

            {/* Kg and Liters Estimated */}
            <div className="grid grid-cols-2 gap-4 pt-2 border-t border-white/15">
              <div>
                <p className="text-xs text-white/70 flex items-center gap-1.5">
                  <Scale className="w-3.5 h-3.5 text-gold-200" />
                  Olio stimato (kg)
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
                  Olio stimato (litri)
                </p>
                <p className="font-mono text-2xl font-semibold mt-1 tabular-nums">
                  {formatLiters(pred.estimatedOilLiters)}
                </p>
                <p className="text-[11px] font-mono text-white/65 tabular-nums mt-0.5">
                  Range {formatNumberIt(pred.oilLitersRange[0])} –{" "}
                  {formatNumberIt(pred.oilLitersRange[1])} L (0,916 kg/L)
                </p>
              </div>
            </div>
          </section>

          {/* Actual Mill Result / Comparison Card */}
          <section className="lg:col-span-5 bg-white rounded-2xl border border-mineral-200 p-5 md:p-6 space-y-4">
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
                <span>Resa del frantoio salvata e confrontata con la stima.</span>
              </div>
            )}

            {mill && !editingMill ? (
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-3 py-3 border-y border-mineral-100">
                  <div>
                    <p className="text-[11px] text-forest-800/65">Resa reale</p>
                    <p className="font-mono text-xl font-semibold text-forest-950 tabular-nums">
                      {formatPct(mill.actualYieldPct)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] text-forest-800/65">Olio reale</p>
                    <p className="font-mono text-xl font-semibold text-forest-950 tabular-nums">
                      {formatKg(mill.actualOilKg)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] text-forest-800/65">Litri reali</p>
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
                      {deltaYieldPct !== null ? formatSignedPct(deltaYieldPct) : "—"}{" "}
                      ({deltaOilKg !== null ? `${deltaOilKg > 0 ? "+" : ""}${formatNumberIt(deltaOilKg)} kg` : ""})
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
              <form onSubmit={handleSubmitMillOutcome} className="space-y-3.5">
                <p className="text-xs text-forest-800/75">
                  Inserisci i dati della bolletta di molitura per confrontare la stima iniziale con la resa effettiva.
                </p>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label
                      htmlFor="mill-lot-kg"
                      className="block text-[11px] font-semibold text-forest-900"
                    >
                      Olive molite (kg)
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
                  <div className="space-y-1">
                    <label
                      htmlFor="mill-oil-kg"
                      className="block text-[11px] font-semibold text-forest-900"
                    >
                      Olio ottenuto (kg)
                    </label>
                    <input
                      id="mill-oil-kg"
                      type="number"
                      min={0.5}
                      step={0.1}
                      value={millOilKg}
                      onChange={(e) => setMillOilKg(Number(e.target.value))}
                      className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-mineral-200 bg-mineral-50 font-mono text-sm font-semibold tabular-nums"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-mineral-100 text-xs">
                  <span className="text-forest-800/75">
                    Resa reale calcolata:
                  </span>
                  <span className="font-mono font-semibold text-forest-950 tabular-nums">
                    {formatPct(computedYieldPct)} · {formatLiters(computedLiters)}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label
                      htmlFor="mill-name"
                      className="block text-[11px] font-semibold text-forest-900"
                    >
                      Nome frantoio (opzionale)
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
      )}

      {/* Visual Morphology & Statistical Breakdown */}
      {pred && features && (
        <div className="grid lg:grid-cols-12 gap-6 items-start">
          {/* Factor Table */}
          <section className="lg:col-span-7 bg-white rounded-2xl border border-mineral-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-mineral-100">
              <h2 className="font-display text-lg font-semibold text-forest-950">
                Fattori del modello statistico
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
                      {factor.observedValue} · {factor.note}
                    </p>
                  </div>
                  <span className="font-mono text-sm font-semibold text-forest-950 tabular-nums shrink-0">
                    {factor.id === "cultivar_prior"
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
              <h2 className="font-display text-lg font-semibold text-forest-950">
                Distribuzione cromatica stimata
              </h2>
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
                  Foto supplementari disponibili
                </h3>
                {analysis.supplementalRequests.map((req) => (
                  <div key={req.id} className="space-y-2.5 pt-1">
                    <p className="text-xs font-semibold text-forest-950">
                      {req.title} (-{req.expectedUncertaintyReductionPct.toFixed(1)}% margine)
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
        <div className="flex items-center justify-between gap-4">
          <h2 className="font-display text-lg font-semibold text-forest-950">
            Fotografie del campione ({analysis.photos.length})
          </h2>
          <button
            type="button"
            disabled={refining}
            onClick={() => setCameraRole("cross_section")}
            className="min-h-[40px] px-3.5 py-2 rounded-xl bg-mineral-100 hover:bg-olive-100 text-forest-950 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
          >
            <Camera className="w-3.5 h-3.5" />
            {refining ? "Aggiornamento..." : "Aggiungi scatto"}
          </button>
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
