import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { checkBackendHealth } from "../services/ai";
import {
  deleteAllDemoAnalyses,
  deleteAnalysisFromDb,
  getAnalysisById,
  getAppSettings,
  getIndexedDbStorageSummary,
  listAnalyses,
  saveAnalysisWithPhotos,
  seedDemoDataIfEmpty,
  updateAppSettings,
  updateMillOutcomeInDb,
} from "../services/persistence/indexedDb";
import {
  buildCalibrationSummary,
  isDemoAnalysis,
} from "../services/prediction/calibration";
import { computeAggregateStats } from "../services/prediction/yieldEngine";
import type {
  AppSettings,
  MillOutcome,
  OliveAnalysisRecord,
  PhotoAsset,
} from "../types/analysis";

export const olivestimaKeys = {
  all: ["olivestima"] as const,
  analyses: () => [...olivestimaKeys.all, "analyses"] as const,
  analysis: (id: string) => [...olivestimaKeys.all, "analysis", id] as const,
  settings: () => [...olivestimaKeys.all, "settings"] as const,
  storage: () => [...olivestimaKeys.all, "storage"] as const,
  backendHealth: () => [...olivestimaKeys.all, "backendHealth"] as const,
};

export function useAnalysesQuery() {
  return useQuery({
    queryKey: olivestimaKeys.analyses(),
    queryFn: listAnalyses,
    staleTime: 30_000,
  });
}

export function useAnalysisDetailQuery(id: string | null) {
  return useQuery({
    queryKey: olivestimaKeys.analysis(id ?? "__none__"),
    queryFn: () => (id ? getAnalysisById(id) : Promise.resolve(null)),
    enabled: Boolean(id),
    staleTime: 15_000,
  });
}

export function useAggregateStatsQuery() {
  const analysesQuery = useAnalysesQuery();
  const all = analysesQuery.data ?? [];
  const realRecords = all.filter((r) => !isDemoAnalysis(r));
  const demoRecords = all.filter((r) => isDemoAnalysis(r));

  const realStats = analysesQuery.data
    ? computeAggregateStats(realRecords)
    : null;
  const demoStats = analysesQuery.data
    ? computeAggregateStats(demoRecords)
    : null;
  const calibrationSummary = analysesQuery.data
    ? buildCalibrationSummary(realRecords)
    : null;

  return {
    ...analysesQuery,
    realRecords,
    demoRecords,
    realStats,
    demoStats,
    calibrationSummary,
  };
}

export function useAppSettingsQuery() {
  return useQuery({
    queryKey: olivestimaKeys.settings(),
    queryFn: getAppSettings,
    staleTime: Infinity,
  });
}

export function useStorageSummaryQuery() {
  return useQuery({
    queryKey: olivestimaKeys.storage(),
    queryFn: getIndexedDbStorageSummary,
    staleTime: 10_000,
  });
}

export function useBackendHealthQuery() {
  return useQuery({
    queryKey: olivestimaKeys.backendHealth(),
    queryFn: () => checkBackendHealth(false),
    retry: false,
    staleTime: 60_000,
  });
}

export function useSaveAnalysisMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: {
      record: OliveAnalysisRecord;
      photos: Array<{ asset: PhotoAsset; blob: Blob }>;
    }) => {
      await saveAnalysisWithPhotos(payload.record, payload.photos);
      return getAnalysisById(payload.record.id);
    },
    onSuccess: (saved, variables) => {
      if (saved) {
        queryClient.setQueryData(olivestimaKeys.analysis(saved.id), saved);
      }
      queryClient.setQueryData<OliveAnalysisRecord[]>(
        olivestimaKeys.analyses(),
        (prev) => {
          const item = saved ?? variables.record;
          if (!prev) return [item];
          const exists = prev.some((r) => r.id === item.id);
          const next = exists
            ? prev.map((r) => (r.id === item.id ? item : r))
            : [item, ...prev];
          return next.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        }
      );
      queryClient.invalidateQueries({ queryKey: olivestimaKeys.storage() });
    },
  });
}

export function useRecordMillOutcomeMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: {
      analysisId: string;
      outcome: MillOutcome;
    }) => {
      return updateMillOutcomeInDb(payload.analysisId, payload.outcome);
    },
    onMutate: async (variables) => {
      await queryClient.cancelQueries({
        queryKey: olivestimaKeys.analysis(variables.analysisId),
      });
      const previousDetail = queryClient.getQueryData<OliveAnalysisRecord | null>(
        olivestimaKeys.analysis(variables.analysisId)
      );
      if (previousDetail) {
        queryClient.setQueryData<OliveAnalysisRecord>(
          olivestimaKeys.analysis(variables.analysisId),
          {
            ...previousDetail,
            millOutcome: variables.outcome,
            status: "verificata_frantoio",
            updatedAt: new Date().toISOString(),
          }
        );
      }
      return { previousDetail };
    },
    onError: (_err, variables, context) => {
      if (context?.previousDetail) {
        queryClient.setQueryData(
          olivestimaKeys.analysis(variables.analysisId),
          context.previousDetail
        );
      }
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(olivestimaKeys.analysis(updated.id), updated);
      queryClient.invalidateQueries({ queryKey: olivestimaKeys.analyses() });
    },
  });
}

export function useDeleteAnalysisMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (analysisId: string) => deleteAnalysisFromDb(analysisId),
    onSuccess: (_void, analysisId) => {
      queryClient.removeQueries({
        queryKey: olivestimaKeys.analysis(analysisId),
      });
      queryClient.setQueryData<OliveAnalysisRecord[]>(
        olivestimaKeys.analyses(),
        (prev) => (prev ? prev.filter((r) => r.id !== analysisId) : [])
      );
      queryClient.invalidateQueries({ queryKey: olivestimaKeys.storage() });
    },
  });
}

export function useDeleteAllDemoMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      await deleteAllDemoAnalyses();
      return listAnalyses();
    },
    onSuccess: (records) => {
      queryClient.setQueryData(olivestimaKeys.analyses(), records);
      queryClient.invalidateQueries({ queryKey: olivestimaKeys.storage() });
    },
  });
}

export function useUpdateSettingsMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (patch: Partial<AppSettings>) => updateAppSettings(patch),
    onSuccess: (next) => {
      queryClient.setQueryData(olivestimaKeys.settings(), next);
    },
  });
}

export function useResetDemoMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      await seedDemoDataIfEmpty(true);
      return listAnalyses();
    },
    onSuccess: (records) => {
      queryClient.setQueryData(olivestimaKeys.analyses(), records);
      queryClient.invalidateQueries({ queryKey: olivestimaKeys.storage() });
    },
  });
}
