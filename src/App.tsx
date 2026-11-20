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
  useAppSettingsQuery,
  useDeleteAllDemoMutation,
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
  const {
    realRecords,
    demoRecords,
    realStats,
    demoStats,
    calibrationSummary,
    isLoading,
  } = useAggregateStatsQuery();
  const settingsQuery = useAppSettingsQuery();
  const deleteAllDemoMutation = useDeleteAllDemoMutation();

  const settings = settingsQuery.data ?? {
    aiMode: "gemini_backend" as const,
    defaultDensityKgPerLiter: OLIVE_OIL_DENSITY_KG_PER_LITER,
    seededDemoVersion: 2,
  };

  function navigateTo(next: AppRoute) {
    setRoute(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <AppShell route={route} onNavigate={navigateTo}>
      {route.view === "dashboard" && (
        <DashboardView
          realRecords={realRecords}
          demoRecords={demoRecords}
          realStats={realStats}
          demoStats={demoStats}
          calibrationSummary={calibrationSummary}
          aiMode={settings.aiMode}
          isLoading={isLoading}
          onNavigate={navigateTo}
        />
      )}

      {route.view === "wizard" && (
        <NewAnalysisWizard
          aiMode={settings.aiMode}
          densityKgPerLiter={settings.defaultDensityKgPerLiter}
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
          densityKgPerLiter={settings.defaultDensityKgPerLiter}
          onBack={() => navigateTo({ view: "history" })}
        />
      )}

      {route.view === "history" && (
        <HistoryView
          realRecords={realRecords}
          demoRecords={demoRecords}
          isLoading={isLoading}
          onSelectAnalysis={(analysisId) =>
            navigateTo({ view: "detail", analysisId })
          }
          onStartNew={() => navigateTo({ view: "wizard" })}
          onDeleteAllDemo={() => deleteAllDemoMutation.mutateAsync()}
          isDeletingDemo={deleteAllDemoMutation.isPending}
        />
      )}

      {route.view === "stats" && (
        <StatisticsView
          realRecords={realRecords}
          demoRecords={demoRecords}
          realStats={realStats}
          demoStats={demoStats}
          calibrationSummary={calibrationSummary}
          densityKgPerLiter={settings.defaultDensityKgPerLiter}
          isLoading={isLoading}
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
