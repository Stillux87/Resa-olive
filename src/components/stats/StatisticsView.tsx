import { useState } from "react";
import { Info } from "lucide-react";
import type {
  AggregateStats,
  CalibrationSummary,
  OliveAnalysisRecord,
} from "../../types/analysis";
import { OLIVE_OIL_DENSITY_KG_PER_LITER } from "../../types/analysis";
import {
  formatDateIt,
  formatGrams,
  formatKg,
  formatLiters,
  formatNumberIt,
  formatPct,
  formatSignedPct,
} from "../../utils/formatters";

interface StatisticsViewProps {
  realRecords: OliveAnalysisRecord[];
  demoRecords: OliveAnalysisRecord[];
  realStats: AggregateStats | null;
  demoStats: AggregateStats | null;
  calibrationSummary: CalibrationSummary | null;
  densityKgPerLiter?: number;
  isLoading: boolean;
  onSelectAnalysis: (id: string) => void;
}

export function StatisticsView({
  realRecords,
  demoRecords,
  realStats,
  demoStats,
  calibrationSummary,
  densityKgPerLiter = OLIVE_OIL_DENSITY_KG_PER_LITER,
  isLoading,
  onSelectAnalysis,
}: StatisticsViewProps) {
  const [scope, setScope] = useState<"real" | "demo">(
    realRecords.length > 0 ? "real" : "demo"
  );

  const analyses = scope === "real" ? realRecords : demoRecords;
  const stats = scope === "real" ? realStats : demoStats;
  const series = stats?.seasonalSeries ?? [];
  const chartItems = analyses
    .filter((a) => Boolean(a.prediction))
    .slice(0, 10)
    .reverse();

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl md:text-3xl font-semibold text-forest-950">
            Statistiche e calibrazione stagionale
          </h1>
          <p className="text-sm text-forest-800/75 mt-1">
            Analisi separata tra lotti reali e campioni dimostrativi: evoluzione rese, cultivar, scostamenti e maturazione.
          </p>
        </div>

        {/* Strict Real vs Demo Switcher */}
        <div className="flex items-center gap-1 p-1 bg-mineral-100 rounded-xl self-start shrink-0">
          <button
            type="button"
            onClick={() => setScope("real")}
            className={`min-h-[36px] px-3.5 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-colors ${
              scope === "real"
                ? "bg-white text-forest-950 shadow-xs font-semibold"
                : "text-forest-800/75 hover:text-forest-950"
            }`}
          >
            Dati reali ({realRecords.length})
          </button>
          <button
            type="button"
            onClick={() => setScope("demo")}
            className={`min-h-[36px] px-3.5 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-colors ${
              scope === "demo"
                ? "bg-white text-forest-950 shadow-xs font-semibold"
                : "text-forest-800/75 hover:text-forest-950"
            }`}
          >
            Demo simulati ({demoRecords.length})
          </button>
        </div>
      </div>

      {scope === "demo" && (
        <div className="rounded-xl bg-gold-50 border border-gold-200 px-4 py-3 flex items-start gap-3 text-xs text-forest-950">
          <Info className="w-4 h-4 text-gold-700 shrink-0 mt-0.5" />
          <p className="leading-relaxed">
            Stai visualizzando esclusivamente i{" "}
            <strong className="font-semibold">
              {demoRecords.length} campioni dimostrativi simulati
            </strong>
            . Questi valori non vengono mai usati per calibrare il motore statistico reale.
          </p>
        </div>
      )}

      {/* Aggregate KPI Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <StatBox
          label="Campioni nella vista"
          value={isLoading || !stats ? "—" : String(stats.totalAnalyses)}
          detail={
            stats ? `${stats.verifiedCount} verificati al frantoio` : ""
          }
        />
        <StatBox
          label="Errore medio assoluto (MAE)"
          value={
            isLoading || stats?.meanAbsoluteErrorPct == null
              ? "—"
              : formatPct(stats.meanAbsoluteErrorPct)
          }
          detail={
            stats?.meanSignedBiasPct != null
              ? `Scostamento: ${formatSignedPct(stats.meanSignedBiasPct)}`
              : "Richiede almeno 1 dato frantoio"
          }
        />
        <StatBox
          label="Copertura intervallo"
          value={
            isLoading || stats?.intervalCoverageRatePct == null
              ? "—"
              : `${stats.intervalCoverageRatePct}%`
          }
          detail="Rese reali dentro l'intervallo"
        />
        <StatBox
          label="Peso campioni totale"
          value={
            isLoading || !stats
              ? "—"
              : formatGrams(stats.totalSampleWeightGrams)
          }
          detail={
            stats
              ? `Su ${formatKg(stats.totalLotWeightKg, 0)} di lotti`
              : ""
          }
        />
      </div>

      {/* Volume Summary + Progressive Calibration Card */}
      {stats && (
        <div className="grid md:grid-cols-3 gap-4">
          <div className="bg-white rounded-2xl border border-mineral-200 p-5 space-y-2">
            <p className="text-xs font-medium text-forest-800/70">
              Olio totale stimato sui lotti
            </p>
            <div className="flex items-baseline gap-4">
              <span className="font-mono text-2xl font-semibold text-forest-950 tabular-nums">
                {formatKg(stats.totalEstimatedOilKg)}
              </span>
              <span className="font-mono text-base text-gold-700 font-semibold tabular-nums">
                {formatLiters(stats.totalEstimatedOilLiters)}
              </span>
            </div>
            <p className="text-xs text-forest-800/65">
              Su {formatKg(stats.totalLotWeightKg, 0)} (densità{" "}
              {formatNumberIt(densityKgPerLiter, 3)} kg/L)
            </p>
          </div>

          <div className="bg-white rounded-2xl border border-mineral-200 p-5 space-y-2">
            <p className="text-xs font-medium text-forest-800/70">
              Olio reale registrato al frantoio
            </p>
            <div className="flex items-baseline gap-4">
              <span className="font-mono text-2xl font-semibold text-forest-950 tabular-nums">
                {stats.verifiedCount > 0
                  ? formatKg(stats.totalActualOilKg)
                  : "—"}
              </span>
              <span className="font-mono text-base text-olive-700 font-semibold tabular-nums">
                {stats.verifiedCount > 0
                  ? formatLiters(stats.totalActualOilLiters)
                  : ""}
              </span>
            </div>
            <p className="text-xs text-forest-800/65">
              {stats.verifiedCount > 0
                ? `Media reale ${formatPct(
                    stats.meanActualYieldPct ?? 0
                  )} vs prevista ${formatPct(stats.meanPredictedYieldPct ?? 0)}`
                : "Nessun risultato di frantoio registrato"}
            </p>
          </div>

          <div className="bg-white rounded-2xl border border-mineral-200 p-5 space-y-2">
            <p className="text-xs font-medium text-forest-800/70">
              Stato calibrazione empirica (solo reali)
            </p>
            <p className="font-mono text-2xl font-semibold text-forest-950 tabular-nums">
              {calibrationSummary?.calibrationActive
                ? "Attiva"
                : `${calibrationSummary?.realVerifiedCount ?? 0} / ${
                    calibrationSummary?.minimumRequiredForAdjustment ?? 3
                  }`}
            </p>
            <p className="text-xs text-forest-800/65">
              {calibrationSummary?.calibrationActive
                ? `MAE reale ${formatPct(
                    calibrationSummary.globalMaePct ?? 0
                  )} · Bias ${formatSignedPct(
                    calibrationSummary.globalMeanBiasPct ?? 0
                  )}`
                : "Servono almeno 3 lotti reali verificati prima di correggere i coefficienti"}
            </p>
          </div>
        </div>
      )}

      {/* CHART 1: Evoluzione delle rese durante la stagione */}
      <section className="bg-white rounded-2xl border border-mineral-200 p-5 md:p-6 space-y-4">
        <div>
          <h2 className="font-display text-lg font-semibold text-forest-950">
            1. Evoluzione delle rese durante la stagione
          </h2>
          <p className="text-xs text-forest-800/70">
            Andamento cronologico delle rese stimate (linea verde) e delle rese reali di frantoio (punti oro)
          </p>
        </div>

        {series.length === 0 ? (
          <p className="text-sm text-forest-800/70 py-6 text-center">
            Nessun dato sufficiente in questa vista.
          </p>
        ) : (
          <SeasonalYieldSvg points={series} />
        )}
      </section>

      {/* CHART 2: Resa media per varietà */}
      <section className="bg-white rounded-2xl border border-mineral-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-mineral-100">
          <h2 className="font-display text-lg font-semibold text-forest-950">
            2. Resa media per varietà
          </h2>
          <p className="text-xs text-forest-800/70 mt-0.5">
            Confronto tra resa prevista media, intervallo osservato e resa reale per cultivar
          </p>
        </div>

        {!stats || stats.cultivarSummaries.length === 0 ? (
          <p className="text-sm text-forest-800/70 py-8 text-center">
            Nessuna cultivar analizzata in questa vista.
          </p>
        ) : (
          <div className="p-5 space-y-4">
            <div className="space-y-3">
              {stats.cultivarSummaries.map((row) => (
                <div key={row.cultivar} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-forest-950">
                      {row.cultivar} ({row.count})
                    </span>
                    <span className="font-mono tabular-nums text-forest-900">
                      Prev. {formatPct(row.avgPredictedYieldPct)}
                      {row.avgActualYieldPct != null
                        ? ` · Reale ${formatPct(row.avgActualYieldPct)}`
                        : ""}
                    </span>
                  </div>
                  <div className="relative h-3.5 rounded-lg bg-mineral-100 overflow-hidden">
                    <div
                      className="absolute inset-y-0 left-0 bg-forest-900/85 rounded-r-md"
                      style={{
                        width: `${Math.min(
                          100,
                          Math.max(4, ((row.avgPredictedYieldPct - 8) / 17) * 100)
                        )}%`,
                      }}
                    />
                    {row.avgActualYieldPct != null && (
                      <div
                        className="absolute top-0 bottom-0 w-2 -ml-1 bg-gold-500 border border-forest-950"
                        style={{
                          left: `${Math.min(
                            100,
                            Math.max(0, ((row.avgActualYieldPct - 8) / 17) * 100)
                          )}%`,
                        }}
                      />
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="overflow-x-auto pt-2 border-t border-mineral-100">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-mineral-200 text-[11px] font-semibold text-forest-800/70 bg-mineral-50">
                    <th className="py-2.5 px-4">Cultivar</th>
                    <th className="py-2.5 px-3 text-right">Campioni</th>
                    <th className="py-2.5 px-3 text-right">Media prevista</th>
                    <th className="py-2.5 px-3 text-right">Intervallo</th>
                    <th className="py-2.5 px-4 text-right">Media reale</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-mineral-100 text-xs">
                  {stats.cultivarSummaries.map((row) => (
                    <tr key={row.cultivar}>
                      <td className="py-2.5 px-4 font-semibold text-forest-950">
                        {row.cultivar}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                        {row.count}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-semibold text-forest-950 tabular-nums">
                        {formatPct(row.avgPredictedYieldPct)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-forest-800/75 tabular-nums">
                        {formatPct(row.minPredictedPct)} –{" "}
                        {formatPct(row.maxPredictedPct)}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono font-semibold text-olive-700 tabular-nums">
                        {row.avgActualYieldPct != null
                          ? formatPct(row.avgActualYieldPct)
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      {/* CHART 3: Confronto tra previsioni e risultati reali */}
      <section className="bg-white rounded-2xl border border-mineral-200 p-5 md:p-6 space-y-4">
        <div>
          <h2 className="font-display text-lg font-semibold text-forest-950">
            3. Confronto tra previsioni e risultati reali per lotto
          </h2>
          <p className="text-xs text-forest-800/70">
            Barra verde bosco: resa prevista con banda di incertezza · Indicatore oro: resa reale al frantoio
          </p>
        </div>

        {chartItems.length === 0 ? (
          <p className="text-sm text-forest-800/70 py-8 text-center">
            Aggiungi almeno un&apos;analisi per visualizzare il grafico comparativo.
          </p>
        ) : (
          <div className="space-y-3 pt-2">
            {chartItems.map((item) => {
              const pred = item.prediction!;
              const mill = item.millOutcome;
              const minScale = 8;
              const maxScale = 25;
              const toPct = (v: number) =>
                Math.min(
                  100,
                  Math.max(0, ((v - minScale) / (maxScale - minScale)) * 100)
                );

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelectAnalysis(item.id)}
                  className="w-full text-left group py-2 px-3 -mx-3 rounded-xl hover:bg-olive-50/60 transition-colors cursor-pointer"
                >
                  <div className="flex items-center justify-between gap-3 text-xs mb-1.5">
                    <span className="font-medium text-forest-950 truncate">
                      {item.code} · {item.title} ({item.cultivar})
                    </span>
                    <span className="font-mono text-forest-950 tabular-nums shrink-0">
                      Prev. {formatPct(pred.predictedYieldPct)}
                      {mill ? ` · Reale ${formatPct(mill.actualYieldPct)}` : ""}
                    </span>
                  </div>

                  <div className="relative h-5 rounded-lg bg-mineral-100 overflow-hidden">
                    <div
                      className="absolute top-1.5 bottom-1.5 left-0 rounded-r-md bg-forest-900/85"
                      style={{ width: `${toPct(pred.predictedYieldPct)}%` }}
                    />
                    <div
                      className="absolute top-0.5 bottom-0.5 border-x-2 border-olive-700 bg-olive-500/20"
                      style={{
                        left: `${toPct(pred.uncertaintyIntervalPct[0])}%`,
                        width: `${Math.max(
                          2,
                          toPct(pred.uncertaintyIntervalPct[1]) -
                            toPct(pred.uncertaintyIntervalPct[0])
                        )}%`,
                      }}
                    />
                    {mill && (
                      <div
                        className="absolute top-1 bottom-1 w-2.5 -ml-1 rounded-sm bg-gold-500 border border-forest-950"
                        style={{ left: `${toPct(mill.actualYieldPct)}%` }}
                      />
                    )}
                  </div>
                </button>
              );
            })}
            <div className="flex justify-between text-[10px] font-mono text-forest-800/55 pt-1 tabular-nums">
              <span>8%</span>
              <span>12%</span>
              <span>16%</span>
              <span>20%</span>
              <span>25%</span>
            </div>
          </div>
        )}
      </section>

      {/* CHART 4 & CHART 5 Split */}
      <div className="grid lg:grid-cols-2 gap-6 items-start">
        {/* CHART 4: Errore medio del sistema */}
        <section className="bg-white rounded-2xl border border-mineral-200 p-5 md:p-6 space-y-4">
          <div>
            <h2 className="font-display text-lg font-semibold text-forest-950">
              4. Errore medio del sistema (reale - prevista)
            </h2>
            <p className="text-xs text-forest-800/70">
              Scostamento residuo rispetto alla linea zero: valori positivi indicano sottostima, negativi sovrastima.
            </p>
          </div>
          <ResidualErrorChart points={series} />
        </section>

        {/* CHART 5: Andamento delle caratteristiche di maturazione */}
        <section className="bg-white rounded-2xl border border-mineral-200 p-5 md:p-6 space-y-4">
          <div>
            <h2 className="font-display text-lg font-semibold text-forest-950">
              5. Andamento delle caratteristiche di maturazione
            </h2>
            <p className="text-xs text-forest-800/70">
              Composizione cromatica (Verdi / Invaiate / Nere %) e indice Jaén nel corso della raccolta
            </p>
          </div>
          <MaturationProgressionChart points={series} />
        </section>
      </div>

      {/* Calibration Error History Audit Table */}
      {calibrationSummary && calibrationSummary.errorHistory.length > 0 && (
        <section className="bg-white rounded-2xl border border-mineral-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-mineral-100">
            <h2 className="font-display text-lg font-semibold text-forest-950">
              Storico errori di stima per calibrazione (lotti reali)
            </h2>
            <p className="text-xs text-forest-800/70 mt-0.5">
              Registrazione degli scostamenti effettivi usata per la taratura prudenziale del modello (soglia minima: {calibrationSummary.minimumRequiredForAdjustment} lotti reali).
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-mineral-200 text-[11px] font-semibold text-forest-800/70 bg-mineral-50">
                  <th className="py-2.5 px-5">Data · Lotto</th>
                  <th className="py-2.5 px-4">Varietà</th>
                  <th className="py-2.5 px-4 text-right">Prevista</th>
                  <th className="py-2.5 px-4 text-right">Reale frantoio</th>
                  <th className="py-2.5 px-4 text-right">Errore (reale - prev.)</th>
                  <th className="py-2.5 px-5 text-right">In intervallo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-mineral-100 text-xs">
                {calibrationSummary.errorHistory.map((row) => (
                  <tr
                    key={row.analysisId}
                    onClick={() => onSelectAnalysis(row.analysisId)}
                    className="hover:bg-olive-50/50 cursor-pointer"
                  >
                    <td className="py-2.5 px-5 font-medium text-forest-950">
                      {formatDateIt(row.harvestDate)} · {row.code} ({row.title})
                    </td>
                    <td className="py-2.5 px-4 text-forest-800/80">
                      {row.cultivar}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums">
                      {formatPct(row.predictedYieldPct)}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono font-semibold text-forest-950 tabular-nums">
                      {formatPct(row.actualYieldPct)}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono font-semibold tabular-nums">
                      {formatSignedPct(row.signedErrorPct)}
                    </td>
                    <td className="py-2.5 px-5 text-right text-forest-800/80">
                      {row.insideInterval ? "Sì" : "No"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

function SeasonalYieldSvg({
  points,
}: {
  points: AggregateStats["seasonalSeries"];
}) {
  const width = 680;
  const height = 190;
  const padX = 40;
  const padY = 24;
  const minY = 9;
  const maxY = 24;

  const toX = (idx: number) =>
    points.length <= 1
      ? width / 2
      : padX + (idx / (points.length - 1)) * (width - padX * 2);
  const toY = (val: number) => {
    const clamped = Math.min(maxY, Math.max(minY, val));
    return (
      height - padY - ((clamped - minY) / (maxY - minY)) * (height - padY * 2)
    );
  };

  const predPath = points
    .map(
      (p, i) => `${i === 0 ? "M" : "L"} ${toX(i)} ${toY(p.predictedYieldPct)}`
    )
    .join(" ");

  const actualPoints = points
    .map((p, idx) => ({ p, idx }))
    .filter((item) => item.p.actualYieldPct !== null);
  const actualPath = actualPoints
    .map(
      (item, i) =>
        `${i === 0 ? "M" : "L"} ${toX(item.idx)} ${toY(
          item.p.actualYieldPct!
        )}`
    )
    .join(" ");

  return (
    <div className="space-y-2">
      <div className="w-full overflow-x-auto">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full min-w-[440px] h-48"
          role="img"
          aria-label="Evoluzione rese stagionali"
        >
          {[10, 14, 18, 22].map((tick) => (
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
            d={predPath}
            fill="none"
            stroke="#1b3a24"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {actualPoints.length >= 2 && (
            <path
              d={actualPath}
              fill="none"
              stroke="#c59b27"
              strokeWidth="2"
              strokeDasharray="4 3"
            />
          )}
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
                y={height - 5}
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

function ResidualErrorChart({
  points,
}: {
  points: AggregateStats["seasonalSeries"];
}) {
  const verified = points.filter((p) => p.signedErrorPct !== null);
  if (verified.length === 0) {
    return (
      <p className="text-xs text-forest-800/70 py-8 text-center">
        Registra almeno un risultato di frantoio per visualizzare l&apos;errore del sistema.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {verified.map((p) => {
        const err = p.signedErrorPct ?? 0;
        const pctWidth = Math.min(48, (Math.abs(err) / 4) * 48);
        return (
          <div key={p.id} className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-forest-950 truncate">
                {formatDateIt(p.date)} · {p.code} ({p.cultivar})
              </span>
              <span className="font-mono font-semibold tabular-nums text-forest-950">
                {formatSignedPct(err)}
              </span>
            </div>
            <div className="relative h-3 rounded-full bg-mineral-100 overflow-hidden">
              <div className="absolute top-0 bottom-0 left-1/2 w-0.5 bg-forest-950/30" />
              <div
                className={`absolute top-0.5 bottom-0.5 rounded-full ${
                  Math.abs(err) <= 1.2 ? "bg-olive-600" : "bg-gold-500"
                }`}
                style={{
                  left: err >= 0 ? "50%" : `${50 - pctWidth}%`,
                  width: `${Math.max(2, pctWidth)}%`,
                }}
              />
            </div>
          </div>
        );
      })}
      <div className="flex justify-between text-[10px] font-mono text-forest-800/60 tabular-nums pt-1">
        <span>-4,0% (sovrastima)</span>
        <span>0%</span>
        <span>+4,0% (sottostima)</span>
      </div>
    </div>
  );
}

function MaturationProgressionChart({
  points,
}: {
  points: AggregateStats["seasonalSeries"];
}) {
  if (points.length === 0) {
    return (
      <p className="text-xs text-forest-800/70 py-8 text-center">
        Nessun campione disponibile per l&apos;andamento della maturazione.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {points.map((p) => (
        <div key={p.id} className="space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium text-forest-950 truncate">
              {formatDateIt(p.date)} · {p.cultivar}
            </span>
            <span className="font-mono text-forest-800/80 tabular-nums">
              Jaén {p.veraisonIndex.toFixed(1)} · {Math.round(p.greenPct)}V /{" "}
              {Math.round(p.turningPct)}I / {Math.round(p.blackPct)}N
            </span>
          </div>
          <div className="h-3 rounded-full overflow-hidden flex bg-mineral-100">
            <div
              style={{ width: `${p.greenPct}%` }}
              className="bg-olive-500"
              title={`Verdi ${Math.round(p.greenPct)}%`}
            />
            <div
              style={{ width: `${p.turningPct}%` }}
              className="bg-gold-500"
              title={`Invaiate ${Math.round(p.turningPct)}%`}
            />
            <div
              style={{ width: `${p.blackPct}%` }}
              className="bg-forest-950"
              title={`Nere ${Math.round(p.blackPct)}%`}
            />
          </div>
        </div>
      ))}
      <div className="flex items-center gap-4 text-[11px] text-forest-800/70 pt-1">
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm bg-olive-500 inline-block" />
          Verdi
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm bg-gold-500 inline-block" />
          Invaiate
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm bg-forest-950 inline-block" />
          Nere
        </span>
      </div>
    </div>
  );
}

function StatBox({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="bg-white rounded-2xl border border-mineral-200 p-4 md:p-5 space-y-1.5">
      <p className="text-xs font-medium text-forest-800/70">{label}</p>
      <p className="font-mono text-2xl md:text-3xl font-semibold text-forest-950 tabular-nums">
        {value}
      </p>
      <p className="text-[11px] text-forest-800/65">{detail}</p>
    </div>
  );
}
