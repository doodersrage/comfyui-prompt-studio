'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/Button';
import {
  GALLERY_SLIDESHOW_TRANSITION_OPTIONS,
  resolveGallerySlideshowTransitionMs,
} from '@/lib/comfyui-gallery';
import { scheduleAfterCommit } from '@/lib/schedule-after-commit';
import {
  isStillLightboxKind,
  shouldUseHtmlVideoElement,
  stripGalleryViewWidthParam,
} from '@/lib/comfyui-outputs';
import { prefetchGalleryImageUrl } from '@/lib/gallery-image-prefetch';
import {
  loadGalleryLightboxUiPreferences,
  saveGalleryLightboxUiPreferences,
  type GalleryLightboxFit,
} from '@/lib/gallery-lightbox-prefs';
import { computeLightboxHistogram, type LightboxHistogram } from '@/lib/lightbox-histogram';
import ImageLightboxFilmstrip from '@/components/ui/image-lightbox/ImageLightboxFilmstrip';
import ImageLightboxHelpOverlay from '@/components/ui/image-lightbox/ImageLightboxHelpOverlay';
import ImageLightboxHistogramPanel from '@/components/ui/image-lightbox/ImageLightboxHistogramPanel';
import ImageLightboxImageStage from '@/components/ui/image-lightbox/ImageLightboxImageStage';
import ImageLightboxJobBadge from '@/components/ui/image-lightbox/ImageLightboxJobBadge';
import ImageLightboxMetaPanel from '@/components/ui/image-lightbox/ImageLightboxMetaPanel';
import ImageLightboxSideNav from '@/components/ui/image-lightbox/ImageLightboxSideNav';
import ImageLightboxSlideChromeBar from '@/components/ui/image-lightbox/ImageLightboxSlideChrome';
import ImageLightboxSlideshowControls from '@/components/ui/image-lightbox/ImageLightboxSlideshowControls';
import ImageLightboxTutorialTip from '@/components/ui/image-lightbox/ImageLightboxTutorialTip';
import {
  resolveSlideDirection,
  resolveTransitionClasses,
} from '@/components/ui/image-lightbox/imageLightboxTransitions';
import { useImageLightboxKeyboard } from '@/components/ui/image-lightbox/useImageLightboxKeyboard';
import { useImageLightboxStage } from '@/components/ui/image-lightbox/useImageLightboxStage';
import type {
  ImageLightboxSlideChrome,
  ImageLightboxSlideshowOptions,
  ImageLightboxState,
} from '@/components/ui/image-lightbox/types';

export type {
  ImageLightboxState,
  ImageLightboxSlideshowOptions,
  ImageLightboxSlideMeta,
  ImageLightboxJobChrome,
  ImageLightboxSlideChrome,
} from '@/components/ui/image-lightbox/types';

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
  const [metaOpen, setMetaOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [copyFlash, setCopyFlash] = useState<string | null>(null);
  const [fitMode, setFitMode] = useState<GalleryLightboxFit>('contain');
  const [chromeCompact, setChromeCompact] = useState(true);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [baOpen, setBaOpen] = useState(false);
  const [baPosition, setBaPosition] = useState(50);
  const [dualMode, setDualMode] = useState(false);
  const [dualIndex, setDualIndex] = useState<number | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [tutorialVisible, setTutorialVisible] = useState(false);
  const [preferFullRes, setPreferFullRes] = useState(false);
  const [fullResLoading, setFullResLoading] = useState(false);
  const [histogram, setHistogram] = useState<LightboxHistogram | null>(null);
  const [histogramOpen, setHistogramOpen] = useState(false);
  const [histogramError, setHistogramError] = useState<string | null>(null);
  const [htmlVideoFailed, setHtmlVideoFailed] = useState<Record<string, boolean>>({});
  const [histogramLoading, setHistogramLoading] = useState(false);
  const [noteDraft, setNoteDraft] = useState('');
  const prefsHydratedRef = useRef(false);
  const playlistKeyRef = useRef('');
  const containerRef = useRef<HTMLDivElement>(null);
  const open = Boolean(state && state.images.length > 0);
  const images = useMemo(() => state?.images ?? [], [state?.images]);
  const index = state?.index ?? 0;
  const transition = slideshow?.transition ?? 'slide';
  const transitionMs = resolveGallerySlideshowTransitionMs(transition);
  const midResUrl = images[displayIndex] ?? images[0];
  const currentThumbUrl =
    state?.thumbImages?.[displayIndex] ?? state?.thumbImages?.[0] ?? undefined;
  const currentOriginalUrl = (() => {
    const candidate =
      state?.originalImages?.[displayIndex] ?? state?.originalImages?.[0] ?? midResUrl;
    if (!candidate) {
      return undefined;
    }
    return stripGalleryViewWidthParam(candidate);
  })();
  const hasDistinctFullRes = Boolean(
    currentOriginalUrl && midResUrl && currentOriginalUrl !== midResUrl
  );
  const currentKind = state?.mediaKinds?.[displayIndex] ?? 'image';
  const playInlineVideo = shouldUseHtmlVideoElement(
    currentKind,
    currentOriginalUrl ?? midResUrl ?? ''
  );
  const currentUrl =
    (preferFullRes || playInlineVideo || !isStillLightboxKind(currentKind)) && currentOriginalUrl
      ? currentOriginalUrl
      : (midResUrl ?? '');
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

  const {
    zoom,
    pan,
    dragging,
    stageRef,
    resetZoom,
    applyZoom,
    toggleZoom,
    setPan,
    onStagePointerDown,
    onStagePointerMove,
    onStagePointerUp,
    onStageTouchStart,
    onStageTouchMove,
    onStageTouchEnd,
    goToIndex,
  } = useImageLightboxStage({
    open,
    index,
    imagesLength: images.length,
    mediaKinds: state?.mediaKinds,
    slideshow,
    onIndexChange,
    canGoNext,
    canGoPrevious,
    isFullscreen,
    mounted,
  });

  const applyZoomPreset = useCallback(
    (preset: 'fit' | 'actual' | 'center' | 'face') => {
      if (preset === 'fit') {
        resetZoom();
        setFitMode('contain');
        return;
      }
      if (preset === 'actual') {
        setFitMode('actual');
        applyZoom(1);
        setPan({ x: 0, y: 0 });
        return;
      }
      setFitMode('contain');
      if (preset === 'center') {
        applyZoom(2);
        setPan({ x: 0, y: 0 });
        return;
      }
      // Upper-third “face zone” heuristic — no detector required.
      applyZoom(2.4);
      setPan({ x: 0, y: 72 });
    },
    [applyZoom, resetZoom, setPan]
  );

  const flashCopy = useCallback((label: string) => {
    setCopyFlash(label);
    window.setTimeout(() => {
      setCopyFlash(previous => (previous === label ? null : previous));
    }, 1400);
  }, []);

  const loadHistogram = useCallback(async () => {
    const url = currentOriginalUrl || midResUrl;
    if (!url) {
      return;
    }
    setHistogramOpen(true);
    setHistogramLoading(true);
    setHistogramError(null);
    const result = await computeLightboxHistogram(url);
    setHistogramLoading(false);
    if (!result) {
      setHistogram(null);
      setHistogramError('Could not sample colors (CORS or load failed).');
      return;
    }
    setHistogram(result);
  }, [currentOriginalUrl, midResUrl]);

  useEffect(() => {
    scheduleAfterCommit(() => {
      setMounted(true);
      if (!prefsHydratedRef.current) {
        prefsHydratedRef.current = true;
        const prefs = loadGalleryLightboxUiPreferences();
        setFitMode(prefs.fit);
        setChromeCompact(prefs.chromeCompact);
        setTutorialVisible(!prefs.tutorialSeen);
      }
    });
  }, []);

  useEffect(() => {
    if (!prefsHydratedRef.current) {
      return;
    }
    saveGalleryLightboxUiPreferences({
      fit: fitMode,
      tutorialSeen: !tutorialVisible,
      chromeCompact,
    });
  }, [fitMode, tutorialVisible, chromeCompact]);

  useEffect(() => {
    scheduleAfterCommit(() => {
      setBaOpen(false);
      setBaPosition(50);
      setMoreOpen(false);
      setPreferFullRes(false);
      setFullResLoading(false);
      setHistogram(null);
      setHistogramOpen(false);
      setHistogramError(null);
      if (dualMode && dualIndex === index) {
        setDualIndex(null);
      }
    });
  }, [index, dualMode, dualIndex]);

  useEffect(() => {
    scheduleAfterCommit(() => {
      setNoteDraft(slideChrome?.note ?? '');
    });
  }, [slideChrome?.note, index]);

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

  useImageLightboxKeyboard({
    open,
    index,
    imagesLength: images.length,
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
    mediaKinds: state?.mediaKinds,
    goToIndex,
    helpOpen,
    metaOpen,
    loadHistogram,
    histogramOpen,
    chromeCompact,
    hasDistinctFullRes,
    setHelpOpen,
    setMetaOpen,
    setFitMode,
    setBaOpen,
    setDualMode,
    setDualIndex,
    setHistogramOpen,
    setActionsOpen,
    setChromeCompact,
    setPreferFullRes,
    setFullResLoading,
    setCurrentImageLoaded,
  });

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
    if (current && isStillLightboxKind(state?.mediaKinds?.[index])) {
      prefetchGalleryImageUrl(current);
    }

    const neighborIndexes = [index - 1, index + 1].filter(
      neighbor => neighbor >= 0 && neighbor < images.length
    );
    for (const neighbor of neighborIndexes) {
      const url = images[neighbor];
      if (!url || !isStillLightboxKind(state?.mediaKinds?.[neighbor])) {
        continue;
      }
      prefetchGalleryImageUrl(url);
    }
  }, [open, index, images, state?.mediaKinds]);

  useEffect(() => {
    scheduleAfterCommit(() => setCurrentImageLoaded(false));
  }, [currentUrl]);

  if (!mounted || !open || !currentUrl) {
    return null;
  }

  const { enter: enterClass, exit: exitClass } = resolveTransitionClasses(
    transition,
    slideDirection
  );
  const imageClassName = isFullscreen
    ? 'relative flex h-full w-full max-h-[100vh] max-w-[100vw] items-center justify-center'
    : 'relative mx-auto flex h-full max-h-full max-w-full items-center justify-center bg-[var(--bg-subtle)]';
  const currentMediaKind = currentKind;
  const previousMediaKind =
    previousIndex !== null ? (state?.mediaKinds?.[previousIndex] ?? 'image') : 'image';

  const stopStagePointer = (event: ReactPointerEvent<HTMLElement>) => {
    event.stopPropagation();
  };

  const renderImageStage = (stageClassName: string) => (
    <ImageLightboxImageStage
      stageClassName={stageClassName}
      stageRef={stageRef}
      zoom={zoom}
      onStagePointerDown={onStagePointerDown}
      onStagePointerMove={onStagePointerMove}
      onStagePointerUp={onStagePointerUp}
      onStageTouchStart={onStageTouchStart}
      onStageTouchMove={onStageTouchMove}
      onStageTouchEnd={onStageTouchEnd}
      dualMode={dualMode}
      dualIndex={dualIndex}
      images={images}
      displayIndex={displayIndex}
      currentUrl={currentUrl}
      currentMediaKind={currentMediaKind}
      currentThumbUrl={currentThumbUrl}
      imageClassName={imageClassName}
      previousIndex={previousIndex}
      previousMediaKind={previousMediaKind}
      enterClass={enterClass}
      exitClass={exitClass}
      mediaKinds={state?.mediaKinds}
      thumbImages={state?.thumbImages}
      fitMode={fitMode}
      pan={pan}
      dragging={dragging}
      currentTitle={currentTitle}
      baOpen={baOpen}
      baPosition={baPosition}
      slideChrome={slideChrome}
      currentImageLoaded={currentImageLoaded}
      preferFullRes={preferFullRes}
      downloadFilename={state?.downloadFilenames?.[displayIndex]}
      htmlVideoFailed={htmlVideoFailed}
      onHtmlVideoFailedChange={setHtmlVideoFailed}
      onCurrentImageLoadedChange={setCurrentImageLoaded}
      onFullResLoadingChange={setFullResLoading}
      onBaPositionChange={setBaPosition}
      onStopStagePointer={stopStagePointer}
    />
  );

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

        <ImageLightboxHelpOverlay open={helpOpen} compact onClose={() => setHelpOpen(false)} />
        <div className="relative min-h-0 flex-1">
          {renderImageStage('h-full min-h-0')}
          <ImageLightboxSideNav
            imagesLength={images.length}
            index={index}
            isFullscreen={isFullscreen}
            canGoPrevious={canGoPrevious}
            canGoNext={canGoNext}
            slideshow={slideshow}
            onGoToIndex={goToIndex}
            onStopStagePointer={stopStagePointer}
          />
        </div>

        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[3] bg-gradient-to-t from-black/85 via-black/45 to-transparent px-4 pb-4 pt-12 sm:px-6">
          <div className="pointer-events-auto flex max-h-[min(48vh,30rem)] flex-col gap-2">
            <div className="sticky top-0 z-[1] shrink-0 bg-gradient-to-b from-black/70 to-transparent pb-1">
              {state ? (
                <ImageLightboxFilmstrip
                  compact
                  images={images}
                  index={index}
                  state={state}
                  dualMode={dualMode}
                  dualIndex={dualIndex}
                  onGoToIndex={goToIndex}
                  onDualIndexChange={setDualIndex}
                />
              ) : null}
            </div>
            <div className="min-h-0 space-y-2 overflow-y-auto overscroll-contain [scrollbar-gutter:stable]">
              <ImageLightboxTutorialTip
                compact
                tutorialVisible={tutorialVisible}
                helpOpen={helpOpen}
                onShowShortcuts={() => setHelpOpen(true)}
                onDismiss={() => setTutorialVisible(false)}
              />
              <ImageLightboxJobBadge compact job={slideChrome?.job} />
              <ImageLightboxHistogramPanel
                compact
                histogramOpen={histogramOpen}
                histogramLoading={histogramLoading}
                histogramError={histogramError}
                histogram={histogram}
                onClose={() => setHistogramOpen(false)}
              />
              <ImageLightboxMetaPanel
                compact
                metaOpen={metaOpen}
                meta={slideChrome?.meta}
                onNoteChange={slideChrome?.onNoteChange}
                onCopyPrompt={slideChrome?.onCopyPrompt}
                onCopyNegative={slideChrome?.onCopyNegative}
                note={slideChrome?.note}
                noteDraft={noteDraft}
                onNoteDraftChange={setNoteDraft}
                preferFullRes={preferFullRes}
                hasDistinctFullRes={hasDistinctFullRes}
                fullResLoading={fullResLoading}
                copyFlash={copyFlash}
                flashCopy={flashCopy}
              />
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <ImageLightboxSlideshowControls
                    compact
                    slideshowEnabled={slideshowEnabled}
                    slideshow={slideshow}
                    transition={transition}
                    transitionOptions={transitionOptions}
                    isFullscreen={isFullscreen}
                    onPauseSlideshow={pauseSlideshow}
                    onToggleFullscreen={toggleFullscreenPresentation}
                  />
                  {/* Zoom presets touch zoomRef inside click handlers only. */}
                  {}
                  <ImageLightboxSlideChromeBar
                    compact
                    slideChrome={slideChrome}
                    chromeCompact={chromeCompact}
                    actionsOpen={actionsOpen}
                    metaOpen={metaOpen}
                    helpOpen={helpOpen}
                    moreOpen={moreOpen}
                    baOpen={baOpen}
                    dualMode={dualMode}
                    fitMode={fitMode}
                    histogramOpen={histogramOpen}
                    preferFullRes={preferFullRes}
                    fullResLoading={fullResLoading}
                    hasDistinctFullRes={hasDistinctFullRes}
                    currentMediaKind={currentMediaKind}
                    imagesLength={images.length}
                    index={index}
                    onMetaOpenChange={setMetaOpen}
                    onActionsOpenChange={setActionsOpen}
                    onChromeCompactChange={setChromeCompact}
                    onHelpOpenChange={setHelpOpen}
                    onMoreOpenChange={setMoreOpen}
                    onBaOpenChange={setBaOpen}
                    onDualModeChange={setDualMode}
                    onDualIndexChange={setDualIndex}
                    onFitModeChange={setFitMode}
                    onHistogramOpenChange={setHistogramOpen}
                    onPreferFullResChange={setPreferFullRes}
                    onFullResLoadingChange={setFullResLoading}
                    onCurrentImageLoadedChange={setCurrentImageLoaded}
                    onLoadHistogram={() => {
                      void loadHistogram();
                    }}
                    onApplyZoomPreset={applyZoomPreset}
                  />
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
      data-testid="image-lightbox"
      style={
        {
          '--lightbox-transition-duration': `${transitionMs}ms`,
          // Stage is flex-sized; image fills remaining space above chrome.
          '--lightbox-image-max-h': '100%',
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
        className="relative z-10 flex h-[min(96vh,100%)] max-h-[96vh] w-full max-w-[min(98vw,1800px)] flex-col gap-2 overflow-hidden"
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
          <Button
            variant="ghost"
            className="!min-h-9 shrink-0 px-3 type-caption"
            onClick={onClose}
            aria-label="Close"
          >
            Close
          </Button>
        </div>

        <ImageLightboxHelpOverlay open={helpOpen} onClose={() => setHelpOpen(false)} />

        <div className="relative min-h-0 w-full flex-1">
          {renderImageStage(
            'relative flex h-full min-h-0 w-full items-center justify-center overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--bg-elevated)] shadow-[var(--shadow-overlay,0_24px_80px_rgb(0_0_0/0.45))]'
          )}
          <ImageLightboxSideNav
            imagesLength={images.length}
            index={index}
            isFullscreen={isFullscreen}
            canGoPrevious={canGoPrevious}
            canGoNext={canGoNext}
            slideshow={slideshow}
            onGoToIndex={goToIndex}
            onStopStagePointer={stopStagePointer}
          />
        </div>

        <div className="flex max-h-[min(46vh,28rem)] shrink-0 flex-col gap-2 pb-0.5">
          <div className="sticky top-0 z-[1] shrink-0 border-b border-[var(--border-subtle)]/50 bg-[var(--bg-base)]/90 pb-1.5 backdrop-blur-md">
            {state ? (
              <ImageLightboxFilmstrip
                images={images}
                index={index}
                state={state}
                dualMode={dualMode}
                dualIndex={dualIndex}
                onGoToIndex={goToIndex}
                onDualIndexChange={setDualIndex}
              />
            ) : null}
          </div>
          <div className="flex min-h-0 flex-col gap-2 overflow-y-auto overscroll-contain [scrollbar-gutter:stable]">
            <ImageLightboxTutorialTip
              tutorialVisible={tutorialVisible}
              helpOpen={helpOpen}
              onShowShortcuts={() => setHelpOpen(true)}
              onDismiss={() => setTutorialVisible(false)}
            />
            <ImageLightboxJobBadge job={slideChrome?.job} />
            <ImageLightboxHistogramPanel
              histogramOpen={histogramOpen}
              histogramLoading={histogramLoading}
              histogramError={histogramError}
              histogram={histogram}
              onClose={() => setHistogramOpen(false)}
            />
            <ImageLightboxMetaPanel
              metaOpen={metaOpen}
              meta={slideChrome?.meta}
              onNoteChange={slideChrome?.onNoteChange}
              onCopyPrompt={slideChrome?.onCopyPrompt}
              onCopyNegative={slideChrome?.onCopyNegative}
              note={slideChrome?.note}
              noteDraft={noteDraft}
              onNoteDraftChange={setNoteDraft}
              preferFullRes={preferFullRes}
              hasDistinctFullRes={hasDistinctFullRes}
              fullResLoading={fullResLoading}
              copyFlash={copyFlash}
              flashCopy={flashCopy}
            />

            <div className="flex shrink-0 flex-col gap-2">
              <div className="flex flex-wrap items-center justify-between gap-3">
                {images.length > 1 ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <ImageLightboxSlideshowControls
                      slideshowEnabled={slideshowEnabled}
                      slideshow={slideshow}
                      transition={transition}
                      transitionOptions={transitionOptions}
                      isFullscreen={isFullscreen}
                      onPauseSlideshow={pauseSlideshow}
                      onToggleFullscreen={toggleFullscreenPresentation}
                    />
                    <Button
                      variant="secondary"
                      className="!min-h-9 px-3 type-caption"
                      disabled={!canGoPrevious}
                      onClick={() => goToIndex(index - 1, true)}
                    >
                      Previous
                    </Button>
                    <p className="type-caption text-[var(--text-tertiary)]">
                      Image {index + 1} of {images.length}
                      {dualMode && dualIndex != null ? ` · pair ${dualIndex + 1}` : ''}
                      {preferFullRes ? ' · full-res' : ''}
                      {fullResLoading ? ' · loading…' : ''}
                    </p>
                    <Button
                      variant="secondary"
                      className="!min-h-9 px-3 type-caption"
                      disabled={!canGoNext}
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
              {slideChrome || isStillLightboxKind(currentMediaKind) ? (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  {}
                  <ImageLightboxSlideChromeBar
                    slideChrome={slideChrome}
                    chromeCompact={chromeCompact}
                    actionsOpen={actionsOpen}
                    metaOpen={metaOpen}
                    helpOpen={helpOpen}
                    moreOpen={moreOpen}
                    baOpen={baOpen}
                    dualMode={dualMode}
                    fitMode={fitMode}
                    histogramOpen={histogramOpen}
                    preferFullRes={preferFullRes}
                    fullResLoading={fullResLoading}
                    hasDistinctFullRes={hasDistinctFullRes}
                    currentMediaKind={currentMediaKind}
                    imagesLength={images.length}
                    index={index}
                    onMetaOpenChange={setMetaOpen}
                    onActionsOpenChange={setActionsOpen}
                    onChromeCompactChange={setChromeCompact}
                    onHelpOpenChange={setHelpOpen}
                    onMoreOpenChange={setMoreOpen}
                    onBaOpenChange={setBaOpen}
                    onDualModeChange={setDualMode}
                    onDualIndexChange={setDualIndex}
                    onFitModeChange={setFitMode}
                    onHistogramOpenChange={setHistogramOpen}
                    onPreferFullResChange={setPreferFullRes}
                    onFullResLoadingChange={setFullResLoading}
                    onCurrentImageLoadedChange={setCurrentImageLoaded}
                    onLoadHistogram={() => {
                      void loadHistogram();
                    }}
                    onApplyZoomPreset={applyZoomPreset}
                  />
                  <p className="type-caption text-[var(--text-muted)]">Press ? for shortcuts</p>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
