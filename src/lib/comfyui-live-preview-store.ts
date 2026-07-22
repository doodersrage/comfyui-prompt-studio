"use client";

export const COMFY_LIVE_PREVIEW_UPDATED_EVENT = "comfyui-live-preview-updated";

const previews = new Map<string, string>();

export function setComfyLivePreviewUrl(
  promptId: string,
  url: string | null,
): void {
  const previous = previews.get(promptId);
  if (previous && previous !== url) {
    URL.revokeObjectURL(previous);
  }
  if (!url) {
    previews.delete(promptId);
  } else {
    previews.set(promptId, url);
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent(COMFY_LIVE_PREVIEW_UPDATED_EVENT, {
        detail: { promptId },
      }),
    );
  }
}

export function getComfyLivePreviewUrl(promptId: string): string | null {
  return previews.get(promptId) ?? null;
}

export function clearComfyLivePreviewUrl(promptId: string): void {
  setComfyLivePreviewUrl(promptId, null);
}

export function clearAllComfyLivePreviewUrls(): void {
  for (const promptId of [...previews.keys()]) {
    clearComfyLivePreviewUrl(promptId);
  }
}
