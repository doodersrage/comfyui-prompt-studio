const EXPERIMENT_WINNERS_KEY = "comfy-experiment-winners-v1";

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
    const raw = window.localStorage.getItem(EXPERIMENT_WINNERS_KEY);
    if (!raw) {
      return {};
    }
    return JSON.parse(raw) as Record<string, ExperimentWinnerRecord>;
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
  window.localStorage.setItem(EXPERIMENT_WINNERS_KEY, JSON.stringify(winners));
}

export function clearExperimentWinner(groupId: string): void {
  if (typeof window === "undefined") {
    return;
  }
  const winners = loadExperimentWinners();
  delete winners[groupId];
  window.localStorage.setItem(EXPERIMENT_WINNERS_KEY, JSON.stringify(winners));
}
