import { ArrowRight, Camera, ChevronRight, Info, Scale } from "lucide-react";
import type { AggregateStats, AiEngineMode, OliveAnalysisRecord } from "../../types/analysis";
import {
  formatDateIt,
  formatGrams,
  formatKg,
  formatLiters,
  formatPct,
  formatSignedPct,
  getOriginLabel,
  getStatusLabel,
} from "../../utils/formatters";
import type { AppRoute } from "../layout/AppShell";

const HERO_IMAGE_URL = "/src/assets/images/hero_olive_harvest_1795170878588.jpg";

interface DashboardViewProps {
  analyses: OliveAnalysisRecord[];
  stats: AggregateStats | null;
  aiMode: AiEngineMode;
  isLoading: boolean;
  onNavigate: (route: AppRoute) => void;
}

export function DashboardView({
  analyses,
  stats,
  aiMode,
  isLoading,
  onNavigate,
}: DashboardViewProps) {
  const recentAnalyses = analyses.slice(0, 4);
  const pendingMill = analyses.filter(
    (a) => a.status === "completata" || a.status === "richiesta_foto"
  );

  return (
    <div className="space-y-8">
      {/* Hero Banner — Mediterranean Olive Harvest */}
      <section className="relative rounded-2xl overflow-hidden bg-forest-900 border border-forest-900/10">
        <div className="grid lg:grid-cols-12 items-stretch">
          <div className="lg:col-span-7 p-6 md:p-9 flex flex-col justify-between gap-6 text-white">
            <div className="space-y-3">
              <p className="text-xs font-medium text-gold-200 tracking-wide">
                OLIVESTIMA · {aiMode === "gemini_backend" ? "Integrazione Gemini attiva" : "Modalità dimostrativa offline"}
              </p>
              <h1 className="font-display text-3xl md:text-4xl font-semibold leading-tight text-balance">
                Stima la resa olearia dal campione fotografico al frantoio
              </h1>
              <p className="text-sm md:text-base text-white/80 max-w-xl leading-relaxed">
                Acquisisci le foto del campione di olive, registra il peso in grammi e ottieni una previsione statistica con intervallo di incertezza, chilogrammi e litri attesi.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-1">
              <button
                type="button"
                onClick={() => onNavigate({ view: "wizard" })}
                className="min-h-[46px] px-5 py-3 rounded-xl bg-gold-500 hover:bg-gold-200 text-forest-950 text-sm font-semibold flex items-center gap-2 transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                <Camera className="w-4 h-4" />
                Nuova analisi
              </button>
              <button
                type="button"
                onClick={() => onNavigate({ view: "history" })}
                className="min-h-[46px] px-5 py-3 rounded-xl bg-white/10 hover:bg-white/20 text-white text-sm font-medium flex items-center gap-2 transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                Storico analisi
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="lg:col-span-5 relative min-h-[210px] lg:min-h-[300px] bg-forest-950">
            <img
              src={HERO_IMAGE_URL}
              alt="Cassetta di olive mediterranee appena raccolte in uliveto al tramonto"
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-forest-950/75 via-forest-950/20 to-transparent lg:bg-gradient-to-r lg:from-forest-900/60 lg:via-transparent lg:to-transparent" />
          </div>
        </div>
      </section>

      {/* Transparent Simulation Disclaimer */}
      <section
        aria-label="Avviso dati simulati"
        className="rounded-xl bg-gold-50 border border-gold-200 px-4 py-3.5 flex items-start gap-3 text-xs md:text-sm text-forest-950"
      >
        <Info className="w-4 h-4 text-gold-700 shrink-0 mt-0.5" />
        <p className="leading-relaxed">
          <strong className="font-semibold">Trasparenza delle stime:</strong> i lotti precaricati sono dati dimostrativi contrassegnati come simulati. Le rese previste rappresentano stime statistiche indicative basate su parametri visivi e non costituiscono misure chimiche o pesate reali di frantoio.
        </p>
      </section>

      {/* 4-Column KPI Strip */}
      <section aria-label="Indicatori principali">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
          <KpiCard
            label="Analisi salvate"
            value={isLoading ? "—" : String(stats?.totalAnalyses ?? 0)}
            subtext={`${stats?.verifiedCount ?? 0} verificate al frantoio`}
          />
          <KpiCard
            label="Resa media prevista"
            value={
              isLoading || stats?.meanPredictedYieldPct == null
                ? "—"
                : formatPct(stats.meanPredictedYieldPct)
            }
            subtext={
              stats?.meanActualYieldPct != null
                ? `Reale media: ${formatPct(stats.meanActualYieldPct)}`
                : "In attesa di dati frantoio"
            }
          />
          <KpiCard
            label="Errore medio (MAE)"
            value={
              isLoading || stats?.meanAbsoluteErrorPct == null
                ? "—"
                : formatPct(stats.meanAbsoluteErrorPct)
            }
            subtext={
              stats?.meanSignedBiasPct != null
                ? `Scostamento: ${formatSignedPct(stats.meanSignedBiasPct)}`
                : "Calcolato dopo la molitura"
            }
          />
          <KpiCard
            label="Olio stimato totale"
            value={
              isLoading || !stats
                ? "—"
                : formatLiters(stats.totalEstimatedOilLiters, 0)
            }
            subtext={
              stats ? `${formatKg(stats.totalEstimatedOilKg, 0)} su ${formatKg(stats.totalLotWeightKg, 0)} olive` : ""
            }
          />
        </div>
      </section>

      {/* Main Content Split: Recent Analyses + Actionable Follow-ups */}
      <div className="grid lg:grid-cols-12 gap-6 items-start">
        {/* Recent Analyses */}
        <section className="lg:col-span-8 bg-white rounded-2xl border border-mineral-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-mineral-100 flex items-center justify-between gap-4">
            <div>
              <h2 className="font-display text-lg font-semibold text-forest-950">
                Analisi recenti
              </h2>
              <p className="text-xs text-forest-800/65">
                Archivio locale sincronizzato in IndexedDB
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate({ view: "history" })}
              className="min-h-[40px] px-3 py-1.5 text-xs font-semibold text-forest-900 hover:text-gold-700 transition-colors cursor-pointer whitespace-nowrap"
            >
              Vedi tutto
            </button>
          </div>

          {isLoading ? (
            <div className="p-5 space-y-3">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-16 rounded-xl bg-mineral-100 animate-pulse"
                />
              ))}
            </div>
          ) : recentAnalyses.length === 0 ? (
            <div className="p-8 text-center space-y-3">
              <p className="text-sm text-forest-800/75">
                Nessuna analisi presente nell&apos;archivio locale.
              </p>
              <button
                type="button"
                onClick={() => onNavigate({ view: "wizard" })}
                className="min-h-[44px] px-4 py-2 rounded-xl bg-forest-900 text-white text-sm font-medium cursor-pointer"
              >
                Avvia la prima analisi
              </button>
            </div>
          ) : (
            <div className="divide-y divide-mineral-100">
              {recentAnalyses.map((item) => {
                const thumb = item.photos[0]?.previewUrl;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() =>
                      onNavigate({ view: "detail", analysisId: item.id })
                    }
                    className="w-full text-left px-5 py-4 hover:bg-olive-50/60 transition-colors flex items-center justify-between gap-4 cursor-pointer min-h-[68px]"
                  >
                    <div className="flex items-center gap-3.5 min-w-0">
                      <div className="w-12 h-12 rounded-xl overflow-hidden bg-mineral-100 shrink-0 border border-mineral-200">
                        {thumb ? (
                          <img
                            src={thumb}
                            alt={item.title}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-olive-600">
                            <Camera className="w-5 h-5" />
                          </div>
                        )}
                      </div>

                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-forest-950 truncate">
                          {item.title}
                        </p>
                        <p className="text-xs text-forest-800/70 truncate mt-0.5">
                          {item.cultivar} · {formatGrams(item.sampleWeightGrams)} ·{" "}
                          {formatDateIt(item.harvestDate)} · {getOriginLabel(item.dataOrigin)}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <div className="text-right">
                        <p className="font-mono text-sm font-semibold text-forest-950 tabular-nums">
                          {item.prediction
                            ? formatPct(item.prediction.predictedYieldPct)
                            : "—"}
                        </p>
                        <p className="text-[11px] text-forest-800/65 tabular-nums">
                          {item.millOutcome
                            ? `Frantoio ${formatPct(item.millOutcome.actualYieldPct)}`
                            : getStatusLabel(item.status)}
                        </p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-forest-800/45" />
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        {/* Right Column: Pending Mill Verification & Quick Actions */}
        <aside className="lg:col-span-4 space-y-4">
          <div className="bg-white rounded-2xl border border-mineral-200 p-5 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-display text-lg font-semibold text-forest-950">
                Conferme dal frantoio
              </h2>
              <Scale className="w-4 h-4 text-gold-600 shrink-0" />
            </div>
            <p className="text-xs text-forest-800/75 leading-relaxed">
              Registra la resa reale dopo la molitura per confrontare previsione e risultato effettivo e migliorare la taratura statistica dei tuoi lotti.
            </p>

            {pendingMill.length === 0 ? (
              <p className="text-xs text-forest-800/60 py-2">
                Tutti i lotti stimati hanno già una verifica di frantoio registrata.
              </p>
            ) : (
              <div className="divide-y divide-mineral-100">
                {pendingMill.slice(0, 3).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() =>
                      onNavigate({ view: "detail", analysisId: item.id })
                    }
                    className="w-full py-3 text-left flex items-center justify-between gap-3 hover:text-gold-700 transition-colors cursor-pointer"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-forest-950 truncate">
                        {item.title}
                      </p>
                      <p className="text-[11px] text-forest-800/65 truncate">
                        {item.status === "richiesta_foto"
                          ? "Foto supplementare suggerita"
                          : `Stima ${item.prediction ? formatPct(item.prediction.predictedYieldPct) : "—"}`}
                      </p>
                    </div>
                    <span className="text-xs font-medium text-forest-900 whitespace-nowrap shrink-0">
                      Apri
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white rounded-2xl border border-mineral-200 p-5 space-y-3">
            <h3 className="font-display text-base font-semibold text-forest-950">
              Statistiche & Motore AI
            </h3>
            <p className="text-xs text-forest-800/75 leading-relaxed">
              Esplora il grafico di scostamento per cultivar oppure configura l&apos;integrazione con il backend protetto Gemini multimodale.
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              <button
                type="button"
                onClick={() => onNavigate({ view: "stats" })}
                className="min-h-[40px] px-3.5 py-2 rounded-xl bg-mineral-100 hover:bg-olive-100 text-forest-950 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap"
              >
                Statistiche aggregate
              </button>
              <button
                type="button"
                onClick={() => onNavigate({ view: "settings" })}
                className="min-h-[40px] px-3.5 py-2 rounded-xl bg-mineral-100 hover:bg-olive-100 text-forest-950 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap"
              >
                Configurazione AI
              </button>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function KpiCard({
  label,
  value,
  subtext,
}: {
  label: string;
  value: string;
  subtext: string;
}) {
  return (
    <div className="bg-white rounded-2xl border border-mineral-200 p-4 md:p-5 flex flex-col justify-between gap-2">
      <span className="text-xs font-medium text-forest-800/70">{label}</span>
      <span className="font-mono text-2xl md:text-3xl font-semibold text-forest-950 tabular-nums">
        {value}
      </span>
      <span className="text-[11px] text-forest-800/65 truncate">{subtext}</span>
    </div>
  );
}
