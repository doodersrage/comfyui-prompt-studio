'use client';

import {
  useCallback,
  useMemo,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/Button';
import ImageLightboxBottomChrome from '@/components/ui/image-lightbox/ImageLightboxBottomChrome';
import ImageLightboxHelpOverlay from '@/components/ui/image-lightbox/ImageLightboxHelpOverlay';
import ImageLightboxImageStage from '@/components/ui/image-lightbox/ImageLightboxImageStage';
import ImageLightboxSideNav from '@/components/ui/image-lightbox/ImageLightboxSideNav';
import { resolveTransitionClasses } from '@/components/ui/image-lightbox/imageLightboxTransitions';
import { useImageLightboxKeyboard } from '@/components/ui/image-lightbox/useImageLightboxKeyboard';
import { useImageLightboxPresentation } from '@/components/ui/image-lightbox/useImageLightboxPresentation';
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
  const presentation = useImageLightboxPresentation({
    state,
    slideshow,
    onIndexChange,
    slideNote: slideChrome?.note,
  });

  const {
    mounted,
    open,
    images,
    index,
    displayIndex,
    previousIndex,
    currentImageLoaded,
    setCurrentImageLoaded,
    metaOpen,
    setMetaOpen,
    helpOpen,
    setHelpOpen,
    copyFlash,
    fitMode,
    setFitMode,
    chromeCompact,
    setChromeCompact,
    actionsOpen,
    setActionsOpen,
    baOpen,
    setBaOpen,
    baPosition,
    setBaPosition,
    dualMode,
    setDualMode,
    dualIndex,
    setDualIndex,
    moreOpen,
    setMoreOpen,
    tutorialVisible,
    setTutorialVisible,
    preferFullRes,
    setPreferFullRes,
    fullResLoading,
    setFullResLoading,
    histogram,
    histogramOpen,
    setHistogramOpen,
    histogramError,
    htmlVideoFailed,
    setHtmlVideoFailed,
    histogramLoading,
    noteDraft,
    setNoteDraft,
    containerRef,
    currentThumbUrl,
    currentOriginalUrl,
    hasDistinctFullRes,
    currentUrl,
    currentDownloadUrl,
    currentTitle,
    canGoPrevious,
    canGoNext,
    slideshowEnabled,
    isFullscreen,
    titleAnimating,
    transition,
    transitionMs,
    transitionOptions,
    pauseSlideshow,
    exitFullscreenPresentation,
    toggleFullscreenPresentation,
    flashCopy,
    loadHistogram,
  } = presentation;

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
      applyZoom(2.4);
      setPan({ x: 0, y: 72 });
    },
    [applyZoom, resetZoom, setPan, setFitMode]
  );

  const slideChromeBar = useMemo(
    () => ({
      chromeCompact,
      actionsOpen,
      metaOpen,
      helpOpen,
      moreOpen,
      baOpen,
      dualMode,
      fitMode,
      histogramOpen,
      preferFullRes,
      fullResLoading,
      hasDistinctFullRes,
      currentMediaKind: presentation.currentKind,
      imagesLength: images.length,
      index,
      onMetaOpenChange: setMetaOpen,
      onActionsOpenChange: setActionsOpen,
      onChromeCompactChange: setChromeCompact,
      onHelpOpenChange: setHelpOpen,
      onMoreOpenChange: setMoreOpen,
      onBaOpenChange: setBaOpen,
      onDualModeChange: setDualMode,
      onDualIndexChange: setDualIndex,
      onFitModeChange: setFitMode,
      onHistogramOpenChange: setHistogramOpen,
      onPreferFullResChange: setPreferFullRes,
      onFullResLoadingChange: setFullResLoading,
      onCurrentImageLoadedChange: setCurrentImageLoaded,
      onLoadHistogram: () => {
        void loadHistogram();
      },
      onApplyZoomPreset: applyZoomPreset,
    }),
    [
      actionsOpen,
      applyZoomPreset,
      baOpen,
      chromeCompact,
      dualMode,
      fitMode,
      fullResLoading,
      hasDistinctFullRes,
      helpOpen,
      histogramOpen,
      images.length,
      index,
      loadHistogram,
      metaOpen,
      moreOpen,
      preferFullRes,
      presentation.currentKind,
      setActionsOpen,
      setBaOpen,
      setChromeCompact,
      setCurrentImageLoaded,
      setDualIndex,
      setDualMode,
      setFitMode,
      setFullResLoading,
      setHelpOpen,
      setHistogramOpen,
      setMetaOpen,
      setMoreOpen,
      setPreferFullRes,
    ]
  );

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

  if (!mounted || !open || !currentUrl || !state) {
    return null;
  }

  const { enter: enterClass, exit: exitClass } = resolveTransitionClasses(
    transition,
    presentation.slideDirection
  );
  const imageClassName = isFullscreen
    ? 'relative flex h-full w-full max-h-[100vh] max-w-[100vw] items-center justify-center'
    : 'relative mx-auto flex h-full max-h-full max-w-full items-center justify-center bg-[var(--bg-subtle)]';
  const currentMediaKind = presentation.currentKind;
  const previousMediaKind =
    previousIndex !== null ? (state.mediaKinds?.[previousIndex] ?? 'image') : 'image';

  const stopStagePointer = (event: ReactPointerEvent<HTMLElement>) => {
    event.stopPropagation();
  };

  const bottomChromeProps = {
    state,
    images,
    index,
    displayIndex,
    dualMode,
    dualIndex,
    onGoToIndex: goToIndex,
    onDualIndexChange: setDualIndex,
    tutorialVisible,
    helpOpen,
    onShowShortcuts: () => setHelpOpen(true),
    onDismissTutorial: () => setTutorialVisible(false),
    slideChrome,
    histogramOpen,
    histogramLoading,
    histogramError,
    histogram,
    onHistogramClose: () => setHistogramOpen(false),
    metaOpen,
    noteDraft,
    onNoteDraftChange: setNoteDraft,
    preferFullRes,
    hasDistinctFullRes,
    fullResLoading,
    copyFlash,
    flashCopy,
    slideshowEnabled,
    slideshow,
    transition,
    transitionOptions,
    isFullscreen,
    onPauseSlideshow: pauseSlideshow,
    onToggleFullscreen: toggleFullscreenPresentation,
    slideChromeBar,
    currentOriginalUrl,
    currentDownloadUrl,
    onDownloadImage,
    currentMediaKind,
    canGoPrevious,
    canGoNext,
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
      mediaKinds={state.mediaKinds}
      thumbImages={state.thumbImages}
      fitMode={fitMode}
      pan={pan}
      dragging={dragging}
      currentTitle={currentTitle}
      baOpen={baOpen}
      baPosition={baPosition}
      slideChrome={slideChrome}
      currentImageLoaded={currentImageLoaded}
      preferFullRes={preferFullRes}
      downloadFilename={state.downloadFilenames?.[displayIndex]}
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
        aria-label={state.title ?? 'Fullscreen slideshow'}
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

        <ImageLightboxBottomChrome compact {...bottomChromeProps} />
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
      aria-label={state.title ?? 'Image preview'}
      data-testid="image-lightbox"
      style={
        {
          '--lightbox-transition-duration': `${transitionMs}ms`,
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

        <ImageLightboxBottomChrome {...bottomChromeProps} />
      </div>
    </div>,
    document.body
  );
}
