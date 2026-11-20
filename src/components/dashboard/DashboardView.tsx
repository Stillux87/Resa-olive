import { useState } from "react";
import { ArrowRight, Camera, ChevronRight, Info, Scale } from "lucide-react";
import type {
  AggregateStats,
  AiEngineMode,
  CalibrationSummary,
  OliveAnalysisRecord,
} from "../../types/analysis";
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
  realRecords: OliveAnalysisRecord[];
  demoRecords: OliveAnalysisRecord[];
  realStats: AggregateStats | null;
  demoStats: AggregateStats | null;
  calibrationSummary: CalibrationSummary | null;
  aiMode: AiEngineMode;
  isLoading: boolean;
  onNavigate: (route: AppRoute) => void;
}

export function DashboardView({
  realRecords,
  demoRecords,
  realStats,
  demoStats,
  calibrationSummary,
  aiMode,
  isLoading,
  onNavigate,
}: DashboardViewProps) {
  const [scope, setScope] = useState<"real" | "demo">("real");

  const activeRecords = scope === "real" ? realRecords : demoRecords;
  const activeStats = scope === "real" ? realStats : demoStats;
  const recentAnalyses = activeRecords.slice(0, 4);
  const pendingMill = activeRecords.filter(
    (a) => a.status === "completata" || a.status === "richiesta_foto"
  );

  const seasonalPoints = activeStats?.seasonalSeries ?? [];

  return (
    <div className="space-y-8">
      {/* Hero Banner — Mediterranean Olive Harvest */}
      <section className="relative rounded-2xl overflow-hidden bg-forest-900 border border-forest-900/10">
        <div className="grid lg:grid-cols-12 items-stretch">
          <div className="lg:col-span-7 p-6 md:p-9 flex flex-col justify-between gap-6 text-white">
            <div className="space-y-3">
              <p className="text-xs font-medium text-gold-200 tracking-wide">
                OLIVESTIMA ·{" "}
                {aiMode === "gemini_backend"
                  ? "Analisi Gemini Vision attiva"
                  : "Modalità offline locale"}
              </p>
              <h1 className="font-display text-3xl md:text-4xl font-semibold leading-tight text-balance">
                Stima la resa effettiva in olio su 100 kg di olive al frantoio
              </h1>
              <p className="text-sm md:text-base text-white/80 max-w-xl leading-relaxed">
                Combina l&apos;analisi fotografica Gemini Vision, i dati fisici del campione e i risultati reali di molitura per calcolare resa probabile, forbice di incertezza e consiglio sulla raccolta.
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
                Storico e confronti
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

      {/* Strict Demo vs Real Separation Bar */}
      <section className="rounded-xl bg-white border border-mineral-200 px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-start gap-2.5 text-xs text-forest-900">
          <Info className="w-4 h-4 text-gold-700 shrink-0 mt-0.5" />
          <p className="leading-relaxed">
            {scope === "real" ? (
              <>
                <strong className="font-semibold">
                  Vista Dati Reali ({realRecords.length} campioni):
                </strong>{" "}
                i {demoRecords.length} lotti dimostrativi sono isolati e non influenzano né le statistiche né la calibrazione del modello.
              </>
            ) : (
              <>
                <strong className="font-semibold">
                  Vista Campioni Demo ({demoRecords.length} lotti simulati):
                </strong>{" "}
                dati puramente dimostrativi per esplorare il funzionamento dell&apos;app, separati dai tuoi lotti reali.
              </>
            )}
          </p>
        </div>

        <div className="flex items-center gap-1 p-1 bg-mineral-100 rounded-xl shrink-0">
          <button
            type="button"
            onClick={() => setScope("real")}
            className={`min-h-[34px] px-3 py-1 rounded-lg text-xs font-medium cursor-pointer transition-colors ${
              scope === "real"
                ? "bg-white text-forest-950 shadow-xs font-semibold"
                : "text-forest-800/75 hover:text-forest-950"
            }`}
          >
            I tuoi dati reali ({realRecords.length})
          </button>
          <button
            type="button"
            onClick={() => setScope("demo")}
            className={`min-h-[34px] px-3 py-1 rounded-lg text-xs font-medium cursor-pointer transition-colors ${
              scope === "demo"
                ? "bg-white text-forest-950 shadow-xs font-semibold"
                : "text-forest-800/75 hover:text-forest-950"
            }`}
          >
            Demo simulati ({demoRecords.length})
          </button>
        </div>
      </section>

      {/* 4-Column KPI Strip */}
      <section aria-label="Indicatori principali">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
          <KpiCard
            label={
              scope === "real"
                ? "Resa media prevista"
                : "Resa media prevista (demo)"
            }
            value={
              isLoading || activeStats?.meanPredictedYieldPct == null
                ? "—"
                : formatPct(activeStats.meanPredictedYieldPct)
            }
            subtext={
              activeStats && activeStats.totalAnalyses > 0
                ? `Su ${activeStats.totalAnalyses} campioni (${formatKg(
                    activeStats.totalEstimatedOilKg,
                    0
                  )} stimati)`
                : "Avvia una nuova analisi"
            }
          />
          <KpiCard
            label="Risultati reali frantoio"
            value={
              isLoading || activeStats?.meanActualYieldPct == null
                ? "—"
                : formatPct(activeStats.meanActualYieldPct)
            }
            subtext={
              activeStats && activeStats.verifiedCount > 0
                ? `${activeStats.verifiedCount} lotti verificati (${formatLiters(
                    activeStats.totalActualOilLiters,
                    0
                  )})`
                : "In attesa di conferme frantoio"
            }
          />
          <KpiCard
            label="Errore medio (MAE)"
            value={
              isLoading || activeStats?.meanAbsoluteErrorPct == null
                ? "—"
                : formatPct(activeStats.meanAbsoluteErrorPct)
            }
            subtext={
              activeStats?.meanSignedBiasPct != null
                ? `Scostamento: ${formatSignedPct(activeStats.meanSignedBiasPct)}`
                : "Calcolato dopo la molitura"
            }
          />
          <KpiCard
            label="Calibrazione modello"
            value={
              calibrationSummary?.calibrationActive
                ? "Attiva"
                : `${calibrationSummary?.realVerifiedCount ?? 0}/${
                    calibrationSummary?.minimumRequiredForAdjustment ?? 3
                  }`
            }
            subtext={
              calibrationSummary?.calibrationActive
                ? "Taratura prudente su dati reali"
                : "Servono almeno 3 lotti reali verificati"
            }
          />
        </div>
      </section>

      {/* Seasonal Trend Mini Chart — Andamento della stagione */}
      <section className="bg-white rounded-2xl border border-mineral-200 p-5 md:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="font-display text-lg font-semibold text-forest-950">
              Andamento della stagione ({scope === "real" ? "lotti reali" : "demo"})
            </h2>
            <p className="text-xs text-forest-800/70">
              Evoluzione della resa prevista (%) e dei riscontri reali nel corso della campagna olearia
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate({ view: "stats" })}
            className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-mineral-100 hover:bg-olive-100 text-xs font-semibold text-forest-950 cursor-pointer whitespace-nowrap self-start sm:self-auto"
          >
            Tutti i 5 grafici statistici
          </button>
        </div>

        {seasonalPoints.length === 0 ? (
          <div className="py-6 text-center space-y-2">
            <p className="text-xs text-forest-800/70">
              Nessun campione reale salvato ancora per tracciare l&apos;andamento stagionale.
            </p>
            <button
              type="button"
              onClick={() => onNavigate({ view: "wizard" })}
              className="min-h-[40px] px-4 py-2 rounded-xl bg-forest-900 text-white text-xs font-semibold cursor-pointer"
            >
              Analizza il primo campione
            </button>
          </div>
        ) : (
          <SeasonalSparkChart points={seasonalPoints} />
        )}
      </section>

      {/* Main Content Split: Ultimi campioni + Conferme dal frantoio */}
      <div className="grid lg:grid-cols-12 gap-6 items-start">
        <section className="lg:col-span-8 bg-white rounded-2xl border border-mineral-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-mineral-100 flex items-center justify-between gap-4">
            <div>
              <h2 className="font-display text-lg font-semibold text-forest-950">
                Ultimi campioni ({scope === "real" ? "reali" : "demo"})
              </h2>
              <p className="text-xs text-forest-800/65">
                Archivio locale IndexedDB persistente sul dispositivo
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate({ view: "history" })}
              className="min-h-[40px] px-3 py-1.5 text-xs font-semibold text-forest-900 hover:text-gold-700 transition-colors cursor-pointer whitespace-nowrap"
            >
              Vedi storico
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
                Nessun campione reale ancora registrato.
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
                          {item.cultivar} · {formatGrams(item.sampleWeightGrams)}{" "}
                          · {formatDateIt(item.harvestDate)} ·{" "}
                          {getOriginLabel(item.dataOrigin)}
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
                            ? `Frantoio ${formatPct(
                                item.millOutcome.actualYieldPct
                              )}`
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
              Registra i kg e litri effettivi dopo la molitura per migliorare la calibrazione del modello sui tuoi lotti reali.
            </p>

            {pendingMill.length === 0 ? (
              <p className="text-xs text-forest-800/60 py-2">
                Nessun lotto in attesa di verifica frantoio in questa vista.
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
                          : `Stima ${
                              item.prediction
                                ? formatPct(item.prediction.predictedYieldPct)
                                : "—"
                            }`}
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
              Visualizza i 5 grafici stagionali o configura densità dell&apos;olio e gestione dell&apos;archivio demo.
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              <button
                type="button"
                onClick={() => onNavigate({ view: "stats" })}
                className="min-h-[40px] px-3.5 py-2 rounded-xl bg-mineral-100 hover:bg-olive-100 text-forest-950 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap"
              >
                Statistiche complete
              </button>
              <button
                type="button"
                onClick={() => onNavigate({ view: "settings" })}
                className="min-h-[40px] px-3.5 py-2 rounded-xl bg-mineral-100 hover:bg-olive-100 text-forest-950 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap"
              >
                Impostazioni
              </button>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function SeasonalSparkChart({
  points,
}: {
  points: AggregateStats["seasonalSeries"];
}) {
  const width = 640;
  const height = 160;
  const padX = 36;
  const padY = 20;
  const minY = 9;
  const maxY = 24;

  const toX = (idx: number) =>
    points.length <= 1
      ? width / 2
      : padX + (idx / (points.length - 1)) * (width - padX * 2);
  const toY = (val: number) => {
    const clamped = Math.min(maxY, Math.max(minY, val));
    return height - padY - ((clamped - minY) / (maxY - minY)) * (height - padY * 2);
  };

  const predictedPath = points
    .map((p, idx) => `${idx === 0 ? "M" : "L"} ${toX(idx)} ${toY(p.predictedYieldPct)}`)
    .join(" ");

  return (
    <div className="space-y-2">
      <div className="w-full overflow-x-auto">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full min-w-[420px] h-40"
          role="img"
          aria-label="Grafico andamento resa stagionale"
        >
          {[10, 15, 20].map((tick) => (
            <g key={tick}>
              <line
                x1={padX}
                x2={width - padX}
                y1={toY(tick)}
                y2={toY(tick)}
                stroke="#e2e5de"
                strokeDasharray="3 3"
              />
              <text
                x={8}
                y={toY(tick) + 4}
                fontSize="10"
                fill="#526052"
                fontFamily="monospace"
              >
                {tick}%
              </text>
            </g>
          ))}
          <path
            d={predictedPath}
            fill="none"
            stroke="#1b3a24"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {points.map((p, idx) => (
            <g key={p.id}>
              <circle
                cx={toX(idx)}
                cy={toY(p.predictedYieldPct)}
                r="4"
                fill="#1b3a24"
              />
              {p.actualYieldPct !== null && (
                <circle
                  cx={toX(idx)}
                  cy={toY(p.actualYieldPct)}
                  r="4.5"
                  fill="#c59b27"
                  stroke="#132919"
                  strokeWidth="1.2"
                />
              )}
              <text
                x={toX(idx)}
                y={height - 4}
                textAnchor="middle"
                fontSize="9.5"
                fill="#526052"
              >
                {formatDateIt(p.date)}
              </text>
            </g>
          ))}
        </svg>
      </div>
      <div className="flex items-center gap-5 text-[11px] text-forest-800/70">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-0.5 bg-forest-900 inline-block" />
          Resa prevista (%)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-gold-500 border border-forest-950 inline-block" />
          Resa reale frantoio (%)
        </span>
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
