'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { BatchQueueProgressState } from '@/components/BatchQueueProgress';
import { resolveSceneHintsForGeneration } from '@/components/scene-tool/HistoryHintSeedPanel';
import { useCachedSettings } from '@/hooks/useCachedSettings';
import { useSeedToolDraft } from '@/hooks/useSeedToolDraft';
import { useLocationBlocklist } from '@/hooks/useLocationBlocklist';
import { useRecentClothing } from '@/hooks/useRecentClothing';
import { useRecentLocations } from '@/hooks/useRecentLocations';
import { useWorkspaceMode } from '@/hooks/useWorkspaceMode';
import { runBatchLintGate, type BatchLintSummary } from '@/lib/batch-lint-gate';
import { scoreBatchReadiness } from '@/lib/batch-readiness';
import { registerComfyGalleryJob } from '@/lib/comfyui-gallery-client';
import { scheduleComfyGalleryPoll } from '@/lib/comfyui-gallery-poller';
import { postComfyUiPrompt } from '@/lib/comfyui-queue-request';
import { resolveRuntimeForQueue } from '@/lib/comfyui-runtime-for-model';
import type { ComfyImageModel } from '@/lib/comfy-models/client';
import { loadGalleryVariationsHandoff } from '@/lib/gallery-variations-handoff';
import { loadPresetVariationsHandoff } from '@/lib/preset-variations-handoff';
import { resolveQueueNegativePrompt } from '@/lib/queue-negative';
import { resolveQueueParams } from '@/lib/queue-params-settings';
import { rememberDraftFields } from '@/lib/remember-draft-fields';
import { scheduleAfterCommit } from '@/lib/schedule-after-commit';
import { DEFAULT_VARIATIONS_TOOL_CACHE } from '@/lib/settings-cache';
import { normalizeHistorySeedScope, normalizeSceneHintSource } from '@/lib/scene-hint-source';
import { countHistorySeedCandidates } from '@/lib/history-hint-seed';
import { buildMatrixAxes } from '@/lib/variation-matrix';
import { runWorkflowPreflight } from '@/lib/workflow-preflight';
import {
  buildVariationRequestBody,
  variationEndpoint,
  variationsHistoryTool,
  type CellOverrides,
  type VariationResult,
} from '@/lib/variation-request-body';

export function useVariationGridOrchestration() {
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

  const fetchVariation = useCallback(
    async (
      overrides: CellOverrides = {},
      labels?: { rowLabel?: string; colLabel?: string }
    ): Promise<VariationResult> => {
      const hints = effectiveHints.trim();
      if (!hints) {
        throw new Error('Enter hints or a base prompt first.');
      }

      const endpoint = variationEndpoint(target);
      const body = buildVariationRequestBody(
        target,
        hints,
        shared,
        toolSettings,
        getRecentClothing,
        getRecentLocations,
        getBlocklist,
        overrides
      );

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = (await response.json()) as {
        prompt?: string;
        seed?: string;
        metadata?: { seed?: string };
        error?: string;
      };

      if (!response.ok || !data.prompt?.trim()) {
        return {
          prompt: '',
          error: data.error ?? 'Variation roll failed.',
          rowLabel: labels?.rowLabel,
          colLabel: labels?.colLabel,
        };
      }

      return {
        prompt: data.prompt.trim(),
        seed: data.seed ?? data.metadata?.seed,
        rowLabel: labels?.rowLabel,
        colLabel: labels?.colLabel,
      };
    },
    [
      effectiveHints,
      getBlocklist,
      getRecentClothing,
      getRecentLocations,
      shared,
      target,
      toolSettings,
    ]
  );

  const rollGrid = useCallback(async () => {
    if (!effectiveHints.trim()) {
      setError('Enter hints or a base prompt first.');
      return;
    }

    setLoading(true);
    setError(null);
    setStatus(null);
    setComfyStatus(null);
    setRollProgress({
      phase: 'generating',
      current: 0,
      total: count,
      message: `Generating variation 1 of ${count}…`,
    });
    setResults([]);

    try {
      const next: VariationResult[] = [];

      for (let index = 0; index < count; index += 1) {
        setRollProgress({
          phase: 'generating',
          current: index,
          total: count,
          message: `Generating variation ${index + 1} of ${count}…`,
        });
        next.push(await fetchVariation());
        setResults([...next]);
        setRollProgress({
          phase: 'generating',
          current: index + 1,
          total: count,
          message:
            index + 1 < count
              ? `Generated ${index + 1}/${count}. Starting variation ${index + 2}…`
              : `Generated ${index + 1}/${count}.`,
        });
      }

      const ok = next.filter(entry => entry.prompt).length;
      setRollProgress({
        phase: 'done',
        current: ok,
        total: count,
        message: `Rolled ${ok}/${count} variation prompts via ${target}.`,
      });
      setStatus(`Rolled ${ok}/${count} variation prompts via ${target}.`);
    } catch (err) {
      setResults([]);
      const message = err instanceof Error ? err.message : 'Variation grid failed.';
      setRollProgress({
        phase: 'error',
        current: 0,
        total: count,
        message,
      });
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [count, effectiveHints, fetchVariation, target]);

  const rollMatrix = useCallback(async () => {
    if (!effectiveHints.trim()) {
      setError('Enter hints or a base prompt first.');
      return;
    }

    setLoading(true);
    setError(null);
    setStatus(null);
    setComfyStatus(null);

    let total = 0;
    try {
      const cells = buildMatrixAxes({
        axisRow: matrixAxisRow,
        axisCol: matrixAxisCol,
        rowCount: matrixRowCount,
        colCount: matrixColCount,
        baseVariation: toolSettings.variationStrength ?? 65,
        recentLocations: getRecentLocations(),
      });
      total = cells.length;

      setRollProgress({
        phase: 'generating',
        current: 0,
        total,
        message: `Generating matrix cell 1 of ${total}…`,
      });
      setResults([]);

      const next: VariationResult[] = [];

      for (let index = 0; index < cells.length; index += 1) {
        const cell = cells[index]!;
        const cellLabel =
          cell.rowLabel && cell.colLabel
            ? `${cell.rowLabel} × ${cell.colLabel}`
            : `Cell ${index + 1}`;
        setRollProgress({
          phase: 'generating',
          current: index,
          total,
          message: `Generating ${cellLabel} (${index + 1}/${total})…`,
        });
        next.push(
          await fetchVariation(
            {
              variationStrength: cell.variationStrength,
              sportPresetId: cell.sportPresetId,
              lockedLocation: cell.lockedLocation,
            },
            { rowLabel: cell.rowLabel, colLabel: cell.colLabel }
          )
        );
        setResults([...next]);
        setRollProgress({
          phase: 'generating',
          current: index + 1,
          total,
          message:
            index + 1 < total
              ? `Generated ${index + 1}/${total}. Starting ${cells[index + 1]?.rowLabel ?? 'next cell'}…`
              : `Generated ${index + 1}/${total}.`,
        });
      }

      const ok = next.filter(entry => entry.prompt).length;
      setRollProgress({
        phase: 'done',
        current: ok,
        total,
        message: `Rolled ${ok}/${total} matrix prompts via ${target}.`,
      });
      setStatus(`Rolled ${ok}/${total} matrix prompts via ${target}.`);
    } catch (err) {
      setResults([]);
      const message = err instanceof Error ? err.message : 'Variation matrix failed.';
      setRollProgress({
        phase: 'error',
        current: 0,
        total: total || matrixRowCount * matrixColCount,
        message,
      });
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [
    effectiveHints,
    fetchVariation,
    getRecentLocations,
    matrixAxisCol,
    matrixAxisRow,
    matrixColCount,
    matrixRowCount,
    target,
    toolSettings.variationStrength,
  ]);

  const executeQueue = useCallback(
    async (prompts: string[]) => {
      if (prompts.length === 0) {
        return;
      }

      setQueueLoading(true);
      setComfyStatus('Queueing variation grid…');
      setQueueProgress({
        phase: 'preflight',
        current: 0,
        total: prompts.length,
        message: 'Validating workflow…',
      });

      try {
        const negativePrompt = await resolveQueueNegativePrompt({
          model: shared.model,
          hints: toolSettings.hints?.trim(),
          tool: 'variations',
        });
        const preflight = await runWorkflowPreflight({
          model: shared.model,
          prompts,
          negativePrompt,
          tool: 'variations',
        });
        if (!preflight.ok) {
          throw new Error(
            preflight.issues
              .filter(issue => issue.severity === 'error')
              .map(issue => issue.message)
              .join(' · ') || 'Workflow pre-flight failed.'
          );
        }

        const { guardQueueQualityForVram } = await import('@/lib/vram-queue-guard');
        const { maybeHoldMaxGenerateJobs } = await import('@/lib/held-max-queue');
        const { toastHeldMax } = await import('@/lib/app-toast');
        const baseRuntime = resolveRuntimeForQueue(shared.model, 'variations');
        const vramGuard = await guardQueueQualityForVram({ runtime: baseRuntime });
        const runtime = vramGuard.runtime ?? baseRuntime;
        setQueueProgress({
          phase: 'queueing',
          current: 0,
          total: prompts.length,
        });
        const paramsPerPrompt = prompts.map((_, index) =>
          resolveQueueParams({
            model: shared.model,
            tool: 'variations',
            base: { seed: String(Math.floor(Math.random() * 2 ** 32) + index) },
            qualityProfile: vramGuard.profile,
          })
        );
        const held = await maybeHoldMaxGenerateJobs({
          profile: vramGuard.profile,
          jobs: prompts.map((prompt, index) => ({
            prompt,
            negativePrompt,
            model: shared.model,
            tool: 'variations',
            params: paramsPerPrompt[index],
            comfy: runtime,
          })),
        });
        if (held.held) {
          setQueueProgress(null);
          toastHeldMax({
            text: 'Max variations held until ComfyUI queue is idle',
            count: held.count,
          });
          return;
        }
        const queued = await postComfyUiPrompt({
          prompts,
          negativePrompt,
          paramsPerPrompt,
          ...(runtime ? { comfy: runtime } : {}),
        });

        const data = queued.raw as {
          queued?: number;
          error?: string;
          comfyUrl?: string;
          results?: Array<{ promptId?: string; comfyUrl?: string }>;
        };

        if (queued.status >= 400) {
          queued.releaseLiveSocket();
          throw new Error(queued.error ?? data.error ?? 'ComfyUI batch queue failed.');
        }

        for (const [index, result] of (data.results ?? []).entries()) {
          if (!result.promptId) {
            continue;
          }
          const comfyUrl =
            result.comfyUrl ?? data.comfyUrl ?? queued.comfyUrl ?? 'http://127.0.0.1:8188';
          registerComfyGalleryJob({
            promptId: result.promptId,
            prompt: prompts[index] ?? '',
            negativePrompt,
            tool: 'variations',
            model: shared.model,
            comfyUrl,
            clientId: queued.clientId,
            queueParams: paramsPerPrompt[index],
            queueQualityProfile: runtime.queueQualityProfile,
          });
          void scheduleComfyGalleryPoll(result.promptId, {
            comfyUrl,
            clientId: queued.clientId,
          });
        }
        queued.releaseLiveSocket();

        const queuedCount = data.queued ?? (data.results ?? []).filter(r => r.promptId).length;
        const failures = (data.results ?? [])
          .map((result, index) =>
            result.promptId
              ? null
              : {
                  label: results[index]?.rowLabel ?? `Row ${index + 1}`,
                  message: 'No promptId returned',
                }
          )
          .filter(Boolean) as Array<{ label: string; message: string }>;

        setQueueProgress({
          phase: 'done',
          current: queuedCount,
          total: prompts.length,
          message: `Queued ${queuedCount}/${prompts.length}`,
          failures: failures.length > 0 ? failures : undefined,
        });

        setComfyStatus(
          `Queued ${queuedCount}/${prompts.length} · ${data.comfyUrl ?? queued.comfyUrl ?? ''}`.trim()
        );
        setLintSummary(null);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'ComfyUI queue failed.';
        setQueueProgress({
          phase: 'error',
          current: 0,
          total: prompts.length,
          message,
        });
        setComfyStatus(message);
      } finally {
        setQueueLoading(false);
      }
    },
    [shared.model, toolSettings.hints, results]
  );

  const queueGrid = useCallback(async () => {
    const prompts = results.map(entry => entry.prompt.trim()).filter(Boolean);
    if (prompts.length === 0) {
      return;
    }

    setLintLoading(true);
    try {
      const summary = await runBatchLintGate(
        results.map(entry => ({ prompt: entry.prompt, topic: entry.rowLabel })),
        toolSettings.hints
      );
      setLintSummary(summary);
    } finally {
      setLintLoading(false);
    }
  }, [results, toolSettings.hints]);

  return {
    mounted,
    isSimple,
    shared,
    toolSettings,
    updateShared,
    updateToolSettings,
    results,
    setResults,
    loading,
    queueLoading,
    error,
    status,
    comfyStatus,
    importStatus,
    setImportStatus,
    lintSummary,
    setLintSummary,
    lintLoading,
    readyOnly,
    setReadyOnly,
    queueProgress,
    rollProgress,
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
    rollGrid,
    rollMatrix,
    executeQueue,
    queueGrid,
  };
}
