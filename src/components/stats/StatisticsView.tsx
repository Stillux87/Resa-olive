import { Info } from "lucide-react";
import type { AggregateStats, OliveAnalysisRecord } from "../../types/analysis";
import {
  formatGrams,
  formatKg,
  formatLiters,
  formatPct,
  formatSignedPct,
} from "../../utils/formatters";

interface StatisticsViewProps {
  analyses: OliveAnalysisRecord[];
  stats: AggregateStats | null;
  isLoading: boolean;
  onSelectAnalysis: (id: string) => void;
}

export function StatisticsView({
  analyses,
  stats,
  isLoading,
  onSelectAnalysis,
}: StatisticsViewProps) {
  const chartItems = analyses
    .filter((a) => Boolean(a.prediction))
    .slice(0, 8)
    .reverse();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl md:text-3xl font-semibold text-forest-950">
          Statistiche aggregate dei campioni
        </h1>
        <p className="text-sm text-forest-800/75 mt-1">
          Metriche cumulative su rese previste, intervalli di confidenza, volumi stimati e riscontri di frantoio.
        </p>
      </div>

      {stats && stats.simulatedDemoCount > 0 && (
        <div className="rounded-xl bg-gold-50 border border-gold-200 px-4 py-3 flex items-start gap-3 text-xs text-forest-950">
          <Info className="w-4 h-4 text-gold-700 shrink-0 mt-0.5" />
          <p className="leading-relaxed">
            L&apos;archivio include{" "}
            <strong className="font-semibold">
              {stats.simulatedDemoCount} campioni dimostrativi simulati
            </strong>
            . Le statistiche aggregate combinano i campioni salvati localmente in IndexedDB.
          </p>
        </div>
      )}

      {/* Aggregate KPI Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <StatBox
          label="Campioni analizzati"
          value={isLoading || !stats ? "—" : String(stats.totalAnalyses)}
          detail={
            stats
              ? `${stats.verifiedCount} verificati al frantoio`
              : ""
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
              ? `Scostamento medio: ${formatSignedPct(stats.meanSignedBiasPct)}`
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
          detail="Rese reali dentro l'intervallo stimato"
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

      {/* Volume Summary Strip */}
      {stats && (
        <div className="grid md:grid-cols-2 gap-4">
          <div className="bg-white rounded-2xl border border-mineral-200 p-5 space-y-2">
            <p className="text-xs font-medium text-forest-800/70">
              Olio totale stimato sui lotti in archivio
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
              Calcolato su {formatKg(stats.totalLotWeightKg, 0)} complessivi (densità 0,916 kg/L)
            </p>
          </div>

          <div className="bg-white rounded-2xl border border-mineral-200 p-5 space-y-2">
            <p className="text-xs font-medium text-forest-800/70">
              Olio reale registrato al frantoio (lotti verificati)
            </p>
            <div className="flex items-baseline gap-4">
              <span className="font-mono text-2xl font-semibold text-forest-950 tabular-nums">
                {stats.verifiedCount > 0 ? formatKg(stats.totalActualOilKg) : "—"}
              </span>
              <span className="font-mono text-base text-olive-700 font-semibold tabular-nums">
                {stats.verifiedCount > 0 ? formatLiters(stats.totalActualOilLiters) : ""}
              </span>
            </div>
            <p className="text-xs text-forest-800/65">
              {stats.verifiedCount > 0
                ? `Media resa reale ${formatPct(stats.meanActualYieldPct ?? 0)} vs prevista ${formatPct(stats.meanPredictedYieldPct ?? 0)}`
                : "Nessun risultato di frantoio ancora registrato"}
            </p>
          </div>
        </div>
      )}

      {/* Prediction vs Mill Actual Comparison Chart (Custom Responsive SVG) */}
      <section className="bg-white rounded-2xl border border-mineral-200 p-5 md:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="font-display text-lg font-semibold text-forest-950">
              Confronto resa prevista vs. reale per lotto
            </h2>
            <p className="text-xs text-forest-800/70">
              Barra verde bosco: resa prevista con intervallo di incertezza · Punto oro: resa reale al frantoio
            </p>
          </div>
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
                Math.min(100, Math.max(0, ((v - minScale) / (maxScale - minScale)) * 100));

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
                    {/* Predicted bar */}
                    <div
                      className="absolute top-1.5 bottom-1.5 left-0 rounded-r-md bg-forest-900/85"
                      style={{ width: `${toPct(pred.predictedYieldPct)}%` }}
                    />
                    {/* Uncertainty interval band */}
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
                    {/* Mill actual diamond/marker */}
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

      {/* Cultivar Breakdown */}
      {stats && stats.cultivarSummaries.length > 0 && (
        <section className="bg-white rounded-2xl border border-mineral-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-mineral-100">
            <h2 className="font-display text-lg font-semibold text-forest-950">
              Riepilogo per cultivar
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-mineral-200 text-[11px] font-semibold text-forest-800/70 bg-mineral-50">
                  <th className="py-3 px-5">Cultivar</th>
                  <th className="py-3 px-4 text-right">Campioni</th>
                  <th className="py-3 px-4 text-right">Media prevista</th>
                  <th className="py-3 px-4 text-right">Intervallo osservato</th>
                  <th className="py-3 px-5 text-right">Media reale</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-mineral-100 text-sm">
                {stats.cultivarSummaries.map((row) => (
                  <tr key={row.cultivar}>
                    <td className="py-3.5 px-5 font-semibold text-forest-950">
                      {row.cultivar}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono tabular-nums">
                      {row.count}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono font-semibold text-forest-950 tabular-nums">
                      {formatPct(row.avgPredictedYieldPct)}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono text-xs text-forest-800/75 tabular-nums">
                      {formatPct(row.minPredictedPct)} –{" "}
                      {formatPct(row.maxPredictedPct)}
                    </td>
                    <td className="py-3.5 px-5 text-right font-mono font-semibold text-olive-700 tabular-nums">
                      {row.avgActualYieldPct != null
                        ? formatPct(row.avgActualYieldPct)
                        : "—"}
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
