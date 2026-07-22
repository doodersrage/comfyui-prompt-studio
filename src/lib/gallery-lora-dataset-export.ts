import type { ComfyGalleryEntry } from "./comfyui-gallery-entry";
import { buildComfyViewPath, type ComfyOutputImage } from "./comfyui-outputs";
import { buildZipBlob, type ZipFileEntry } from "./gallery-zip-export";

/**
 * Gallery → LoRA training dataset export. Pulls selected/favorited/high-rated
 * gallery entries and packages each as an `NNNN_slug.<ext>` image alongside a
 * matching `NNNN_slug.txt` caption file (cleaned prompt text), zipped with the
 * same lightweight inline ZIP writer used by gallery-zip-export.ts.
 */

/** Minimum `reviewRating` (out of 5) that counts as "high-rated" for the default selection. */
export const DEFAULT_LORA_DATASET_MIN_RATING = 4;

export type LoraDatasetSelectionOptions = {
  /** Explicit gallery entry ids (e.g. current bulk selection). Takes priority over favorites/rating when non-empty. */
  selectedIds?: Iterable<string>;
  /** Minimum reviewRating to include when no explicit selection is provided (default 4). */
  minRating?: 1 | 2 | 3 | 4 | 5;
};

/**
 * Resolves the entries to export: an explicit selection when provided,
 * otherwise every favorited or `minRating`+ starred entry. Either way, only
 * completed entries with at least one output image are eligible.
 */
export function selectLoraDatasetEntries(
  entries: ComfyGalleryEntry[],
  options?: LoraDatasetSelectionOptions,
): ComfyGalleryEntry[] {
  const selectedIdSet = options?.selectedIds ? new Set(options.selectedIds) : null;
  const minRating = options?.minRating ?? DEFAULT_LORA_DATASET_MIN_RATING;

  const candidates =
    selectedIdSet && selectedIdSet.size > 0
      ? entries.filter((entry) => selectedIdSet.has(entry.id))
      : entries.filter(
          (entry) => entry.favorite === true || (entry.reviewRating ?? 0) >= minRating,
        );

  return candidates.filter(
    (entry) =>
      entry.status === "completed" && entry.images.length > 0 && Boolean(entry.prompt?.trim()),
  );
}

const WEIGHT_SYNTAX_RE = /\(([^()]+?):\s*-?[\d.]+\)/g;
const TOKEN_PLACEHOLDER_RE = /\{\{[A-Z0-9_]+\}\}/g;

/**
 * Cleans a raw prompt for use as a LoRA caption: unwraps ComfyUI-style
 * attention weighting (`(subject:1.3)` → `subject`), drops unresolved
 * `{{TOKEN}}` placeholders and stray `BREAK` separators, and collapses
 * whitespace/newlines/commas into a single tidy comma-separated line.
 */
export function cleanLoraCaptionText(prompt: string | undefined): string {
  if (!prompt?.trim()) {
    return "";
  }

  let text = prompt;
  let previous: string;
  do {
    previous = text;
    text = text.replace(WEIGHT_SYNTAX_RE, "$1");
  } while (text !== previous);

  return text
    .replace(TOKEN_PLACEHOLDER_RE, "")
    .replace(/\bBREAK\b/gi, ",")
    .replace(/[\r\n]+/g, ", ")
    .replace(/[ \t]+/g, " ")
    .replace(/,\s*,+/g, ",")
    .replace(/\s*,\s*/g, ", ")
    .replace(/^[,\s]+|[,\s]+$/g, "")
    .trim();
}

/** Cleaned caption text, optionally prefixed with a LoRA trigger word (skipped if already present). */
export function buildLoraCaptionText(
  entry: Pick<ComfyGalleryEntry, "prompt">,
  options?: { triggerWord?: string },
): string {
  const cleaned = cleanLoraCaptionText(entry.prompt);
  const trigger = options?.triggerWord?.trim();
  if (!trigger) {
    return cleaned;
  }
  if (cleaned.toLowerCase().includes(trigger.toLowerCase())) {
    return cleaned;
  }
  return cleaned ? `${trigger}, ${cleaned}` : trigger;
}

/** Lowercase, hyphenated, filesystem-safe slug — falls back to "image" when nothing usable remains. */
export function sanitizeLoraDatasetSlug(value: string | undefined): string {
  const slug = (value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return slug || "image";
}

/** Image filename extension (without the dot), defaulting to "png" when it can't be determined. */
export function loraDatasetImageExtension(filename: string | undefined): string {
  const match = /\.([a-z0-9]{2,5})$/i.exec(filename ?? "");
  return match ? match[1].toLowerCase() : "png";
}

/** Zero-padded ordinal + model/tool slug — image and caption share this base name. */
export function buildLoraDatasetBaseName(
  entry: Pick<ComfyGalleryEntry, "model" | "tool" | "id">,
  ordinal: number,
): string {
  const index = String(Math.max(1, Math.floor(ordinal))).padStart(4, "0");
  const slug = sanitizeLoraDatasetSlug(entry.model || entry.tool || entry.id);
  return `${index}_${slug}`;
}

export type LoraDatasetManifestEntry = {
  id: string;
  baseName: string;
  imageFilename: string;
  captionFilename: string;
  caption: string;
  sourceImageUrl: string;
  model?: string;
  favorite: boolean;
  reviewRating?: number;
};

/** Builds the per-entry image/caption filename + caption text plan, without fetching any bytes. */
export function buildLoraDatasetManifest(
  entries: ComfyGalleryEntry[],
  options?: { triggerWord?: string },
): LoraDatasetManifestEntry[] {
  const manifest: LoraDatasetManifestEntry[] = [];
  let ordinal = 0;

  for (const entry of entries) {
    const image: ComfyOutputImage | undefined = entry.images[0];
    if (!image) {
      continue;
    }
    ordinal += 1;
    const baseName = buildLoraDatasetBaseName(entry, ordinal);
    const extension = loraDatasetImageExtension(image.filename);
    manifest.push({
      id: entry.id,
      baseName,
      imageFilename: `${baseName}.${extension}`,
      captionFilename: `${baseName}.txt`,
      caption: buildLoraCaptionText(entry, options),
      sourceImageUrl: buildComfyViewPath(entry.comfyUrl, image),
      model: entry.model,
      favorite: Boolean(entry.favorite),
      reviewRating: entry.reviewRating,
    });
  }

  return manifest;
}

export type LoraDatasetExportResult = {
  count: number;
  manifest: LoraDatasetManifestEntry[];
};

/**
 * Fetches each manifest entry's output image and packages it with its caption
 * `.txt` (+ a `manifest.json` summary) into a single downloadable ZIP. Entries
 * whose image fetch fails are skipped (not fatal) so a partial dataset is
 * still exported.
 */
export async function downloadLoraDatasetZip(
  entries: ComfyGalleryEntry[],
  options?: { triggerWord?: string },
): Promise<LoraDatasetExportResult> {
  const manifest = buildLoraDatasetManifest(entries, options);
  const files: ZipFileEntry[] = [];

  for (const item of manifest) {
    try {
      const response = await fetch(item.sourceImageUrl);
      if (!response.ok) {
        continue;
      }
      files.push({
        filename: item.imageFilename,
        data: new Uint8Array(await response.arrayBuffer()),
      });
      files.push({
        filename: item.captionFilename,
        data: new TextEncoder().encode(item.caption),
      });
    } catch {
      // Skip this entry — the rest of the dataset still exports.
    }
  }

  if (files.length === 0) {
    return { count: 0, manifest };
  }

  files.push({
    filename: "manifest.json",
    data: new TextEncoder().encode(
      JSON.stringify(
        { exportedAt: new Date().toISOString(), count: manifest.length, entries: manifest },
        null,
        2,
      ),
    ),
  });

  const blob = buildZipBlob(files);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `lora-dataset-${Date.now()}.zip`;
  anchor.click();
  URL.revokeObjectURL(url);

  return { count: manifest.length, manifest };
}
