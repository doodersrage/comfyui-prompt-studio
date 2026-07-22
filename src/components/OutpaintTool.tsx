"use client";

import { useCallback, useState } from "react";
import { Button } from "@/components/ui/Button";
import { FieldLabel, TextInput, MonoTextArea } from "@/components/ui/Field";
import {
  ToolBadge,
  ToolLayout,
  ToolSection,
} from "@/components/ui/ToolPageShell";
import { useCachedSettings } from "@/hooks/useCachedSettings";
import { usePromptResultActions } from "@/hooks/usePromptResultActions";
import {
  buildOutpaintInstruction,
  normalizeOutpaintInsets,
  outpaintInsetsHavePad,
  renderOutpaintPadAndMask,
} from "@/lib/outpaint-canvas";
import { isInpaintModel } from "@/lib/model-denoise-defaults";
import { DEFAULT_INPAINT_TOOL_CACHE } from "@/lib/settings-cache";

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
  const { shared, updateShared } = useCachedSettings(
    "inpaint",
    DEFAULT_INPAINT_TOOL_CACHE,
  );
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [pad, setPad] = useState({ top: 128, right: 128, bottom: 128, left: 128 });
  const [intent, setIntent] = useState(
    "continue the scene naturally with matching lighting",
  );
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const actions = usePromptResultActions({
    tool: "inpaint",
    model: shared.model,
  });

  const onFile = useCallback(async (file: File | null) => {
    if (!file) {
      return;
    }
    setSourceUrl(URL.createObjectURL(file));
    setStatus(`Loaded ${file.name}`);
  }, []);

  const runOutpaint = useCallback(async () => {
    if (!sourceUrl) {
      setStatus("Choose a source image first.");
      return;
    }
    const insets = normalizeOutpaintInsets(pad);
    if (!outpaintInsetsHavePad(insets)) {
      setStatus("Set at least one pad side above zero.");
      return;
    }
    if (!isInpaintModel(shared.model)) {
      updateShared({ model: "flux-inpaint" });
    }
    setBusy(true);
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
      setStatus("Queueing outpaint…");
      await actions.sendComfyUi(instruction, undefined, undefined, {
        inputImage: imageFile,
        maskImage: maskFile,
        queueParamsBase: {
          width: String(rendered.width),
          height: String(rendered.height),
          denoise: "0.85",
        },
      });
      setStatus(actions.comfyUiStatus ?? "Outpaint queued.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Outpaint failed.");
    } finally {
      setBusy(false);
    }
  }, [actions, intent, pad, shared.model, sourceUrl, updateShared]);

  return (
    <ToolLayout
      badge={<ToolBadge>Outpaint</ToolBadge>}
      title="Outpaint / expand"
      description="Pad the canvas and inpaint the new border so the scene continues outward."
    >
      <ToolSection title="Source">
        <FieldLabel>Image</FieldLabel>
        <input
          type="file"
          accept="image/*"
          onChange={(event) => void onFile(event.target.files?.[0] ?? null)}
          className="block w-full text-sm text-zinc-300 transition hover:text-zinc-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-500"
        />
        {sourceUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={sourceUrl}
            alt="Outpaint source"
            className="mt-3 max-h-64 rounded-xl border border-zinc-800 object-contain"
          />
        ) : null}
      </ToolSection>

      <ToolSection title="Expand">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {(["top", "right", "bottom", "left"] as const).map((side) => (
            <label key={side} className="space-y-1 text-xs text-zinc-400">
              {side} (px)
              <TextInput
                type="number"
                min={0}
                max={1024}
                value={String(pad[side])}
                onChange={(event) =>
                  setPad((previous) => ({
                    ...previous,
                    [side]: Number(event.target.value) || 0,
                  }))
                }
              />
            </label>
          ))}
        </div>
        <label className="mt-3 block space-y-1 text-xs text-zinc-400">
          Intent for the new border
          <MonoTextArea
            rows={3}
            value={intent}
            onChange={(event) => setIntent(event.target.value)}
          />
        </label>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button
            type="button"
            disabled={busy || !sourceUrl}
            onClick={() => void runOutpaint()}
          >
            {busy ? "Working…" : "Queue outpaint"}
          </Button>
          {status ? <p className="text-xs text-zinc-500">{status}</p> : null}
        </div>
      </ToolSection>
    </ToolLayout>
  );
}
