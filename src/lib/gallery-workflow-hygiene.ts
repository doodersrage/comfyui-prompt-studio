import type { ComfyGalleryEntry } from './comfyui-gallery-entry';

/** Default: keep stored exact-replay graphs for 30 days. 0 = keep forever. */
export const DEFAULT_GALLERY_WORKFLOW_RETENTION_DAYS = 30;

export function normalizeGalleryWorkflowRetentionDays(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULT_GALLERY_WORKFLOW_RETENTION_DAYS;
  }
  return Math.min(365, Math.max(0, Math.round(value)));
}

/** Strip stored workflow JSON from entries older than retentionDays (0 = no-op). */
export function pruneStaleGalleryWorkflowJson(
  entries: ComfyGalleryEntry[],
  retentionDays: number,
  now = Date.now()
): { entries: ComfyGalleryEntry[]; pruned: number } {
  const days = normalizeGalleryWorkflowRetentionDays(retentionDays);
  if (days <= 0) {
    return { entries, pruned: 0 };
  }
  const cutoff = now - days * 24 * 60 * 60 * 1000;
  let pruned = 0;
  const next = entries.map(entry => {
    if (!entry.workflowJson?.trim()) {
      return entry;
    }
    const stamp = entry.completedAt ?? entry.queuedAt;
    if (stamp >= cutoff) {
      return entry;
    }
    pruned += 1;
    const rest = { ...entry };
    delete rest.workflowJson;
    return {
      ...rest,
      hasStoredWorkflow: false,
      workflowJsonOmitted: true,
    };
  });
  return { entries: next, pruned };
}

/** Export copy without heavy workflow graphs (ZIP/sidecar bundles stay lean). */
export function stripGalleryWorkflowJsonForExport(entry: ComfyGalleryEntry): ComfyGalleryEntry {
  if (!entry.workflowJson) {
    return entry;
  }
  const rest = { ...entry };
  delete rest.workflowJson;
  return {
    ...rest,
    hasStoredWorkflow: Boolean(entry.hasStoredWorkflow || entry.workflowJson),
  };
}
