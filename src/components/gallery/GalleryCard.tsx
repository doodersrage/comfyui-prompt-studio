"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import ModalPortal from "@/components/ui/ModalPortal";
import { ComfyUiGalleryJobPlaceholder } from "@/components/ui/ComfyUiJobStatusPanel";
import { comfyUiJobProgressPercent } from "@/lib/comfyui-job-status";
import {
  buildGalleryHandoff,
  galleryHandoffPath,
  saveGalleryHandoff,
} from "@/lib/gallery-handoff";
import { startImproveFromGalleryEntry, startInpaintFromGalleryEntry } from "@/lib/improve-output";
import {
  scoreGalleryEntryHeuristic,
  type AestheticScoreResult,
} from "@/lib/aesthetic-score";
import { updateComfyGalleryEntryById } from "@/lib/comfyui-gallery";
import {
  downloadGalleryImage,
  downloadGallerySidecar,
} from "@/lib/comfyui-gallery-export";
import { studioHistoryUrl } from "@/lib/prompt-lineage";
import {
  galleryEntryPrimaryLqipUrl,
  galleryEntryPrimaryMediaKind,
  galleryEntryPrimaryThumbSrcSet,
  galleryEntryMediaKinds,
  type ComfyGalleryEntry,
  type GalleryLayoutMode,
} from "@/lib/comfyui-gallery";

type GalleryCardProps = {
  entry: ComfyGalleryEntry;
  compact: boolean;
  layout?: GalleryLayoutMode;
  selectable?: boolean;
  selected?: boolean;
  reviewFocus?: boolean;
  cardRef?: React.Ref<HTMLElement>;
  onToggleSelected?: () => void;
  previewUrl: string | null;
  imageUrls: string[];
  onRemove: () => void;
  onToggleFavorite: () => void;
  onDownloadError: (message: string | null) => void;
  onRequeue: (newSeed: boolean, qualityProfile?: import("@/lib/queue-quality-profile").QueueQualityProfile) => void;
  onCancel: () => void;
  onUpscale: (
    qualityProfile: "final" | "max",
    options?: { force?: boolean },
  ) => void;
  onRefine: () => void;
  onFaceDetail?: () => void;
  onMoireClean?: (
    qualityProfile: "final" | "max",
    options?: { force?: boolean },
  ) => void;
  /** When false, hide both Final and Max upscale items (unless finer flags set). */
  showUpscaleActions?: boolean;
  showUpscaleFinal?: boolean;
  showUpscaleMax?: boolean;
  showForceUpscaleMax?: boolean;
  showRefineAction?: boolean;
  showFaceDetailAction?: boolean;
  showMoireCleanActions?: boolean;
  showMoireCleanFinal?: boolean;
  showMoireCleanMax?: boolean;
  showForceMoireCleanMax?: boolean;
  onShowParent?: () => void;
  onShowDerivatives?: () => void;
  hasDerivatives?: boolean;
  onOpenImage: (index: number) => void;
  reviewMode?: boolean;
  onReviewRating?: (rating: ComfyGalleryEntry["reviewRating"]) => void;
  reviewMutationHints?: string[];
  onVisionTagClick?: (tag: string) => void;
  onViewWorkflow?: () => void;
};

function statusLabel(status: ComfyGalleryEntry["status"], entry?: ComfyGalleryEntry): string {
  if (status === "completed") return "Done";
  if (status === "running") {
    const percent = entry ? comfyUiJobProgressPercent(entry) : null;
    return percent != null ? `Running · ${percent}%` : "Running";
  }
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
  layout = "grid",
  selectable,
  selected,
  reviewFocus = false,
  cardRef,
  onToggleSelected,
  previewUrl,
  imageUrls,
  onRemove,
  onToggleFavorite,
  onDownloadError,
  onRequeue,
  onCancel,
  onUpscale,
  onRefine,
  onFaceDetail,
  onMoireClean,
  showUpscaleActions = true,
  showUpscaleFinal,
  showUpscaleMax,
  showForceUpscaleMax = false,
  showRefineAction = true,
  showFaceDetailAction = false,
  showMoireCleanActions = true,
  showMoireCleanFinal,
  showMoireCleanMax,
  showForceMoireCleanMax = false,
  onShowParent,
  onShowDerivatives,
  hasDerivatives,
  onOpenImage,
  reviewMode,
  onReviewRating,
  reviewMutationHints,
  onVisionTagClick,
  onViewWorkflow,
}: GalleryCardProps) {
  const router = useRouter();
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const menuPanelRef = useRef<HTMLDivElement>(null);
  const [promptExpanded, setPromptExpanded] = useState(false);
  const [heroLoaded, setHeroLoaded] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState<{
    top: number;
    left: number;
    maxHeight: number;
  } | null>(null);
  const heroSrcSet = useMemo(() => galleryEntryPrimaryThumbSrcSet(entry), [entry]);
  const lqipUrl = useMemo(() => galleryEntryPrimaryLqipUrl(entry), [entry]);
  const primaryMediaKind = useMemo(() => galleryEntryPrimaryMediaKind(entry), [entry]);
  const stripMediaKinds = useMemo(() => galleryEntryMediaKinds(entry), [entry]);
  const isVideoHero = primaryMediaKind === "video";
  const isRendering =
    entry.status === "pending" || entry.status === "running";

  useEffect(() => {
    setHeroLoaded(false);
  }, [previewUrl]);

  const heuristicScore = useMemo(
    () => scoreGalleryEntryHeuristic(entry),
    [
      entry.id,
      entry.status,
      entry.favorite,
      entry.reviewRating,
      entry.prompt.length,
    ],
  );
  const cachedScore = useMemo((): AestheticScoreResult | null => {
    if (
      typeof entry.aestheticScore === "number" &&
      entry.aestheticScoreMethod
    ) {
      return {
        score: entry.aestheticScore,
        method: entry.aestheticScoreMethod,
        notes: ["Cached score"],
      };
    }
    return null;
  }, [entry.aestheticScore, entry.aestheticScoreMethod]);
  const [aestheticScore, setAestheticScore] = useState<AestheticScoreResult>(
    cachedScore ?? heuristicScore,
  );
  const [aestheticBusy, setAestheticBusy] = useState(false);

  useEffect(() => {
    setAestheticScore(cachedScore ?? heuristicScore);
  }, [cachedScore, heuristicScore]);

  const scoreWithVision = async () => {
    if (!previewUrl || aestheticBusy || entry.status !== "completed") {
      return;
    }
    setAestheticBusy(true);
    try {
      const imageResponse = await fetch(previewUrl);
      if (!imageResponse.ok) {
        throw new Error("Could not load preview for vision scoring.");
      }
      const blob = await imageResponse.blob();
      const imageDataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result ?? ""));
        reader.onerror = () => reject(new Error("Could not encode preview."));
        reader.readAsDataURL(blob);
      });
      const response = await fetch("/api/aesthetic/score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          method: "vision",
          imageDataUrl,
          prompt: entry.prompt,
          model: entry.model,
          tool: entry.tool,
          status: entry.status,
          favorite: entry.favorite,
          reviewRating: entry.reviewRating,
          images: entry.images,
          comfyUrl: entry.comfyUrl,
          promptId: entry.promptId,
          id: entry.id,
        }),
      });
      const data = (await response.json()) as AestheticScoreResult & {
        error?: string;
      };
      if (!response.ok) {
        throw new Error(data.error ?? "Aesthetic score failed.");
      }
      const nextScore: AestheticScoreResult = {
        score: data.score,
        method: data.method,
        notes: data.notes ?? [],
      };
      setAestheticScore(nextScore);
      updateComfyGalleryEntryById(entry.id, {
        aestheticScore: nextScore.score,
        aestheticScoreMethod: nextScore.method,
      });
    } catch {
      setAestheticScore(heuristicScore);
    } finally {
      setAestheticBusy(false);
    }
  };

  useLayoutEffect(() => {
    if (!menuOpen) {
      return;
    }

    const updatePosition = () => {
      const button = menuButtonRef.current;
      if (!button) {
        return;
      }

      const rect = button.getBoundingClientRect();
      const padding = 8;
      const menuWidth = 208;
      const estimatedHeight = 360;
      const spaceBelow = window.innerHeight - rect.bottom - padding;
      const spaceAbove = rect.top - padding;
      const openUp = spaceBelow < 240 && spaceAbove > spaceBelow;
      const maxHeight = Math.max(
        160,
        Math.min(estimatedHeight, openUp ? spaceAbove - 4 : spaceBelow - 4),
      );
      const left = Math.min(
        Math.max(padding, rect.right - menuWidth),
        window.innerWidth - menuWidth - padding,
      );
      const top = openUp
        ? Math.max(padding, rect.top - maxHeight - 6)
        : Math.min(rect.bottom + 6, window.innerHeight - maxHeight - padding);

      setMenuPosition({ top, left, maxHeight });
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [menuOpen]);

  useEffect(() => {
    if (!menuOpen) {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (
        menuButtonRef.current?.contains(target) ||
        menuPanelRef.current?.contains(target)
      ) {
        return;
      }
      setMenuOpen(false);
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

  const derivedLabel =
    entry.derivedKind === "upscale"
      ? "upscaled from prior"
      : entry.derivedKind === "refine"
        ? "refined from prior"
        : entry.derivedKind === "variation"
          ? "variation of prior"
          : entry.derivedKind === "moire-clean"
            ? "moiré-cleaned from prior"
            : entry.derivedKind === "face-detail"
              ? "face-detailed from prior"
              : undefined;

  const metaLine = [entry.tool, entry.model, entry.parentGalleryEntryId ? undefined : derivedLabel]
    .filter(Boolean)
    .join(" · ");
  const progressPercent = comfyUiJobProgressPercent(entry);

  const cardTone = selected
    ? "border-violet-500/50 ring-1 ring-violet-500/25"
    : reviewFocus
      ? "border-violet-400/60 ring-2 ring-violet-400/35 shadow-[0_0_24px_-8px_rgba(139,92,246,0.45)]"
      : "border-zinc-800/80";

  const imageBlock = (
    <div
      className={`relative overflow-hidden bg-zinc-900/90 ${
        layout === "list"
          ? "h-28 w-28 shrink-0 rounded-xl sm:h-32 sm:w-36"
          : layout === "dense"
            ? "aspect-[3/4] rounded-t-2xl"
            : "aspect-[4/5] rounded-t-2xl sm:aspect-square"
      }`}
    >
      {previewUrl && !isRendering ? (
        <>
          <button
            type="button"
            onClick={() => onOpenImage(0)}
            className="relative block h-full w-full cursor-zoom-in overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/60 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950"
            aria-label="Open image preview"
          >
            {lqipUrl && !isVideoHero ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={lqipUrl}
                alt=""
                aria-hidden
                className="absolute inset-0 h-full w-full scale-110 object-cover opacity-80 blur-xl"
              />
            ) : null}
            {isVideoHero ? (
              <video
                src={previewUrl}
                autoPlay
                loop
                muted
                playsInline
                preload="metadata"
                onLoadedData={() => setHeroLoaded(true)}
                className={`relative h-full w-full object-cover transition duration-300 group-hover/card:scale-[1.02] ${
                  heroLoaded ? "opacity-100" : "opacity-0"
                }`}
              />
            ) : (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={previewUrl}
                srcSet={heroSrcSet ?? undefined}
                alt={entry.prompt.slice(0, 80)}
                loading="lazy"
                decoding="async"
                sizes={
                  layout === "list"
                    ? "9rem"
                    : layout === "dense"
                      ? "(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
                      : "(max-width: 640px) 100vw, (max-width: 1280px) 50vw, 25vw"
                }
                onLoad={() => setHeroLoaded(true)}
                className={`relative h-full w-full object-cover transition duration-300 group-hover/card:scale-[1.02] ${
                  heroLoaded ? "opacity-100" : "opacity-0"
                }`}
              />
            )}
            {isVideoHero ? (
              <span className="pointer-events-none absolute right-2 top-2 rounded-full border border-white/15 bg-black/55 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-white/85 backdrop-blur-sm">
                Video
              </span>
            ) : null}
          </button>
          {layout !== "list" ? (
            <div className="pointer-events-none absolute inset-0 flex items-end justify-center gap-2 bg-gradient-to-t from-zinc-950/95 via-zinc-950/35 to-transparent p-3 opacity-0 transition duration-200 group-hover/card:pointer-events-auto group-hover/card:opacity-100 group-focus-within/card:pointer-events-auto group-focus-within/card:opacity-100">
              <button
                type="button"
                onClick={() => onOpenImage(0)}
                className="pointer-events-auto rounded-lg border border-zinc-700/80 bg-zinc-950/80 px-2.5 py-1 text-[11px] text-zinc-200 backdrop-blur transition hover:border-zinc-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/50 active:scale-[0.98]"
              >
                Open
              </button>
              {entry.status === "completed" && !isVideoHero ? (
                <>
                  <button
                    type="button"
                    onClick={() => startImproveFromGalleryEntry(entry)}
                    className="pointer-events-auto rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[11px] text-emerald-200 backdrop-blur transition hover:bg-emerald-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/45 active:scale-[0.98]"
                  >
                    Improve
                  </button>
                  <button
                    type="button"
                    onClick={() => startInpaintFromGalleryEntry(entry)}
                    className="pointer-events-auto rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[11px] text-amber-100 backdrop-blur transition hover:bg-amber-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/45 active:scale-[0.98]"
                  >
                    Inpaint
                  </button>
                </>
              ) : null}
            </div>
          ) : null}
        </>
      ) : isRendering ? (
        <div className="relative flex h-full flex-col">
          <ComfyUiGalleryJobPlaceholder entry={entry} />
          <button
            type="button"
            onClick={onCancel}
            className="absolute bottom-2.5 right-2.5 z-30 rounded-full border border-rose-500/30 bg-zinc-950/85 px-2.5 py-1 text-[11px] text-rose-200 backdrop-blur transition hover:border-rose-400/50 hover:bg-rose-500/15 hover:text-rose-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/50 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 active:scale-[0.97]"
          >
            Cancel
          </button>
        </div>
      ) : (
        <div className="flex h-full items-center justify-center px-4 text-center text-xs text-zinc-500">
          {entry.status === "error"
            ? entry.statusMessage ?? "Generation failed"
            : "No image output"}
        </div>
      )}

      {layout !== "list" ? (
        <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-2.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <span
              className={`rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide backdrop-blur-sm ${statusTone(entry.status)}`}
            >
              {statusLabel(entry.status, entry)}
            </span>
            {entry.reviewRating ? (
              <span className="rounded-full border border-violet-500/30 bg-violet-500/15 px-2 py-0.5 text-[10px] text-violet-100 backdrop-blur-sm">
                {entry.reviewRating}★
              </span>
            ) : null}
            {primaryMediaKind === "video" ? (
              <span className="rounded-full border border-sky-500/30 bg-sky-500/15 px-2 py-0.5 text-[10px] text-sky-100 backdrop-blur-sm">
                {entry.sourceImageUrl?.trim() ? "I2V" : "Video"}
              </span>
            ) : null}
            {entry.status === "completed" && !entry.reviewRating ? (
              <button
                type="button"
                disabled={!previewUrl || aestheticBusy}
                onClick={() => void scoreWithVision()}
                className="pointer-events-auto rounded-full border border-zinc-700/60 bg-zinc-950/70 px-2 py-0.5 text-[10px] text-zinc-400 backdrop-blur-sm transition hover:border-zinc-500 hover:text-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/45 active:scale-[0.98] disabled:opacity-50"
                title={
                  aestheticScore.notes.join(" · ") ||
                  "Click to score with vision LLM (falls back to heuristic)"
                }
              >
                {aestheticBusy
                  ? "…"
                  : `${aestheticScore.score}${
                      aestheticScore.method === "vision" ? "★" : ""
                    }`}
              </button>
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
      ) : null}

      {/* Percent is overlaid inside ComfyUiGalleryJobPlaceholder while rendering. */}
      {(entry.status === "pending" || entry.status === "running") &&
      entry.queuePosition != null &&
      entry.queuePosition > 0 &&
      progressPercent == null ? (
        <p className="absolute bottom-2 left-2 z-10 rounded-full border border-zinc-700/60 bg-zinc-950/80 px-2 py-0.5 text-[10px] text-zinc-400 backdrop-blur">
          Queue #{entry.queuePosition}
        </p>
      ) : null}
    </div>
  );

  const bodyBlock = (
    <div className={`min-w-0 flex-1 space-y-2.5 ${layout === "list" ? "py-1" : "p-3.5"}`}>
      {layout === "list" ? (
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${statusTone(entry.status)}`}
          >
            {statusLabel(entry.status, entry)}
          </span>
          {entry.reviewRating ? (
            <span className="text-[10px] text-violet-300">{entry.reviewRating}★</span>
          ) : null}
          {reviewFocus ? (
            <span className="text-[10px] font-medium text-violet-300">Review focus</span>
          ) : null}
        </div>
      ) : null}

      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          {promptExpanded ? (
            <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-xl border border-zinc-800/80 bg-zinc-900/50 p-3 text-xs leading-relaxed text-zinc-300">
              {entry.prompt}
            </pre>
          ) : (
            <p
              className={`leading-snug text-zinc-300 ${
                layout === "list" ? "line-clamp-3 text-sm" : "line-clamp-2 text-sm"
              }`}
            >
              {entry.prompt}
            </p>
          )}
          {metaLine ? (
            <p className="mt-1.5 truncate text-[11px] text-zinc-500">
              {entry.parentGalleryEntryId && onShowParent ? (
                <>
                  <button
                    type="button"
                    onClick={onShowParent}
                    className="text-violet-300/90 underline decoration-violet-500/30 underline-offset-2 transition hover:text-violet-200"
                  >
                    {derivedLabel ?? "View source"}
                  </button>
                  {" · "}
                </>
              ) : null}
              {metaLine}
              {entry.queueParams?.seed != null ? ` · seed ${entry.queueParams.seed}` : ""}
              {entry.queueParams?.videoFrames != null
                ? ` · ${entry.queueParams.videoFrames}f`
                : ""}
              {entry.queueParams?.videoFps != null
                ? ` @ ${entry.queueParams.videoFps}fps`
                : ""}
              {entry.queuedAt ? ` · ${new Date(entry.queuedAt).toLocaleDateString()}` : ""}
            </p>
          ) : null}
          {entry.visionTags && entry.visionTags.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {entry.visionTags.slice(0, 8).map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => onVisionTagClick?.(tag)}
                  className="rounded-full border border-sky-500/25 bg-sky-500/10 px-2 py-0.5 text-[10px] text-sky-100 transition hover:border-sky-400/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/40"
                >
                  {tag}
                </button>
              ))}
            </div>
          ) : null}
        </div>
        {layout === "list" && selectable ? (
          <label className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-zinc-700/70 bg-zinc-950/80">
            <input
              type="checkbox"
              checked={selected ?? false}
              onChange={onToggleSelected}
              aria-label="Select entry"
              className="h-3.5 w-3.5 rounded border-zinc-600 bg-zinc-950 accent-violet-500"
            />
          </label>
        ) : null}
      </div>

      {!compact && layout !== "list" && imageUrls.length > 1 ? (
        <div className="flex gap-1.5 overflow-x-auto pb-0.5">
          {imageUrls.slice(1, 5).map((url, thumbIndex) =>
            stripMediaKinds[thumbIndex + 1] === "video" ? (
              <button
                key={url}
                type="button"
                onClick={() => onOpenImage(thumbIndex + 1)}
                className="shrink-0 overflow-hidden rounded-lg border border-zinc-800 transition hover:border-violet-500/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/50"
                aria-label={`Open video ${thumbIndex + 2} preview`}
              >
                <video
                  src={url}
                  muted
                  loop
                  playsInline
                  preload="metadata"
                  className="h-9 w-9 object-cover"
                />
              </button>
            ) : (
              <button
                key={url}
                type="button"
                onClick={() => onOpenImage(thumbIndex + 1)}
                className="shrink-0 overflow-hidden rounded-lg border border-zinc-800 transition hover:border-violet-500/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/50"
                aria-label={`Open image ${thumbIndex + 2} preview`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={url}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className="h-9 w-9 object-cover"
                />
              </button>
            ),
          )}
        </div>
      ) : null}

      {reviewMode && reviewMutationHints && reviewMutationHints.length > 0 ? (
        <ul className="space-y-1 rounded-xl border border-amber-500/15 bg-amber-500/5 px-3 py-2 text-[11px] text-amber-100/90">
          {reviewMutationHints.map((hint) => (
            <li key={hint}>· {hint}</li>
          ))}
        </ul>
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
          className="ui-btn-ghost ui-btn-sm text-xs"
        >
          {promptExpanded ? "Less" : "Prompt"}
        </button>
        {layout === "list" ? (
          <button
            type="button"
            onClick={onToggleFavorite}
            className="ui-btn-ghost ui-btn-sm text-xs"
          >
            {entry.favorite ? "Unfavorite" : "Favorite"}
          </button>
        ) : null}

        <div className="relative ml-auto">
          <button
            ref={menuButtonRef}
            type="button"
            aria-expanded={menuOpen}
            aria-haspopup="menu"
            onClick={() => {
              if (menuOpen) {
                setMenuOpen(false);
                setMenuPosition(null);
                return;
              }
              setMenuOpen(true);
            }}
            className="ui-btn-ghost ui-btn-sm text-xs"
          >
            More
          </button>
          {menuOpen && menuPosition ? (
            <ModalPortal>
              <div
                ref={menuPanelRef}
                role="menu"
                className="fixed z-[200] min-w-[12.5rem] overflow-y-auto rounded-xl border border-zinc-700/80 bg-zinc-950 p-1 shadow-[0_20px_50px_-12px_rgba(0,0,0,0.85)] ring-1 ring-white/5"
                style={{
                  top: menuPosition.top,
                  left: menuPosition.left,
                  maxHeight: menuPosition.maxHeight,
                }}
              >
                <GalleryMenuGroup label="Export">
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
                  {onViewWorkflow ? (
                    <GalleryMenuButton
                      label="View workflow"
                      onClick={() => {
                        onViewWorkflow();
                        setMenuOpen(false);
                      }}
                    />
                  ) : null}
                  {entry.historyId ? (
                    <Link
                      href={studioHistoryUrl(entry.historyId)}
                      role="menuitem"
                      className="block rounded-lg px-3 py-2 text-xs text-sky-300 transition hover:bg-zinc-900 hover:text-sky-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/40 active:bg-zinc-900/80"
                      onClick={() => setMenuOpen(false)}
                    >
                      Studio history
                    </Link>
                  ) : null}
                </GalleryMenuGroup>

                {entry.status === "completed" && entry.prompt?.trim() ? (
                  <GalleryMenuGroup label="Edit">
                    <GalleryMenuButton
                      label="Edit prompt"
                      onClick={() => {
                        saveGalleryHandoff(buildGalleryHandoff(entry, "promptEditor"));
                        router.push(galleryHandoffPath("promptEditor"));
                        setMenuOpen(false);
                      }}
                    />
                    {previewUrl ? (
                      <>
                        {layout === "list" ? (
                          <>
                            <GalleryMenuButton
                              label="Improve"
                              onClick={() => {
                                startImproveFromGalleryEntry(entry);
                                setMenuOpen(false);
                              }}
                            />
                            <GalleryMenuButton
                              label="Inpaint"
                              onClick={() => {
                                startInpaintFromGalleryEntry(entry);
                                setMenuOpen(false);
                              }}
                            />
                          </>
                        ) : null}
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
                        <GalleryMenuButton
                          label="ControlNet"
                          onClick={() => {
                            saveGalleryHandoff(buildGalleryHandoff(entry, "controlnet"));
                            router.push(galleryHandoffPath("controlnet"));
                            setMenuOpen(false);
                          }}
                        />
                        {primaryMediaKind === "image" && entry.status === "completed" ? (
                          <GalleryMenuButton
                            label="Send to Video (I2V)"
                            onClick={() => {
                              saveGalleryHandoff(buildGalleryHandoff(entry, "video"));
                              router.push(galleryHandoffPath("video"));
                              setMenuOpen(false);
                            }}
                          />
                        ) : null}
                      </>
                    ) : null}
                  </GalleryMenuGroup>
                ) : null}

                <GalleryMenuGroup label="Queue">
                  {entry.status === "pending" || entry.status === "running" ? (
                    <GalleryMenuButton
                      label="Cancel job"
                      tone="danger"
                      onClick={() => {
                        onCancel();
                        setMenuOpen(false);
                      }}
                    />
                  ) : null}
                  <GalleryMenuButton
                    label="Re-queue"
                    onClick={() => {
                      onRequeue(false);
                      setMenuOpen(false);
                    }}
                  />
                  <GalleryMenuButton
                    label="New seed"
                    onClick={() => {
                      onRequeue(true);
                      setMenuOpen(false);
                    }}
                  />
                  <GalleryMenuButton
                    label="Variation · Final"
                    onClick={() => {
                      onRequeue(true, "final");
                      setMenuOpen(false);
                    }}
                  />
                  <GalleryMenuButton
                    label="Variation · Max"
                    onClick={() => {
                      onRequeue(true, "max");
                      setMenuOpen(false);
                    }}
                  />
                </GalleryMenuGroup>

                {(() => {
                  const canUpscaleFinal =
                    showUpscaleFinal ?? showUpscaleActions;
                  const canUpscaleMax = showUpscaleMax ?? showUpscaleActions;
                  const canMoireFinal =
                    showMoireCleanFinal ?? showMoireCleanActions;
                  const canMoireMax = showMoireCleanMax ?? showMoireCleanActions;
                  const showEnhance =
                    canUpscaleFinal ||
                    canUpscaleMax ||
                    showForceUpscaleMax ||
                    showRefineAction ||
                    (onFaceDetail && showFaceDetailAction) ||
                    (onMoireClean &&
                      (canMoireFinal || canMoireMax || showForceMoireCleanMax));
                  if (!showEnhance) {
                    return null;
                  }
                  return (
                  <GalleryMenuGroup label="Enhance">
                    {canUpscaleFinal ? (
                        <GalleryMenuButton
                          label="Upscale · Final"
                          onClick={() => {
                            onUpscale("final");
                            setMenuOpen(false);
                          }}
                        />
                    ) : null}
                    {canUpscaleMax ? (
                        <GalleryMenuButton
                          label="Upscale · Max"
                          onClick={() => {
                            onUpscale("max");
                            setMenuOpen(false);
                          }}
                        />
                    ) : null}
                    {showForceUpscaleMax ? (
                        <GalleryMenuButton
                          label="Force Upscale · Max"
                          onClick={() => {
                            onUpscale("max", { force: true });
                            setMenuOpen(false);
                          }}
                        />
                    ) : null}
                    {showRefineAction ? (
                      <GalleryMenuButton
                        label="Refine · low denoise"
                        onClick={() => {
                          onRefine();
                          setMenuOpen(false);
                        }}
                      />
                    ) : null}
                    {onFaceDetail && showFaceDetailAction ? (
                      <GalleryMenuButton
                        label="Face detail"
                        onClick={() => {
                          onFaceDetail();
                          setMenuOpen(false);
                        }}
                      />
                    ) : null}
                    {onMoireClean && canMoireFinal ? (
                        <GalleryMenuButton
                          label="Moiré · Final"
                          onClick={() => {
                            onMoireClean("final");
                            setMenuOpen(false);
                          }}
                        />
                    ) : null}
                    {onMoireClean && canMoireMax ? (
                        <GalleryMenuButton
                          label="Moiré · Max"
                          onClick={() => {
                            onMoireClean("max");
                            setMenuOpen(false);
                          }}
                        />
                    ) : null}
                    {onMoireClean && showForceMoireCleanMax ? (
                        <GalleryMenuButton
                          label="Force Moiré · Max"
                          onClick={() => {
                            onMoireClean("max", { force: true });
                            setMenuOpen(false);
                          }}
                        />
                    ) : null}
                  </GalleryMenuGroup>
                  );
                })()}

                {hasDerivatives && onShowDerivatives ? (
                  <GalleryMenuGroup label="Lineage">
                    <GalleryMenuButton
                      label="Show derivatives"
                      onClick={() => {
                        onShowDerivatives();
                        setMenuOpen(false);
                      }}
                    />
                  </GalleryMenuGroup>
                ) : null}

                <GalleryMenuGroup>
                  <GalleryMenuButton
                    label="Remove"
                    tone="danger"
                    onClick={() => {
                      onRemove();
                      setMenuOpen(false);
                    }}
                  />
                </GalleryMenuGroup>
              </div>
            </ModalPortal>
          ) : null}
        </div>
      </div>
    </div>
  );

  return (
    <article
      ref={cardRef}
      data-gallery-entry={entry.id}
      className={`group/card relative min-w-0 rounded-2xl border bg-gradient-to-b from-zinc-950/80 to-zinc-950/40 shadow-[0_12px_40px_-24px_rgba(0,0,0,0.8)] transition hover:border-zinc-700/80 ${
        menuOpen
          ? "z-30"
          : "z-0 [content-visibility:auto] [contain-intrinsic-size:auto_320px]"
      } ${cardTone}`}
    >
      {layout === "list" ? (
        <div className="flex gap-4 p-3">{imageBlock}{bodyBlock}</div>
      ) : (
        <>
          {imageBlock}
          {bodyBlock}
        </>
      )}
    </article>
  );
}

function GalleryMenuGroup({
  label,
  children,
}: {
  label?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-t border-zinc-800/80 py-1 first:border-t-0 first:pt-0">
      {label ? (
        <p className="px-3 pb-1 pt-1.5 text-[10px] font-medium uppercase tracking-[0.08em] text-zinc-500">
          {label}
        </p>
      ) : null}
      {children}
    </div>
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
      className={`block w-full rounded-lg px-3 py-2 text-left text-xs transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/40 active:scale-[0.99] ${
        props.tone === "danger"
          ? "text-rose-300 hover:bg-rose-500/10 hover:text-rose-200"
          : "text-zinc-300 hover:bg-zinc-900 hover:text-zinc-100"
      }`}
    >
      {props.label}
    </button>
  );
}
