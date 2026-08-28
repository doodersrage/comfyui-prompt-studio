'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { resolveSceneHintsForGeneration } from '@/components/scene-tool/HistoryHintSeedPanel';
import { useCachedSettings } from '@/hooks/useCachedSettings';
import { useSeedToolDraft } from '@/hooks/useSeedToolDraft';
import { useLocationBlocklist } from '@/hooks/useLocationBlocklist';
import { useRecentClothing } from '@/hooks/useRecentClothing';
import { useRecentLocations } from '@/hooks/useRecentLocations';
import { useWorkspaceMode } from '@/hooks/useWorkspaceMode';
import type { BatchLintSummary } from '@/lib/batch-lint-gate';
import { scoreBatchReadiness } from '@/lib/batch-readiness';
import type { ComfyImageModel } from '@/lib/comfy-models/client';
import { loadGalleryVariationsHandoff } from '@/lib/gallery-variations-handoff';
import { loadPresetVariationsHandoff } from '@/lib/preset-variations-handoff';
import { rememberDraftFields } from '@/lib/remember-draft-fields';
import { scheduleAfterCommit } from '@/lib/schedule-after-commit';
import { DEFAULT_VARIATIONS_TOOL_CACHE } from '@/lib/settings-cache';
import { normalizeHistorySeedScope, normalizeSceneHintSource } from '@/lib/scene-hint-source';
import { countHistorySeedCandidates } from '@/lib/history-hint-seed';
import type { BatchQueueProgressState } from '@/components/BatchQueueProgress';
import type { VariationResult } from '@/lib/variation-request-body';
import { variationsHistoryTool } from '@/lib/variation-request-body';

export function useVariationGridInit() {
  const workspaceMode = useWorkspaceMode();
  const isSimple = workspaceMode === 'simple';
  const { mounted, shared, toolSettings, updateShared, updateToolSettings } = useCachedSettings(
    'variations',
    DEFAULT_VARIATIONS_TOOL_CACHE
  );
  const { getRecent: getRecentClothing } = useRecentClothing();
  const { getRecent: getRecentLocations } = useRecentLocations();
  const { getBlocklist } = useLocationBlocklist();
  const [results, setResults] = useState<VariationResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [queueLoading, setQueueLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [comfyStatus, setComfyStatus] = useState<string | null>(null);
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [lintSummary, setLintSummary] = useState<BatchLintSummary | null>(null);
  const [lintLoading, setLintLoading] = useState(false);
  const [readyOnly, setReadyOnly] = useState(false);
  const [queueProgress, setQueueProgress] = useState<BatchQueueProgressState | null>(null);
  const [rollProgress, setRollProgress] = useState<BatchQueueProgressState | null>(null);
  const importedAppliedRef = useRef(false);

  useSeedToolDraft(mounted, {
    toolKey: 'variations',
    label: 'Variations',
    href: '/variations',
    fields: [toolSettings.hints],
  });

  useEffect(() => {
    if (!mounted) {
      return;
    }
    const params = new URLSearchParams(window.location.search);
    if (params.get('matrix') === '1') {
      updateToolSettings({ gridMode: 'matrix' });
    }
  }, [mounted, updateToolSettings]);

  useEffect(() => {
    if (!mounted || importedAppliedRef.current) {
      return;
    }
    scheduleAfterCommit(() => {
      const params = new URLSearchParams(window.location.search);
      if (params.get('from') === 'gallery') {
        const handoff = loadGalleryVariationsHandoff();
        if (handoff?.prompt) {
          importedAppliedRef.current = true;
          updateToolSettings({ hints: handoff.hints, gridMode: 'imported' });
          rememberDraftFields({
            toolKey: 'variations',
            label: 'Variations',
            href: '/variations',
            fields: [handoff.hints, handoff.prompt],
          });
          setResults([{ prompt: handoff.prompt, rowLabel: 'gallery' }]);
          setStatus('Loaded prompt from Gallery.');
          if (handoff.model) {
            updateShared({ model: handoff.model as ComfyImageModel });
          }
          return;
        }
      }
      if (params.get('from') === 'preset') {
        const handoff = loadPresetVariationsHandoff();
        if (handoff?.hints) {
          importedAppliedRef.current = true;
          updateToolSettings({
            hints: handoff.hints,
            count: handoff.count,
            target: handoff.target,
            portraitStyle: handoff.portraitStyle,
            sportPresetId: handoff.sportPresetId,
            gridMode: 'roll',
            hintSource: 'manual',
          });
          rememberDraftFields({
            toolKey: 'variations',
            label: 'Variations',
            href: '/variations',
            fields: [handoff.hints],
          });
          setStatus(`Loaded preset hints for ${handoff.count} variations.`);
          return;
        }
      }
      if (params.get('from') !== 'topics') {
        return;
      }
      const prompts = toolSettings.importedBatchPrompts;
      if (!prompts?.length) {
        return;
      }
      importedAppliedRef.current = true;
      const topics = toolSettings.importedBatchTopics ?? [];
      setResults(
        prompts.map((prompt, index) => ({
          prompt,
          rowLabel: topics[index],
        }))
      );
      setStatus(`Loaded ${prompts.length} prompts from Topics batch.`);
      updateToolSettings({ gridMode: 'imported' });
    });
  }, [
    mounted,
    toolSettings.importedBatchPrompts,
    toolSettings.importedBatchTopics,
    updateToolSettings,
    updateShared,
  ]);

  const target = toolSettings.target ?? 'generate';
  const hintSource = normalizeSceneHintSource(toolSettings.hintSource);
  const historySeedScope = normalizeHistorySeedScope(toolSettings.historySeedScope);
  const historyTool = variationsHistoryTool(target);
  const historyCandidateCount = countHistorySeedCandidates(historyTool, historySeedScope);
  const effectiveHints = resolveSceneHintsForGeneration({
    hintSource,
    hints: toolSettings.hints,
    randomTheme: toolSettings.randomTheme,
  });
  const gridMode = toolSettings.gridMode ?? 'roll';
  const count = Math.min(12, Math.max(2, toolSettings.count ?? 4));
  const matrixRowCount = Math.min(6, Math.max(2, toolSettings.matrixRowCount ?? 3));
  const matrixColCount = Math.min(6, Math.max(2, toolSettings.matrixColCount ?? 3));
  const matrixAxisRow = toolSettings.matrixAxisRow ?? 'variation';
  const matrixAxisCol = toolSettings.matrixAxisCol ?? 'sportPreset';

  const batchReadiness = useMemo(
    () =>
      scoreBatchReadiness({
        rows: results.map(entry => ({
          prompt: entry.prompt,
          label:
            entry.rowLabel && entry.colLabel
              ? `${entry.rowLabel} × ${entry.colLabel}`
              : entry.rowLabel,
          hints: toolSettings.hints,
        })),
        model: shared.model,
        detail: shared.detail,
      }),
    [results, shared.detail, shared.model, toolSettings.hints]
  );
  const readinessByIndex = useMemo(
    () => new Map(batchReadiness.map(row => [row.index, row])),
    [batchReadiness]
  );

  return {
    mounted,
    isSimple,
    shared,
    toolSettings,
    updateShared,
    updateToolSettings,
    getRecentClothing,
    getRecentLocations,
    getBlocklist,
    effectiveHints,
    results,
    setResults,
    loading,
    setLoading,
    queueLoading,
    setQueueLoading,
    error,
    setError,
    status,
    setStatus,
    comfyStatus,
    setComfyStatus,
    importStatus,
    setImportStatus,
    lintSummary,
    setLintSummary,
    lintLoading,
    setLintLoading,
    readyOnly,
    setReadyOnly,
    queueProgress,
    setQueueProgress,
    rollProgress,
    setRollProgress,
    target,
    hintSource,
    historySeedScope,
    historyTool,
    historyCandidateCount,
    gridMode,
    count,
    matrixRowCount,
    matrixColCount,
    matrixAxisRow,
    matrixAxisCol,
    readinessByIndex,
  };
}

export type VariationGridInit = ReturnType<typeof useVariationGridInit>;
