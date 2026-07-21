"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/Button";
import {
  formatGallerySlideshowInterval,
  GALLERY_SLIDESHOW_TRANSITION_LABELS,
  GALLERY_SLIDESHOW_TRANSITION_OPTIONS,
  resolveGallerySlideshowTransitionMs,
  type GallerySlideshowTransition,
} from "@/lib/comfyui-gallery";
import { scheduleAfterCommit } from "@/lib/schedule-after-commit";

export type ImageLightboxState = {
  images: string[];
  index: number;
  title?: string;
  /** Optional per-image titles; falls back to `title` when omitted. */
  titles?: string[];
  /** Full-res URLs parallel to `images` — used by “Open original”. */
  originalImages?: string[];
};

export type ImageLightboxSlideshowOptions = {
  playing: boolean;
  intervalMs: number;
  intervalOptions?: readonly number[];
  transition: GallerySlideshowTransition;
  transitionOptions?: readonly GallerySlideshowTransition[];
  onPlayingChange: (playing: boolean) => void;
  onIntervalChange?: (intervalMs: number) => void;
  onTransitionChange?: (transition: GallerySlideshowTransition) => void;
  /** Immersive presentation: image fills the viewport (optionally via browser fullscreen). */
  fullscreen?: boolean;
  onFullscreenChange?: (fullscreen: boolean) => void;
};

type ImageLightboxProps = {
  state: ImageLightboxState | null;
  onClose: () => void;
  onIndexChange: (index: number) => void;
  slideshow?: ImageLightboxSlideshowOptions;
};

function resolveSlideDirection(
  fromIndex: number,
  toIndex: number,
  totalImages: number,
  slideshowPlaying: boolean,
): 1 | -1 {
  if (toIndex > fromIndex) {
    return 1;
  }

  if (toIndex < fromIndex) {
    if (toIndex === 0 && fromIndex === totalImages - 1 && slideshowPlaying) {
      return 1;
    }

    return -1;
  }

  return 1;
}

function resolveTransitionClasses(
  transition: GallerySlideshowTransition,
  direction: 1 | -1,
): { enter: string; exit: string } {
  switch (transition) {
    case "fade":
      return { enter: "lightbox-fade-enter", exit: "lightbox-fade-exit" };
    case "zoom":
      return { enter: "lightbox-zoom-enter", exit: "lightbox-zoom-exit" };
    case "none":
      return { enter: "", exit: "" };
    case "slide":
    default:
      return direction === 1
        ? {
            enter: "lightbox-slide-enter-forward",
            exit: "lightbox-slide-exit-forward",
          }
        : {
            enter: "lightbox-slide-enter-back",
            exit: "lightbox-slide-exit-back",
          };
  }
}

export default function ImageLightbox({
  state,
  onClose,
  onIndexChange,
  slideshow,
}: ImageLightboxProps) {
  const [mounted, setMounted] = useState(false);
  const [displayIndex, setDisplayIndex] = useState(0);
  const [previousIndex, setPreviousIndex] = useState<number | null>(null);
  const [slideDirection, setSlideDirection] = useState<1 | -1>(1);
  const [titleAnimating, setTitleAnimating] = useState(false);
  const playlistKeyRef = useRef("");
  const containerRef = useRef<HTMLDivElement>(null);
  const open = Boolean(state && state.images.length > 0);
  const images = state?.images ?? [];
  const index = state?.index ?? 0;
  const transition = slideshow?.transition ?? "slide";
  const transitionMs = resolveGallerySlideshowTransitionMs(transition);
  const currentUrl = images[displayIndex] ?? images[0];
  const currentOriginalUrl =
    state?.originalImages?.[displayIndex] ??
    state?.originalImages?.[0] ??
    currentUrl;
  const currentTitle = state?.titles?.[displayIndex] ?? state?.title;
  const canGoPrevious = index > 0;
  const canGoNext = index < images.length - 1;
  const slideshowEnabled = Boolean(slideshow && images.length > 1);
  const isFullscreen = Boolean(slideshow?.fullscreen);
  const isTransitioning = previousIndex !== null && transitionMs > 0;
  const transitionOptions =
    slideshow?.transitionOptions ?? GALLERY_SLIDESHOW_TRANSITION_OPTIONS;

  const pauseSlideshow = () => {
    if (slideshow?.playing) {
      slideshow.onPlayingChange(false);
    }
  };

  const exitFullscreenPresentation = useCallback(() => {
    if (document.fullscreenElement === containerRef.current) {
      void document.exitFullscreen?.().catch(() => undefined);
    }
    slideshow?.onFullscreenChange?.(false);
  }, [slideshow]);

  const enterFullscreenPresentation = useCallback(() => {
    slideshow?.onFullscreenChange?.(true);
    const element = containerRef.current;
    if (element?.requestFullscreen) {
      void element.requestFullscreen().catch(() => undefined);
    }
  }, [slideshow]);

  const toggleFullscreenPresentation = useCallback(() => {
    if (isFullscreen) {
      exitFullscreenPresentation();
      return;
    }
    enterFullscreenPresentation();
  }, [enterFullscreenPresentation, exitFullscreenPresentation, isFullscreen]);

  const goToIndex = (nextIndex: number, manual = false) => {
    if (manual) {
      pauseSlideshow();
    }
    onIndexChange(nextIndex);
  };

  useEffect(() => {
    scheduleAfterCommit(() => {
      setMounted(true);
    });
  }, []);

  useEffect(() => {
    scheduleAfterCommit(() => {
      if (!open) {
        setPreviousIndex(null);
        setDisplayIndex(0);
        setTitleAnimating(false);
        return;
      }

      const playlistKey = images.join("\u0000");
      if (playlistKeyRef.current !== playlistKey) {
        playlistKeyRef.current = playlistKey;
        setPreviousIndex(null);
        setDisplayIndex(index);
        setTitleAnimating(false);
        return;
      }

      if (index === displayIndex) {
        return;
      }

      if (transition === "none") {
        setDisplayIndex(index);
        return;
      }

      const direction = resolveSlideDirection(
        displayIndex,
        index,
        images.length,
        Boolean(slideshow?.playing),
      );

      setSlideDirection(direction);
      setPreviousIndex(displayIndex);
      setDisplayIndex(index);
      setTitleAnimating(true);
    });
  }, [
    open,
    index,
    displayIndex,
    images,
    slideshow?.playing,
    transition,
  ]);

  useEffect(() => {
    if (previousIndex === null || transitionMs === 0) {
      return;
    }

    const timer = window.setTimeout(() => {
      setPreviousIndex(null);
      setTitleAnimating(false);
    }, transitionMs);

    return () => {
      window.clearTimeout(timer);
    };
  }, [previousIndex, transitionMs]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (isFullscreen) {
          exitFullscreenPresentation();
          return;
        }
        onClose();
        return;
      }

      if (slideshowEnabled && (event.key === " " || event.key === "Spacebar")) {
        event.preventDefault();
        slideshow?.onPlayingChange(!slideshow.playing);
        return;
      }

      if (slideshowEnabled && (event.key === "f" || event.key === "F")) {
        event.preventDefault();
        toggleFullscreenPresentation();
        return;
      }

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        const prevIndex = index > 0 ? index - 1 : slideshow?.playing ? images.length - 1 : index;
        if (prevIndex !== index) {
          goToIndex(prevIndex, !slideshow?.playing);
        }
        return;
      }

      if (event.key === "ArrowRight") {
        event.preventDefault();
        const nextIndex =
          index < images.length - 1 ? index + 1 : slideshow?.playing ? 0 : index;
        if (nextIndex !== index) {
          goToIndex(nextIndex, !slideshow?.playing);
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [
    open,
    index,
    images.length,
    onClose,
    slideshow,
    slideshowEnabled,
    isFullscreen,
    exitFullscreenPresentation,
    toggleFullscreenPresentation,
  ]);

  useEffect(() => {
    if (!open || !isFullscreen) {
      return;
    }

    const onFullscreenChange = () => {
      if (!document.fullscreenElement) {
        slideshow?.onFullscreenChange?.(false);
      }
    };

    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, [open, isFullscreen, slideshow]);

  useEffect(() => {
    if (!open || !isFullscreen) {
      return;
    }

    const element = containerRef.current;
    if (element?.requestFullscreen && document.fullscreenElement !== element) {
      void element.requestFullscreen().catch(() => undefined);
    }
  }, [open, isFullscreen]);

  useEffect(() => {
    if (
      !open ||
      !slideshow?.playing ||
      images.length <= 1 ||
      isTransitioning
    ) {
      return;
    }

    const timer = window.setTimeout(() => {
      const nextIndex = index < images.length - 1 ? index + 1 : 0;
      onIndexChange(nextIndex);
    }, slideshow.intervalMs);

    return () => {
      window.clearTimeout(timer);
    };
  }, [
    open,
    slideshow?.playing,
    slideshow?.intervalMs,
    index,
    images.length,
    onIndexChange,
    isTransitioning,
  ]);

  useEffect(() => {
    if (!open || images.length === 0) {
      return;
    }

    const neighborIndexes = [index - 1, index + 1].filter(
      (neighbor) => neighbor >= 0 && neighbor < images.length,
    );
    const prefetched: HTMLImageElement[] = [];
    for (const neighbor of neighborIndexes) {
      const url = images[neighbor];
      if (!url) {
        continue;
      }
      const img = new Image();
      img.decoding = "async";
      img.src = url;
      prefetched.push(img);
    }

    return () => {
      for (const img of prefetched) {
        img.src = "";
      }
    };
  }, [open, index, images]);

  if (!mounted || !open || !currentUrl) {
    return null;
  }

  const { enter: enterClass, exit: exitClass } = resolveTransitionClasses(
    transition,
    slideDirection,
  );
  const imageClassName = isFullscreen
    ? "h-full w-full max-h-[100vh] max-w-[100vw] object-contain"
    : "mx-auto max-h-[min(72vh,900px)] w-full object-contain bg-[var(--bg-subtle)]";

  const renderImageStage = (stageClassName: string) => (
    <div className={`relative overflow-hidden ${stageClassName}`}>
      <div className="relative flex h-full min-h-0 items-center justify-center">
        {previousIndex !== null && images[previousIndex] ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={images[previousIndex]}
              alt=""
              aria-hidden
              decoding="async"
              className={`absolute inset-0 m-auto max-h-full max-w-full object-contain ${exitClass}`}
            />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={currentUrl}
              alt={currentTitle ?? "Gallery image preview"}
              decoding="async"
              className={`relative z-[1] ${imageClassName} ${enterClass}`}
            />
          </>
        ) : (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={currentUrl}
            alt={currentTitle ?? "Gallery image preview"}
            decoding="async"
            className={`relative ${imageClassName}`}
          />
        )}
      </div>

      {isFullscreen && images.length > 1 ? (
        <>
          <button
            type="button"
            className="absolute inset-y-0 left-0 z-[2] w-[22%] cursor-w-resize bg-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/30"
            onClick={() => {
              const prevIndex = index > 0 ? index - 1 : slideshow?.playing ? images.length - 1 : 0;
              goToIndex(prevIndex, !slideshow?.playing);
            }}
            aria-label="Previous image"
          />
          <button
            type="button"
            className="absolute inset-y-0 right-0 z-[2] w-[22%] cursor-e-resize bg-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/30"
            onClick={() => {
              const nextIndex =
                index < images.length - 1 ? index + 1 : slideshow?.playing ? 0 : images.length - 1;
              goToIndex(nextIndex, !slideshow?.playing);
            }}
            aria-label="Next image"
          />
        </>
      ) : null}

      {!isFullscreen && images.length > 1 ? (
        <>
          <Button
            variant="secondary"
            className="absolute left-3 top-1/2 z-[2] !min-h-9 -translate-y-1/2 px-3 type-caption"
            disabled={!canGoPrevious || isTransitioning}
            onClick={() => goToIndex(index - 1, true)}
            aria-label="Previous image"
          >
            Previous
          </Button>
          <Button
            variant="secondary"
            className="absolute right-3 top-1/2 z-[2] !min-h-9 -translate-y-1/2 px-3 type-caption"
            disabled={!canGoNext || isTransitioning}
            onClick={() => goToIndex(index + 1, true)}
            aria-label="Next image"
          >
            Next
          </Button>
        </>
      ) : null}
    </div>
  );

  const renderSlideshowControls = (compact = false) =>
    slideshowEnabled ? (
      <>
        <Button
          variant={compact ? "ghost" : "secondary"}
          className={`${compact ? "!min-h-8 !text-white hover:!bg-white/10" : "!min-h-9"} px-3 type-caption`}
          onClick={() => slideshow?.onPlayingChange(!slideshow.playing)}
        >
          {slideshow?.playing ? "Pause" : "Play"}
        </Button>
        {slideshow?.onIntervalChange &&
        slideshow.intervalOptions &&
        slideshow.intervalOptions.length > 0 ? (
          <label
            className={`flex items-center gap-2 type-caption ${compact ? "text-white/70" : "text-[var(--text-tertiary)]"}`}
          >
            Every
            <select
              value={slideshow.intervalMs}
              onChange={(event) => {
                pauseSlideshow();
                slideshow.onIntervalChange?.(Number(event.target.value));
              }}
              className={
                compact
                  ? "rounded-md border border-white/15 bg-black/40 px-2 py-1 text-white"
                  : "rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--bg-subtle)] px-2 py-1 text-[var(--text-secondary)]"
              }
            >
              {slideshow.intervalOptions.map((option) => (
                <option key={option} value={option}>
                  {formatGallerySlideshowInterval(option)}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {slideshow?.onTransitionChange && transitionOptions.length > 0 ? (
          <label
            className={`flex items-center gap-2 type-caption ${compact ? "text-white/70" : "text-[var(--text-tertiary)]"}`}
          >
            Effect
            <select
              value={transition}
              onChange={(event) => {
                pauseSlideshow();
                slideshow.onTransitionChange?.(
                  event.target.value as GallerySlideshowTransition,
                );
              }}
              className={
                compact
                  ? "rounded-md border border-white/15 bg-black/40 px-2 py-1 text-white"
                  : "rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--bg-subtle)] px-2 py-1 text-[var(--text-secondary)]"
              }
            >
              {transitionOptions.map((option) => (
                <option key={option} value={option}>
                  {GALLERY_SLIDESHOW_TRANSITION_LABELS[option]}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {slideshow?.onFullscreenChange ? (
          <Button
            variant={compact ? "ghost" : "secondary"}
            className={`${compact ? "!min-h-8 !text-white hover:!bg-white/10" : "!min-h-9"} px-3 type-caption`}
            onClick={toggleFullscreenPresentation}
          >
            {isFullscreen ? "Exit fullscreen" : "Fullscreen"}
          </Button>
        ) : null}
      </>
    ) : null;

  if (isFullscreen) {
    return createPortal(
      <div
        ref={containerRef}
        className="fixed inset-0 z-[120] flex flex-col bg-black text-white"
        role="dialog"
        aria-modal="true"
        aria-label={state?.title ?? "Fullscreen slideshow"}
        style={
          {
            "--lightbox-transition-duration": `${transitionMs}ms`,
          } as CSSProperties
        }
      >
        <div className="pointer-events-none absolute inset-x-0 top-0 z-[3] bg-gradient-to-b from-black/80 via-black/35 to-transparent px-4 pb-10 pt-4 sm:px-6">
          <div className="pointer-events-auto flex items-start justify-between gap-4">
            <div className="min-w-0 space-y-1">
              <p className="type-overline text-white/50">
                {slideshow?.playing ? "Slideshow" : "Paused"} · {index + 1} / {images.length}
              </p>
              {currentTitle ? (
                <p
                  key={`${displayIndex}-${currentTitle}`}
                  className={`type-caption line-clamp-2 text-white/80${
                    titleAnimating && transitionMs > 0 ? " lightbox-title-fade-in" : ""
                  }`}
                >
                  {currentTitle}
                </p>
              ) : null}
            </div>
            <Button
              variant="ghost"
              className="!min-h-9 shrink-0 px-3 type-caption !text-white hover:!bg-white/10"
              onClick={onClose}
            >
              Close
            </Button>
          </div>
        </div>

        {renderImageStage("flex-1 min-h-0")}

        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[3] bg-gradient-to-t from-black/85 via-black/45 to-transparent px-4 pb-4 pt-12 sm:px-6">
          <div className="pointer-events-auto flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">{renderSlideshowControls(true)}</div>
            <div className="flex flex-wrap items-center gap-3">
              {currentOriginalUrl ? (
                <a
                  href={currentOriginalUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="type-caption text-white/70 underline-offset-4 transition-colors hover:text-white hover:underline focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
                >
                  Open original
                </a>
              ) : null}
              <p className="type-caption text-white/45">
                Space play/pause · ←/→ navigate · F fullscreen · Esc exit
              </p>
            </div>
          </div>
        </div>
      </div>,
      document.body,
    );
  }

  return createPortal(
    <div
      ref={containerRef}
      className="fixed inset-0 z-[120] flex items-center justify-center p-4 sm:p-8"
      role="dialog"
      aria-modal="true"
      aria-label={state?.title ?? "Image preview"}
      style={
        {
          "--lightbox-transition-duration": `${transitionMs}ms`,
        } as CSSProperties
      }
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={onClose}
        aria-label="Close image preview"
      />

      <div
        className="relative z-10 flex max-h-[92vh] w-full max-w-6xl flex-col gap-4"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 space-y-1">
            <p className="type-overline text-[var(--text-muted)]">
              {slideshow?.playing ? "Slideshow" : "Image preview"}
            </p>
            {currentTitle ? (
              <p
                key={`${displayIndex}-${currentTitle}`}
                className={`type-caption line-clamp-2 text-[var(--text-secondary)]${
                  titleAnimating && transitionMs > 0
                    ? " lightbox-title-fade-in"
                    : ""
                }`}
              >
                {currentTitle}
              </p>
            ) : null}
          </div>
          <Button
            variant="ghost"
            className="!min-h-9 shrink-0 px-3 type-caption"
            onClick={onClose}
          >
            Close
          </Button>
        </div>

        {renderImageStage(
          "relative min-h-[min(40vh,420px)] rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--bg-elevated)] shadow-[var(--shadow-overlay,0_24px_80px_rgb(0_0_0/0.45))]",
        )}

        <div className="flex flex-wrap items-center justify-between gap-3">
          {images.length > 1 ? (
            <div className="flex flex-wrap items-center gap-2">
              {renderSlideshowControls()}
              <Button
                variant="secondary"
                className="!min-h-9 px-3 type-caption"
                disabled={!canGoPrevious || isTransitioning}
                onClick={() => goToIndex(index - 1, true)}
              >
                Previous
              </Button>
              <p className="type-caption text-[var(--text-tertiary)]">
                Image {index + 1} of {images.length}
              </p>
              <Button
                variant="secondary"
                className="!min-h-9 px-3 type-caption"
                disabled={!canGoNext || isTransitioning}
                onClick={() => goToIndex(index + 1, true)}
              >
                Next
              </Button>
            </div>
          ) : (
            <span />
          )}
          <div className="flex flex-wrap gap-2">
            {currentOriginalUrl ? (
              <a
                href={currentOriginalUrl}
                target="_blank"
                rel="noreferrer"
                className="ui-btn-ghost !min-h-9 px-4 type-caption focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
              >
                Open original
              </a>
            ) : null}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
