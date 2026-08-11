'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type TouchEvent as ReactTouchEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/Button';
import {
  formatGallerySlideshowInterval,
  GALLERY_SLIDESHOW_TRANSITION_LABELS,
  GALLERY_SLIDESHOW_TRANSITION_OPTIONS,
  resolveGallerySlideshowTransitionMs,
  type GallerySlideshowTransition,
} from '@/lib/comfyui-gallery';
import { scheduleAfterCommit } from '@/lib/schedule-after-commit';
import type { ComfyOutputMediaKind } from '@/lib/comfyui-outputs';
import { prefetchGalleryImageUrl } from '@/lib/gallery-image-prefetch';
import { stripGalleryViewWidthParam } from '@/lib/comfyui-outputs';

export type ImageLightboxState = {
  images: string[];
  index: number;
  title?: string;
  /** Optional per-image titles; falls back to `title` when omitted. */
  titles?: string[];
  /** Full-res URLs parallel to `images` — used by "Open original". */
  originalImages?: string[];
  /** Download-ready Comfy view URLs (with width param) parallel to `images`. */
  downloadUrls?: string[];
  /** Per-slide filenames for naming the downloaded file; falls back to promptId slice. */
  downloadFilenames?: string[];
  /** Grid-thumb URLs parallel to `images` — blur-up while mid-res loads. */
  thumbImages?: string[];
  /** Per-slide media kind (image vs. video/animated), parallel to `images`. */
  mediaKinds?: ComfyOutputMediaKind[];
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

export type ImageLightboxSlideMeta = {
  model?: string;
  seed?: string;
  cfg?: string;
  steps?: string;
  width?: string;
  height?: string;
  tool?: string;
  prompt?: string;
  negativePrompt?: string;
  derivedKind?: string;
};

/** Per-slide review / iterate actions for the current lightbox index. */
export type ImageLightboxSlideChrome = {
  rating?: 1 | 2 | 3 | 4 | 5 | null;
  favorite?: boolean;
  onRate?: (rating: 1 | 2 | 3 | 4 | 5) => void;
  onToggleFavorite?: () => void;
  onImprove?: () => void;
  onCompose?: () => void;
  onInpaint?: () => void;
  onExactRequeue?: () => void;
  onRequeue?: () => void;
  showImprove?: boolean;
  showCompose?: boolean;
  showInpaint?: boolean;
  showExact?: boolean;
  showRequeue?: boolean;
  /** Seed / model / prompt details for the Details (M) panel. */
  meta?: ImageLightboxSlideMeta | null;
  onCopyPrompt?: () => void;
  onCopyNegative?: () => void;
  onAddToCompare?: () => void;
  compareSelected?: boolean;
  compareCount?: number;
  onOpenCompare?: () => void;
  onRemove?: () => void;
  onShowParent?: () => void;
  onShowDerivatives?: () => void;
  onJumpToSibling?: () => void;
  hasParent?: boolean;
  hasDerivatives?: boolean;
  hasSibling?: boolean;
};

type ImageLightboxProps = {
  state: ImageLightboxState | null;
  onClose: () => void;
  onIndexChange: (index: number) => void;
  /** Optional per-slide download trigger. */
  onDownloadImage?: (index: number) => Promise<void>;
  slideshow?: ImageLightboxSlideshowOptions;
  /** Review / iterate chrome for the active slide. */
  slideChrome?: ImageLightboxSlideChrome | null;
};

function resolveSlideDirection(
  fromIndex: number,
  toIndex: number,
  totalImages: number,
  slideshowPlaying: boolean
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
  direction: 1 | -1
): { enter: string; exit: string } {
  switch (transition) {
    case 'fade':
      return { enter: 'lightbox-fade-enter', exit: 'lightbox-fade-exit' };
    case 'zoom':
      return { enter: 'lightbox-zoom-enter', exit: 'lightbox-zoom-exit' };
    case 'none':
      return { enter: '', exit: '' };
    case 'slide':
    default:
      return direction === 1
        ? {
            enter: 'lightbox-slide-enter-forward',
            exit: 'lightbox-slide-exit-forward',
          }
        : {
            enter: 'lightbox-slide-enter-back',
            exit: 'lightbox-slide-exit-back',
          };
  }
}

export default function ImageLightbox({
  state,
  onClose,
  onIndexChange,
  onDownloadImage,
  slideshow,
  slideChrome = null,
}: ImageLightboxProps) {
  const [mounted, setMounted] = useState(false);
  const [displayIndex, setDisplayIndex] = useState(0);
  const [previousIndex, setPreviousIndex] = useState<number | null>(null);
  const [slideDirection, setSlideDirection] = useState<1 | -1>(1);
  const [titleAnimating, setTitleAnimating] = useState(false);
  const [currentImageLoaded, setCurrentImageLoaded] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [metaOpen, setMetaOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [copyFlash, setCopyFlash] = useState<string | null>(null);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    moved: boolean;
    mode: 'pan' | 'swipe';
  } | null>(null);
  const playlistKeyRef = useRef('');
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const zoomRef = useRef(1);
  const touchPinchRef = useRef<{ distance: number; zoom: number } | null>(null);
  const open = Boolean(state && state.images.length > 0);
  const images = useMemo(() => state?.images ?? [], [state?.images]);
  const index = state?.index ?? 0;
  const transition = slideshow?.transition ?? 'slide';
  const transitionMs = resolveGallerySlideshowTransitionMs(transition);
  const currentUrl = images[displayIndex] ?? images[0];
  const currentThumbUrl =
    state?.thumbImages?.[displayIndex] ?? state?.thumbImages?.[0] ?? undefined;
  const currentOriginalUrl = (() => {
    const candidate =
      state?.originalImages?.[displayIndex] ?? state?.originalImages?.[0] ?? currentUrl;
    if (!candidate) {
      return undefined;
    }
    return stripGalleryViewWidthParam(candidate);
  })();
  const currentDownloadUrl = state?.downloadUrls?.[displayIndex] ?? undefined;
  const currentTitle = state?.titles?.[displayIndex] ?? state?.title;
  const canGoPrevious = index > 0;
  const canGoNext = index < images.length - 1;
  const slideshowEnabled = Boolean(slideshow && images.length > 1);
  const isFullscreen = Boolean(slideshow?.fullscreen);
  const isTransitioning = previousIndex !== null && transitionMs > 0;
  const transitionOptions = slideshow?.transitionOptions ?? GALLERY_SLIDESHOW_TRANSITION_OPTIONS;

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

  const resetZoom = useCallback(() => {
    setZoom(1);
    zoomRef.current = 1;
    setPan({ x: 0, y: 0 });
    setDragging(false);
    dragRef.current = null;
  }, []);

  const applyZoom = useCallback((next: number) => {
    const clamped = Math.min(5, Math.max(1, next));
    zoomRef.current = clamped;
    setZoom(clamped);
    if (clamped <= 1) {
      setPan({ x: 0, y: 0 });
    }
  }, []);

  const toggleZoom = useCallback(() => {
    setZoom(previous => {
      if (previous > 1) {
        setPan({ x: 0, y: 0 });
        zoomRef.current = 1;
        return 1;
      }
      zoomRef.current = 2;
      return 2;
    });
  }, []);

  const flashCopy = useCallback((label: string) => {
    setCopyFlash(label);
    window.setTimeout(() => {
      setCopyFlash(previous => (previous === label ? null : previous));
    }, 1400);
  }, []);

  const goToIndex = useCallback(
    (nextIndex: number, manual = false) => {
      if (manual && slideshow?.playing) {
        slideshow.onPlayingChange(false);
      }
      resetZoom();
      onIndexChange(nextIndex);
    },
    [onIndexChange, resetZoom, slideshow]
  );

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

      const playlistKey = images.join('\u0000');
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

      if (transition === 'none') {
        setDisplayIndex(index);
        return;
      }

      const direction = resolveSlideDirection(
        displayIndex,
        index,
        images.length,
        Boolean(slideshow?.playing)
      );

      setSlideDirection(direction);
      setPreviousIndex(displayIndex);
      setDisplayIndex(index);
      setTitleAnimating(true);
    });
  }, [open, index, displayIndex, images, slideshow?.playing, transition]);

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
    document.body.style.overflow = 'hidden';

    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }

      if (event.key === 'Escape') {
        if (helpOpen) {
          event.preventDefault();
          setHelpOpen(false);
          return;
        }
        if (metaOpen) {
          event.preventDefault();
          setMetaOpen(false);
          return;
        }
        if (zoom > 1) {
          event.preventDefault();
          resetZoom();
          return;
        }
        if (isFullscreen) {
          exitFullscreenPresentation();
          return;
        }
        onClose();
        return;
      }

      if (event.key === '?' || (event.shiftKey && event.key === '/')) {
        event.preventDefault();
        setHelpOpen(previous => !previous);
        return;
      }

      if ((event.key === 'm' || event.key === 'M') && slideChrome?.meta) {
        event.preventDefault();
        setMetaOpen(previous => !previous);
        return;
      }

      if (slideshowEnabled && (event.key === ' ' || event.key === 'Spacebar')) {
        event.preventDefault();
        slideshow?.onPlayingChange(!slideshow.playing);
        return;
      }

      if (slideshowEnabled && (event.key === 'f' || event.key === 'F') && !event.shiftKey) {
        event.preventDefault();
        toggleFullscreenPresentation();
        return;
      }

      if ((event.key === 'd' || event.key === 'D') && onDownloadImage) {
        event.preventDefault();
        void onDownloadImage(index);
        return;
      }

      if (
        (event.key === 'z' || event.key === 'Z') &&
        (state?.mediaKinds?.[index] ?? 'image') !== 'video'
      ) {
        event.preventDefault();
        toggleZoom();
        return;
      }

      if (
        (event.key === 'b' ||
          event.key === 'B' ||
          (event.shiftKey && (event.key === 'f' || event.key === 'F'))) &&
        slideChrome?.onToggleFavorite
      ) {
        event.preventDefault();
        slideChrome.onToggleFavorite();
        return;
      }

      if (event.key >= '1' && event.key <= '5' && slideChrome?.onRate) {
        event.preventDefault();
        slideChrome.onRate(Number(event.key) as 1 | 2 | 3 | 4 | 5);
        return;
      }

      if (
        (event.key === 'i' || event.key === 'I') &&
        slideChrome?.onImprove &&
        slideChrome.showImprove !== false
      ) {
        event.preventDefault();
        slideChrome.onImprove();
        return;
      }

      if (
        (event.key === 'c' || event.key === 'C') &&
        slideChrome?.onCompose &&
        slideChrome.showCompose !== false
      ) {
        event.preventDefault();
        slideChrome.onCompose();
        return;
      }

      if ((event.key === 'a' || event.key === 'A') && slideChrome?.onAddToCompare) {
        event.preventDefault();
        slideChrome.onAddToCompare();
        return;
      }

      if (
        (event.key === 'Delete' || event.key === 'Backspace') &&
        slideChrome?.onRemove &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey
      ) {
        event.preventDefault();
        slideChrome.onRemove();
        return;
      }

      if ((event.key === 'p' || event.key === 'P') && slideChrome?.onShowParent) {
        event.preventDefault();
        slideChrome.onShowParent();
        return;
      }

      if ((event.key === 'g' || event.key === 'G') && slideChrome?.onShowDerivatives) {
        event.preventDefault();
        slideChrome.onShowDerivatives();
        return;
      }

      if ((event.key === 's' || event.key === 'S') && slideChrome?.onJumpToSibling) {
        event.preventDefault();
        slideChrome.onJumpToSibling();
        return;
      }

      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        const prevIndex = index > 0 ? index - 1 : slideshow?.playing ? images.length - 1 : index;
        if (prevIndex !== index) {
          goToIndex(prevIndex, !slideshow?.playing);
        }
        return;
      }

      if (event.key === 'ArrowRight') {
        event.preventDefault();
        const nextIndex = index < images.length - 1 ? index + 1 : slideshow?.playing ? 0 : index;
        if (nextIndex !== index) {
          goToIndex(nextIndex, !slideshow?.playing);
        }
      }
    };

    window.addEventListener('keydown', onKeyDown, true);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown, true);
    };
  }, [
    open,
    index,
    images.length,
    onClose,
    onDownloadImage,
    slideshow,
    slideshowEnabled,
    isFullscreen,
    exitFullscreenPresentation,
    toggleFullscreenPresentation,
    zoom,
    resetZoom,
    toggleZoom,
    slideChrome,
    state?.mediaKinds,
    goToIndex,
    helpOpen,
    metaOpen,
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

    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
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
    if (!open || !slideshow?.playing || images.length <= 1 || isTransitioning) {
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

    const current = images[index];
    if (current && state?.mediaKinds?.[index] !== 'video') {
      prefetchGalleryImageUrl(current);
    }

    const neighborIndexes = [index - 1, index + 1].filter(
      neighbor => neighbor >= 0 && neighbor < images.length
    );
    for (const neighbor of neighborIndexes) {
      const url = images[neighbor];
      if (!url || state?.mediaKinds?.[neighbor] === 'video') {
        continue;
      }
      prefetchGalleryImageUrl(url);
    }
  }, [open, index, images, state?.mediaKinds]);

  useEffect(() => {
    scheduleAfterCommit(() => setCurrentImageLoaded(false));
  }, [currentUrl]);

  useEffect(() => {
    scheduleAfterCommit(() => {
      resetZoom();
    });
  }, [index, resetZoom]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const el = stageRef.current;
    if (!el) {
      return;
    }

    const onWheel = (event: WheelEvent) => {
      const mediaKind = state?.mediaKinds?.[index] ?? 'image';
      if (event.ctrlKey || event.metaKey) {
        if (mediaKind === 'video') {
          return;
        }
        event.preventDefault();
        const factor = event.deltaY > 0 ? 0.92 : 1.08;
        applyZoom(zoomRef.current * factor);
        return;
      }

      if (zoomRef.current > 1) {
        return;
      }

      if (images.length <= 1) {
        return;
      }

      const dominant =
        Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX;
      if (Math.abs(dominant) < 18) {
        return;
      }

      event.preventDefault();
      if (dominant > 0) {
        const nextIndex = index < images.length - 1 ? index + 1 : slideshow?.playing ? 0 : index;
        if (nextIndex !== index) {
          goToIndex(nextIndex, !slideshow?.playing);
        }
      } else {
        const prevIndex = index > 0 ? index - 1 : slideshow?.playing ? images.length - 1 : index;
        if (prevIndex !== index) {
          goToIndex(prevIndex, !slideshow?.playing);
        }
      }
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      el.removeEventListener('wheel', onWheel);
    };
  }, [
    open,
    index,
    images.length,
    goToIndex,
    slideshow?.playing,
    state?.mediaKinds,
    applyZoom,
    isFullscreen,
    mounted,
  ]);

  const onStagePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) {
      return;
    }
    const mode = zoom > 1 ? 'pan' : 'swipe';
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: pan.x,
      originY: pan.y,
      moved: false,
      mode,
    };
    setDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onStagePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) {
      drag.moved = true;
    }
    if (drag.mode === 'pan' && zoom > 1) {
      setPan({ x: drag.originX + dx, y: drag.originY + dy });
    }
  };

  const onStagePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    dragRef.current = null;
    setDragging(false);
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // ignore
    }

    if (drag.mode === 'swipe' && zoom <= 1 && Math.abs(dx) > 56 && Math.abs(dx) > Math.abs(dy)) {
      if (dx < 0 && (canGoNext || slideshow?.playing)) {
        const nextIndex = index < images.length - 1 ? index + 1 : slideshow?.playing ? 0 : index;
        if (nextIndex !== index) {
          goToIndex(nextIndex, !slideshow?.playing);
        }
      } else if (dx > 0 && (canGoPrevious || slideshow?.playing)) {
        const prevIndex = index > 0 ? index - 1 : slideshow?.playing ? images.length - 1 : index;
        if (prevIndex !== index) {
          goToIndex(prevIndex, !slideshow?.playing);
        }
      }
    }
  };

  if (!mounted || !open || !currentUrl) {
    return null;
  }

  const { enter: enterClass, exit: exitClass } = resolveTransitionClasses(
    transition,
    slideDirection
  );
  const imageClassName = isFullscreen
    ? 'relative flex h-full w-full max-h-[100vh] max-w-[100vw] items-center justify-center'
    : 'relative mx-auto flex max-h-[calc(96vh-6.5rem)] max-w-full items-center justify-center bg-[var(--bg-subtle)]';
  const currentMediaKind = state?.mediaKinds?.[displayIndex] ?? 'image';
  const previousMediaKind =
    previousIndex !== null ? (state?.mediaKinds?.[previousIndex] ?? 'image') : 'image';

  const renderSlide = (
    url: string,
    kind: ComfyOutputMediaKind,
    className: string,
    key: string,
    options?: {
      ariaHidden?: boolean;
      isCurrent?: boolean;
      placeholderUrl?: string;
    }
  ) => {
    const ariaHidden = options?.ariaHidden ?? false;
    const isCurrent = options?.isCurrent ?? false;
    if (kind === 'video') {
      return (
        <video
          key={key}
          src={url}
          className={`${className} max-h-[var(--lightbox-image-max-h,calc(96vh-6.5rem))] max-w-full object-contain`}
          aria-hidden={ariaHidden || undefined}
          autoPlay
          loop
          muted
          playsInline
          controls={!ariaHidden}
        />
      );
    }

    const showPlaceholder =
      isCurrent &&
      Boolean(options?.placeholderUrl) &&
      options?.placeholderUrl !== url &&
      !currentImageLoaded;

    return (
      <div key={key} className={className}>
        {showPlaceholder ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={options!.placeholderUrl}
            alt=""
            aria-hidden
            decoding="async"
            className="absolute inset-0 m-auto max-h-[var(--lightbox-image-max-h,calc(96vh-6.5rem))] max-w-full object-contain opacity-90 blur-sm scale-[1.02]"
          />
        ) : null}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt={ariaHidden ? '' : (currentTitle ?? 'Gallery image preview')}
          aria-hidden={ariaHidden || undefined}
          decoding={isCurrent ? 'sync' : 'async'}
          fetchPriority={isCurrent ? 'high' : 'auto'}
          ref={
            isCurrent
              ? el => {
                  if (el?.complete && el.naturalWidth > 0) {
                    setCurrentImageLoaded(true);
                  }
                }
              : undefined
          }
          onLoad={
            isCurrent
              ? () => {
                  setCurrentImageLoaded(true);
                }
              : undefined
          }
          className={`relative z-[1] max-h-[var(--lightbox-image-max-h,calc(96vh-6.5rem))] max-w-full object-contain transition-opacity duration-200 ${
            isCurrent && !currentImageLoaded && options?.placeholderUrl
              ? 'opacity-0'
              : 'opacity-100'
          }`}
          style={
            isCurrent && zoom > 1
              ? {
                  transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                  transformOrigin: 'center center',
                  cursor: dragging ? 'grabbing' : 'grab',
                  maxHeight: 'none',
                  maxWidth: 'none',
                  height: 'min(var(--lightbox-image-max-h, calc(96vh - 6.5rem)), 100%)',
                }
              : isCurrent
                ? { cursor: 'zoom-in' }
                : undefined
          }
          onDoubleClick={
            isCurrent
              ? event => {
                  event.preventDefault();
                  toggleZoom();
                }
              : undefined
          }
        />
      </div>
    );
  };

  const chromeBtn = (compact: boolean) =>
    `${compact ? '!min-h-8 !text-white hover:!bg-white/10' : '!min-h-9'} px-2.5 type-caption`;

  const renderMetaPanel = (compact = false) => {
    const meta = slideChrome?.meta;
    if (!metaOpen || !meta) {
      return null;
    }
    const dims =
      meta.width && meta.height
        ? `${meta.width}×${meta.height}`
        : meta.width || meta.height || undefined;
    const chips = [
      meta.tool ? `Tool ${meta.tool}` : null,
      meta.model ? `Model ${meta.model}` : null,
      meta.seed != null && meta.seed !== '' ? `Seed ${meta.seed}` : null,
      meta.cfg != null && meta.cfg !== '' ? `CFG ${meta.cfg}` : null,
      meta.steps != null && meta.steps !== '' ? `Steps ${meta.steps}` : null,
      dims ? dims : null,
      meta.derivedKind ? meta.derivedKind : null,
    ].filter(Boolean) as string[];

    return (
      <div
        className={`max-h-[40vh] space-y-2 overflow-y-auto rounded-xl border p-3 shadow-[0_12px_40px_rgb(0_0_0/0.35)] backdrop-blur-md ${
          compact
            ? 'border-white/15 bg-black/55 text-white'
            : 'border-[var(--border-subtle)]/80 bg-[var(--bg-base)]/90 text-[var(--text-secondary)]'
        }`}
      >
        {chips.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {chips.map(chip => (
              <span
                key={chip}
                className={`rounded-md px-2 py-0.5 text-[11px] ${
                  compact
                    ? 'bg-white/10 text-white/80'
                    : 'bg-[var(--bg-muted)] text-[var(--text-muted)]'
                }`}
              >
                {chip}
              </span>
            ))}
          </div>
        ) : null}
        {meta.prompt ? (
          <div className="space-y-1">
            <div className="flex items-center justify-between gap-2">
              <p
                className={`type-overline ${compact ? 'text-white/45' : 'text-[var(--text-tertiary)]'}`}
              >
                Prompt
              </p>
              {slideChrome?.onCopyPrompt ? (
                <Button
                  variant={compact ? 'ghost' : 'secondary'}
                  className={chromeBtn(compact)}
                  onClick={() => {
                    slideChrome.onCopyPrompt?.();
                    flashCopy('Prompt copied');
                  }}
                >
                  Copy
                </Button>
              ) : null}
            </div>
            <p
              className={`max-h-28 overflow-y-auto whitespace-pre-wrap text-[12px] leading-relaxed ${
                compact ? 'text-white/85' : 'text-[var(--text-secondary)]'
              }`}
            >
              {meta.prompt}
            </p>
          </div>
        ) : null}
        {meta.negativePrompt ? (
          <div className="space-y-1">
            <div className="flex items-center justify-between gap-2">
              <p
                className={`type-overline ${compact ? 'text-white/45' : 'text-[var(--text-tertiary)]'}`}
              >
                Negative
              </p>
              {slideChrome?.onCopyNegative ? (
                <Button
                  variant={compact ? 'ghost' : 'secondary'}
                  className={chromeBtn(compact)}
                  onClick={() => {
                    slideChrome.onCopyNegative?.();
                    flashCopy('Negative copied');
                  }}
                >
                  Copy
                </Button>
              ) : null}
            </div>
            <p
              className={`max-h-20 overflow-y-auto whitespace-pre-wrap text-[12px] leading-relaxed ${
                compact ? 'text-white/70' : 'text-[var(--text-muted)]'
              }`}
            >
              {meta.negativePrompt}
            </p>
          </div>
        ) : null}
        {copyFlash ? (
          <p className={`type-caption ${compact ? 'text-emerald-300/90' : 'text-emerald-400/90'}`}>
            {copyFlash}
          </p>
        ) : null}
      </div>
    );
  };

  const renderHelpOverlay = (compact = false) => {
    if (!helpOpen) {
      return null;
    }
    const rows = [
      ['← / → · wheel', 'Previous / next'],
      ['Z · double-click · pinch', 'Zoom (Esc resets)'],
      ['1–5', 'Rate'],
      ['B · Shift+F', 'Favorite'],
      ['M', 'Details / metadata'],
      ['C / I', 'Compose / Improve'],
      ['A', 'Toggle compare selection'],
      ['P / G / S', 'Parent / derivatives / sibling'],
      ['D', 'Download'],
      ['Delete', 'Remove (confirm)'],
      ['? · Esc', 'Help / dismiss'],
    ] as const;
    return (
      <div
        className={`absolute inset-x-4 top-16 z-[40] mx-auto max-w-md rounded-2xl border p-4 shadow-[0_20px_60px_rgb(0_0_0/0.45)] backdrop-blur-xl sm:inset-x-auto ${
          compact
            ? 'border-white/20 bg-black/75 text-white'
            : 'border-[var(--border-subtle)] bg-[var(--bg-base)]/95 text-[var(--text-secondary)]'
        }`}
        role="dialog"
        aria-label="Lightbox shortcuts"
      >
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="type-heading text-[15px]">Shortcuts</p>
          <Button
            variant={compact ? 'ghost' : 'secondary'}
            className={chromeBtn(compact)}
            onClick={() => setHelpOpen(false)}
          >
            Close
          </Button>
        </div>
        <ul className="space-y-1.5">
          {rows.map(([keys, label]) => (
            <li key={keys} className="flex items-baseline justify-between gap-4 text-[12px]">
              <span
                className={`font-medium ${compact ? 'text-white' : 'text-[var(--text-primary)]'}`}
              >
                {keys}
              </span>
              <span className={compact ? 'text-white/65' : 'text-[var(--text-muted)]'}>
                {label}
              </span>
            </li>
          ))}
        </ul>
      </div>
    );
  };

  const renderSlideChrome = (compact = false) => (
    <div className="flex flex-wrap items-center gap-1.5">
      {slideChrome?.onRate
        ? ([1, 2, 3, 4, 5] as const).map(rating => (
            <button
              key={rating}
              type="button"
              onClick={() => slideChrome.onRate?.(rating)}
              className={`rounded-md px-1.5 py-0.5 text-[11px] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/50 active:scale-[0.97] ${
                compact
                  ? slideChrome.rating === rating
                    ? 'bg-violet-500/40 text-white ring-white/40'
                    : 'bg-white/10 text-white/75 hover:bg-white/20'
                  : slideChrome.rating === rating
                    ? 'bg-violet-500/25 text-violet-100 ring-violet-400/40'
                    : 'bg-[var(--bg-muted)] text-[var(--text-muted)] hover:bg-[var(--bg-hover)]'
              }`}
            >
              {rating}★
            </button>
          ))
        : null}
      {slideChrome?.onToggleFavorite ? (
        <Button
          variant={compact ? 'ghost' : 'secondary'}
          className={chromeBtn(compact)}
          onClick={() => slideChrome.onToggleFavorite?.()}
        >
          {slideChrome.favorite ? '★ Fav' : '☆ Fav'}
        </Button>
      ) : null}
      {slideChrome?.meta ? (
        <Button
          variant={compact ? 'ghost' : 'secondary'}
          className={chromeBtn(compact)}
          onClick={() => setMetaOpen(previous => !previous)}
          aria-pressed={metaOpen}
        >
          {metaOpen ? 'Hide details' : 'Details'}
        </Button>
      ) : null}
      {slideChrome?.showImprove !== false && slideChrome?.onImprove ? (
        <Button
          variant={compact ? 'ghost' : 'secondary'}
          className={chromeBtn(compact)}
          onClick={() => slideChrome.onImprove?.()}
        >
          Improve
        </Button>
      ) : null}
      {slideChrome?.showCompose !== false && slideChrome?.onCompose ? (
        <Button
          variant={compact ? 'ghost' : 'secondary'}
          className={chromeBtn(compact)}
          onClick={() => slideChrome.onCompose?.()}
        >
          Compose
        </Button>
      ) : null}
      {slideChrome?.showInpaint !== false && slideChrome?.onInpaint ? (
        <Button
          variant={compact ? 'ghost' : 'secondary'}
          className={chromeBtn(compact)}
          onClick={() => slideChrome.onInpaint?.()}
        >
          Inpaint
        </Button>
      ) : null}
      {slideChrome?.showExact && slideChrome?.onExactRequeue ? (
        <Button
          variant={compact ? 'ghost' : 'secondary'}
          className={chromeBtn(compact)}
          onClick={() => slideChrome.onExactRequeue?.()}
        >
          Exact
        </Button>
      ) : null}
      {slideChrome?.showRequeue !== false && slideChrome?.onRequeue ? (
        <Button
          variant={compact ? 'ghost' : 'secondary'}
          className={chromeBtn(compact)}
          onClick={() => slideChrome.onRequeue?.()}
        >
          Requeue
        </Button>
      ) : null}
      {slideChrome?.onAddToCompare ? (
        <Button
          variant={compact ? 'ghost' : 'secondary'}
          className={chromeBtn(compact)}
          onClick={() => slideChrome.onAddToCompare?.()}
          aria-pressed={Boolean(slideChrome.compareSelected)}
        >
          {slideChrome.compareSelected
            ? `In compare${slideChrome.compareCount ? ` (${slideChrome.compareCount})` : ''}`
            : 'Compare'}
        </Button>
      ) : null}
      {slideChrome?.onOpenCompare &&
      (slideChrome.compareCount ?? 0) >= 2 &&
      (slideChrome.compareCount ?? 0) <= 4 ? (
        <Button
          variant={compact ? 'ghost' : 'secondary'}
          className={chromeBtn(compact)}
          onClick={() => slideChrome.onOpenCompare?.()}
        >
          Open compare
        </Button>
      ) : null}
      {slideChrome?.onShowParent ? (
        <Button
          variant={compact ? 'ghost' : 'secondary'}
          className={chromeBtn(compact)}
          onClick={() => slideChrome.onShowParent?.()}
        >
          Parent
        </Button>
      ) : null}
      {slideChrome?.onShowDerivatives ? (
        <Button
          variant={compact ? 'ghost' : 'secondary'}
          className={chromeBtn(compact)}
          onClick={() => slideChrome.onShowDerivatives?.()}
        >
          Derivatives
        </Button>
      ) : null}
      {slideChrome?.onJumpToSibling ? (
        <Button
          variant={compact ? 'ghost' : 'secondary'}
          className={chromeBtn(compact)}
          onClick={() => slideChrome.onJumpToSibling?.()}
        >
          Sibling
        </Button>
      ) : null}
      {slideChrome?.onRemove ? (
        <Button
          variant={compact ? 'ghost' : 'secondary'}
          className={chromeBtn(compact)}
          onClick={() => slideChrome.onRemove?.()}
        >
          Remove
        </Button>
      ) : null}
      {currentMediaKind !== 'video' ? (
        <Button
          variant={compact ? 'ghost' : 'secondary'}
          className={chromeBtn(compact)}
          onClick={toggleZoom}
        >
          {zoom > 1 ? 'Reset zoom' : 'Zoom'}
        </Button>
      ) : null}
      <Button
        variant={compact ? 'ghost' : 'secondary'}
        className={chromeBtn(compact)}
        onClick={() => setHelpOpen(previous => !previous)}
        aria-pressed={helpOpen}
      >
        ?
      </Button>
    </div>
  );

  const renderFilmstrip = (compact = false) =>
    images.length > 1 && state?.thumbImages?.length ? (
      <div
        className={`flex max-w-full gap-1.5 overflow-x-auto pb-0.5 ${
          compact ? 'scrollbar-thin' : ''
        }`}
      >
        {images.map((_, thumbIndex) => {
          const thumb = state.thumbImages?.[thumbIndex];
          if (!thumb) {
            return null;
          }
          const active = thumbIndex === index;
          return (
            <button
              key={`film-${thumbIndex}`}
              type="button"
              onClick={() => goToIndex(thumbIndex, true)}
              className={`relative h-12 w-12 shrink-0 overflow-hidden rounded-md border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/50 ${
                active
                  ? 'border-violet-400/70 ring-1 ring-violet-400/40'
                  : compact
                    ? 'border-white/20 opacity-70 hover:opacity-100'
                    : 'border-[var(--border-subtle)] opacity-80 hover:opacity-100'
              }`}
              aria-label={`Go to image ${thumbIndex + 1}`}
              aria-current={active ? 'true' : undefined}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={thumb} alt="" className="h-full w-full object-cover" loading="lazy" />
            </button>
          );
        })}
      </div>
    ) : null;

  const onStageTouchStart = (event: ReactTouchEvent<HTMLDivElement>) => {
    if (event.touches.length === 2 && (state?.mediaKinds?.[index] ?? 'image') !== 'video') {
      const [a, b] = [event.touches[0], event.touches[1]];
      if (!a || !b) {
        return;
      }
      const distance = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      touchPinchRef.current = { distance, zoom: zoomRef.current };
      dragRef.current = null;
      setDragging(false);
    }
  };

  const onStageTouchMove = (event: ReactTouchEvent<HTMLDivElement>) => {
    const pinch = touchPinchRef.current;
    if (!pinch || event.touches.length !== 2) {
      return;
    }
    event.preventDefault();
    const [a, b] = [event.touches[0], event.touches[1]];
    if (!a || !b) {
      return;
    }
    const distance = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    if (pinch.distance < 8) {
      return;
    }
    applyZoom(pinch.zoom * (distance / pinch.distance));
  };

  const onStageTouchEnd = () => {
    touchPinchRef.current = null;
  };

  const renderImageStage = (stageClassName: string) => (
    <div
      ref={stageRef}
      className={`relative min-h-0 touch-pan-y overflow-hidden ${stageClassName} ${
        zoom > 1 ? 'cursor-grab' : ''
      }`}
      onPointerDown={onStagePointerDown}
      onPointerMove={onStagePointerMove}
      onPointerUp={onStagePointerUp}
      onPointerCancel={onStagePointerUp}
      onTouchStart={onStageTouchStart}
      onTouchMove={onStageTouchMove}
      onTouchEnd={onStageTouchEnd}
      onTouchCancel={onStageTouchEnd}
    >
      <div className="relative flex h-full min-h-0 w-full items-center justify-center">
        {previousIndex !== null && images[previousIndex] ? (
          <>
            {renderSlide(
              images[previousIndex],
              previousMediaKind,
              `absolute inset-0 m-auto flex max-h-full max-w-full items-center justify-center ${exitClass}`,
              'previous-slide',
              { ariaHidden: true }
            )}
            {renderSlide(
              currentUrl,
              currentMediaKind,
              `relative z-[1] ${imageClassName} ${enterClass}`,
              `current-slide-${displayIndex}`,
              {
                isCurrent: true,
                placeholderUrl: currentThumbUrl,
              }
            )}
          </>
        ) : (
          renderSlide(
            currentUrl,
            currentMediaKind,
            `relative ${imageClassName}`,
            `solo-slide-${displayIndex}`,
            {
              isCurrent: true,
              placeholderUrl: currentThumbUrl,
            }
          )
        )}
      </div>

      {isFullscreen && images.length > 1 ? (
        <>
          <button
            type="button"
            className="absolute inset-y-0 left-0 z-20 w-[22%] cursor-w-resize bg-gradient-to-r from-black/35 via-black/10 to-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/40"
            onClick={() => {
              const prevIndex = index > 0 ? index - 1 : slideshow?.playing ? images.length - 1 : 0;
              goToIndex(prevIndex, !slideshow?.playing);
            }}
            aria-label="Previous image"
          />
          <button
            type="button"
            className="absolute inset-y-0 right-0 z-20 w-[22%] cursor-e-resize bg-gradient-to-l from-black/35 via-black/10 to-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/40"
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
            className="absolute left-3 top-1/2 z-20 !min-h-10 -translate-y-1/2 border border-white/30 !bg-[var(--bg-base)]/85 px-3.5 type-caption !text-white shadow-[0_8px_28px_rgb(0_0_0/0.55)] backdrop-blur-md hover:!bg-[var(--bg-muted)]/95 hover:!text-white focus-visible:ring-2 focus-visible:ring-white/40 disabled:!bg-[var(--bg-base)]/40 disabled:!text-white/35"
            disabled={!canGoPrevious || isTransitioning}
            onClick={() => goToIndex(index - 1, true)}
            aria-label="Previous image"
          >
            ← Prev
          </Button>
          <Button
            variant="secondary"
            className="absolute right-3 top-1/2 z-20 !min-h-10 -translate-y-1/2 border border-white/30 !bg-[var(--bg-base)]/85 px-3.5 type-caption !text-white shadow-[0_8px_28px_rgb(0_0_0/0.55)] backdrop-blur-md hover:!bg-[var(--bg-muted)]/95 hover:!text-white focus-visible:ring-2 focus-visible:ring-white/40 disabled:!bg-[var(--bg-base)]/40 disabled:!text-white/35"
            disabled={!canGoNext || isTransitioning}
            onClick={() => goToIndex(index + 1, true)}
            aria-label="Next image"
          >
            Next →
          </Button>
        </>
      ) : null}
    </div>
  );

  const renderSlideshowControls = (compact = false) =>
    slideshowEnabled ? (
      <>
        <Button
          variant={compact ? 'ghost' : 'secondary'}
          className={`${compact ? '!min-h-8 !text-white hover:!bg-white/10' : '!min-h-9'} px-3 type-caption`}
          onClick={() => slideshow?.onPlayingChange(!slideshow.playing)}
        >
          {slideshow?.playing ? 'Pause' : 'Play'}
        </Button>
        {slideshow?.onIntervalChange &&
        slideshow.intervalOptions &&
        slideshow.intervalOptions.length > 0 ? (
          <label
            className={`flex items-center gap-2 type-caption ${compact ? 'text-white/70' : 'text-[var(--text-tertiary)]'}`}
          >
            Every
            <select
              value={slideshow.intervalMs}
              onChange={event => {
                pauseSlideshow();
                slideshow.onIntervalChange?.(Number(event.target.value));
              }}
              className={
                compact
                  ? 'rounded-md border border-white/15 bg-black/40 px-2 py-1 text-white'
                  : 'rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--bg-subtle)] px-2 py-1 text-[var(--text-secondary)]'
              }
            >
              {slideshow.intervalOptions.map(option => (
                <option key={option} value={option}>
                  {formatGallerySlideshowInterval(option)}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {slideshow?.onTransitionChange && transitionOptions.length > 0 ? (
          <label
            className={`flex items-center gap-2 type-caption ${compact ? 'text-white/70' : 'text-[var(--text-tertiary)]'}`}
          >
            Effect
            <select
              value={transition}
              onChange={event => {
                pauseSlideshow();
                slideshow.onTransitionChange?.(event.target.value as GallerySlideshowTransition);
              }}
              className={
                compact
                  ? 'rounded-md border border-white/15 bg-black/40 px-2 py-1 text-white'
                  : 'rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--bg-subtle)] px-2 py-1 text-[var(--text-secondary)]'
              }
            >
              {transitionOptions.map(option => (
                <option key={option} value={option}>
                  {GALLERY_SLIDESHOW_TRANSITION_LABELS[option]}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {slideshow?.onFullscreenChange ? (
          <Button
            variant={compact ? 'ghost' : 'secondary'}
            className={`${compact ? '!min-h-8 !text-white hover:!bg-white/10' : '!min-h-9'} px-3 type-caption`}
            onClick={toggleFullscreenPresentation}
          >
            {isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
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
        aria-label={state?.title ?? 'Fullscreen slideshow'}
        style={
          {
            '--lightbox-transition-duration': `${transitionMs}ms`,
            '--lightbox-image-max-h': '100vh',
          } as CSSProperties
        }
      >
        <div className="pointer-events-none absolute inset-x-0 top-0 z-[3] bg-gradient-to-b from-black/80 via-black/35 to-transparent px-4 pb-10 pt-4 sm:px-6">
          <div className="pointer-events-auto flex items-start justify-between gap-4">
            <div className="min-w-0 space-y-1">
              <p className="type-overline text-white/50">
                {slideshow?.playing ? 'Slideshow' : 'Paused'} · {index + 1} / {images.length}
              </p>
              {currentTitle ? (
                <p
                  key={`${displayIndex}-${currentTitle}`}
                  className={`type-caption line-clamp-2 text-white/80${
                    titleAnimating && transitionMs > 0 ? ' lightbox-title-fade-in' : ''
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

        {renderHelpOverlay(true)}
        {renderImageStage('flex-1 min-h-0')}

        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[3] bg-gradient-to-t from-black/85 via-black/45 to-transparent px-4 pb-4 pt-12 sm:px-6">
          <div className="pointer-events-auto space-y-2">
            {renderMetaPanel(true)}
            {renderFilmstrip(true)}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                {renderSlideshowControls(true)}
                {renderSlideChrome(true)}
              </div>
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
                {onDownloadImage && currentDownloadUrl ? (
                  <Button
                    variant="secondary"
                    className="!min-h-9 px-3 type-caption"
                    onClick={() => void onDownloadImage(displayIndex)}
                  >
                    Download (D)
                  </Button>
                ) : null}
                <p className="type-caption text-white/45">Press ? for shortcuts</p>
              </div>
            </div>
          </div>
        </div>
      </div>,
      document.body
    );
  }

  return createPortal(
    <div
      ref={containerRef}
      className="fixed inset-0 z-[120] flex items-center justify-center p-2 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={state?.title ?? 'Image preview'}
      style={
        {
          '--lightbox-transition-duration': `${transitionMs}ms`,
          '--lightbox-image-max-h': 'calc(96vh - 6.5rem)',
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
        className="relative z-10 flex max-h-[96vh] w-full max-w-[min(98vw,1800px)] flex-col gap-2"
        onClick={event => event.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-4">
          <div className="min-w-0 space-y-1">
            <p className="type-overline text-[var(--text-muted)]">
              {slideshow?.playing ? 'Slideshow' : 'Image preview'}
            </p>
            {currentTitle ? (
              <p
                key={`${displayIndex}-${currentTitle}`}
                className={`type-caption line-clamp-2 text-[var(--text-secondary)]${
                  titleAnimating && transitionMs > 0 ? ' lightbox-title-fade-in' : ''
                }`}
              >
                {currentTitle}
              </p>
            ) : null}
          </div>
          <Button variant="ghost" className="!min-h-9 shrink-0 px-3 type-caption" onClick={onClose}>
            Close
          </Button>
        </div>

        {renderHelpOverlay(false)}

        {renderImageStage(
          'relative flex w-full items-center justify-center overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--bg-elevated)] shadow-[var(--shadow-overlay,0_24px_80px_rgb(0_0_0/0.45))]'
        )}

        {renderMetaPanel(false)}
        {renderFilmstrip(false)}

        <div className="flex shrink-0 flex-col gap-2">
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
              {onDownloadImage && currentDownloadUrl ? (
                <Button
                  variant="secondary"
                  className="!min-h-9 px-3 type-caption focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
                  onClick={() => void onDownloadImage(displayIndex)}
                >
                  Download (D)
                </Button>
              ) : null}
            </div>
          </div>
          {slideChrome || currentMediaKind !== 'video' ? (
            <div className="flex flex-wrap items-center justify-between gap-2">
              {renderSlideChrome(false)}
              <p className="type-caption text-[var(--text-muted)]">Press ? for shortcuts</p>
            </div>
          ) : null}
        </div>
      </div>
    </div>,
    document.body
  );
}
