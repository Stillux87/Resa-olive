import type { AiEngineMode } from "../../types/analysis";
import {
  checkBackendHealth,
  geminiBackendProvider,
} from "./geminiBackendProvider";
import { simulatedLocalProvider } from "./simulatedProvider";
import type { AiAnalysisInput, AiAnalysisOutput } from "./types";

export type {
  AiAnalysisInput,
  AiAnalysisOutput,
  AiAnalysisProgressEvent,
  BackendHealthStatus,
  MultimodalAnalysisProvider,
} from "./types";
export { checkBackendHealth };

export async function runOliveSampleAnalysis(
  mode: AiEngineMode,
  input: AiAnalysisInput
): Promise<AiAnalysisOutput> {
  if (mode === "gemini_backend") {
    return geminiBackendProvider.analyzeSample(input);
  }
  return simulatedLocalProvider.analyzeSample(input);
}
