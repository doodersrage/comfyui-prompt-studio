'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useCachedSettings } from '@/hooks/useCachedSettings';
import { useSeedToolDraft } from '@/hooks/useSeedToolDraft';
import { useGalleryHandoff } from '@/hooks/useGalleryHandoff';
import { usePromptResultActions } from '@/hooks/usePromptResultActions';
import type { ComfyImageModel } from '@/lib/comfy-models/client';
import type { WorkflowParamValues } from '@/lib/comfyui-config';
import { getComfyModelDefinition } from '@/lib/comfy-models/client';
import {
  isComposeCapableModel,
  isBooguEditModel,
  isFluxKleinModel,
  isQwenEditModel,
  isZImageModel,
} from '@/lib/model-denoise-defaults';
import { normalizeTurboEditStrength } from '@/lib/turbo-edit-strength';
import { getReformatTargetModel } from '@/lib/reformat-target';
import {
  buildComposeInstruction,
  COMPOSE_DEFAULT_MODEL,
  COMPOSE_MODIFY_TEMPLATE_GROUPS,
  COMPOSE_TRANSFER_TEMPLATE_GROUPS,
  isAggressiveComposeInstruction,
  type ComposeMode,
  type ComposeStarterTemplate,
} from '@/lib/compose-prompt';
import {
  DEFAULT_COMPOSE_IDENTITY_LOCK_STRENGTH,
  formatComposeIdentityLockHint,
  formatKleinEnhancerComposeHint,
  formatKleinEnhancerIdentityHint,
  normalizeComposeIdentityKind,
  normalizeComposeIdentityLockStrength,
} from '@/lib/compose-identity-lock';
import { createDefaultRegionalSlots } from '@/lib/regional-prompt-slots';
import { regionalSlotsQueueExtras } from '@/components/RegionalEditPanel';
import { sharedPatchFromGalleryHandoff } from '@/lib/gallery-handoff';
import {
  isolateSubjectOnWhite,
  ISOLATE_QUEUE_BLOCKED_MESSAGE,
  normalizeIsolateSubject,
} from '@/lib/isolate-subject';
import {
  CLOUD_COMPOSE_TRANSFER_BLOCKED,
  cloudComposeBlocksTransfer,
  cloudComposeSendsOnlyImage1,
} from '@/lib/cloud-compose-refs';
import { isCloudEngine } from '@/lib/engine/capabilities';
import { loadEngineSettings } from '@/lib/engine-settings';
import { DEFAULT_IMAGE_COMPOSE_TOOL_CACHE } from '@/lib/settings-cache';
import { rememberDraftFields } from '@/lib/remember-draft-fields';
import { scheduleAfterCommit } from '@/lib/schedule-after-commit';
import {
  emptyFigure,
  emptySlots,
  fileFromPreviewUrl,
  revokeBlobUrl,
  revokeFigureUrls,
  type FigureSlot,
} from '@/lib/compose-figure-slot';
import { resolveLocalImageFile, scanStillWithVision } from '@/lib/vision-still-scan-client';

export function useComposeToolOrchestration() {
  const { mounted, shared, toolSettings, updateShared, updateToolSettings } = useCachedSettings(
    'imageCompose',
    DEFAULT_IMAGE_COMPOSE_TOOL_CACHE
  );

  const [slots, setSlots] = useState<FigureSlot[]>(emptySlots);
  const [maskFile, setMaskFile] = useState<File | null>(null);
  const [maskPreviewUrl, setMaskPreviewUrl] = useState<string | null>(null);
  const [showMaskEditor, setShowMaskEditor] = useState(false);
  const [handoffQueueParams, setHandoffQueueParams] = useState<WorkflowParamValues | undefined>();
  const [output, setOutput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isolating, setIsolating] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [isolateStatus, setIsolateStatus] = useState<string | null>(null);
  const isolateGenRef = useRef(0);
  const autoIsolateAttemptedRef = useRef(false);

  const instruction = toolSettings.instruction ?? '';
  const mode = (toolSettings.mode ?? 'transfer') as ComposeMode;
  const isolateSubject = normalizeIsolateSubject(toolSettings.isolateSubject);

  const setInstruction = useCallback(
    (value: string) => {
      updateToolSettings({ instruction: value });
      rememberDraftFields({
        toolKey: 'compose',
        label: 'Compose',
        href: '/compose',
        fields: [value],
      });
    },
    [updateToolSettings]
  );

  const scanWithVision = useCallback(async () => {
    const slot = slots[0];
    if (!slot?.file && !slot?.previewUrl) {
      setError('Add Image 1 first.');
      return;
    }
    setScanning(true);
    setError(null);
    try {
      const image = await resolveLocalImageFile(slot.file, slot.previewUrl, 'compose-image-1.png');
      const prompt = await scanStillWithVision({
        image,
        purpose: 'compose',
        model: shared.model,
        detail: shared.detail,
        extraHints: instruction.trim() || undefined,
        shared,
      });
      setInstruction(prompt);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Vision scan failed.');
    } finally {
      setScanning(false);
    }
  }, [instruction, setInstruction, shared, slots]);

  const setMode = useCallback(
    (next: ComposeMode) => {
      updateToolSettings({ mode: next });
    },
    [updateToolSettings]
  );

  useSeedToolDraft(mounted, {
    toolKey: 'compose',
    label: 'Compose',
    href: '/compose',
    fields: [instruction],
  });

  const actions = usePromptResultActions({
    tool: 'compose',
    model: shared.model,
    detail: shared.detail,
    hints: instruction,
    autoFixRules: shared.autoFixRules !== false,
    reformatTarget: getReformatTargetModel(shared.model),
  });

  const selectedModel = getComfyModelDefinition(shared.model);

  useEffect(() => {
    if (!mounted) {
      return;
    }
    if (!isComposeCapableModel(shared.model)) {
      updateShared({ model: COMPOSE_DEFAULT_MODEL });
    }
  }, [mounted, shared.model, updateShared]);

  const filledCount = useMemo(
    () => slots.filter(slot => slot.file || slot.previewUrl).length,
    [slots]
  );
  const extraFilledCount = useMemo(
    () => slots.slice(1).filter(slot => slot.file || slot.previewUrl).length,
    [slots]
  );
  const cloudComposeModelId = useMemo(() => {
    const engine = shared.inferenceEngine;
    if (engine === 'fal') {
      return shared.falImg2ImgModel || loadEngineSettings().falImg2ImgModel;
    }
    if (engine === 'replicate') {
      return shared.replicateImg2ImgModel || loadEngineSettings().replicateImg2ImgModel;
    }
    return undefined;
  }, [shared.falImg2ImgModel, shared.inferenceEngine, shared.replicateImg2ImgModel]);
  const cloudComposeSingleRef =
    isCloudEngine(shared.inferenceEngine) &&
    extraFilledCount > 0 &&
    cloudComposeSendsOnlyImage1(shared.inferenceEngine, cloudComposeModelId);

  useEffect(() => {
    if (filledCount > 0) {
      updateToolSettings({ figureCountHint: Math.max(1, filledCount) });
    }
  }, [filledCount, updateToolSettings]);

  const builtOutput = useMemo(
    () =>
      buildComposeInstruction({
        mode,
        instruction,
        figureCount: Math.max(filledCount, mode === 'transfer' ? 2 : 1),
        model: shared.model,
        isolatedSubject: slots[0]?.isolated === true,
        turboEditStrength: normalizeTurboEditStrength(shared.turboEditStrength),
      }),
    [filledCount, instruction, mode, shared.model, shared.turboEditStrength, slots]
  );

  useEffect(() => {
    scheduleAfterCommit(() => {
      setOutput(builtOutput);
    });
  }, [builtOutput]);

  const clearMaskState = useCallback(() => {
    setMaskFile(null);
    setMaskPreviewUrl(current => {
      if (current) {
        URL.revokeObjectURL(current);
      }
      return null;
    });
  }, []);

  const onMaskChange = useCallback((nextFile: File | null, nextPreviewUrl: string | null) => {
    setMaskFile(nextFile);
    setMaskPreviewUrl(current => {
      if (current && current !== nextPreviewUrl) {
        URL.revokeObjectURL(current);
      }
      return nextPreviewUrl;
    });
  }, []);

  const assignFigure = useCallback(
    async (
      index: number,
      nextFile: File | null,
      options?: { skipIsolate?: boolean; isolate?: boolean; previewUrl?: string | null }
    ) => {
      if (index !== 0) {
        setSlots(current => {
          const next = current.map(slot => ({ ...slot }));
          revokeFigureUrls(next[index]);
          next[index] = nextFile
            ? {
                file: nextFile,
                originalFile: nextFile,
                previewUrl: URL.createObjectURL(nextFile),
                originalPreviewUrl: null,
                isolated: false,
              }
            : emptyFigure();
          return next;
        });
        return;
      }

      isolateGenRef.current += 1;
      const gen = isolateGenRef.current;
      clearMaskState();

      const incomingPreview = options?.previewUrl ?? null;
      if (!nextFile && !incomingPreview) {
        setSlots(current => {
          const next = current.map(slot => ({ ...slot }));
          revokeFigureUrls(next[0]);
          next[0] = emptyFigure();
          return next;
        });
        setIsolateStatus(null);
        setIsolating(false);
        return;
      }

      const originalPreviewUrl =
        incomingPreview ?? (nextFile ? URL.createObjectURL(nextFile) : null);
      setSlots(current => {
        const next = current.map(slot => ({ ...slot }));
        const prev = next[0];
        if (prev) {
          if (prev.previewUrl && prev.previewUrl !== originalPreviewUrl) {
            revokeBlobUrl(prev.previewUrl);
          }
          if (
            prev.originalPreviewUrl &&
            prev.originalPreviewUrl !== originalPreviewUrl &&
            prev.originalPreviewUrl !== prev.previewUrl
          ) {
            revokeBlobUrl(prev.originalPreviewUrl);
          }
        }
        next[0] = {
          file: nextFile,
          originalFile: nextFile,
          previewUrl: originalPreviewUrl,
          originalPreviewUrl,
          isolated: false,
        };
        return next;
      });

      const shouldIsolate = (options?.isolate ?? isolateSubject) && !options?.skipIsolate;
      if (!shouldIsolate) {
        setIsolateStatus(null);
        setIsolating(false);
        return;
      }

      setIsolating(true);
      setIsolateStatus('Isolating subject on white…');
      setError(null);
      try {
        const source =
          nextFile ??
          (await fileFromPreviewUrl(
            incomingPreview as string,
            `compose-image-1-${Date.now()}.png`
          ));
        if (gen !== isolateGenRef.current) {
          return;
        }
        const cutout = await isolateSubjectOnWhite(source, source.name);
        if (gen !== isolateGenRef.current) {
          return;
        }
        const cutoutPreview = URL.createObjectURL(cutout);
        setSlots(current => {
          const next = current.map(slot => ({ ...slot }));
          const prev = next[0];
          if (prev?.previewUrl && prev.previewUrl !== prev.originalPreviewUrl) {
            revokeBlobUrl(prev.previewUrl);
          }
          next[0] = {
            file: cutout,
            originalFile: prev?.originalFile ?? source,
            previewUrl: cutoutPreview,
            originalPreviewUrl: prev?.originalPreviewUrl ?? originalPreviewUrl,
            isolated: true,
          };
          return next;
        });
        setIsolateStatus('Subject isolated on white.');
      } catch (err) {
        if (gen !== isolateGenRef.current) {
          return;
        }
        setIsolateStatus(null);
        setError(
          err instanceof Error
            ? `${err.message} ${ISOLATE_QUEUE_BLOCKED_MESSAGE}`
            : ISOLATE_QUEUE_BLOCKED_MESSAGE
        );
      } finally {
        if (gen === isolateGenRef.current) {
          setIsolating(false);
        }
      }
    },
    [clearMaskState, isolateSubject]
  );

  useEffect(() => {
    if (!isolateSubject) {
      autoIsolateAttemptedRef.current = false;
      return;
    }
    if (isolating) {
      return;
    }
    const slot0 = slots[0];
    if (slot0?.isolated) {
      autoIsolateAttemptedRef.current = false;
      return;
    }
    const original = slot0?.originalFile ?? slot0?.file ?? null;
    const preview = slot0?.originalPreviewUrl || slot0?.previewUrl || null;
    if (!original && !preview) {
      autoIsolateAttemptedRef.current = false;
      return;
    }
    if (autoIsolateAttemptedRef.current) {
      return;
    }
    autoIsolateAttemptedRef.current = true;
    void assignFigure(0, original, {
      isolate: true,
      previewUrl: original ? undefined : preview,
    });
  }, [assignFigure, isolateSubject, isolating, slots]);

  const applyGalleryHandoff = useCallback(
    (handoff: {
      prompt: string;
      model?: string;
      queueParams?: WorkflowParamValues;
      sessionActiveLoraIds?: string[];
      queueQualityProfile?: import('@/lib/queue-quality-profile').QueueQualityProfile;
      handoffMode?: import('@/lib/gallery-handoff').GalleryHandoffMode;
      file: File | null;
      previewUrl: string | null;
      payload?: import('@/lib/gallery-handoff').GalleryHandoffPayload;
    }) => {
      if (handoff.handoffMode === 'reedit' && handoff.prompt.trim()) {
        setInstruction(handoff.prompt.trim());
      }
      if (handoff.handoffMode === 'reedit' && handoff.queueParams) {
        const rest = { ...handoff.queueParams };
        delete rest.width;
        delete rest.height;
        setHandoffQueueParams(rest);
      } else {
        setHandoffQueueParams(undefined);
      }
      const sharedPatch = handoff.payload
        ? sharedPatchFromGalleryHandoff(handoff.payload)
        : {
            sessionActiveLoraIds: handoff.sessionActiveLoraIds,
            queueQualityProfile: handoff.queueQualityProfile,
          };
      if (handoff.model && isComposeCapableModel(handoff.model)) {
        updateShared({
          model: handoff.model as ComfyImageModel,
          ...sharedPatch,
        });
      } else {
        updateShared({
          model: COMPOSE_DEFAULT_MODEL,
          ...sharedPatch,
        });
      }
      const restoredKind = handoff.payload?.identityKind ?? handoff.queueParams?.identityKind;
      if (restoredKind) {
        updateToolSettings({
          identityKind: normalizeComposeIdentityKind(restoredKind),
          identityLock: true,
        });
      }
      void assignFigure(0, handoff.file, {
        skipIsolate: handoff.handoffMode === 'reedit',
        previewUrl: handoff.previewUrl,
      });
    },
    [assignFigure, setInstruction, updateShared, updateToolSettings]
  );

  useGalleryHandoff('compose', applyGalleryHandoff);

  const identityLock = toolSettings.identityLock === true;
  const identityLockStrength = normalizeComposeIdentityLockStrength(
    toolSettings.identityLockStrength ?? DEFAULT_COMPOSE_IDENTITY_LOCK_STRENGTH
  );
  const identityKind = normalizeComposeIdentityKind(toolSettings.identityKind);
  const kleinEnhancerActive =
    isFluxKleinModel(shared.model) && shared.kleinEnhancerEnabled !== false;
  const identityLockHint = useMemo(() => {
    if (kleinEnhancerActive && identityLock) {
      return formatKleinEnhancerIdentityHint({
        enabled: shared.kleinEnhancerEnabled,
        identityLockStrength,
        preset: shared.kleinEnhancerIdentityPreset,
        textEnhancerEnabled: shared.kleinEnhancerTextEnabled,
        colorAnchorEnabled: shared.kleinEnhancerColorAnchorEnabled,
        model: shared.model,
      });
    }
    if (kleinEnhancerActive) {
      return formatKleinEnhancerComposeHint({
        enabled: shared.kleinEnhancerEnabled,
        textEnhancerEnabled: shared.kleinEnhancerTextEnabled,
        colorAnchorEnabled: shared.kleinEnhancerColorAnchorEnabled,
      });
    }
    return formatComposeIdentityLockHint({
      enabled: identityLock,
      strength: identityLockStrength,
      identityKind,
    });
  }, [
    identityKind,
    identityLock,
    identityLockStrength,
    kleinEnhancerActive,
    shared.kleinEnhancerColorAnchorEnabled,
    shared.kleinEnhancerEnabled,
    shared.kleinEnhancerIdentityPreset,
    shared.kleinEnhancerTextEnabled,
    shared.model,
  ]);
  const regionalSlots = toolSettings.regionalSlots ?? createDefaultRegionalSlots();
  const regionalQueue = useMemo(() => regionalSlotsQueueExtras(regionalSlots), [regionalSlots]);

  const queueImageOptions = useMemo(() => {
    const fig1 = slots[0];
    return {
      inputImage: fig1?.file ?? null,
      inputImageUrl: !fig1?.file ? (fig1?.previewUrl ?? undefined) : undefined,
      inputImages: slots.map(slot => slot.file),
      inputImageUrls: slots.map(slot => (!slot.file ? (slot.previewUrl ?? undefined) : undefined)),
      maskImage: showMaskEditor ? maskFile : undefined,
      maskImageUrl: showMaskEditor && !maskFile ? (maskPreviewUrl ?? undefined) : undefined,
      queueParamsBase: handoffQueueParams,
      identityLock,
      identityLockStrength,
      identityKind,
      customTokens: regionalQueue.customTokens,
      regionalSlots: regionalQueue.regionalSlots,
    };
  }, [
    handoffQueueParams,
    identityKind,
    identityLock,
    identityLockStrength,
    maskFile,
    maskPreviewUrl,
    regionalQueue,
    showMaskEditor,
    slots,
  ]);

  const assertReadyToQueue = useCallback(() => {
    if (isolating) {
      setError('Wait for Image 1 to finish isolating.');
      return false;
    }
    const fig1 = slots[0];
    if (!fig1?.file && !fig1?.previewUrl) {
      setError('Upload Image 1 (base image) before queueing.');
      return false;
    }
    if (isolateSubject && fig1 && !fig1.isolated) {
      autoIsolateAttemptedRef.current = false;
      const original = fig1.originalFile ?? fig1.file ?? null;
      const preview = fig1.originalPreviewUrl || fig1.previewUrl || null;
      if (original || preview) {
        setError('Isolating subject on white…');
        void assignFigure(0, original, {
          isolate: true,
          previewUrl: original ? undefined : preview,
        });
        return false;
      }
      setError(ISOLATE_QUEUE_BLOCKED_MESSAGE);
      return false;
    }
    if (mode === 'transfer' && filledCount < 2) {
      setError('Transfer mode needs at least Image 1 and Image 2.');
      return false;
    }
    if (
      cloudComposeBlocksTransfer({
        engine: shared.inferenceEngine,
        modelId: cloudComposeModelId,
        mode,
        extraFilled: extraFilledCount > 0,
      })
    ) {
      setError(CLOUD_COMPOSE_TRANSFER_BLOCKED);
      return false;
    }
    if (!output.trim()) {
      setError('Add an edit instruction before queueing.');
      return false;
    }
    setError(null);
    return true;
  }, [
    assignFigure,
    cloudComposeModelId,
    extraFilledCount,
    filledCount,
    isolateSubject,
    isolating,
    mode,
    output,
    shared.inferenceEngine,
    slots,
  ]);

  const applyTemplate = useCallback(
    (text: string) => {
      setInstruction(text);
    },
    [setInstruction]
  );

  const copyOutput = useCallback(async () => {
    if (!output) {
      return;
    }
    try {
      await navigator.clipboard.writeText(output);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Could not copy to clipboard.');
    }
  }, [output]);

  const templateGroups =
    mode === 'transfer' ? COMPOSE_TRANSFER_TEMPLATE_GROUPS : COMPOSE_MODIFY_TEMPLATE_GROUPS;
  const defaultTransferMinFigures = mode === 'transfer' ? 2 : 1;
  const fig1Preview = slots[0]?.previewUrl ?? null;

  const templateMinFigures = useCallback(
    (template: ComposeStarterTemplate) => template.minFigures ?? defaultTransferMinFigures,
    [defaultTransferMinFigures]
  );
  const qwenEditModel = isQwenEditModel(shared.model);
  const booguEditModel = isBooguEditModel(shared.model);
  const zImageModel = isZImageModel(shared.model);
  const aggressiveInstruction = isAggressiveComposeInstruction(instruction);
  const showPoseUnlockHint =
    (qwenEditModel || booguEditModel) &&
    (aggressiveInstruction ||
      (mode === 'modify' && /refactor|beast mode|replace everything/i.test(instruction)));

  return {
    mounted,
    shared,
    toolSettings,
    updateShared,
    updateToolSettings,
    slots,
    maskPreviewUrl,
    showMaskEditor,
    setShowMaskEditor,
    output,
    setOutput,
    error,
    copied,
    isolating,
    scanning,
    isolateStatus,
    instruction,
    setInstruction,
    mode,
    setMode,
    isolateSubject,
    scanWithVision,
    actions,
    selectedModel,
    filledCount,
    cloudComposeSingleRef,
    onMaskChange,
    assignFigure,
    identityLock,
    identityLockStrength,
    identityKind,
    identityLockHint,
    regionalSlots,
    queueImageOptions,
    assertReadyToQueue,
    applyTemplate,
    copyOutput,
    templateGroups,
    fig1Preview,
    templateMinFigures,
    booguEditModel,
    zImageModel,
    showPoseUnlockHint,
  };
}
