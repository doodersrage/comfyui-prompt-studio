"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import EnhancedPromptResult from "@/components/LazyEnhancedPromptResult";
import SharedToolControls from "@/components/SharedToolControls";
import MobileStickyQueueBar from "@/components/MobileStickyQueueBar";
import ComfyPackImportControl from "@/components/ComfyPackImportControl";
import { useCachedSettings } from "@/hooks/useCachedSettings";
import { usePromptResultActions } from "@/hooks/usePromptResultActions";
import { promptResultPreviewProps } from "@/lib/prompt-result-preview-props";
import { DEFAULT_MESH_MODEL, getComfyModelDefinition } from "@/lib/comfy-models/client";
import { scheduleAfterCommit } from "@/lib/schedule-after-commit";
import {
  MESH_RESOLUTION_TOKEN,
  buildMeshPrompt,
} from "@/lib/audio-mesh-prompt";
import { ensureMeshWorkflowScaffold } from "@/lib/ensure-media-workflow";
import { DEFAULT_MESH_TOOL_CACHE } from "@/lib/settings-cache";
import { fetchComfyObjectInfoCached } from "@/lib/comfyui-object-info-cache";
import {
  ToolBadge,
  ToolLayout,
  ToolSection,
  accentButtonClass,
  accentFocusClass,
} from "@/components/ui/ToolPageShell";
import { FieldLabel, TextArea, TextInput } from "@/components/ui/Field";
import { PrimaryButton } from "@/components/ui/Button";

const ACCENT = "emerald" as const;

export default function MeshPromptTool() {
  const { mounted, shared, toolSettings, updateShared, updateToolSettings } =
    useCachedSettings("mesh", DEFAULT_MESH_TOOL_CACHE);
  const subject = toolSettings?.subject ?? "";
  const materials = toolSettings?.materials ?? "";
  const style = toolSettings?.style ?? "";
  const resolution = toolSettings?.resolution ?? 512;
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const actions = usePromptResultActions({
    tool: "mesh",
    model: shared.model,
    detail: shared.detail,
    hints: subject,
  });

  useEffect(() => {
    if (!mounted) {
      return;
    }
    if (getComfyModelDefinition(shared.model).category !== "mesh") {
      updateShared({ model: DEFAULT_MESH_MODEL });
    }
  }, [mounted, shared.model, updateShared]);

  const [workflowStatus, setWorkflowStatus] = useState<string | null>(null);

  useEffect(() => {
    if (!mounted) {
      return;
    }
    let cancelled = false;
    try {
      const model =
        getComfyModelDefinition(shared.model).category === "mesh"
          ? shared.model
          : DEFAULT_MESH_MODEL;
      void fetchComfyObjectInfoCached().catch(() => null);
      const result = ensureMeshWorkflowScaffold(model);
      if (!cancelled) {
        updateShared(result.sharedPatch);
        scheduleAfterCommit(() => {
          setWorkflowStatus(result.note);
        });
      }
    } catch (error) {
      if (!cancelled) {
        scheduleAfterCommit(() => {
          setWorkflowStatus(
            error instanceof Error
              ? error.message
              : "Could not create mesh workflow scaffold. Import a Hunyuan3D pack in Settings → workflows.",
          );
        });
      }
    }
    return () => {
      cancelled = true;
    };
  }, [mounted, shared.model, updateShared]);

  const output = useMemo(
    () => buildMeshPrompt({ subject, materials, style }),
    [materials, style, subject],
  );

  const [copied, setCopied] = useState(false);
  const copyOutput = useCallback(async () => {
    if (!output.trim()) {
      return;
    }
    await navigator.clipboard.writeText(output);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }, [output]);

  if (!mounted) {
    return null;
  }

  const controlsModel =
    getComfyModelDefinition(shared.model).category === "mesh"
      ? shared.model
      : DEFAULT_MESH_MODEL;
  const controlsShared =
    controlsModel === shared.model ? shared : { ...shared, model: controlsModel };
  const selectedModel = getComfyModelDefinition(controlsModel);

  return (
    <ToolLayout
      accent={ACCENT}
      badge={<ToolBadge accent={ACCENT}>3D · {selectedModel.comfyNode}</ToolBadge>}
      title="Mesh / 3D prompt"
      description="Describe shape and materials for Hunyuan3D-style scaffolds. Optional reference image binds {{INPUT_IMAGE}}; resolution fills {{MESH_RESOLUTION}}."
      sidebar={
        <SharedToolControls
          toolId="mesh"
          shared={controlsShared}
          onModelChange={(model) => updateShared({ model })}
          onDetailChange={(detail) => updateShared({ detail })}
          onWorkflowPresetChange={(id) => updateShared({ selectedWorkflowFileId: id })}
          recommendFromText={output}
        />
      }
    >
      <ToolSection>
        {workflowStatus ? (
          <p className="mb-3 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-100">
            {workflowStatus}
          </p>
        ) : null}
        <div className="mb-4 rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3">
          <ComfyPackImportControl
            preferKind="mesh"
            compact
            onImported={(summary, result) => {
              if (result.sharedPatch) {
                updateShared(result.sharedPatch);
              }
              setWorkflowStatus(summary);
            }}
          />
        </div>
        <FieldLabel>Reference image (optional)</FieldLabel>
        <input
          type="file"
          accept="image/*"
          onChange={(event) => {
            const next = event.target.files?.[0] ?? null;
            setFile(next);
            setPreviewUrl((current) => {
              if (current?.startsWith("blob:")) {
                URL.revokeObjectURL(current);
              }
              return next ? URL.createObjectURL(next) : null;
            });
          }}
          className="block w-full text-sm text-zinc-400"
        />
        {previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={previewUrl}
            alt="Mesh reference"
            className="mt-3 max-h-48 rounded-xl border border-zinc-800 object-contain"
          />
        ) : null}
        <FieldLabel>Subject / silhouette</FieldLabel>
        <TextArea
          rows={3}
          value={subject}
          onChange={(event) => updateToolSettings({ subject: event.target.value })}
          placeholder="A ceramic teapot with a short spout…"
          className={accentFocusClass(ACCENT)}
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <FieldLabel>Materials</FieldLabel>
            <TextInput
              value={materials}
              onChange={(event) =>
                updateToolSettings({ materials: event.target.value })
              }
              className={accentFocusClass(ACCENT)}
            />
          </div>
          <div className="space-y-1.5">
            <FieldLabel>Style</FieldLabel>
            <TextInput
              value={style}
              onChange={(event) => updateToolSettings({ style: event.target.value })}
              className={accentFocusClass(ACCENT)}
            />
          </div>
        </div>
        <label className="mt-3 block space-y-1 text-xs text-zinc-400">
          Mesh resolution hint
          <TextInput
            type="number"
            min={128}
            max={2048}
            value={String(resolution)}
            onChange={(event) =>
              updateToolSettings({
                resolution: Math.max(128, Number(event.target.value) || 512),
              })
            }
            className={accentFocusClass(ACCENT)}
          />
        </label>
        <PrimaryButton
          className="mt-4"
          accentClassName={accentButtonClass(ACCENT)}
          disabled={!output.trim()}
          onClick={() =>
            void actions.sendComfyUi(output, undefined, undefined, {
              inputImage: file,
              inputImageUrl: !file ? previewUrl ?? undefined : undefined,
              customTokens: [
                { token: MESH_RESOLUTION_TOKEN, value: String(resolution) },
              ],
            })
          }
        >
          Queue mesh
        </PrimaryButton>
      </ToolSection>

      <EnhancedPromptResult
        output={output}
        provider={output ? "template" : null}
        comfyNode={selectedModel.comfyNode}
        readinessModel={controlsModel}
        readinessDetail={shared.detail}
        copied={copied}
        onCopy={() => void copyOutput()}
        onSaveHistory={() => actions.saveHistory({ prompt: output, hints: subject })}
        onSendComfyUi={() =>
          void actions.sendComfyUi(output, undefined, undefined, {
            inputImage: file,
            inputImageUrl: !file ? previewUrl ?? undefined : undefined,
            customTokens: [
              { token: MESH_RESOLUTION_TOKEN, value: String(resolution) },
            ],
          })
        }
        {...promptResultPreviewProps(actions, output)}
        comfyUiStatus={actions.comfyUiStatus}
        comfyUiJob={actions.comfyUiJob}
        historySaved={actions.historySaved}
      />
      <MobileStickyQueueBar
        disabled={!output.trim()}
        label="Queue mesh"
        status={actions.comfyUiStatus}
        onQueue={() =>
          void actions.sendComfyUi(output, undefined, undefined, {
            inputImage: file,
            inputImageUrl: !file ? previewUrl ?? undefined : undefined,
            customTokens: [
              { token: MESH_RESOLUTION_TOKEN, value: String(resolution) },
            ],
          })
        }
      />
    </ToolLayout>
  );
}
