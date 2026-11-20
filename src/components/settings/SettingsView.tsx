import { useState } from "react";
import {
  CheckCircle2,
  Database,
  Download,
  RefreshCw,
  Server,
  ShieldCheck,
} from "lucide-react";
import {
  useBackendHealthQuery,
  useResetDemoMutation,
  useStorageSummaryQuery,
  useUpdateSettingsMutation,
} from "../../hooks/useOlivestimaQueries";
import { exportAnalysesJson } from "../../services/persistence/indexedDb";
import { formatBytes } from "../../services/photos/photoManager";
import type { AiEngineMode, AppSettings } from "../../types/analysis";

interface SettingsViewProps {
  settings: AppSettings;
}

export function SettingsView({ settings }: SettingsViewProps) {
  const healthQuery = useBackendHealthQuery();
  const storageQuery = useStorageSummaryQuery();
  const updateSettingsMutation = useUpdateSettingsMutation();
  const resetDemoMutation = useResetDemoMutation();

  const [confirmReset, setConfirmReset] = useState(false);
  const [feedback, setFeedback] = useState<string>("");

  const backendOnline = healthQuery.data?.status === "ok";
  const geminiReady = Boolean(healthQuery.data?.geminiConfigured);

  async function handleSelectMode(mode: AiEngineMode) {
    await updateSettingsMutation.mutateAsync({ aiMode: mode });
    setFeedback(
      mode === "simulato_locale"
        ? "Modalità locale offline attivata."
        : "Modalità Gemini multimodale (backend protetto) selezionata."
    );
    setTimeout(() => setFeedback(""), 3000);
  }

  async function handleExportJson() {
    const json = await exportAnalysesJson();
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `olivestima-archivio-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleResetDemo() {
    await resetDemoMutation.mutateAsync();
    setConfirmReset(false);
    setFeedback("Archivio dimostrativo ripristinato con i 4 lotti simulati.");
    setTimeout(() => setFeedback(""), 3500);
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="font-display text-2xl md:text-3xl font-semibold text-forest-950">
          Motore AI e archivio locale
        </h1>
        <p className="text-sm text-forest-800/75 mt-1">
          Gestisci il provider di analisi visiva delle olive e i dati memorizzati localmente nel tuo browser con IndexedDB.
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
              L&apos;applicazione rimane completamente navigabile e funzionante anche senza collegamento alle API AI.
            </p>
          </div>
          <Server className="w-5 h-5 text-forest-800/50 shrink-0" />
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
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
              Analisi locale deterministica su qualità pixel e parametri agronomici simulati. Zero dipendenze di rete.
            </p>
          </button>

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
                Gemini multimodale (Backend)
              </span>
              {settings.aiMode === "gemini_backend" && (
                <CheckCircle2 className="w-4 h-4 text-forest-900" />
              )}
            </div>
            <p className="text-xs text-forest-800/75 leading-relaxed">
              Invia le foto all&apos;endpoint protetto <span className="font-mono">/api/analyze-olive-sample</span> sul server Express.
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
                    ? "Connesso e pronto per Gemini multimodale"
                    : "Server attivo (chiave Gemini non configurata sul server)"
                  : "Non raggiungibile (modalità offline attiva)"}
              </p>
              <p className="text-forest-800/70 mt-0.5">
                Le credenziali API risiedono esclusivamente lato server e non vengono mai esposte al browser.
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

      {/* IndexedDB Persistence & Data Management */}
      <section className="bg-white rounded-2xl border border-mineral-200 p-5 md:p-6 space-y-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-display text-lg font-semibold text-forest-950">
              Archivio locale IndexedDB
            </h2>
            <p className="text-xs text-forest-800/75 mt-0.5">
              Le analisi, le stime e le fotografie compresse sono salvate sul dispositivo senza necessità di account cloud.
            </p>
          </div>
          <Database className="w-5 h-5 text-forest-800/50 shrink-0" />
        </div>

        <div className="grid grid-cols-3 gap-3 py-3 border-y border-mineral-100 text-xs">
          <div>
            <span className="text-forest-800/65">Analisi salvate</span>
            <p className="font-mono text-lg font-semibold text-forest-950 tabular-nums mt-0.5">
              {storageQuery.data?.analysesCount ?? 0}
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

          {!confirmReset ? (
            <button
              type="button"
              onClick={() => setConfirmReset(true)}
              className="min-h-[42px] px-4 py-2 rounded-xl bg-mineral-100 hover:bg-mineral-200 text-forest-950 text-xs font-medium cursor-pointer"
            >
              Ripristina campioni dimostrativi
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
