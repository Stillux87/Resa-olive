import { useMemo, useState } from "react";
import { Camera, ChevronRight, Search, Trash2 } from "lucide-react";
import { isDemoAnalysis } from "../../services/prediction/calibration";
import type { AnalysisStatus, OliveAnalysisRecord } from "../../types/analysis";
import { CULTIVAR_OPTIONS } from "../../types/analysis";
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
  realRecords: OliveAnalysisRecord[];
  demoRecords: OliveAnalysisRecord[];
  isLoading: boolean;
  onSelectAnalysis: (id: string) => void;
  onStartNew: () => void;
  onDeleteAllDemo: () => Promise<unknown>;
  isDeletingDemo: boolean;
}

type OriginScope = "reali" | "demo" | "tutte";
type FilterMode =
  | "tutte"
  | "verificata_frantoio"
  | "completata"
  | "richiesta_foto";

export function HistoryView({
  realRecords,
  demoRecords,
  isLoading,
  onSelectAnalysis,
  onStartNew,
  onDeleteAllDemo,
  isDeletingDemo,
}: HistoryViewProps) {
  const [originScope, setOriginScope] = useState<OriginScope>(
    realRecords.length > 0 ? "reali" : "tutte"
  );
  const [search, setSearch] = useState("");
  const [cultivarFilter, setCultivarFilter] = useState<string>("tutte");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [filter, setFilter] = useState<FilterMode>("tutte");
  const [sortBy, setSortBy] = useState<"date" | "yield" | "accuracy">("date");
  const [confirmClearDemo, setConfirmClearDemo] = useState(false);

  const sourceList = useMemo(() => {
    if (originScope === "reali") return realRecords;
    if (originScope === "demo") return demoRecords;
    return [...realRecords, ...demoRecords].sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt)
    );
  }, [originScope, realRecords, demoRecords]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = sourceList.filter((item) => {
      if (filter !== "tutte" && item.status !== (filter as AnalysisStatus)) {
        return false;
      }
      if (cultivarFilter !== "tutte" && item.cultivar !== cultivarFilter) {
        return false;
      }
      if (dateFrom && item.harvestDate < dateFrom) {
        return false;
      }
      if (dateTo && item.harvestDate > dateTo) {
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
            ? Math.abs(
                a.millOutcome.actualYieldPct - a.prediction.predictedYieldPct
              )
            : 99;
        const errB =
          b.millOutcome && b.prediction
            ? Math.abs(
                b.millOutcome.actualYieldPct - b.prediction.predictedYieldPct
              )
            : 99;
        return errA - errB;
      }
      return b.harvestDate.localeCompare(a.harvestDate);
    });
  }, [sourceList, filter, cultivarFilter, dateFrom, dateTo, search, sortBy]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl md:text-3xl font-semibold text-forest-950">
            Storico campioni e confronto frantoio
          </h1>
          <p className="text-sm text-forest-800/75 mt-1">
            Filtra per periodo, cultivar e origine dei dati. I campioni reali e dimostrativi restano chiaramente separati.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {demoRecords.length > 0 && (
            <>
              {!confirmClearDemo ? (
                <button
                  type="button"
                  onClick={() => setConfirmClearDemo(true)}
                  className="min-h-[44px] px-3.5 py-2 rounded-xl bg-white border border-mineral-200 hover:border-red-300 text-xs font-medium text-forest-900 hover:text-red-700 flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Elimina demo ({demoRecords.length})
                </button>
              ) : (
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    disabled={isDeletingDemo}
                    onClick={async () => {
                      await onDeleteAllDemo();
                      setConfirmClearDemo(false);
                      setOriginScope("reali");
                    }}
                    className="min-h-[44px] px-3.5 py-2 rounded-xl bg-red-700 text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
                  >
                    {isDeletingDemo ? "Eliminazione..." : "Conferma elimina demo"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmClearDemo(false)}
                    className="min-h-[44px] px-3 py-2 rounded-xl bg-mineral-100 text-forest-950 text-xs font-medium cursor-pointer"
                  >
                    Annulla
                  </button>
                </div>
              )}
            </>
          )}

          <button
            type="button"
            onClick={onStartNew}
            className="min-h-[44px] px-4 py-2.5 rounded-xl bg-forest-900 hover:bg-forest-800 text-white text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            Nuova analisi
          </button>
        </div>
      </div>

      {/* Filters Panel */}
      <div className="bg-white rounded-2xl border border-mineral-200 p-4 space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          {/* Origin Tabs */}
          <div className="flex items-center gap-1 p-1 bg-mineral-100 rounded-xl self-start">
            {(
              [
                { id: "reali", label: `Dati reali (${realRecords.length})` },
                { id: "demo", label: `Demo (${demoRecords.length})` },
                {
                  id: "tutte",
                  label: `Tutti (${realRecords.length + demoRecords.length})`,
                },
              ] as Array<{ id: OriginScope; label: string }>
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setOriginScope(tab.id)}
                className={`min-h-[34px] px-3 py-1 rounded-lg text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                  originScope === tab.id
                    ? "bg-white text-forest-950 shadow-xs font-semibold"
                    : "text-forest-800/75 hover:text-forest-950"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

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
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5 pt-1">
          <select
            aria-label="Filtra per varietà"
            value={cultivarFilter}
            onChange={(e) => setCultivarFilter(e.target.value)}
            className="min-h-[40px] px-3 py-2 rounded-xl border border-mineral-200 bg-mineral-50 text-xs font-medium text-forest-950"
          >
            <option value="tutte">Tutte le varietà</option>
            {CULTIVAR_OPTIONS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>

          <input
            type="date"
            aria-label="Dalla data"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="min-h-[40px] px-3 py-2 rounded-xl border border-mineral-200 bg-mineral-50 text-xs text-forest-950"
          />

          <input
            type="date"
            aria-label="Alla data"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="min-h-[40px] px-3 py-2 rounded-xl border border-mineral-200 bg-mineral-50 text-xs text-forest-950"
          />

          <select
            aria-label="Filtra per stato"
            value={filter}
            onChange={(e) => setFilter(e.target.value as FilterMode)}
            className="min-h-[40px] px-3 py-2 rounded-xl border border-mineral-200 bg-mineral-50 text-xs font-medium text-forest-950"
          >
            <option value="tutte">Tutti gli stati</option>
            <option value="verificata_frantoio">Verificate frantoio</option>
            <option value="completata">In attesa frantoio</option>
            <option value="richiesta_foto">Foto richieste</option>
          </select>

          <select
            aria-label="Ordina risultati"
            value={sortBy}
            onChange={(e) =>
              setSortBy(e.target.value as "date" | "yield" | "accuracy")
            }
            className="min-h-[40px] px-3 py-2 rounded-xl border border-mineral-200 bg-mineral-50 text-xs font-medium text-forest-950"
          >
            <option value="date">Data più recente</option>
            <option value="yield">Resa prevista più alta</option>
            <option value="accuracy">Maggiore precisione</option>
          </select>
        </div>
      </div>

      {/* Results List */}
      <div className="bg-white rounded-2xl border border-mineral-200 overflow-hidden">
        {isLoading ? (
          <div className="p-5 space-y-3">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-16 rounded-xl bg-mineral-100 animate-pulse"
              />
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
                setCultivarFilter("tutte");
                setDateFrom("");
                setDateTo("");
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
                    <th className="py-3 px-5">Foto e campione</th>
                    <th className="py-3 px-4">Varietà · Maturazione</th>
                    <th className="py-3 px-4 text-right">Resa prevista</th>
                    <th className="py-3 px-4 text-right">Resa effettiva</th>
                    <th className="py-3 px-4 text-right">Differenza</th>
                    <th className="py-3 px-5 text-right">Stato</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-mineral-100 text-sm">
                  {filtered.map((item) => {
                    const pred = item.prediction;
                    const mill = item.millOutcome;
                    const vf = item.visualFeatures;
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
                          <div className="flex items-center gap-3">
                            <div className="flex -space-x-2 shrink-0">
                              {item.photos.length > 0 ? (
                                item.photos.slice(0, 3).map((photo) => (
                                  <div
                                    key={photo.id}
                                    className="w-10 h-10 rounded-lg overflow-hidden bg-mineral-100 border border-white"
                                  >
                                    {photo.previewUrl ? (
                                      <img
                                        src={photo.previewUrl}
                                        alt={item.title}
                                        className="w-full h-full object-cover"
                                      />
                                    ) : (
                                      <div className="w-full h-full flex items-center justify-center text-olive-600">
                                        <Camera className="w-4 h-4" />
                                      </div>
                                    )}
                                  </div>
                                ))
                              ) : (
                                <div className="w-10 h-10 rounded-lg bg-mineral-100 flex items-center justify-center text-olive-600">
                                  <Camera className="w-4 h-4" />
                                </div>
                              )}
                            </div>

                            <div className="min-w-0">
                              <p className="font-semibold text-forest-950 truncate">
                                {item.title}
                              </p>
                              <p className="text-xs text-forest-800/65 mt-0.5">
                                {formatDateIt(item.harvestDate)} · {item.code} ·{" "}
                                {isDemoAnalysis(item)
                                  ? "Demo simulato"
                                  : getOriginLabel(item.dataOrigin)}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="py-3.5 px-4 text-xs text-forest-800/80">
                          <p className="font-medium text-forest-950">
                            {item.cultivar} · {formatGrams(item.sampleWeightGrams)}
                          </p>
                          <p className="font-mono tabular-nums mt-0.5 text-[11px]">
                            {vf
                              ? `Jaén ${vf.veraisonIndex.toFixed(1)}/5 (${Math.round(
                                  vf.greenPct
                                )}V / ${Math.round(vf.turningPct)}I / ${Math.round(
                                  vf.blackPct
                                )}N)`
                              : formatKg(item.lotWeightKg, 0)}
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
                const vf = item.visualFeatures;
                const delta =
                  pred && mill
                    ? Math.round(
                        (mill.actualYieldPct - pred.predictedYieldPct) * 10
                      ) / 10
                    : null;
                const thumb = item.photos[0]?.previewUrl;

                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onSelectAnalysis(item.id)}
                    className="w-full text-left px-4 py-4 flex items-center justify-between gap-3 hover:bg-olive-50/50 cursor-pointer min-h-[72px]"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-12 h-12 rounded-xl overflow-hidden bg-mineral-100 shrink-0 border border-mineral-200">
                        {thumb ? (
                          <img
                            src={thumb}
                            alt={item.title}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-olive-600">
                            <Camera className="w-4 h-4" />
                          </div>
                        )}
                      </div>

                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-forest-950 truncate">
                          {item.title}
                        </p>
                        <p className="text-xs text-forest-800/70 truncate mt-0.5">
                          {formatDateIt(item.harvestDate)} · {item.cultivar} ·{" "}
                          {vf ? `Jaén ${vf.veraisonIndex.toFixed(1)}` : ""}
                        </p>
                        <p className="text-[11px] text-forest-800/60 mt-0.5">
                          {isDemoAnalysis(item)
                            ? "Demo simulato"
                            : getOriginLabel(item.dataOrigin)}{" "}
                          · {getStatusLabel(item.status)}
                        </p>
                      </div>
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
