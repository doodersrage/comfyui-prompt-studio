import Link from 'next/link';
import type { AppRouterInstance } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import {
  buildGalleryHandoff,
  buildReeditGalleryHandoff,
  galleryHandoffPath,
  saveGalleryHandoff,
} from '@/lib/gallery-handoff';
import {
  startAnatomyRepairFromGalleryEntry,
  startBackgroundFromGalleryEntry,
  startImproveFromGalleryEntry,
  startInpaintFromGalleryEntry,
  startMeshFromGalleryEntry,
  startOutpaintFromGalleryEntry,
} from '@/lib/improve-output';
import {
  galleryVariationsPath,
  prepareGalleryVariationsFromEntry,
} from '@/lib/gallery-variations-handoff';
import { downloadGalleryImage, downloadGallerySidecar } from '@/lib/comfyui-gallery-export';
import { galleryDownloadActionLabel } from '@/lib/comfyui-outputs';
import { studioHistoryUrl } from '@/lib/prompt-lineage';
import type { ComfyGalleryEntry, GalleryLayoutMode } from '@/lib/comfyui-gallery';
import {
  applyGalleryPromptAndStackToSession,
  applyGalleryStackToSession,
  galleryEntryCanSaveLook,
  galleryEntryHasRestorableStack,
  saveGalleryLookFromEntry,
} from '@/lib/gallery-stack-restore';
import { applyGalleryFaceToSession, galleryEntryCanLockFace } from '@/lib/gallery-identity-lock';
import { galleryToolHref, galleryToolLabel } from '@/lib/gallery-tool-href';
import { continueClipActionLabel } from '@/lib/video-clip-mode';
import { loadEngineSettings } from '@/lib/engine-settings';
import { isCloudEngine } from '@/lib/engine/capabilities';
import { GalleryMenuButton, GalleryMenuGroup } from '@/components/gallery/GalleryMenuPrimitives';
import type { RefObject } from 'react';

export type GalleryCardMenuProps = {
  entry: ComfyGalleryEntry;
  layout: GalleryLayoutMode;
  previewUrl: string | null;
  primaryMediaKind: ReturnType<typeof import('@/lib/comfyui-gallery').galleryEntryPrimaryMediaKind>;
  isVideoHero: boolean;
  comfyHostLabel: string | null;
  menuOpen: boolean;
  menuPosition: { top: number; left: number; maxHeight: number } | null;
  menuButtonRef: RefObject<HTMLButtonElement | null>;
  menuPanelRef: RefObject<HTMLDivElement | null>;
  setMenuOpen: (open: boolean) => void;
  setMenuPosition: (position: { top: number; left: number; maxHeight: number } | null) => void;
  onDownloadError: (message: string | null) => void;
  onRequeue: (
    newSeed: boolean,
    qualityProfile?: import('@/lib/queue-quality-profile').QueueQualityProfile,
    options?: { exactGraph?: boolean; stickyHost?: boolean }
  ) => void;
  onCancel: () => void;
  onUpscale: (qualityProfile: 'final' | 'max', options?: { force?: boolean }) => void;
  onRefine: () => void;
  onSoftSecondPass?: () => void;
  onFaceDetail?: () => void;
  onAnatomyRepair?: () => void;
  onMoireClean?: (qualityProfile: 'final' | 'max', options?: { force?: boolean }) => void;
  showUpscaleActions?: boolean;
  showUpscaleFinal?: boolean;
  showUpscaleMax?: boolean;
  showForceUpscaleMax?: boolean;
  showRefineAction?: boolean;
  showSoftSecondPassAction?: boolean;
  showFaceDetailAction?: boolean;
  showAnatomyRepairAction?: boolean;
  showMoireCleanActions?: boolean;
  showMoireCleanFinal?: boolean;
  showMoireCleanMax?: boolean;
  showForceMoireCleanMax?: boolean;
  onShowDerivatives?: () => void;
  hasDerivatives?: boolean;
  onViewWorkflow?: () => void;
  onRestoreExactGraph?: () => void;
  onRemove: () => void;
};

export type GalleryCardMenuSectionProps = Pick<
  GalleryCardMenuProps,
  | 'entry'
  | 'layout'
  | 'previewUrl'
  | 'primaryMediaKind'
  | 'isVideoHero'
  | 'comfyHostLabel'
  | 'onDownloadError'
  | 'onRequeue'
  | 'onCancel'
  | 'onUpscale'
  | 'onRefine'
  | 'onSoftSecondPass'
  | 'onFaceDetail'
  | 'onAnatomyRepair'
  | 'onMoireClean'
  | 'showUpscaleActions'
  | 'showUpscaleFinal'
  | 'showUpscaleMax'
  | 'showForceUpscaleMax'
  | 'showRefineAction'
  | 'showSoftSecondPassAction'
  | 'showFaceDetailAction'
  | 'showAnatomyRepairAction'
  | 'showMoireCleanActions'
  | 'showMoireCleanFinal'
  | 'showMoireCleanMax'
  | 'showForceMoireCleanMax'
  | 'onShowDerivatives'
  | 'hasDerivatives'
  | 'onViewWorkflow'
  | 'onRestoreExactGraph'
  | 'onRemove'
> & {
  router: AppRouterInstance;
  setMenuOpen: (open: boolean) => void;
};

export function GalleryExportSection({
  entry,
  previewUrl,
  primaryMediaKind,
  onDownloadError,
  onViewWorkflow,
  setMenuOpen,
}: GalleryCardMenuSectionProps) {
  return (
    <GalleryMenuGroup label="Export">
      <GalleryMenuButton
        label="Copy prompt"
        onClick={() => {
          void navigator.clipboard.writeText(entry.prompt).catch(() => {
            onDownloadError('Could not copy prompt.');
          });
          setMenuOpen(false);
        }}
      />
      {entry.status === 'completed' && previewUrl ? (
        <GalleryMenuButton
          label={galleryDownloadActionLabel(primaryMediaKind)}
          onClick={() => {
            onDownloadError(null);
            void downloadGalleryImage(entry).catch(error => {
              onDownloadError(error instanceof Error ? error.message : 'Download failed.');
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
          className="block rounded-lg px-3 py-2 text-xs text-[var(--tint-info-text)] transition hover:bg-[var(--bg-muted)] hover:text-[var(--tint-info-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)] active:bg-[var(--bg-muted)]/80"
          onClick={() => setMenuOpen(false)}
        >
          Studio history
        </Link>
      ) : null}
    </GalleryMenuGroup>
  );
}

export function GalleryEditSection({
  entry,
  layout,
  previewUrl,
  primaryMediaKind,
  isVideoHero,
  showAnatomyRepairAction,
  onAnatomyRepair,
  router,
  setMenuOpen,
}: GalleryCardMenuSectionProps) {
  if (!(entry.status === 'completed' && entry.prompt?.trim())) {
    return null;
  }

  return (
    <GalleryMenuGroup label="Edit">
      <GalleryMenuButton
        label="Edit prompt"
        onClick={() => {
          saveGalleryHandoff(buildGalleryHandoff(entry, 'promptEditor'));
          router.push(galleryHandoffPath('promptEditor'));
          setMenuOpen(false);
        }}
      />
      {previewUrl ? (
        <>
          {layout === 'list' ? (
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
              {showAnatomyRepairAction ? (
                <GalleryMenuButton
                  label="Anatomy repair"
                  onClick={() => {
                    if (onAnatomyRepair) {
                      onAnatomyRepair();
                    } else {
                      startAnatomyRepairFromGalleryEntry(entry);
                    }
                    setMenuOpen(false);
                  }}
                />
              ) : null}
              <GalleryMenuButton
                label="Outpaint"
                onClick={() => {
                  startOutpaintFromGalleryEntry(entry);
                  setMenuOpen(false);
                }}
              />
            </>
          ) : null}
          <GalleryMenuButton
            label="Refine"
            onClick={() => {
              saveGalleryHandoff(buildGalleryHandoff(entry, 'refine'));
              router.push(galleryHandoffPath('refine'));
              setMenuOpen(false);
            }}
          />
          {primaryMediaKind === 'image' && previewUrl && showAnatomyRepairAction ? (
            <GalleryMenuButton
              label="Anatomy repair → inpaint limb"
              onClick={() => {
                if (onAnatomyRepair) {
                  onAnatomyRepair();
                } else {
                  startAnatomyRepairFromGalleryEntry(entry);
                }
                setMenuOpen(false);
              }}
            />
          ) : null}
          <GalleryMenuButton
            label="Re-edit · Refine (same stack)"
            onClick={() => {
              saveGalleryHandoff(buildReeditGalleryHandoff(entry, 'refine'));
              router.push(galleryHandoffPath('refine'));
              setMenuOpen(false);
            }}
          />
          {entry.status === 'completed' ? (
            <GalleryMenuButton
              label="Re-edit · Inpaint (same stack)"
              onClick={() => {
                saveGalleryHandoff(buildReeditGalleryHandoff(entry, 'inpaint'));
                router.push(galleryHandoffPath('inpaint'));
                setMenuOpen(false);
              }}
            />
          ) : null}
          {entry.status === 'completed' ? (
            <GalleryMenuButton
              label="Re-edit · Outpaint (same stack)"
              onClick={() => {
                saveGalleryHandoff(buildReeditGalleryHandoff(entry, 'outpaint'));
                router.push(galleryHandoffPath('outpaint'));
                setMenuOpen(false);
              }}
            />
          ) : null}
          <GalleryMenuButton
            label="Open in Variations"
            onClick={() => {
              prepareGalleryVariationsFromEntry(entry);
              router.push(galleryVariationsPath());
              setMenuOpen(false);
            }}
          />
          <GalleryMenuButton
            label="Compose"
            onClick={() => {
              saveGalleryHandoff(buildGalleryHandoff(entry, 'compose'));
              router.push(galleryHandoffPath('compose'));
              setMenuOpen(false);
            }}
          />
          <GalleryMenuButton
            label="Re-edit · Compose (same stack)"
            onClick={() => {
              saveGalleryHandoff(buildReeditGalleryHandoff(entry, 'compose'));
              router.push(galleryHandoffPath('compose'));
              setMenuOpen(false);
            }}
          />
          {layout !== 'list' ? (
            <GalleryMenuButton
              label="Outpaint"
              onClick={() => {
                startOutpaintFromGalleryEntry(entry);
                setMenuOpen(false);
              }}
            />
          ) : null}
          <GalleryMenuButton
            label="Image → Prompt"
            onClick={() => {
              saveGalleryHandoff(buildGalleryHandoff(entry, 'imagePrompt'));
              router.push(galleryHandoffPath('imagePrompt'));
              setMenuOpen(false);
            }}
          />
          <GalleryMenuButton
            label="ControlNet"
            onClick={() => {
              saveGalleryHandoff(buildGalleryHandoff(entry, 'controlnet'));
              router.push(galleryHandoffPath('controlnet'));
              setMenuOpen(false);
            }}
          />
          {entry.status === 'completed' ? (
            <GalleryMenuButton
              label="Re-edit · ControlNet (same stack)"
              onClick={() => {
                saveGalleryHandoff(buildReeditGalleryHandoff(entry, 'controlnet'));
                router.push(galleryHandoffPath('controlnet'));
                setMenuOpen(false);
              }}
            />
          ) : null}
          <GalleryMenuButton
            label="Background"
            onClick={() => {
              startBackgroundFromGalleryEntry(entry);
              setMenuOpen(false);
            }}
          />
          {primaryMediaKind === 'image' && entry.status === 'completed' ? (
            <GalleryMenuButton
              label="Mesh / 3D"
              onClick={() => {
                startMeshFromGalleryEntry(entry);
                setMenuOpen(false);
              }}
            />
          ) : null}
          {primaryMediaKind === 'image' && entry.status === 'completed' ? (
            <GalleryMenuButton
              label="Animate this still"
              onClick={() => {
                saveGalleryHandoff(buildGalleryHandoff(entry, 'video'));
                router.push(galleryHandoffPath('video'));
                setMenuOpen(false);
              }}
            />
          ) : null}
          {entry.derivedKind === 'film' && entry.characterId && entry.status === 'completed' ? (
            <GalleryMenuButton
              label="Open film on character"
              onClick={() => {
                const characterId = entry.characterId?.trim();
                if (!characterId) {
                  return;
                }
                router.push(`/characters/${encodeURIComponent(characterId)}`);
                setMenuOpen(false);
              }}
            />
          ) : null}
          {(isVideoHero || entry.derivedKind === 'i2v' || entry.derivedKind === 'extend') &&
          entry.derivedKind !== 'film' &&
          entry.status === 'completed' ? (
            <GalleryMenuButton
              label={continueClipActionLabel({
                parentUrl: previewUrl,
                engine: loadEngineSettings().engine,
              })}
              onClick={() => {
                saveGalleryHandoff(buildGalleryHandoff(entry, 'video'));
                router.push(galleryHandoffPath('video'));
                setMenuOpen(false);
              }}
            />
          ) : null}
          {entry.status === 'completed' ? (
            <GalleryMenuButton
              label="Re-edit · Video (same stack)"
              onClick={() => {
                saveGalleryHandoff(buildReeditGalleryHandoff(entry, 'video'));
                router.push(galleryHandoffPath('video'));
                setMenuOpen(false);
              }}
            />
          ) : null}
        </>
      ) : null}
    </GalleryMenuGroup>
  );
}

export function GalleryQueueSection({
  entry,
  comfyHostLabel,
  onCancel,
  onRequeue,
  onRestoreExactGraph,
  router,
  setMenuOpen,
}: GalleryCardMenuSectionProps) {
  return (
    <GalleryMenuGroup label="Queue">
      {entry.status === 'pending' || entry.status === 'running' ? (
        <GalleryMenuButton
          label="Cancel job"
          tone="danger"
          onClick={() => {
            onCancel();
            setMenuOpen(false);
          }}
        />
      ) : null}
      {galleryEntryHasRestorableStack(entry) ? (
        <GalleryMenuButton
          label={`Use this stack on ${galleryToolLabel(entry.tool)}`}
          data-testid="gallery-use-stack-menu"
          onClick={() => {
            applyGalleryStackToSession(entry);
            router.push(galleryToolHref(entry.tool));
            setMenuOpen(false);
          }}
        />
      ) : null}
      {galleryEntryHasRestorableStack(entry) && entry.prompt?.trim() ? (
        <GalleryMenuButton
          label={`Prompt + stack on ${galleryToolLabel(entry.tool)}`}
          data-testid="gallery-use-prompt-stack-menu"
          onClick={() => {
            applyGalleryPromptAndStackToSession(entry);
            router.push(galleryToolHref(entry.tool));
            setMenuOpen(false);
          }}
        />
      ) : null}
      {galleryEntryCanLockFace(entry) ? (
        <GalleryMenuButton
          label={`${
            isCloudEngine(loadEngineSettings().engine) ? 'Use as reference on' : 'Lock this face on'
          } ${galleryToolLabel(entry.tool)}`}
          data-testid="gallery-lock-face-menu"
          onClick={() => {
            void applyGalleryFaceToSession(entry).then(result => {
              if (result.ok) {
                router.push(galleryToolHref(entry.tool));
              }
            });
            setMenuOpen(false);
          }}
        />
      ) : null}
      {galleryEntryCanSaveLook(entry) ? (
        <GalleryMenuButton
          label="Save look from this still"
          data-testid="gallery-save-look-menu"
          onClick={() => {
            saveGalleryLookFromEntry(entry);
            setMenuOpen(false);
          }}
        />
      ) : null}
      {entry.hasStoredWorkflow || entry.workflowJson ? (
        <GalleryMenuButton
          label="Replay exact graph"
          data-testid="gallery-replay-exact"
          onClick={() => {
            onRequeue(false, undefined, { exactGraph: true });
            setMenuOpen(false);
          }}
        />
      ) : entry.promptId?.trim() && onRestoreExactGraph ? (
        <GalleryMenuButton
          label="Restore exact graph from Comfy history"
          data-testid="gallery-restore-exact"
          onClick={() => {
            onRestoreExactGraph();
            setMenuOpen(false);
          }}
        />
      ) : null}
      <GalleryMenuButton
        label="Re-queue (same seed)"
        onClick={() => {
          onRequeue(false, undefined, { exactGraph: false });
          setMenuOpen(false);
        }}
      />
      {entry.comfyUrl?.trim() ? (
        <GalleryMenuButton
          label={`Retry on this host (${comfyHostLabel ?? entry.comfyUrl})`}
          onClick={() => {
            onRequeue(false, undefined, {
              exactGraph: Boolean(entry.hasStoredWorkflow || entry.workflowJson),
              stickyHost: true,
            });
            setMenuOpen(false);
          }}
        />
      ) : null}
      <GalleryMenuButton
        label="New seed"
        onClick={() => {
          onRequeue(true, undefined, { exactGraph: false });
          setMenuOpen(false);
        }}
      />
      <GalleryMenuButton
        label="Variation · Good (hires sampler)"
        onClick={() => {
          onRequeue(true, 'final', { exactGraph: false });
          setMenuOpen(false);
        }}
      />
      <GalleryMenuButton
        label="Variation · Best (heavy polish)"
        onClick={() => {
          onRequeue(true, 'max', { exactGraph: false });
          setMenuOpen(false);
        }}
      />
    </GalleryMenuGroup>
  );
}

export function GalleryEnhanceSection({
  onUpscale,
  onRefine,
  onSoftSecondPass,
  onFaceDetail,
  onMoireClean,
  showUpscaleActions = true,
  showUpscaleFinal,
  showUpscaleMax,
  showForceUpscaleMax = false,
  showRefineAction = true,
  showSoftSecondPassAction = true,
  showFaceDetailAction = false,
  showMoireCleanActions = true,
  showMoireCleanFinal,
  showMoireCleanMax,
  showForceMoireCleanMax = false,
  setMenuOpen,
}: GalleryCardMenuSectionProps) {
  const canUpscaleFinal = showUpscaleFinal ?? showUpscaleActions;
  const canUpscaleMax = showUpscaleMax ?? showUpscaleActions;
  const canMoireFinal = showMoireCleanFinal ?? showMoireCleanActions;
  const canMoireMax = showMoireCleanMax ?? showMoireCleanActions;

  const shouldShowUpscaleFinal = canUpscaleFinal;
  const shouldShowUpscaleMax = canUpscaleMax;
  const shouldShowForceUpscaleMax = showForceUpscaleMax;
  const shouldShowSoftSecondPass = onSoftSecondPass && showSoftSecondPassAction;
  const shouldShowRefine = showRefineAction;
  const shouldShowFaceDetail = onFaceDetail && showFaceDetailAction;
  const shouldShowMoireFinal = onMoireClean && canMoireFinal;
  const shouldShowMoireMax = onMoireClean && canMoireMax;
  const shouldShowForceMoireCleanMax = onMoireClean && showForceMoireCleanMax;

  const hasEnhanceActions =
    shouldShowUpscaleFinal ||
    shouldShowUpscaleMax ||
    shouldShowForceUpscaleMax ||
    shouldShowSoftSecondPass ||
    shouldShowRefine ||
    shouldShowFaceDetail ||
    shouldShowMoireFinal ||
    shouldShowMoireMax ||
    shouldShowForceMoireCleanMax;

  if (!hasEnhanceActions) {
    return null;
  }

  return (
    <GalleryMenuGroup label="Enhance">
      {shouldShowUpscaleFinal ? (
        <GalleryMenuButton
          label="Upscale → Good (~1.25× Lanczos)"
          onClick={() => {
            onUpscale('final');
            setMenuOpen(false);
          }}
        />
      ) : null}
      {shouldShowUpscaleMax ? (
        <GalleryMenuButton
          label="Upscale → Best (full pipeline)"
          onClick={() => {
            onUpscale('max');
            setMenuOpen(false);
          }}
        />
      ) : null}
      {shouldShowForceUpscaleMax ? (
        <GalleryMenuButton
          label="Force Upscale · Best"
          onClick={() => {
            onUpscale('max', { force: true });
            setMenuOpen(false);
          }}
        />
      ) : null}
      {shouldShowRefine ? (
        <GalleryMenuButton
          label="Refine → low-denoise second pass"
          onClick={() => {
            onRefine();
            setMenuOpen(false);
          }}
        />
      ) : null}
      {shouldShowSoftSecondPass ? (
        <GalleryMenuButton
          label="Soft second pass → gentler denoise"
          onClick={() => {
            onSoftSecondPass();
            setMenuOpen(false);
          }}
        />
      ) : null}
      {shouldShowFaceDetail ? (
        <GalleryMenuButton
          label="Face detail → second KSampler pass"
          onClick={() => {
            onFaceDetail();
            setMenuOpen(false);
          }}
        />
      ) : null}
      {shouldShowMoireFinal ? (
        <GalleryMenuButton
          label="Flux polish → Good (blur only)"
          onClick={() => {
            onMoireClean('final');
            setMenuOpen(false);
          }}
        />
      ) : null}
      {shouldShowMoireMax ? (
        <GalleryMenuButton
          label="Flux polish → Best (blur + resample)"
          onClick={() => {
            onMoireClean('max');
            setMenuOpen(false);
          }}
        />
      ) : null}
      {shouldShowForceMoireCleanMax ? (
        <GalleryMenuButton
          label="Force Flux polish → Best"
          onClick={() => {
            onMoireClean('max', { force: true });
            setMenuOpen(false);
          }}
        />
      ) : null}
    </GalleryMenuGroup>
  );
}

export function GalleryLineageSection({
  hasDerivatives,
  onShowDerivatives,
  setMenuOpen,
}: GalleryCardMenuSectionProps) {
  if (!hasDerivatives || !onShowDerivatives) {
    return null;
  }

  return (
    <GalleryMenuGroup label="Lineage">
      <GalleryMenuButton
        label="Show derivatives"
        onClick={() => {
          onShowDerivatives();
          setMenuOpen(false);
        }}
      />
    </GalleryMenuGroup>
  );
}

export function GalleryManageSection({ onRemove, setMenuOpen }: GalleryCardMenuSectionProps) {
  return (
    <GalleryMenuGroup label="Manage">
      <GalleryMenuButton
        label="Remove from gallery"
        tone="danger"
        onClick={() => {
          onRemove();
          setMenuOpen(false);
        }}
      />
    </GalleryMenuGroup>
  );
}
