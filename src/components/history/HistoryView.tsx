import { useMemo, useState } from "react";
import { ChevronRight, Search } from "lucide-react";
import type { AnalysisStatus, OliveAnalysisRecord } from "../../types/analysis";
import {
  formatDateIt,
  formatGrams,
  formatKg,
  formatPct,
  formatSignedPct,
  getOriginLabel,
  getStatusLabel,
} from "../../utils/formatters";

interface HistoryViewProps {
  analyses: OliveAnalysisRecord[];
  isLoading: boolean;
  onSelectAnalysis: (id: string) => void;
  onStartNew: () => void;
}

type FilterMode = "tutte" | "verificata_frantoio" | "completata" | "richiesta_foto";

export function HistoryView({
  analyses,
  isLoading,
  onSelectAnalysis,
  onStartNew,
}: HistoryViewProps) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterMode>("tutte");
  const [sortBy, setSortBy] = useState<"date" | "yield" | "accuracy">("date");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = analyses.filter((item) => {
      if (filter !== "tutte" && item.status !== (filter as AnalysisStatus)) {
        return false;
      }
      if (!q) return true;
      return (
        item.title.toLowerCase().includes(q) ||
        item.cultivar.toLowerCase().includes(q) ||
        item.groveLocation.toLowerCase().includes(q) ||
        item.code.toLowerCase().includes(q)
      );
    });

    return [...list].sort((a, b) => {
      if (sortBy === "yield") {
        return (
          (b.prediction?.predictedYieldPct ?? 0) -
          (a.prediction?.predictedYieldPct ?? 0)
        );
      }
      if (sortBy === "accuracy") {
        const errA =
          a.millOutcome && a.prediction
            ? Math.abs(a.millOutcome.actualYieldPct - a.prediction.predictedYieldPct)
            : 99;
        const errB =
          b.millOutcome && b.prediction
            ? Math.abs(b.millOutcome.actualYieldPct - b.prediction.predictedYieldPct)
            : 99;
        return errA - errB;
      }
      return b.createdAt.localeCompare(a.createdAt);
    });
  }, [analyses, filter, search, sortBy]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl md:text-3xl font-semibold text-forest-950">
            Storico analisi e confronto frantoio
          </h1>
          <p className="text-sm text-forest-800/75 mt-1">
            Confronta le stime iniziali con la resa effettiva registrata dopo la molitura.
          </p>
        </div>
        <button
          type="button"
          onClick={onStartNew}
          className="min-h-[44px] px-4 py-2.5 rounded-xl bg-forest-900 hover:bg-forest-800 text-white text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0"
        >
          Nuova analisi
        </button>
      </div>

      {/* Controls: Search + Segmented Status Filter + Sort */}
      <div className="bg-white rounded-2xl border border-mineral-200 p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="relative flex-1 min-w-0">
          <Search className="w-4 h-4 text-forest-800/45 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cerca per lotto, cultivar, località o codice..."
            className="w-full min-h-[42px] pl-10 pr-3.5 py-2 rounded-xl border border-mineral-200 bg-mineral-50 text-sm text-forest-950 focus:outline-none focus:border-forest-900"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 p-1 bg-mineral-100 rounded-xl overflow-x-auto">
            {(
              [
                { id: "tutte", label: "Tutte" },
                { id: "verificata_frantoio", label: "Verificate" },
                { id: "completata", label: "In attesa" },
                { id: "richiesta_foto", label: "Foto richieste" },
              ] as Array<{ id: FilterMode; label: string }>
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFilter(tab.id)}
                className={`min-h-[34px] px-3 py-1 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  filter === tab.id
                    ? "bg-white text-forest-950 shadow-xs font-semibold"
                    : "text-forest-800/75 hover:text-forest-950"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <select
            aria-label="Ordina risultati"
            value={sortBy}
            onChange={(e) =>
              setSortBy(e.target.value as "date" | "yield" | "accuracy")
            }
            className="min-h-[42px] px-3 py-2 rounded-xl border border-mineral-200 bg-mineral-50 text-xs font-medium text-forest-950"
          >
            <option value="date">Più recenti</option>
            <option value="yield">Resa prevista più alta</option>
            <option value="accuracy">Maggiore precisione</option>
          </select>
        </div>
      </div>

      {/* Results List (Mobile Cards + Desktop Table) */}
      <div className="bg-white rounded-2xl border border-mineral-200 overflow-hidden">
        {isLoading ? (
          <div className="p-5 space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 rounded-xl bg-mineral-100 animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center space-y-3">
            <p className="text-sm text-forest-800/75">
              Nessun campione corrisponde ai filtri selezionati.
            </p>
            <button
              type="button"
              onClick={() => {
                setSearch("");
                setFilter("tutte");
              }}
              className="min-h-[40px] px-4 py-2 rounded-xl bg-mineral-100 text-forest-950 text-xs font-semibold cursor-pointer"
            >
              Reimposta filtri
            </button>
          </div>
        ) : (
          <>
            {/* Desktop Table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-mineral-200 text-[11px] font-semibold text-forest-800/70 bg-mineral-50">
                    <th className="py-3 px-5">Campione e origine</th>
                    <th className="py-3 px-4">Cultivar · Peso</th>
                    <th className="py-3 px-4 text-right">Prevista (±)</th>
                    <th className="py-3 px-4 text-right">Reale frantoio</th>
                    <th className="py-3 px-4 text-right">Scostamento</th>
                    <th className="py-3 px-5 text-right">Stato</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-mineral-100 text-sm">
                  {filtered.map((item) => {
                    const pred = item.prediction;
                    const mill = item.millOutcome;
                    const delta =
                      pred && mill
                        ? Math.round(
                            (mill.actualYieldPct - pred.predictedYieldPct) * 10
                          ) / 10
                        : null;

                    return (
                      <tr
                        key={item.id}
                        onClick={() => onSelectAnalysis(item.id)}
                        className="hover:bg-olive-50/60 transition-colors cursor-pointer"
                      >
                        <td className="py-3.5 px-5">
                          <p className="font-semibold text-forest-950">
                            {item.title}
                          </p>
                          <p className="text-xs text-forest-800/65 mt-0.5">
                            {item.code} · {formatDateIt(item.harvestDate)} ·{" "}
                            {getOriginLabel(item.dataOrigin)}
                          </p>
                        </td>
                        <td className="py-3.5 px-4 text-xs text-forest-800/80">
                          <p className="font-medium text-forest-950">
                            {item.cultivar}
                          </p>
                          <p className="font-mono tabular-nums mt-0.5">
                            {formatGrams(item.sampleWeightGrams)} /{" "}
                            {formatKg(item.lotWeightKg, 0)}
                          </p>
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono tabular-nums">
                          {pred ? (
                            <div>
                              <span className="font-semibold text-forest-950">
                                {formatPct(pred.predictedYieldPct)}
                              </span>
                              <span className="block text-[11px] text-forest-800/60">
                                ±{formatPct(pred.marginPct)}
                              </span>
                            </div>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono font-semibold text-forest-950 tabular-nums">
                          {mill ? formatPct(mill.actualYieldPct) : "—"}
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono tabular-nums">
                          {delta !== null ? (
                            <span
                              className={
                                Math.abs(delta) <= (pred?.marginPct ?? 1.5)
                                  ? "text-olive-700 font-semibold"
                                  : "text-gold-700 font-semibold"
                              }
                            >
                              {formatSignedPct(delta)}
                            </span>
                          ) : (
                            <span className="text-forest-800/45">—</span>
                          )}
                        </td>
                        <td className="py-3.5 px-5 text-right text-xs text-forest-800/80">
                          {getStatusLabel(item.status)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile List */}
            <div className="md:hidden divide-y divide-mineral-100">
              {filtered.map((item) => {
                const pred = item.prediction;
                const mill = item.millOutcome;
                const delta =
                  pred && mill
                    ? Math.round(
                        (mill.actualYieldPct - pred.predictedYieldPct) * 10
                      ) / 10
                    : null;

                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onSelectAnalysis(item.id)}
                    className="w-full text-left px-4 py-4 flex items-center justify-between gap-3 hover:bg-olive-50/50 cursor-pointer min-h-[68px]"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-forest-950 truncate">
                        {item.title}
                      </p>
                      <p className="text-xs text-forest-800/70 truncate mt-0.5">
                        {item.cultivar} · {formatGrams(item.sampleWeightGrams)} ·{" "}
                        {getOriginLabel(item.dataOrigin)}
                      </p>
                      <p className="text-[11px] text-forest-800/60 mt-0.5">
                        {getStatusLabel(item.status)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <div className="text-right font-mono tabular-nums">
                        <p className="text-sm font-semibold text-forest-950">
                          {pred ? formatPct(pred.predictedYieldPct) : "—"}
                        </p>
                        <p className="text-[11px] text-forest-800/70">
                          {mill
                            ? `Reale ${formatPct(mill.actualYieldPct)} (${
                                delta !== null ? formatSignedPct(delta) : ""
                              })`
                            : pred
                            ? `±${formatPct(pred.marginPct)}`
                            : ""}
                        </p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-forest-800/45" />
                    </div>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
