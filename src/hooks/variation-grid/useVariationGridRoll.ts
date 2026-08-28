'use client';

import { useCallback } from 'react';
import { buildMatrixAxes } from '@/lib/variation-matrix';
import {
  buildVariationRequestBody,
  variationEndpoint,
  type CellOverrides,
  type VariationResult,
} from '@/lib/variation-request-body';
import type { VariationGridInit } from '@/hooks/variation-grid/useVariationGridInit';

export function useVariationGridRoll(init: VariationGridInit) {
  const {
    shared,
    toolSettings,
    getRecentClothing,
    getRecentLocations,
    getBlocklist,
    effectiveHints,
    target,
    count,
    matrixAxisRow,
    matrixAxisCol,
    matrixRowCount,
    matrixColCount,
    setLoading,
    setError,
    setStatus,
    setComfyStatus,
    setRollProgress,
    setResults,
  } = init;

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
  }, [
    count,
    effectiveHints,
    fetchVariation,
    setComfyStatus,
    setError,
    setLoading,
    setResults,
    setRollProgress,
    setStatus,
    target,
  ]);

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
    setComfyStatus,
    setError,
    setLoading,
    setResults,
    setRollProgress,
    setStatus,
    target,
    toolSettings.variationStrength,
  ]);

  return { rollGrid, rollMatrix };
}
