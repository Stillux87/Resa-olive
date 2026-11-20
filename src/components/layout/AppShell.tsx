import type { ReactNode } from "react";
import {
  BarChart3,
  Camera,
  History,
  Home,
  SlidersHorizontal,
} from "lucide-react";

export type AppRoute =
  | { view: "dashboard" }
  | { view: "wizard" }
  | { view: "history" }
  | { view: "stats" }
  | { view: "settings" }
  | { view: "detail"; analysisId: string };

interface AppShellProps {
  route: AppRoute;
  onNavigate: (route: AppRoute) => void;
  children: ReactNode;
}

const NAV_ITEMS: Array<{
  id: "dashboard" | "history" | "stats" | "settings";
  label: string;
  mobileLabel: string;
}> = [
  { id: "dashboard", label: "Dashboard", mobileLabel: "Home" },
  { id: "history", label: "Storico", mobileLabel: "Storico" },
  { id: "stats", label: "Statistiche", mobileLabel: "Statistiche" },
  { id: "settings", label: "Motore AI", mobileLabel: "Impostazioni" },
];

export function AppShell({ route, onNavigate, children }: AppShellProps) {
  const activeKey =
    route.view === "detail"
      ? "history"
      : route.view === "wizard"
      ? "wizard"
      : route.view;

  return (
    <div className="min-h-screen flex flex-col bg-mineral-50 text-forest-950">
      {/* Desktop & Mobile Top Bar — strictly 3 zones on desktop, compact 52px on mobile */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-mineral-200">
        <div className="max-w-6xl mx-auto px-4 md:px-6 h-13 md:h-16 flex items-center justify-between gap-8">
          {/* Zone 1: Single text element wordmark */}
          <button
            type="button"
            onClick={() => onNavigate({ view: "dashboard" })}
            className="font-display text-lg md:text-xl font-semibold tracking-tight text-forest-900 whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest-900 cursor-pointer"
          >
            OLIVESTIMA
          </button>

          {/* Zone 2: Clean single-line text nav links (Desktop) */}
          <nav
            aria-label="Navigazione principale"
            className="hidden md:flex items-center gap-6 text-sm font-medium text-forest-800/75"
          >
            {NAV_ITEMS.map((item) => {
              const isActive = activeKey === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onNavigate({ view: item.id })}
                  className={`py-1.5 border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest-900 ${
                    isActive
                      ? "border-gold-500 text-forest-950 font-semibold"
                      : "border-transparent hover:text-forest-950 hover:border-mineral-200"
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>

          {/* Zone 3: 1 Primary Action CTA */}
          <div className="flex items-center shrink-0">
            <button
              type="button"
              onClick={() => onNavigate({ view: "wizard" })}
              className="min-h-[40px] md:min-h-[42px] px-4 py-2 rounded-xl bg-forest-900 text-white text-xs md:text-sm font-semibold hover:bg-forest-800 active:scale-[0.98] transition-all whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest-900"
            >
              Nuova analisi
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 w-full max-w-6xl mx-auto px-4 md:px-6 pt-5 pb-24 md:py-8">
        {children}
      </main>

      {/* Desktop Footer */}
      <footer className="hidden md:block border-t border-mineral-200 bg-white">
        <div className="max-w-6xl mx-auto px-6 py-5 flex items-center justify-between text-xs text-forest-800/65">
          <span>
            OLIVESTIMA · Stima statistica della resa olearia · Archivio locale IndexedDB
          </span>
          <span>
            Le stime fotografiche sono indicative e non sostituiscono la resa reale al frantoio.
          </span>
        </div>
      </footer>

      {/* Mobile Bottom Tab Bar — max 60px + safe area (under 15% total sticky cap) */}
      <nav
        aria-label="Menu rapido smartphone"
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-mineral-200 pb-safe"
      >
        <div className="grid grid-cols-5 items-center h-14">
          <MobileTabButton
            active={activeKey === "dashboard"}
            label="Home"
            onClick={() => onNavigate({ view: "dashboard" })}
            icon={<Home className="w-5 h-5" />}
          />
          <MobileTabButton
            active={activeKey === "history"}
            label="Storico"
            onClick={() => onNavigate({ view: "history" })}
            icon={<History className="w-5 h-5" />}
          />
          <button
            type="button"
            onClick={() => onNavigate({ view: "wizard" })}
            aria-label="Nuova analisi"
            className="flex flex-col items-center justify-center min-h-[44px] text-forest-900 cursor-pointer focus-visible:outline-2 focus-visible:outline-forest-900"
          >
            <span
              className={`w-10 h-8 rounded-xl flex items-center justify-center transition-colors ${
                activeKey === "wizard"
                  ? "bg-gold-500 text-forest-950"
                  : "bg-forest-900 text-white"
              }`}
            >
              <Camera className="w-4 h-4" />
            </span>
            <span className="text-[10px] font-semibold tracking-tight mt-0.5 whitespace-nowrap">
              Analizza
            </span>
          </button>
          <MobileTabButton
            active={activeKey === "stats"}
            label="Statistiche"
            onClick={() => onNavigate({ view: "stats" })}
            icon={<BarChart3 className="w-5 h-5" />}
          />
          <MobileTabButton
            active={activeKey === "settings"}
            label="Motore"
            onClick={() => onNavigate({ view: "settings" })}
            icon={<SlidersHorizontal className="w-5 h-5" />}
          />
        </div>
      </nav>
    </div>
  );
}

function MobileTabButton({
  active,
  label,
  icon,
  onClick,
}: {
  active: boolean;
  label: string;
  icon: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col items-center justify-center min-h-[44px] py-1 transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-forest-900 ${
        active ? "text-forest-950 font-semibold" : "text-forest-800/60"
      }`}
    >
      <span className={active ? "text-gold-600" : ""}>{icon}</span>
      <span className="text-[10px] tracking-tight mt-0.5 whitespace-nowrap">
        {label}
      </span>
    </button>
  );
}
