"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import SharedToolControls from "@/components/SharedToolControls";
import { Button, PrimaryButton } from "@/components/ui/Button";
import { FieldError, FieldLabel, TextInput, TextArea } from "@/components/ui/Field";
import {
  ToolBadge,
  ToolLayout,
  ToolSection,
  accentButtonClass,
  accentFocusClass,
} from "@/components/ui/ToolPageShell";
import { useCachedSettings } from "@/hooks/useCachedSettings";
import { useGalleryHandoff } from "@/hooks/useGalleryHandoff";
import { usePromptResultActions } from "@/hooks/usePromptResultActions";
import type { ComfyImageModel } from "@/lib/comfy-models/client";
import { getComfyModelDefinition } from "@/lib/comfy-models/client";
import {
  DEFAULT_OUTPAINT_DENOISE,
  isInpaintModel,
} from "@/lib/model-denoise-defaults";
import {
  buildOutpaintInstruction,
  normalizeOutpaintInsets,
  outpaintInsetsHavePad,
  renderOutpaintPadAndMask,
} from "@/lib/outpaint-canvas";
import { sharedPatchFromGalleryHandoff } from "@/lib/gallery-handoff";
import { DEFAULT_OUTPAINT_TOOL_CACHE } from "@/lib/settings-cache";
import { rememberDraftFields } from "@/lib/remember-draft-fields";

const ACCENT = "amber" as const;
const DEFAULT_OUTPAINT_MODEL: ComfyImageModel = "flux-inpaint";

function dataUrlToFile(dataUrl: string, filename: string): File {
  const [header, base64] = dataUrl.split(",");
  const mime = /data:(.*?);/.exec(header ?? "")?.[1] ?? "image/png";
  const binary = atob(base64 ?? "");
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new File([bytes], filename, { type: mime });
}

export default function OutpaintTool() {
  const { mounted, shared, toolSettings, updateShared, updateToolSettings } =
    useCachedSettings("outpaint", DEFAULT_OUTPAINT_TOOL_CACHE);
  const modelInitializedRef = useRef(false);

  const intent =
    toolSettings.intent?.trim() ||
    DEFAULT_OUTPAINT_TOOL_CACHE.intent ||
    "continue the scene naturally with matching lighting";
  const pad = {
    top: toolSettings.padTop ?? DEFAULT_OUTPAINT_TOOL_CACHE.padTop,
    right: toolSettings.padRight ?? DEFAULT_OUTPAINT_TOOL_CACHE.padRight,
    bottom: toolSettings.padBottom ?? DEFAULT_OUTPAINT_TOOL_CACHE.padBottom,
    left: toolSettings.padLeft ?? DEFAULT_OUTPAINT_TOOL_CACHE.padLeft,
  };

  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const actions = usePromptResultActions({
    tool: "outpaint",
    model: shared.model,
    detail: shared.detail,
    hints: intent,
    autoFixRules: shared.autoFixRules !== false,
  });

  const selectedModel = getComfyModelDefinition(shared.model);

  useEffect(() => {
    if (!mounted || modelInitializedRef.current) {
      return;
    }
    modelInitializedRef.current = true;
    if (!isInpaintModel(shared.model)) {
      updateShared({ model: DEFAULT_OUTPAINT_MODEL });
    }
  }, [mounted, shared.model, updateShared]);

  const setIntent = useCallback(
    (value: string) => {
      updateToolSettings({ intent: value });
      rememberDraftFields({
        toolKey: "outpaint",
        label: "Outpaint",
        href: "/outpaint",
        fields: [value],
      });
    },
    [updateToolSettings],
  );

  const setPadSide = useCallback(
    (side: "top" | "right" | "bottom" | "left", value: number) => {
      const key =
        side === "top"
          ? "padTop"
          : side === "right"
            ? "padRight"
            : side === "bottom"
              ? "padBottom"
              : "padLeft";
      updateToolSettings({ [key]: Math.max(0, Math.min(1024, Math.round(value) || 0)) });
    },
    [updateToolSettings],
  );

  const revokeSourceUrl = useCallback((url: string | null) => {
    if (url?.startsWith("blob:")) {
      URL.revokeObjectURL(url);
    }
  }, []);

  const onFile = useCallback(
    (file: File | null) => {
      setSourceUrl((current) => {
        revokeSourceUrl(current);
        return file ? URL.createObjectURL(file) : null;
      });
      setError(null);
      setStatus(file ? `Loaded ${file.name}` : null);
    },
    [revokeSourceUrl],
  );

  const applyGalleryHandoff = useCallback(
    (handoff: {
      prompt: string;
      model?: string;
      file: File | null;
      previewUrl: string | null;
      payload: import("@/lib/gallery-handoff").GalleryHandoffPayload;
    }) => {
      if (handoff.prompt.trim()) {
        setIntent(handoff.prompt.trim());
      }
      if (handoff.file || handoff.previewUrl) {
        setSourceUrl((current) => {
          revokeSourceUrl(current);
          return handoff.previewUrl;
        });
      }
      const patch = sharedPatchFromGalleryHandoff(handoff.payload);
      const modelPatch =
        handoff.model && isInpaintModel(handoff.model)
          ? { model: handoff.model as ComfyImageModel }
          : {};
      if (Object.keys(patch).length > 0 || Object.keys(modelPatch).length > 0) {
        updateShared({ ...patch, ...modelPatch });
      }
      setStatus("Loaded gallery handoff.");
    },
    [revokeSourceUrl, setIntent, updateShared],
  );

  useGalleryHandoff("outpaint", applyGalleryHandoff);

  const runOutpaint = useCallback(async () => {
    if (!sourceUrl) {
      setError("Choose a source image first.");
      return;
    }
    const insets = normalizeOutpaintInsets(pad);
    if (!outpaintInsetsHavePad(insets)) {
      setError("Set at least one pad side above zero.");
      return;
    }
    if (!isInpaintModel(shared.model)) {
      updateShared({ model: DEFAULT_OUTPAINT_MODEL });
    }
    setBusy(true);
    setError(null);
    setStatus("Preparing padded canvas + mask…");
    try {
      const image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error("Could not decode source image."));
        img.src = sourceUrl;
      });
      const rendered = await renderOutpaintPadAndMask(image, insets);
      const imageFile = dataUrlToFile(rendered.imageDataUrl, "outpaint-source.png");
      const maskFile = dataUrlToFile(rendered.maskDataUrl, "outpaint-mask.png");
      const instruction = buildOutpaintInstruction(insets, intent);
      const denoise =
        typeof shared.editDenoiseStrength === "number" &&
        Number.isFinite(shared.editDenoiseStrength)
          ? shared.editDenoiseStrength
          : DEFAULT_OUTPAINT_DENOISE;
      setStatus("Queueing outpaint…");
      await actions.sendComfyUi(instruction, undefined, undefined, {
        inputImage: imageFile,
        maskImage: maskFile,
        queueParamsBase: {
          width: String(rendered.width),
          height: String(rendered.height),
          denoise: String(denoise),
        },
      });
      setStatus(actions.comfyUiStatus ?? "Outpaint queued.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Outpaint failed.");
      setStatus(null);
    } finally {
      setBusy(false);
    }
  }, [
    actions,
    intent,
    pad,
    shared.editDenoiseStrength,
    shared.model,
    sourceUrl,
    updateShared,
  ]);

  if (!mounted) {
    return null;
  }

  return (
    <ToolLayout
      accent={ACCENT}
      badge={
        <ToolBadge accent={ACCENT}>
          Outpaint · {selectedModel.comfyNode}
        </ToolBadge>
      }
      title="Outpaint / expand"
      description="Pad the canvas and inpaint the new border so the scene continues outward. Uses the same quality recipes, LoRA stack, and Final promote path as Inpaint."
      sidebar={
        <SharedToolControls
          toolId="outpaint"
          shared={shared}
          onModelChange={(model) => updateShared({ model })}
          onDetailChange={(detail) => updateShared({ detail })}
          onWorkflowPresetChange={(id) => updateShared({ selectedWorkflowFileId: id })}
          recommendFromText={intent}
        />
      }
    >
      <ToolSection title="Source">
        <FieldLabel>Image</FieldLabel>
        <input
          type="file"
          accept="image/*"
          onChange={(event) => onFile(event.target.files?.[0] ?? null)}
          className={`block w-full text-sm text-zinc-400 file:mr-4 file:rounded-lg file:border-0 file:bg-amber-600 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-amber-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/60 ${accentFocusClass(ACCENT)}`}
        />
        {sourceUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={sourceUrl}
            alt="Outpaint source"
            className="mt-3 max-h-64 rounded-xl border border-zinc-800/80 object-contain shadow-[0_12px_40px_-24px_rgba(0,0,0,0.8)]"
          />
        ) : (
          <p className="mt-3 rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 py-2.5 text-xs text-amber-100/85">
            Upload a source image, or send one here from the Gallery Outpaint action.
          </p>
        )}
      </ToolSection>

      <ToolSection title="Expand">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {(["top", "right", "bottom", "left"] as const).map((side) => (
            <label key={side} className="space-y-1.5 text-xs text-zinc-400">
              <span className="capitalize">{side} (px)</span>
              <TextInput
                type="number"
                min={0}
                max={1024}
                value={String(pad[side])}
                onChange={(event) =>
                  setPadSide(side, Number(event.target.value) || 0)
                }
                className={accentFocusClass(ACCENT)}
              />
            </label>
          ))}
        </div>
        <div className="mt-4 space-y-1.5">
          <FieldLabel hint="Describes what should appear in the new border.">
            Intent for the new border
          </FieldLabel>
          <TextArea
            rows={3}
            value={intent}
            onChange={(event) => setIntent(event.target.value)}
            placeholder="continue the scene naturally with matching lighting"
            className={accentFocusClass(ACCENT)}
          />
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <PrimaryButton
            accentClassName={accentButtonClass(ACCENT)}
            type="button"
            disabled={busy || !sourceUrl}
            onClick={() => void runOutpaint()}
          >
            {busy ? "Working…" : "Queue outpaint"}
          </PrimaryButton>
          <Button
            type="button"
            variant="secondary"
            disabled={!sourceUrl && !intent}
            onClick={() => {
              onFile(null);
              setStatus(null);
              setError(null);
            }}
          >
            Clear source
          </Button>
          {status ? <p className="text-xs text-zinc-500">{status}</p> : null}
        </div>
        <FieldError>{error}</FieldError>
      </ToolSection>
    </ToolLayout>
  );
}
