import type { ComfyGalleryEntry } from "./comfyui-gallery";
import { galleryEntryViewUrls } from "./comfyui-gallery";
import { downloadTextFile } from "./history-export-formats";

export type CompareExportEntry = {
  id: string;
  model?: string;
  seed?: string;
  rating?: number;
  favorite?: boolean;
  prompt: string;
  negativePrompt?: string;
  imageUrl?: string;
};

export function buildCompareExport(entries: ComfyGalleryEntry[]): CompareExportEntry[] {
  return entries.map((entry) => ({
    id: entry.id,
    model: entry.model,
    seed: entry.queueParams?.seed != null ? String(entry.queueParams.seed) : undefined,
    rating: entry.reviewRating,
    favorite: entry.favorite,
    prompt: entry.prompt,
    negativePrompt: entry.negativePrompt,
    imageUrl: entry.images?.length ? galleryEntryViewUrls(entry)[0] : undefined,
  }));
}

export function exportCompareJson(entries: ComfyGalleryEntry[]): string {
  return JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      count: entries.length,
      entries: buildCompareExport(entries),
    },
    null,
    2,
  );
}

export function exportCompareHtml(entries: ComfyGalleryEntry[]): string {
  const cards = buildCompareExport(entries)
    .map((entry) => {
      const model = escapeHtml(entry.model ?? "unknown");
      const seed = escapeHtml(entry.seed ?? "?");
      const rating =
        typeof entry.rating === "number" && Number.isFinite(entry.rating)
          ? ` · ${escapeHtml(String(entry.rating))}★`
          : "";
      const imageUrl = safeImageUrlAttr(entry.imageUrl);
      return `
<section style="margin-bottom:24px;padding:16px;border:1px solid #333;border-radius:12px;">
  <h2 style="margin:0 0 8px;font-size:16px;">${model} · seed ${seed}${rating}</h2>
  ${imageUrl ? `<img src="${imageUrl}" alt="" style="max-width:100%;border-radius:8px;margin-bottom:12px;" />` : ""}
  <pre style="white-space:pre-wrap;font-size:13px;line-height:1.5;">${escapeHtml(entry.prompt)}</pre>
</section>`;
    })
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Gallery compare export</title>
</head>
<body style="font-family:system-ui,sans-serif;background:#0a0a0a;color:#e4e4e7;padding:24px;max-width:960px;margin:0 auto;">
  <h1>Gallery A/B compare (${entries.length})</h1>
  <p style="color:#71717a;">Exported ${escapeHtml(new Date().toLocaleString())}</p>
  ${cards}
</body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function safeImageUrlAttr(value: string | undefined): string | undefined {
  if (!value?.trim()) {
    return undefined;
  }
  try {
    const url = new URL(value, "http://localhost");
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return undefined;
    }
    return escapeHtml(value);
  } catch {
    return undefined;
  }
}

export function downloadCompareExport(
  entries: ComfyGalleryEntry[],
  format: "json" | "html" = "json",
): void {
  if (format === "html") {
    downloadTextFile(
      exportCompareHtml(entries),
      "gallery-compare.html",
      "text/html;charset=utf-8",
    );
    return;
  }
  downloadTextFile(
    exportCompareJson(entries),
    "gallery-compare.json",
    "application/json;charset=utf-8",
  );
}
