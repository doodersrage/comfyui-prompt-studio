import type { ExperimentGroup } from './experiment-groups';
import type { ComfyGalleryEntry } from './comfyui-gallery-entry';

const DEFAULT_WINDOW_MS = 45_000;
const MIN_BATCH = 3;

function runId(entries: ComfyGalleryEntry[]): string {
  const first = entries[0];
  // Keyed on the first entry's own (already-unique) id rather than a
  // tool-name + timestamp string truncated to 32 chars: several tools in
  // this app have names long enough (e.g. "wan-video-rapid-aio", 19 chars)
  // that the old scheme left only ~8 leading digits of the 13-digit
  // queuedAt epoch-ms value before truncation -- any two batches of the
  // same tool queued within the same ~100-second bucket collided on id.
  // That id is used directly as both the React row key and the lookup key
  // for collapse/winner state, so a collision made two unrelated batches
  // silently share (and clobber) each other's expand/collapse + winner UI
  // state, and could cause React to drop one of the rows entirely.
  return `run-${first?.id ?? 'batch'}`;
}

/**
 * Group entries queued in a tight window with the same tool (seed sweeps,
 * scheduled batches, param grids) even when prompts differ.
 */
export function groupGalleryQueueRuns(
  entries: ComfyGalleryEntry[],
  windowMs = DEFAULT_WINDOW_MS
): ExperimentGroup[] {
  const eligible = entries.filter(
    entry => entry.status === 'completed' || entry.status === 'running'
  );
  const byTool = new Map<string, ComfyGalleryEntry[]>();
  for (const entry of eligible) {
    const key = entry.tool ?? '';
    const list = byTool.get(key);
    if (list) {
      list.push(entry);
    } else {
      byTool.set(key, [entry]);
    }
  }

  const clusters: ComfyGalleryEntry[][] = [];
  for (const list of byTool.values()) {
    const sorted = [...list].sort((a, b) => a.queuedAt - b.queuedAt);
    let current: ComfyGalleryEntry[] = [];
    let windowStart = 0;
    for (const entry of sorted) {
      if (current.length === 0 || entry.queuedAt - windowStart <= windowMs) {
        if (current.length === 0) {
          windowStart = entry.queuedAt;
        }
        current.push(entry);
        continue;
      }
      if (current.length >= MIN_BATCH) {
        clusters.push(current);
      }
      current = [entry];
      windowStart = entry.queuedAt;
    }
    if (current.length >= MIN_BATCH) {
      clusters.push(current);
    }
  }

  return clusters.map(group => {
    const seeds = [
      ...new Set(
        group
          .map(entry => (entry.queueParams?.seed != null ? String(entry.queueParams.seed) : ''))
          .filter(Boolean)
      ),
    ];
    const started = new Date(group[0]!.queuedAt);
    const timeLabel = started.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return {
      id: runId(group),
      label: `Batch · ${timeLabel} · ${group[0]?.tool ?? 'queue'} · ${group.length} jobs`,
      parentPrompt: group[0]?.prompt ?? '',
      entries: group,
      variants: {
        seeds,
        cfgValues: [
          ...new Set(
            group
              .map(entry => (entry.queueParams?.cfg != null ? String(entry.queueParams.cfg) : ''))
              .filter(Boolean)
          ),
        ],
        stepValues: [
          ...new Set(
            group
              .map(entry =>
                entry.queueParams?.steps != null ? String(entry.queueParams.steps) : ''
              )
              .filter(Boolean)
          ),
        ],
      },
    };
  });
}
