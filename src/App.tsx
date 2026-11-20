/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DashboardView } from "./components/dashboard/DashboardView";
import { HistoryView } from "./components/history/HistoryView";
import { AppShell, type AppRoute } from "./components/layout/AppShell";
import { AnalysisResultsView } from "./components/results/AnalysisResultsView";
import { SettingsView } from "./components/settings/SettingsView";
import { StatisticsView } from "./components/stats/StatisticsView";
import { NewAnalysisWizard } from "./components/wizard/NewAnalysisWizard";
import {
  useAggregateStatsQuery,
  useAnalysesQuery,
  useAppSettingsQuery,
} from "./hooks/useOlivestimaQueries";
import { OLIVE_OIL_DENSITY_KG_PER_LITER } from "./types/analysis";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

function OlivestimaWorkspace() {
  const [route, setRoute] = useState<AppRoute>({ view: "dashboard" });
  const analysesQuery = useAnalysesQuery();
  const { stats } = useAggregateStatsQuery();
  const settingsQuery = useAppSettingsQuery();

  const settings = settingsQuery.data ?? {
    aiMode: "simulato_locale" as const,
    defaultDensityKgPerLiter: OLIVE_OIL_DENSITY_KG_PER_LITER,
    seededDemoVersion: 1,
  };

  function navigateTo(next: AppRoute) {
    setRoute(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <AppShell route={route} onNavigate={navigateTo}>
      {route.view === "dashboard" && (
        <DashboardView
          analyses={analysesQuery.data ?? []}
          stats={stats}
          aiMode={settings.aiMode}
          isLoading={analysesQuery.isLoading}
          onNavigate={navigateTo}
        />
      )}

      {route.view === "wizard" && (
        <NewAnalysisWizard
          aiMode={settings.aiMode}
          onComplete={(analysisId) =>
            navigateTo({ view: "detail", analysisId })
          }
          onCancel={() => navigateTo({ view: "dashboard" })}
        />
      )}

      {route.view === "detail" && (
        <AnalysisResultsView
          analysisId={route.analysisId}
          aiMode={settings.aiMode}
          onBack={() => navigateTo({ view: "history" })}
        />
      )}

      {route.view === "history" && (
        <HistoryView
          analyses={analysesQuery.data ?? []}
          isLoading={analysesQuery.isLoading}
          onSelectAnalysis={(analysisId) =>
            navigateTo({ view: "detail", analysisId })
          }
          onStartNew={() => navigateTo({ view: "wizard" })}
        />
      )}

      {route.view === "stats" && (
        <StatisticsView
          analyses={analysesQuery.data ?? []}
          stats={stats}
          isLoading={analysesQuery.isLoading}
          onSelectAnalysis={(analysisId) =>
            navigateTo({ view: "detail", analysisId })
          }
        />
      )}

      {route.view === "settings" && <SettingsView settings={settings} />}
    </AppShell>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <OlivestimaWorkspace />
    </QueryClientProvider>
  );
}
