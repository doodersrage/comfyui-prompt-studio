import type { LoraCaptionMode } from "./gallery-lora-dataset-export";

export type LoraDatasetExportUiOptions = {
  triggerWord?: string;
  captionMode: LoraCaptionMode;
};

/**
 * @deprecated Prefer the LoraDatasetExportDialog component. Kept for non-React callers.
 */
export function promptLoraDatasetExportOptions(): LoraDatasetExportUiOptions | null {
  if (typeof window === "undefined") {
    return { captionMode: "prompt" };
  }
  const triggerWord =
    window.prompt("LoRA trigger word (optional, leave blank for none):", "") ??
    undefined;
  if (triggerWord === undefined) {
    return null;
  }
  const modeRaw = window.prompt(
    "Caption mode: prompt | tags | vision\n(prompt=cleaned prompt, tags=prompt+visionTags, vision=LLM caption)",
    "prompt",
  );
  if (modeRaw === null) {
    return null;
  }
  const normalized = modeRaw.trim().toLowerCase();
  const captionMode: LoraCaptionMode =
    normalized === "tags" || normalized === "vision" ? normalized : "prompt";
  return {
    triggerWord: triggerWord.trim() || undefined,
    captionMode,
  };
}
