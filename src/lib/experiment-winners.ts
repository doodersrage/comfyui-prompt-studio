import { readBrowserValue, writeBrowserValue } from "./browser-storage";

export const EXPERIMENT_WINNERS_KEY = "comfy-experiment-winners-v1";

export type ExperimentWinnerRecord = {
  groupId: string;
  entryId: string;
  markedAt: number;
};

export function loadExperimentWinners(): Record<string, ExperimentWinnerRecord> {
  if (typeof window === "undefined") {
    return {};
  }
  try {
    return readBrowserValue<Record<string, ExperimentWinnerRecord>>(EXPERIMENT_WINNERS_KEY) ?? {};
  } catch {
    return {};
  }
}

export function markExperimentWinner(groupId: string, entryId: string): void {
  if (typeof window === "undefined") {
    return;
  }
  const winners = loadExperimentWinners();
  winners[groupId] = { groupId, entryId, markedAt: Date.now() };
  writeBrowserValue(EXPERIMENT_WINNERS_KEY, winners);
}

export function clearExperimentWinner(groupId: string): void {
  if (typeof window === "undefined") {
    return;
  }
  const winners = loadExperimentWinners();
  delete winners[groupId];
  writeBrowserValue(EXPERIMENT_WINNERS_KEY, winners);
}
