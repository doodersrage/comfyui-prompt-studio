"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import BatchLintGatePanel from "@/components/BatchLintGatePanel";
import SharedToolControls from "@/components/SharedToolControls";
import SportPresetChips from "@/components/SportPresetChips";
import { useCachedSettings } from "@/hooks/useCachedSettings";
import { useLocationBlocklist } from "@/hooks/useLocationBlocklist";
import { useRecentClothing } from "@/hooks/useRecentClothing";
import { useRecentLocations } from "@/hooks/useRecentLocations";
import {
  registerComfyGalleryJob,
} from "@/lib/comfyui-gallery-client";
import { scheduleComfyGalleryPoll } from "@/lib/comfyui-gallery-poller";
import {
  batchFixPrompts,
  filterBatchByLintIndexes,
  runBatchLintGate,
  type BatchLintSummary,
} from "@/lib/batch-lint-gate";
import { avoidedTokensRequestBody } from "@/lib/avoided-tokens";
import { resolveQueueNegativePrompt } from "@/lib/queue-negative";
import { runWorkflowPreflight } from "@/lib/workflow-preflight";
import { resolveComfyUiRuntime } from "@/lib/comfyui-runtime";
import { DEFAULT_VARIATIONS_TOOL_CACHE } from "@/lib/settings-cache";
import type { ComfyImageModel } from "@/lib/comfy-models";
import { loadGalleryVariationsHandoff } from "@/lib/gallery-variations-handoff";
import { loadPresetVariationsHandoff } from "@/lib/preset-variations-handoff";
import {
  HistoryHintSeedPanel,
  resolveSceneHintsForGeneration,
} from "@/components/scene-tool/HistoryHintSeedPanel";
import {
  normalizeHistorySeedScope,
  normalizeSceneHintSource,
  type HistorySeedTool,
} from "@/lib/scene-hint-source";
import { countHistorySeedCandidates } from "@/lib/history-hint-seed";
import type { SharedToolSettings, VariationsToolCache } from "@/lib/settings-cache";
import {
  buildMatrixAxes,
  type MatrixAxisKind,
} from "@/lib/variation-matrix";
import { downloadMatrixCsv } from "@/lib/matrix-export-formats";
import SidecarImportButton from "@/components/SidecarImportButton";
import {
  SHOT_SCALE_LABEL,
  rollVariationLabel,
} from "@/lib/tool-ui-labels";
import type { PromptSidecar } from "@/lib/prompt-sidecar";
import {
  ToolBadge,
  ToolLayout,
  ToolSection,
  accentButtonClass,
  accentFocusClass,
  accentRingClass,
} from "@/components/ui/ToolPageShell";
import { FieldError, FieldLabel, TextArea } from "@/components/ui/Field";
import { Button, PrimaryButton } from "@/components/ui/Button";

const ACCENT = "violet" as const;

function variationsHistoryTool(target: VariationTarget): HistorySeedTool {
  switch (target) {
    case "character":
      return "character";
    case "duo":
      return "duo";
    case "pet":
      return "pet";
    case "fantasy":
      return "fantasy";
    case "background":
      return "background";
    default:
      return "generate";
  }
}

type VariationTarget = NonNullable<VariationsToolCache["target"]>;

type CellOverrides = {
  variationStrength?: number;
  sportPresetId?: string;
  lockedLocation?: string;
};

type VariationResult = {
  prompt: string;
  seed?: string;
  error?: string;
  rowLabel?: string;
  colLabel?: string;
};

function variationEndpoint(target: VariationTarget): string {
  switch (target) {
    case "character":
      return "/api/character";
    case "duo":
      return "/api/duo";
    case "pet":
      return "/api/pet";
    case "fantasy":
      return "/api/fantasy";
    case "background":
      return "/api/background";
    default:
      return "/api/generate";
  }
}

function buildVariationRequestBody(
  target: VariationTarget,
  hints: string,
  shared: Pick<
    SharedToolSettings,
    "model" | "detail" | "alwaysIncludeClothing" | "lockedWardrobeId" | "lockedLocation"
  >,
  toolSettings: VariationsToolCache,
  getRecentClothing: () => string[],
  getRecentLocations: () => string[],
  getBlocklist: () => string[],
  overrides: CellOverrides = {},
) {
  const avoidance = avoidedTokensRequestBody();
  const variationStrength =
    overrides.variationStrength ?? toolSettings.variationStrength ?? 65;
  const sportPresetId = overrides.sportPresetId ?? toolSettings.sportPresetId;
  const lockedLocation = overrides.lockedLocation ?? shared.lockedLocation;
  const portraitStyle = toolSettings.portraitStyle ?? "action";

  if (target === "generate") {
    return {
      input: hints,
      mode: "positive" as const,
      model: shared.model,
      detail: shared.detail,
      variation: {
        enabled: true,
        strength: variationStrength,
      },
      alwaysIncludeClothing: shared.alwaysIncludeClothing !== false,
      recentClothing: getRecentClothing(),
      lockedWardrobeId: shared.lockedWardrobeId,
      lockedLocation,
      ...avoidance,
    };
  }

  if (target === "background") {
    const settingType = overrides.lockedLocation
      ? `${hints}, ${overrides.lockedLocation}`
      : hints;
    return {
      model: shared.model,
      detail: shared.detail,
      settingType,
      recentLocations: getRecentLocations(),
      blockedLocations: getBlocklist(),
      ...avoidance,
    };
  }

  if (target === "pet") {
    return {
      hints,
      model: shared.model,
      detail: shared.detail,
      portraitStyle,
      variationStrength,
      recentLocations: getRecentLocations(),
      blockedLocations: getBlocklist(),
      lockedLocation,
      ...avoidance,
    };
  }

  if (target === "fantasy") {
    return {
      hints,
      model: shared.model,
      detail: shared.detail,
      portraitStyle,
      wildness: 65,
      variationStrength,
      recentLocations: getRecentLocations(),
      recentClothing: getRecentClothing(),
      blockedLocations: getBlocklist(),
      lockedLocation,
      lockedWardrobeId: shared.lockedWardrobeId,
      alwaysIncludeClothing: shared.alwaysIncludeClothing !== false,
      ...avoidance,
    };
  }

  if (target === "character") {
    return {
      hints,
      model: shared.model,
      detail: shared.detail,
      portraitStyle,
      variationStrength,
      alwaysIncludeClothing: shared.alwaysIncludeClothing !== false,
      recentClothing: getRecentClothing(),
      lockedWardrobeId: shared.lockedWardrobeId,
      lockedLocation,
      blockedLocations: getBlocklist(),
      ...avoidance,
    };
  }

  return {
    hints,
    model: shared.model,
    detail: shared.detail,
    portraitStyle,
    variationStrength,
    sportPresetId,
    teamKit: false,
    alwaysIncludeClothing: shared.alwaysIncludeClothing !== false,
    recentClothing: getRecentClothing(),
    lockedWardrobeId: shared.lockedWardrobeId,
    lockedLocation,
    blockedLocations: getBlocklist(),
    ...avoidance,
  };
}

export default function VariationGridTool() {
  const { mounted, shared, toolSettings, updateShared, updateToolSettings } =
    useCachedSettings("variations", DEFAULT_VARIATIONS_TOOL_CACHE);
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
  const importedAppliedRef = useRef(false);

  useEffect(() => {
    if (!mounted) {
      return;
    }
    const params = new URLSearchParams(window.location.search);
    if (params.get("matrix") === "1") {
      updateToolSettings({ gridMode: "matrix" });
    }
  }, [mounted, updateToolSettings]);

  useEffect(() => {
    if (!mounted || importedAppliedRef.current) {
      return;
    }
    const params = new URLSearchParams(window.location.search);
    if (params.get("from") === "gallery") {
      const handoff = loadGalleryVariationsHandoff();
      if (handoff?.prompt) {
        importedAppliedRef.current = true;
        updateToolSettings({ hints: handoff.hints, gridMode: "imported" });
        setResults([{ prompt: handoff.prompt, rowLabel: "gallery" }]);
        setStatus("Loaded prompt from Gallery.");
        if (handoff.model) {
          updateShared({ model: handoff.model as ComfyImageModel });
        }
        return;
      }
    }
    if (params.get("from") === "preset") {
      const handoff = loadPresetVariationsHandoff();
      if (handoff?.hints) {
        importedAppliedRef.current = true;
        updateToolSettings({
          hints: handoff.hints,
          count: handoff.count,
          target: handoff.target,
          portraitStyle: handoff.portraitStyle,
          sportPresetId: handoff.sportPresetId,
          gridMode: "roll",
          hintSource: "manual",
        });
        setStatus(`Loaded preset hints for ${handoff.count} variations.`);
        return;
      }
    }
    if (params.get("from") !== "topics") {
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
      })),
    );
    setStatus(`Loaded ${prompts.length} prompts from Topics batch.`);
    updateToolSettings({ gridMode: "imported" });
  }, [mounted, toolSettings.importedBatchPrompts, toolSettings.importedBatchTopics, updateToolSettings]);

  const target = toolSettings.target ?? "generate";
  const hintSource = normalizeSceneHintSource(toolSettings.hintSource);
  const historySeedScope = normalizeHistorySeedScope(toolSettings.historySeedScope);
  const historyTool = variationsHistoryTool(target);
  const historyCandidateCount = countHistorySeedCandidates(historyTool, historySeedScope);
  const effectiveHints = resolveSceneHintsForGeneration({
    hintSource,
    hints: toolSettings.hints,
    randomTheme: toolSettings.randomTheme,
  });
  const gridMode = toolSettings.gridMode ?? "roll";
  const count = Math.min(12, Math.max(2, toolSettings.count ?? 4));
  const matrixRowCount = Math.min(6, Math.max(2, toolSettings.matrixRowCount ?? 3));
  const matrixColCount = Math.min(6, Math.max(2, toolSettings.matrixColCount ?? 3));
  const matrixAxisRow = toolSettings.matrixAxisRow ?? "variation";
  const matrixAxisCol = toolSettings.matrixAxisCol ?? "sportPreset";

  const fetchVariation = useCallback(
    async (
      overrides: CellOverrides = {},
      labels?: { rowLabel?: string; colLabel?: string },
    ): Promise<VariationResult> => {
      const hints = effectiveHints.trim();
      if (!hints) {
        throw new Error("Enter hints or a base prompt first.");
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
        overrides,
      );

      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
          prompt: "",
          error: data.error ?? "Variation roll failed.",
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
    [effectiveHints, getBlocklist, getRecentClothing, getRecentLocations, shared, target, toolSettings],
  );

  const rollGrid = useCallback(async () => {
    if (!effectiveHints.trim()) {
      setError("Enter hints or a base prompt first.");
      return;
    }

    setLoading(true);
    setError(null);
    setStatus(null);
    setComfyStatus(null);

    try {
      const next: VariationResult[] = [];

      for (let index = 0; index < count; index += 1) {
        next.push(await fetchVariation());
      }

      setResults(next);
      const ok = next.filter((entry) => entry.prompt).length;
      setStatus(`Rolled ${ok}/${count} variation prompts via ${target}.`);
    } catch (err) {
      setResults([]);
      setError(err instanceof Error ? err.message : "Variation grid failed.");
    } finally {
      setLoading(false);
    }
  }, [count, effectiveHints, fetchVariation, target]);

  const rollMatrix = useCallback(async () => {
    if (!effectiveHints.trim()) {
      setError("Enter hints or a base prompt first.");
      return;
    }

    setLoading(true);
    setError(null);
    setStatus(null);
    setComfyStatus(null);

    try {
      const cells = buildMatrixAxes({
        axisRow: matrixAxisRow,
        axisCol: matrixAxisCol,
        rowCount: matrixRowCount,
        colCount: matrixColCount,
        baseVariation: toolSettings.variationStrength ?? 65,
        recentLocations: getRecentLocations(),
      });

      const next: VariationResult[] = [];

      for (const cell of cells) {
        next.push(
          await fetchVariation(
            {
              variationStrength: cell.variationStrength,
              sportPresetId: cell.sportPresetId,
              lockedLocation: cell.lockedLocation,
            },
            { rowLabel: cell.rowLabel, colLabel: cell.colLabel },
          ),
        );
      }

      setResults(next);
      const ok = next.filter((entry) => entry.prompt).length;
      setStatus(`Rolled ${ok}/${cells.length} matrix prompts via ${target}.`);
    } catch (err) {
      setResults([]);
      setError(err instanceof Error ? err.message : "Variation matrix failed.");
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
      setComfyStatus("Queueing variation grid…");

      try {
        const negativePrompt = await resolveQueueNegativePrompt({
          model: shared.model,
          hints: toolSettings.hints?.trim(),
          tool: "variations",
        });
        const preflight = await runWorkflowPreflight({
          model: shared.model,
          prompts,
          negativePrompt,
        });
        if (!preflight.ok) {
          throw new Error(
            preflight.issues
              .filter((issue) => issue.severity === "error")
              .map((issue) => issue.message)
              .join(" · ") || "Workflow pre-flight failed.",
          );
        }

        const runtime = resolveComfyUiRuntime();
        const response = await fetch("/api/comfyui", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompts,
            negativePrompt,
            paramsPerPrompt: prompts.map((_, index) => ({
              seed: String(Math.floor(Math.random() * 2 ** 32) + index),
            })),
            ...(runtime ? { comfy: runtime } : {}),
          }),
        });

        const data = (await response.json()) as {
          queued?: number;
          error?: string;
          comfyUrl?: string;
          results?: Array<{ promptId?: string; comfyUrl?: string }>;
        };

        if (!response.ok) {
          throw new Error(data.error ?? "ComfyUI batch queue failed.");
        }

        for (const [index, result] of (data.results ?? []).entries()) {
          if (!result.promptId) {
            continue;
          }
          registerComfyGalleryJob({
            promptId: result.promptId,
            prompt: prompts[index] ?? "",
            negativePrompt,
            tool: "variations",
            model: shared.model,
            comfyUrl: result.comfyUrl ?? data.comfyUrl ?? "http://127.0.0.1:8188",
          });
          void scheduleComfyGalleryPoll(result.promptId, {
            comfyUrl: result.comfyUrl ?? data.comfyUrl ?? "http://127.0.0.1:8188",
          });
        }

        setComfyStatus(
          `Queued ${data.queued ?? prompts.length}/${prompts.length} · ${data.comfyUrl ?? ""}`.trim(),
        );
        setLintSummary(null);
      } catch (err) {
        setComfyStatus(err instanceof Error ? err.message : "ComfyUI queue failed.");
      } finally {
        setQueueLoading(false);
      }
    },
    [shared.model, toolSettings.hints],
  );

  const queueGrid = useCallback(async () => {
    const prompts = results.map((entry) => entry.prompt.trim()).filter(Boolean);
    if (prompts.length === 0) {
      return;
    }

    setLintLoading(true);
    try {
      const summary = await runBatchLintGate(
        results.map((entry) => ({ prompt: entry.prompt, topic: entry.rowLabel })),
        toolSettings.hints,
      );
      setLintSummary(summary);
    } finally {
      setLintLoading(false);
    }
  }, [results, toolSettings.hints]);

  if (!mounted) {
    return null;
  }

  return (
    <ToolLayout
      accent={ACCENT}
      width="wide"
      badge={<ToolBadge accent={ACCENT}>Variation grid</ToolBadge>}
      title="Variation Grid"
      description={
        <>
          Roll several prompt variations from the same hints, then batch-queue them to
          ComfyUI with unique seeds per job. Track outputs in the{" "}
          <Link href="/gallery" className="text-violet-300 hover:text-violet-200">
            gallery
          </Link>
          .
        </>
      }
      sidebar={
        <SharedToolControls
          shared={shared}
          onModelChange={(model) => updateShared({ model })}
          onDetailChange={(detail) => updateShared({ detail })}
          onWorkflowPresetChange={(id) => updateShared({ selectedWorkflowFileId: id })}
          lockedWardrobeId={shared.lockedWardrobeId}
          lockedLocation={shared.lockedLocation}
          lockedVariationSeed={shared.lockedVariationSeed}
          onClearLockedWardrobe={() => updateShared({ lockedWardrobeId: undefined })}
          onClearLockedLocation={() => updateShared({ lockedLocation: undefined })}
          onClearLockedVariationSeed={() =>
            updateShared({ lockedVariationSeed: undefined })
          }
        />
      }
    >
      <ToolSection>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-1">
            <FieldLabel>Generator</FieldLabel>
            <select
              value={target}
              onChange={(event) =>
                updateToolSettings({
                  target: event.target.value as VariationTarget,
                })
              }
              className="ui-input w-full px-3 py-2 text-sm"
            >
              <option value="generate">Generate (keywords)</option>
              <option value="character">Character</option>
              <option value="duo">Duo</option>
              <option value="pet">Pet</option>
              <option value="fantasy">Fantasy</option>
              <option value="background">Background</option>
            </select>
          </div>

          <div className="space-y-1">
            <FieldLabel>Grid mode</FieldLabel>
            <select
              value={gridMode}
              onChange={(event) =>
                updateToolSettings({
                  gridMode: event.target.value as "roll" | "matrix" | "imported",
                })
              }
              className="ui-input w-full px-3 py-2 text-sm"
            >
              <option value="roll">Roll variations</option>
              <option value="matrix">Variation matrix</option>
              <option value="imported">Imported batch (Topics)</option>
            </select>
          </div>

          {gridMode === "roll" ? (
            <div className="space-y-1">
              <FieldLabel>Count ({count})</FieldLabel>
              <input
                type="range"
                min={2}
                max={12}
                value={count}
                onChange={(event) =>
                  updateToolSettings({ count: Number(event.target.value) })
                }
                className={`w-full ${accentRingClass(ACCENT)}`}
              />
            </div>
          ) : (
            <>
              <div className="space-y-1">
                <FieldLabel>Row axis</FieldLabel>
                <select
                  value={matrixAxisRow}
                  onChange={(event) =>
                    updateToolSettings({
                      matrixAxisRow: event.target.value as MatrixAxisKind,
                    })
                  }
                  className="ui-input w-full px-3 py-2 text-sm"
                >
                  <option value="variation">Variation strength</option>
                  <option value="sportPreset">Sport preset</option>
                  <option value="location">Location</option>
                </select>
              </div>

              <div className="space-y-1">
                <FieldLabel>Column axis</FieldLabel>
                <select
                  value={matrixAxisCol}
                  onChange={(event) =>
                    updateToolSettings({
                      matrixAxisCol: event.target.value as MatrixAxisKind,
                    })
                  }
                  className="ui-input w-full px-3 py-2 text-sm"
                >
                  <option value="variation">Variation strength</option>
                  <option value="sportPreset">Sport preset</option>
                  <option value="location">Location</option>
                </select>
              </div>

              <div className="space-y-1">
                <FieldLabel>Rows ({matrixRowCount})</FieldLabel>
                <input
                  type="range"
                  min={2}
                  max={6}
                  value={matrixRowCount}
                  onChange={(event) =>
                    updateToolSettings({ matrixRowCount: Number(event.target.value) })
                  }
                  className={`w-full ${accentRingClass(ACCENT)}`}
                />
              </div>

              <div className="space-y-1">
                <FieldLabel>Columns ({matrixColCount})</FieldLabel>
                <input
                  type="range"
                  min={2}
                  max={6}
                  value={matrixColCount}
                  onChange={(event) =>
                    updateToolSettings({ matrixColCount: Number(event.target.value) })
                  }
                  className={`w-full ${accentRingClass(ACCENT)}`}
                />
              </div>
            </>
          )}
        </div>

        {(target === "character" ||
          target === "duo" ||
          target === "pet" ||
          target === "fantasy") && (
          <div className="space-y-1">
            <FieldLabel>{SHOT_SCALE_LABEL}</FieldLabel>
            <select
              value={toolSettings.portraitStyle ?? "action"}
              onChange={(event) =>
                updateToolSettings({
                  portraitStyle: event.target.value as
                    | "portrait"
                    | "full-body"
                    | "action",
                })
              }
              className="ui-input w-full px-3 py-2 text-sm"
            >
              <option value="portrait">Portrait</option>
              <option value="full-body">Full body</option>
              <option value="action">Action</option>
            </select>
          </div>
        )}

        {target === "duo" && (
          <SportPresetChips
            selectedId={toolSettings.sportPresetId ?? ""}
            mode="duo"
            onSelect={(preset) => updateToolSettings({ sportPresetId: preset.id })}
          />
        )}

        <div className="space-y-1">
          <FieldLabel>
            Variation strength ({rollVariationLabel(toolSettings.variationStrength ?? 65)})
          </FieldLabel>
          <input
            type="range"
            min={0}
            max={100}
            value={toolSettings.variationStrength ?? 65}
            onChange={(event) =>
              updateToolSettings({ variationStrength: Number(event.target.value) })
            }
            className={`w-full ${accentRingClass(ACCENT)}`}
          />
        </div>

        <HistoryHintSeedPanel
          tool={historyTool}
          hintSource={hintSource}
          historySeedScope={historySeedScope}
          hints={toolSettings.hints ?? ""}
          randomTheme={toolSettings.randomTheme ?? ""}
          lastHistorySeedEntryId={toolSettings.lastHistorySeedEntryId}
          onHintSourceChange={(source) => updateToolSettings({ hintSource: source })}
          onHistorySeedScopeChange={(scope) =>
            updateToolSettings({ historySeedScope: scope })
          }
          onHintsChange={(value) => updateToolSettings({ hints: value })}
          onRandomThemeChange={(value) => updateToolSettings({ randomTheme: value })}
          onHistorySeedApplied={(result) => {
            updateToolSettings({
              hints: result.hints,
              lastHistorySeedEntryId: result.entryId,
            });
          }}
          accentFocusClassName={accentFocusClass(ACCENT)}
        />

        <FieldLabel>Hints / base input</FieldLabel>
        <TextArea
          value={toolSettings.hints ?? ""}
          onChange={(event) => updateToolSettings({ hints: event.target.value })}
          rows={4}
          placeholder="neon alley, rain, black cat"
          className={accentFocusClass(ACCENT)}
          disabled={hintSource !== "manual"}
        />

        <div className="flex flex-wrap gap-2">
          <PrimaryButton
            accentClassName={accentButtonClass(ACCENT)}
            loading={loading}
            loadingLabel={gridMode === "matrix" ? "Rolling matrix" : "Rolling variations"}
            disabled={
              gridMode === "imported" ||
              (hintSource === "history" && historyCandidateCount === 0) ||
              (hintSource === "manual" && !toolSettings.hints?.trim())
            }
            onClick={() => void (gridMode === "matrix" ? rollMatrix() : rollGrid())}
            data-action="primary-generate"
          >
            {gridMode === "matrix"
              ? `Roll matrix (${matrixRowCount}×${matrixColCount})`
              : `Roll ${count} variations`}
          </PrimaryButton>
          <Button
            variant="accent-outline"
            loading={queueLoading || lintLoading}
            loadingLabel={lintLoading ? "Linting batch" : "Queueing variations"}
            disabled={results.every((entry) => !entry.prompt)}
            onClick={() => void queueGrid()}
          >
            Queue grid to ComfyUI
          </Button>
          <SidecarImportButton
            label="Import sidecar hints"
            className="cursor-pointer rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-200 hover:border-zinc-500"
            onImport={(sidecar: PromptSidecar) => {
              updateToolSettings({
                hints: sidecar.hints?.trim() || sidecar.positive.slice(0, 400),
              });
              if (sidecar.variationSeed) {
                updateShared({ lockedVariationSeed: sidecar.variationSeed });
              }
              setImportStatus(
                `Loaded sidecar · ${sidecar.tool ?? "unknown"} · ${sidecar.model}`,
              );
            }}
            onError={setImportStatus}
          />
        </div>

        {importStatus && <p className="text-sm text-zinc-500">{importStatus}</p>}
        {status && <p className="text-sm text-zinc-500">{status}</p>}
        <BatchLintGatePanel
          summary={lintSummary}
          loading={lintLoading}
          onFixAll={() => {
            const prompts = results.map((entry) => entry.prompt);
            void batchFixPrompts(prompts, toolSettings.hints).then((fixed) => {
              setResults((previous) =>
                previous.map((entry, index) => ({
                  ...entry,
                  prompt: fixed[index] ?? entry.prompt,
                })),
              );
              setLintSummary(null);
            });
          }}
          onContinue={() => {
            const prompts = results.map((entry) => entry.prompt.trim()).filter(Boolean);
            const filtered =
              lintSummary && lintSummary.blockedIndexes.length > 0
                ? filterBatchByLintIndexes(prompts, lintSummary.blockedIndexes)
                : prompts;
            void executeQueue(filtered);
          }}
          onCancel={() => setLintSummary(null)}
        />
        {comfyStatus && <p className="text-sm text-violet-300/90">{comfyStatus}</p>}
        <FieldError>{error}</FieldError>
      </ToolSection>

      {results.length > 0 && (
        <ToolSection title="Rolled prompts">
          {gridMode === "matrix" ? (
            <div className="mb-3">
              <Button
                variant="secondary"
                onClick={() =>
                  downloadMatrixCsv(
                    results.map((entry) => ({
                      rowLabel: entry.rowLabel,
                      colLabel: entry.colLabel,
                      prompt: entry.prompt,
                      seed: entry.seed,
                      error: entry.error,
                    })),
                  )
                }
              >
                Export matrix CSV
              </Button>
            </div>
          ) : null}
          <ol className="space-y-3">
            {results.map((entry, index) => (
              <li
                key={`${index}-${entry.prompt.slice(0, 24)}`}
                className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-4"
              >
                <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                  {entry.rowLabel && entry.colLabel
                    ? `${entry.rowLabel} × ${entry.colLabel}`
                    : `Variation ${index + 1}`}
                  {entry.seed ? ` · seed ${entry.seed.slice(0, 48)}` : ""}
                </p>
                {entry.error ? (
                  <p className="mt-2 text-sm text-rose-300">{entry.error}</p>
                ) : (
                  <p className="mt-2 text-sm leading-relaxed text-zinc-300">
                    {entry.prompt}
                  </p>
                )}
              </li>
            ))}
          </ol>
        </ToolSection>
      )}
    </ToolLayout>
  );
}
