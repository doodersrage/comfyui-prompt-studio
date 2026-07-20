"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { ComfyUiGalleryJobPlaceholder } from "@/components/ui/ComfyUiJobStatusPanel";
import {
  buildGalleryHandoff,
  galleryHandoffPath,
  saveGalleryHandoff,
} from "@/lib/gallery-handoff";
import { startImproveFromGalleryEntry } from "@/lib/improve-output";
import { scoreGalleryEntryHeuristic } from "@/lib/aesthetic-score";
import {
  downloadGalleryImage,
  downloadGallerySidecar,
} from "@/lib/comfyui-gallery-export";
import { studioHistoryUrl } from "@/lib/prompt-lineage";
import type { ComfyGalleryEntry } from "@/lib/comfyui-gallery";

type GalleryCardProps = {
  entry: ComfyGalleryEntry;
  compact: boolean;
  selectable?: boolean;
  selected?: boolean;
  onToggleSelected?: () => void;
  previewUrl: string | null;
  imageUrls: string[];
  onRemove: () => void;
  onToggleFavorite: () => void;
  onDownloadError: (message: string | null) => void;
  onRequeue: (newSeed: boolean) => void;
  onOpenImage: (index: number) => void;
  reviewMode?: boolean;
  onReviewRating?: (rating: ComfyGalleryEntry["reviewRating"]) => void;
};

function statusLabel(status: ComfyGalleryEntry["status"]): string {
  if (status === "completed") return "Done";
  if (status === "running") return "Running";
  if (status === "pending") return "Queued";
  return "Error";
}

function statusTone(status: ComfyGalleryEntry["status"]): string {
  if (status === "completed") {
    return "border-emerald-500/30 bg-emerald-500/10 text-emerald-200";
  }
  if (status === "error") {
    return "border-rose-500/30 bg-rose-500/10 text-rose-200";
  }
  if (status === "running") {
    return "border-amber-500/30 bg-amber-500/10 text-amber-100";
  }
  return "border-zinc-600/40 bg-zinc-800/60 text-zinc-300";
}

export default function GalleryCard({
  entry,
  compact,
  selectable,
  selected,
  onToggleSelected,
  previewUrl,
  imageUrls,
  onRemove,
  onToggleFavorite,
  onDownloadError,
  onRequeue,
  onOpenImage,
  reviewMode,
  onReviewRating,
}: GalleryCardProps) {
  const router = useRouter();
  const menuRef = useRef<HTMLDivElement>(null);
  const [promptExpanded, setPromptExpanded] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const aestheticScore = useMemo(() => scoreGalleryEntryHeuristic(entry), [entry]);

  useEffect(() => {
    if (!menuOpen) {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMenuOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [menuOpen]);

  const metaLine = [entry.tool, entry.model]
    .filter(Boolean)
    .join(" · ");

  return (
    <article
      className={`group/card relative rounded-2xl border bg-gradient-to-b from-zinc-950/80 to-zinc-950/40 shadow-[0_12px_40px_-24px_rgba(0,0,0,0.8)] transition hover:border-zinc-700/80 ${
        selected
          ? "border-violet-500/50 ring-1 ring-violet-500/25"
          : "border-zinc-800/80"
      } ${menuOpen ? "z-30" : "z-0"}`}
    >
      <div className="relative aspect-[4/5] overflow-hidden rounded-t-2xl bg-zinc-900/90 sm:aspect-square">
        {previewUrl ? (
          <button
            type="button"
            onClick={() => onOpenImage(0)}
            className="block h-full w-full cursor-zoom-in focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/60 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950"
            aria-label="Open image preview"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewUrl}
              alt={entry.prompt.slice(0, 80)}
              className="h-full w-full object-cover transition duration-300 group-hover/card:scale-[1.02]"
            />
          </button>
        ) : entry.status === "pending" || entry.status === "running" ? (
          <ComfyUiGalleryJobPlaceholder entry={entry} />
        ) : (
          <div className="flex h-full items-center justify-center px-4 text-center text-xs text-zinc-500">
            {entry.status === "error"
              ? entry.statusMessage ?? "Generation failed"
              : "No image output"}
          </div>
        )}

        <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-2.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <span
              className={`rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide backdrop-blur-sm ${statusTone(entry.status)}`}
            >
              {statusLabel(entry.status)}
            </span>
            {entry.reviewRating ? (
              <span className="rounded-full border border-violet-500/30 bg-violet-500/15 px-2 py-0.5 text-[10px] text-violet-100 backdrop-blur-sm">
                {entry.reviewRating}★
              </span>
            ) : null}
            {entry.status === "completed" && !entry.reviewRating ? (
              <span
                className="rounded-full border border-zinc-700/60 bg-zinc-950/70 px-2 py-0.5 text-[10px] text-zinc-400 backdrop-blur-sm"
                title={aestheticScore.notes.join(" · ")}
              >
                {aestheticScore.score}
              </span>
            ) : null}
          </div>

          <div className="pointer-events-auto flex items-center gap-1">
            {selectable ? (
              <label className="flex h-8 w-8 items-center justify-center rounded-full border border-zinc-700/70 bg-zinc-950/80 backdrop-blur transition hover:border-zinc-500">
                <input
                  type="checkbox"
                  checked={selected ?? false}
                  onChange={onToggleSelected}
                  aria-label="Select entry"
                  className="h-3.5 w-3.5 rounded border-zinc-600 bg-zinc-950 accent-violet-500"
                />
              </label>
            ) : null}
            <button
              type="button"
              onClick={onToggleFavorite}
              title={entry.favorite ? "Remove favorite" : "Add favorite"}
              className={`flex h-8 w-8 items-center justify-center rounded-full border text-sm backdrop-blur transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/50 ${
                entry.favorite
                  ? "border-amber-500/50 bg-amber-500/20 text-amber-100 hover:bg-amber-500/30"
                  : "border-zinc-700/70 bg-zinc-950/80 text-zinc-400 hover:border-amber-500/40 hover:text-amber-100"
              }`}
            >
              {entry.favorite ? "★" : "☆"}
            </button>
          </div>
        </div>

        {(entry.status === "pending" || entry.status === "running") &&
        entry.queuePosition != null &&
        entry.queuePosition > 0 ? (
          <p className="absolute bottom-2 left-2 rounded-full border border-zinc-700/60 bg-zinc-950/80 px-2 py-0.5 text-[10px] text-zinc-400 backdrop-blur">
            Queue #{entry.queuePosition}
          </p>
        ) : null}
      </div>

      <div className="space-y-2.5 p-3.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            {promptExpanded ? (
              <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-xl border border-zinc-800/80 bg-zinc-900/50 p-3 text-xs leading-relaxed text-zinc-300">
                {entry.prompt}
              </pre>
            ) : (
              <p className="line-clamp-2 text-sm leading-snug text-zinc-300">{entry.prompt}</p>
            )}
            {metaLine ? (
              <p className="mt-1.5 truncate text-[11px] text-zinc-500">
                {metaLine}
                {entry.queuedAt ? ` · ${new Date(entry.queuedAt).toLocaleDateString()}` : ""}
              </p>
            ) : null}
          </div>
        </div>

        {!compact && imageUrls.length > 1 ? (
          <div className="flex gap-1.5 overflow-x-auto pb-0.5">
            {imageUrls.slice(1, 5).map((url, thumbIndex) => (
              <button
                key={url}
                type="button"
                onClick={() => onOpenImage(thumbIndex + 1)}
                className="shrink-0 overflow-hidden rounded-lg border border-zinc-800 transition hover:border-violet-500/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/50"
                aria-label={`Open image ${thumbIndex + 2} preview`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt="" className="h-9 w-9 object-cover" />
              </button>
            ))}
          </div>
        ) : null}

        {reviewMode && entry.status === "completed" && onReviewRating ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] text-zinc-500">Rate</span>
            {[1, 2, 3, 4, 5].map((rating) => (
              <button
                key={rating}
                type="button"
                onClick={() => onReviewRating(rating as ComfyGalleryEntry["reviewRating"])}
                className={`min-h-8 min-w-8 rounded-lg border text-xs transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/50 ${
                  entry.reviewRating === rating
                    ? "border-violet-500/60 bg-violet-500/15 text-violet-100"
                    : "border-zinc-800 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200"
                }`}
              >
                {rating}
              </button>
            ))}
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-2 pt-0.5">
          <button
            type="button"
            onClick={() => setPromptExpanded((previous) => !previous)}
            className="ui-btn-ghost !min-h-8 px-2.5 text-xs"
          >
            {promptExpanded ? "Less" : "Prompt"}
          </button>
          {previewUrl ? (
            <button
              type="button"
              onClick={() => onOpenImage(0)}
              className="ui-btn-ghost !min-h-8 px-2.5 text-xs"
            >
              Open
            </button>
          ) : null}
          {entry.status === "completed" && previewUrl ? (
            <button
              type="button"
              onClick={() => startImproveFromGalleryEntry(entry)}
              className="ui-btn-ghost !min-h-8 px-2.5 text-xs text-emerald-300 hover:text-emerald-200"
            >
              Improve
            </button>
          ) : null}

          <div ref={menuRef} className="relative ml-auto">
            <button
              type="button"
              aria-expanded={menuOpen}
              aria-haspopup="menu"
              onClick={() => setMenuOpen((previous) => !previous)}
              className="ui-btn-ghost !min-h-8 px-2.5 text-xs"
            >
              More
            </button>
            {menuOpen ? (
              <div
                role="menu"
                className="absolute bottom-full right-0 z-50 mb-1.5 min-w-[12rem] overflow-hidden rounded-xl border border-zinc-700/80 bg-zinc-950 p-1 shadow-[0_20px_50px_-12px_rgba(0,0,0,0.85)] ring-1 ring-white/5"
              >
                <GalleryMenuButton
                  label="Copy prompt"
                  onClick={() => {
                    void navigator.clipboard.writeText(entry.prompt).catch(() => {
                      onDownloadError("Could not copy prompt.");
                    });
                    setMenuOpen(false);
                  }}
                />
                {entry.status === "completed" && previewUrl ? (
                  <GalleryMenuButton
                    label="Download image"
                    onClick={() => {
                      onDownloadError(null);
                      void downloadGalleryImage(entry).catch((error) => {
                        onDownloadError(
                          error instanceof Error ? error.message : "Download failed.",
                        );
                      });
                      setMenuOpen(false);
                    }}
                  />
                ) : null}
                <GalleryMenuButton
                  label="Sidecar JSON"
                  onClick={() => {
                    downloadGallerySidecar(entry);
                    setMenuOpen(false);
                  }}
                />
                {entry.historyId ? (
                  <Link
                    href={studioHistoryUrl(entry.historyId)}
                    role="menuitem"
                    className="block rounded-lg px-3 py-2 text-xs text-sky-300 transition hover:bg-zinc-900 hover:text-sky-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/40"
                    onClick={() => setMenuOpen(false)}
                  >
                    Studio history
                  </Link>
                ) : null}
                {entry.status === "completed" && previewUrl ? (
                  <>
                    <GalleryMenuButton
                      label="Refine"
                      onClick={() => {
                        saveGalleryHandoff(buildGalleryHandoff(entry, "refine"));
                        router.push(galleryHandoffPath("refine"));
                        setMenuOpen(false);
                      }}
                    />
                    <GalleryMenuButton
                      label="Image → Prompt"
                      onClick={() => {
                        saveGalleryHandoff(buildGalleryHandoff(entry, "imagePrompt"));
                        router.push(galleryHandoffPath("imagePrompt"));
                        setMenuOpen(false);
                      }}
                    />
                  </>
                ) : null}
                <GalleryMenuButton
                  label="Re-queue"
                  onClick={() => {
                    onRequeue(false);
                    setMenuOpen(false);
                  }}
                />
                <GalleryMenuButton
                  label="Re-queue (new seed)"
                  onClick={() => {
                    onRequeue(true);
                    setMenuOpen(false);
                  }}
                />
                <GalleryMenuButton
                  label="Remove"
                  tone="danger"
                  onClick={() => {
                    onRemove();
                    setMenuOpen(false);
                  }}
                />
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </article>
  );
}

function GalleryMenuButton(props: {
  label: string;
  onClick: () => void;
  tone?: "default" | "danger";
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={props.onClick}
      className={`block w-full rounded-lg px-3 py-2 text-left text-xs transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/40 ${
        props.tone === "danger"
          ? "text-rose-300 hover:bg-rose-500/10 hover:text-rose-200"
          : "text-zinc-300 hover:bg-zinc-900 hover:text-zinc-100"
      }`}
    >
      {props.label}
    </button>
  );
}
