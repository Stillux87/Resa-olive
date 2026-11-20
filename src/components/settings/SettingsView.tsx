import { useEffect, useState } from "react";
import {
  CheckCircle2,
  Database,
  Download,
  RefreshCw,
  Server,
  ShieldCheck,
  Sliders,
  Trash2,
} from "lucide-react";
import {
  useBackendHealthQuery,
  useDeleteAllDemoMutation,
  useResetDemoMutation,
  useStorageSummaryQuery,
  useUpdateSettingsMutation,
} from "../../hooks/useOlivestimaQueries";
import { exportAnalysesJson } from "../../services/persistence/indexedDb";
import { formatBytes } from "../../services/photos/photoManager";
import type { AiEngineMode, AppSettings } from "../../types/analysis";
import { OLIVE_OIL_DENSITY_KG_PER_LITER } from "../../types/analysis";

interface SettingsViewProps {
  settings: AppSettings;
}

export function SettingsView({ settings }: SettingsViewProps) {
  const healthQuery = useBackendHealthQuery();
  const storageQuery = useStorageSummaryQuery();
  const updateSettingsMutation = useUpdateSettingsMutation();
  const resetDemoMutation = useResetDemoMutation();
  const deleteAllDemoMutation = useDeleteAllDemoMutation();

  const [densityInput, setDensityInput] = useState<string>(
    String(settings.defaultDensityKgPerLiter)
  );
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmDeleteDemo, setConfirmDeleteDemo] = useState(false);
  const [feedback, setFeedback] = useState<string>("");

  useEffect(() => {
    setDensityInput(String(settings.defaultDensityKgPerLiter));
  }, [settings.defaultDensityKgPerLiter]);

  const backendOnline = healthQuery.data?.status === "ok";
  const geminiReady = Boolean(healthQuery.data?.geminiConfigured);

  async function handleSelectMode(mode: AiEngineMode) {
    await updateSettingsMutation.mutateAsync({ aiMode: mode });
    setFeedback(
      mode === "simulato_locale"
        ? "Modalità locale offline attivata."
        : "Modalità Gemini Vision (backend protetto) selezionata."
    );
    setTimeout(() => setFeedback(""), 3000);
  }

  async function handleSaveDensity(e: React.FormEvent) {
    e.preventDefault();
    const parsed = Number(densityInput.replace(",", "."));
    if (!Number.isFinite(parsed) || parsed < 0.88 || parsed > 0.95) {
      setFeedback("Inserisci una densità valida tra 0,880 e 0,950 kg/L.");
      return;
    }
    const rounded = Math.round(parsed * 1000) / 1000;
    await updateSettingsMutation.mutateAsync({
      defaultDensityKgPerLiter: rounded,
    });
    setFeedback(
      `Densità predefinita aggiornata a ${rounded
        .toFixed(3)
        .replace(".", ",")} kg/L per le nuove stime.`
    );
    setTimeout(() => setFeedback(""), 3500);
  }

  async function handleExportJson() {
    const json = await exportAnalysesJson();
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `olivestima-archivio-${new Date()
      .toISOString()
      .slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleResetDemo() {
    await resetDemoMutation.mutateAsync();
    setConfirmReset(false);
    setFeedback(
      "Campioni dimostrativi ripristinati senza modificare i tuoi lotti reali."
    );
    setTimeout(() => setFeedback(""), 3500);
  }

  async function handleDeleteDemoOnly() {
    await deleteAllDemoMutation.mutateAsync();
    setConfirmDeleteDemo(false);
    setFeedback("Tutti i campioni dimostrativi sono stati eliminati.");
    setTimeout(() => setFeedback(""), 3500);
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="font-display text-2xl md:text-3xl font-semibold text-forest-950">
          Motore AI, densità e archivio locale
        </h1>
        <p className="text-sm text-forest-800/75 mt-1">
          Configura l&apos;analisi fotografica Gemini Vision, la densità dell&apos;olio per il calcolo dei litri e la separazione tra dati reali e dimostrativi.
        </p>
      </div>

      {feedback && (
        <div className="rounded-xl bg-olive-50 border border-olive-100 px-4 py-3 text-xs font-medium text-forest-950 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-olive-600 shrink-0" />
          <span>{feedback}</span>
        </div>
      )}

      {/* AI Provider Mode Selector */}
      <section className="bg-white rounded-2xl border border-mineral-200 p-5 md:p-6 space-y-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-display text-lg font-semibold text-forest-950">
              Motore di analisi fotografica
            </h2>
            <p className="text-xs text-forest-800/75 mt-0.5">
              Gemini Vision analizza realmente le fotografie caricate; la modalità offline resta disponibile in assenza di connessione.
            </p>
          </div>
          <Server className="w-5 h-5 text-forest-800/50 shrink-0" />
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => handleSelectMode("gemini_backend")}
            className={`text-left p-4 rounded-xl border transition-colors cursor-pointer space-y-1.5 ${
              settings.aiMode === "gemini_backend"
                ? "border-forest-900 bg-olive-50"
                : "border-mineral-200 bg-mineral-50 hover:bg-white"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-forest-950">
                Gemini Vision (consigliato)
              </span>
              {settings.aiMode === "gemini_backend" && (
                <CheckCircle2 className="w-4 h-4 text-forest-900" />
              )}
            </div>
            <p className="text-xs text-forest-800/75 leading-relaxed">
              Analisi visiva reale tramite endpoint protetto{" "}
              <span className="font-mono">/api/analyze-olive-sample</span> su maturazione, difetti, mosca, dimensione e taglio.
            </p>
          </button>

          <button
            type="button"
            onClick={() => handleSelectMode("simulato_locale")}
            className={`text-left p-4 rounded-xl border transition-colors cursor-pointer space-y-1.5 ${
              settings.aiMode === "simulato_locale"
                ? "border-forest-900 bg-olive-50"
                : "border-mineral-200 bg-mineral-50 hover:bg-white"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-forest-950">
                Simulatore locale offline
              </span>
              {settings.aiMode === "simulato_locale" && (
                <CheckCircle2 className="w-4 h-4 text-forest-900" />
              )}
            </div>
            <p className="text-xs text-forest-800/75 leading-relaxed">
              Modalità di emergenza senza rete: stima locale contrassegnata come simulata, modificabile manualmente.
            </p>
          </button>
        </div>

        {/* Server Status Summary */}
        <div className="rounded-xl bg-mineral-50 border border-mineral-200 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="w-4 h-4 text-olive-700 shrink-0" />
            <div>
              <p className="font-semibold text-forest-950">
                Stato backend protetto:{" "}
                {healthQuery.isLoading
                  ? "Verifica in corso..."
                  : backendOnline
                  ? geminiReady
                    ? "Connesso e pronto per Gemini Vision"
                    : "Server attivo (chiave Gemini non configurata sul server)"
                  : "Non raggiungibile (disponibile modalità offline)"}
              </p>
              <p className="text-forest-800/70 mt-0.5">
                La chiave API risiede esclusivamente lato server e non è mai visibile nel browser.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => healthQuery.refetch()}
            className="min-h-[38px] px-3 py-1.5 rounded-lg bg-white border border-mineral-200 text-xs font-medium text-forest-950 hover:bg-mineral-100 flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Verifica stato
          </button>
        </div>
      </section>

      {/* Oil Density Configuration */}
      <section className="bg-white rounded-2xl border border-mineral-200 p-5 md:p-6 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-display text-lg font-semibold text-forest-950">
              Conversione chilogrammi / litri
            </h2>
            <p className="text-xs text-forest-800/75 mt-0.5">
              Valore di densità dell&apos;olio extravergine a ~20°C usato per convertire i kg stimati in litri indicativi (predefinito 0,916 kg/L).
            </p>
          </div>
          <Sliders className="w-5 h-5 text-forest-800/50 shrink-0" />
        </div>

        <form
          onSubmit={handleSaveDensity}
          className="flex flex-col sm:flex-row sm:items-end gap-3"
        >
          <div className="space-y-1 flex-1">
            <label
              htmlFor="density-input"
              className="block text-xs font-semibold text-forest-900"
            >
              Densità indicativa dell&apos;olio (kg/litro)
            </label>
            <input
              id="density-input"
              type="text"
              inputMode="decimal"
              value={densityInput}
              onChange={(e) => setDensityInput(e.target.value)}
              className="w-full min-h-[42px] px-3.5 py-2 rounded-xl border border-mineral-200 bg-mineral-50 font-mono text-sm font-semibold tabular-nums"
            />
          </div>
          <button
            type="submit"
            className="min-h-[42px] px-4 py-2 rounded-xl bg-forest-900 hover:bg-forest-800 text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
          >
            Salva densità
          </button>
          <button
            type="button"
            onClick={() => {
              setDensityInput(String(OLIVE_OIL_DENSITY_KG_PER_LITER));
              updateSettingsMutation.mutate({
                defaultDensityKgPerLiter: OLIVE_OIL_DENSITY_KG_PER_LITER,
              });
            }}
            className="min-h-[42px] px-3.5 py-2 rounded-xl bg-mineral-100 hover:bg-mineral-200 text-forest-950 text-xs font-medium cursor-pointer whitespace-nowrap"
          >
            Ripristina 0,916
          </button>
        </form>
      </section>

      {/* IndexedDB Persistence & Data Management */}
      <section className="bg-white rounded-2xl border border-mineral-200 p-5 md:p-6 space-y-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-display text-lg font-semibold text-forest-950">
              Archivio locale IndexedDB
            </h2>
            <p className="text-xs text-forest-800/75 mt-0.5">
              I tuoi lotti reali e le fotografie restano sempre separati dai campioni dimostrativi precaricati.
            </p>
          </div>
          <Database className="w-5 h-5 text-forest-800/50 shrink-0" />
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 py-3 border-y border-mineral-100 text-xs">
          <div>
            <span className="text-forest-800/65">Campioni reali</span>
            <p className="font-mono text-lg font-semibold text-forest-950 tabular-nums mt-0.5">
              {storageQuery.data?.realCount ?? 0}
            </p>
          </div>
          <div>
            <span className="text-forest-800/65">Campioni demo</span>
            <p className="font-mono text-lg font-semibold text-gold-700 tabular-nums mt-0.5">
              {storageQuery.data?.demoCount ?? 0}
            </p>
          </div>
          <div>
            <span className="text-forest-800/65">Immagini salvate</span>
            <p className="font-mono text-lg font-semibold text-forest-950 tabular-nums mt-0.5">
              {storageQuery.data?.photosCount ?? 0}
            </p>
          </div>
          <div>
            <span className="text-forest-800/65">Spazio foto</span>
            <p className="font-mono text-lg font-semibold text-forest-950 tabular-nums mt-0.5">
              {formatBytes(storageQuery.data?.totalPhotoBytes ?? 0)}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleExportJson}
            className="min-h-[42px] px-4 py-2 rounded-xl bg-forest-900 hover:bg-forest-800 text-white text-xs font-semibold flex items-center gap-2 transition-colors cursor-pointer"
          >
            <Download className="w-4 h-4" />
            Esporta archivio JSON
          </button>

          {(storageQuery.data?.demoCount ?? 0) > 0 && (
            <>
              {!confirmDeleteDemo ? (
                <button
                  type="button"
                  onClick={() => setConfirmDeleteDemo(true)}
                  className="min-h-[42px] px-4 py-2 rounded-xl bg-white border border-mineral-200 hover:border-red-300 text-forest-950 hover:text-red-700 text-xs font-medium flex items-center gap-1.5 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Elimina solo campioni demo
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={deleteAllDemoMutation.isPending}
                    onClick={handleDeleteDemoOnly}
                    className="min-h-[42px] px-4 py-2 rounded-xl bg-red-700 text-white text-xs font-semibold cursor-pointer"
                  >
                    Conferma elimina demo
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteDemo(false)}
                    className="min-h-[42px] px-3 py-2 rounded-xl bg-mineral-100 text-forest-950 text-xs font-medium cursor-pointer"
                  >
                    Annulla
                  </button>
                </div>
              )}
            </>
          )}

          {!confirmReset ? (
            <button
              type="button"
              onClick={() => setConfirmReset(true)}
              className="min-h-[42px] px-4 py-2 rounded-xl bg-mineral-100 hover:bg-mineral-200 text-forest-950 text-xs font-medium cursor-pointer"
            >
              Ripristina campioni demo
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={resetDemoMutation.isPending}
                onClick={handleResetDemo}
                className="min-h-[42px] px-4 py-2 rounded-xl bg-gold-500 text-forest-950 text-xs font-semibold cursor-pointer"
              >
                {resetDemoMutation.isPending
                  ? "Ripristino..."
                  : "Conferma ripristino demo"}
              </button>
              <button
                type="button"
                onClick={() => setConfirmReset(false)}
                className="min-h-[42px] px-3 py-2 rounded-xl bg-mineral-100 text-forest-950 text-xs font-medium cursor-pointer"
              >
                Annulla
              </button>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
