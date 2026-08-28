'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { AthleticSport } from '@/lib/athletic-sport-profiles';
import type { ComfyImageModel } from '@/lib/comfy-models/client';
import { resolveModelForQueueTool } from '@/lib/queue-tool-model';
import { guardQueueQualityForVram } from '@/lib/vram-queue-guard';
import { rememberedSamplerOverrides } from '@/lib/sampler-memory';
import type { WorkflowParamValues } from '@/lib/comfyui-config';
import { parseWorkflowJson } from '@/lib/comfyui-config';
import {
  COMFYUI_GALLERY_UPDATED_EVENT,
  galleryEntryPrimaryViewUrl,
  loadComfyGallery,
} from '@/lib/comfyui-gallery';
import { scheduleComfyGalleryPoll } from '@/lib/comfyui-gallery-poller';
import { registerComfyGalleryJob } from '@/lib/comfyui-gallery-client';
import { attachGalleryPromptIdToHistory, linkGalleryToHistory } from '@/lib/prompt-lineage';
import { resolveQueueNegativePromptRaw } from '@/lib/queue-negative';
import { loadActiveProjectId } from '@/lib/prompt-projects';
import { resolveParentHistoryId } from '@/lib/prompt-lineage-session';
import { injectLoraTriggers } from '@/lib/lora-prompt-injection';
import {
  loadComfyUiSettings,
  resolveSharedEffectiveSessionLoraIds,
  resolveSharedEffectiveSessionLoraStrengthOverrides,
} from '@/lib/comfyui-settings';
import { loadSettingsCache } from '@/lib/settings-cache';
import { getEngineAdapter } from '@/lib/engine';
import { engineDisplayName, isCloudEngine } from '@/lib/engine/capabilities';
import {
  loadEngineSettings,
  resolveCloudEngineHost,
  resolveCloudQueueExtras,
  resolveCloudQueueModel,
} from '@/lib/engine-settings';
import { workshopCropToApi } from '@/lib/diffusers-defaults';
import { modelUsesNegativePrompt } from '@/lib/prompt-pair';
import { resolveQueueInputImage, resolveQueueInputImageFilename } from '@/lib/queue-input-image';
import { resolveQueueParams } from '@/lib/queue-params-settings';
import { toastHeldMax, toastQueueOutcome } from '@/lib/app-toast';
import { applyQueuePromptSteering, prepareQueuePrompts } from '@/lib/queue-prompt-prep';
import { joinQueueStatusNotes } from '@/lib/queue-status-notes';
import { runPluginQueuePreflight } from '@/lib/plugin-queue-hooks';
import { dispatchWebhook } from '@/lib/webhook-settings';
import { markOnboardingFirstQueue } from '@/lib/onboarding-hooks';
import { resolveQueueFailureHref, resolveQueueFailurePlaybook } from '@/lib/queue-failure-playbook';
import {
  formatComfyUiJobStatusLine,
  isComfyUiJobProcessing,
  type ComfyUiJobTrackerState,
} from '@/lib/comfyui-job-status';
import type { PromptResultActionsConfig, WorkflowPreviewResult } from '@/hooks/prompt-result/types';

type ComfyUiDeps = {
  saveHistory: (input: {
    prompt: string;
    hints?: string;
    metadata?: Record<string, unknown>;
    parentHistoryId?: string;
  }) => string | undefined;
  historySaved: boolean;
};

export function usePromptResultComfyUi(config: PromptResultActionsConfig, deps: ComfyUiDeps) {
  const { saveHistory, historySaved } = deps;

  const [comfyUiStatus, setComfyUiStatus] = useState<string | null>(null);
  const [comfyUiJob, setComfyUiJob] = useState<ComfyUiJobTrackerState | null>(null);
  const [comfyUiPreviewUrl, setComfyUiPreviewUrl] = useState<string | null>(null);
  const [workflowPreview, setWorkflowPreview] = useState<WorkflowPreviewResult | null>(null);
  const [previewStatus, setPreviewStatus] = useState<string | null>(null);
  /** Bumped on each queue so stale gallery polls cannot overwrite a newer job preview. */
  const previewGenerationRef = useRef(0);
  const identityRelocateAttemptRef = useRef(false);

  const resetStatuses = useCallback(() => {
    setComfyUiStatus(null);
    setComfyUiJob(null);
    setComfyUiPreviewUrl(null);
    setWorkflowPreview(null);
    setPreviewStatus(null);
  }, []);
  // Keep tracker in sync when the same job is cancelled from tray / queue / gallery.
  useEffect(() => {
    if (!comfyUiJob || !isComfyUiJobProcessing(comfyUiJob)) {
      return;
    }
    const promptId = comfyUiJob.promptId;
    const syncFromGallery = () => {
      const entry = loadComfyGallery().find(item => item.promptId === promptId);
      if (!entry || (entry.status !== 'completed' && entry.status !== 'error')) {
        return;
      }
      const finishedJob: ComfyUiJobTrackerState = {
        promptId,
        status: entry.status,
        statusMessage: entry.statusMessage,
        comfyUrl: entry.comfyUrl ?? comfyUiJob.comfyUrl,
        engineId: comfyUiJob.engineId,
        imageCount: entry.images?.length,
        progressValue: undefined,
        progressMax: undefined,
        progressNode: undefined,
      };
      setComfyUiJob(finishedJob);
      setComfyUiStatus(formatComfyUiJobStatusLine(finishedJob));
    };
    window.addEventListener(COMFYUI_GALLERY_UPDATED_EVENT, syncFromGallery);
    return () => window.removeEventListener(COMFYUI_GALLERY_UPDATED_EVENT, syncFromGallery);
  }, [comfyUiJob]);

  const sendComfyUiRef = useRef<
    (
      prompt: string,
      sport?: AthleticSport | null,
      historyId?: string,
      options?: object
    ) => Promise<string | undefined>
  >(async () => undefined);

  const trackComfyUiJob = useCallback(
    (
      input: {
        promptId: string;
        prompt: string;
        negativePrompt?: string;
        comfyUrl: string;
        clientId?: string;
        historyId?: string;
        queueParams?: WorkflowParamValues;
        workflowJson?: string;
        parentGalleryEntryId?: string;
        characterId?: string;
        lookId?: string;
        derivedKind?: import('@/lib/comfyui-gallery-entry').ComfyGalleryEntry['derivedKind'];
        sourceImageUrl?: string;
        maskImageUrl?: string;
        queueQualityProfile?: import('@/lib/queue-quality-profile').QueueQualityProfile;
        /** Actual model queued (may differ from picker when Generate remaps Edit Lightning). */
        model?: ComfyImageModel;
        tool?: string;
        sessionActiveLoraIds?: string[];
        sessionLoraStrengthOverrides?: import('@/lib/lora-stack').SessionLoraStrengthOverrides;
        engineId?: import('@/lib/engine/types').EngineId;
      },
      showPreview = true
    ) => {
      const generation = previewGenerationRef.current;
      const engineId = input.engineId ?? getEngineAdapter().id;
      const galleryEntry = registerComfyGalleryJob({
        promptId: input.promptId,
        prompt: input.prompt,
        negativePrompt: input.negativePrompt,
        tool: input.tool ?? config.tool,
        model: input.model ?? config.model,
        comfyUrl: input.comfyUrl,
        clientId: input.clientId,
        historyId: input.historyId,
        queueParams: input.queueParams,
        workflowJson: input.workflowJson,
        parentGalleryEntryId: input.parentGalleryEntryId,
        characterId: input.characterId,
        lookId: input.lookId,
        derivedKind: input.derivedKind,
        sourceImageUrl: input.sourceImageUrl,
        maskImageUrl: input.maskImageUrl,
        queueQualityProfile: input.queueQualityProfile,
        sessionActiveLoraIds: input.sessionActiveLoraIds,
        sessionLoraStrengthOverrides: input.sessionLoraStrengthOverrides,
        sessionEmbeddingTokens: loadSettingsCache().shared.sessionEmbeddingTokens,
        projectId: loadActiveProjectId(),
        engineId,
      });

      if (input.historyId) {
        linkGalleryToHistory(input.promptId, input.historyId);
        attachGalleryPromptIdToHistory(input.historyId, input.promptId, galleryEntry.id);
      }

      const initialJob: ComfyUiJobTrackerState = {
        promptId: input.promptId,
        status: 'pending',
        statusMessage: `Submitted to ${engineDisplayName(engineId)}`,
        comfyUrl: input.comfyUrl,
        engineId,
      };
      setComfyUiJob(initialJob);
      setComfyUiStatus(formatComfyUiJobStatusLine(initialJob));

      void scheduleComfyGalleryPoll(input.promptId, {
        comfyUrl: input.comfyUrl,
        onJobUpdate: job => {
          if (generation !== previewGenerationRef.current) {
            return;
          }
          const next = { ...job, engineId: job.engineId ?? engineId };
          setComfyUiJob(next);
          setComfyUiStatus(formatComfyUiJobStatusLine(next));
        },
      }).then(entry => {
        if (generation !== previewGenerationRef.current) {
          return;
        }
        if (!entry) {
          return;
        }

        const finishedJob: ComfyUiJobTrackerState = {
          promptId: input.promptId,
          status: entry.status,
          statusMessage: entry.statusMessage,
          comfyUrl: entry.comfyUrl,
          engineId,
          imageCount: entry.images.length,
          progressValue: undefined,
          progressMax: undefined,
          progressNode: undefined,
        };
        setComfyUiJob(finishedJob);
        setComfyUiStatus(formatComfyUiJobStatusLine(finishedJob));

        if (entry.status === 'completed') {
          const preview = galleryEntryPrimaryViewUrl(entry);
          if (showPreview && preview) {
            setComfyUiPreviewUrl(preview);
          }
          return;
        }
      });
    },
    [config.model, config.tool]
  );

  const sendComfyUi = useCallback(
    async (
      prompt: string,
      sport?: AthleticSport | null,
      historyId?: string,
      options?: {
        explicitNegative?: string;
        inputImage?: File | null;
        inputImageFilename?: string;
        inputImageUrl?: string;
        /** Extra figures for Compose (Figure 2–4). Index 0 is ignored — use inputImage. */
        inputImages?: Array<File | null | undefined>;
        inputImageUrls?: Array<string | undefined>;
        inputImageFilenames?: string[];
        maskImage?: File | null;
        maskImageFilename?: string;
        maskImageUrl?: string;
        controlImage?: File | null;
        controlImageFilename?: string;
        controlImageUrl?: string;
        /** Extra control images for multi-ControlNet stack (index 0 ignored — use controlImage). */
        controlImages?: Array<File | null | undefined>;
        controlImageUrls?: Array<string | undefined>;
        controlImageFilenames?: string[];
        queueParamsBase?: WorkflowParamValues;
        qualityProfile?: import('@/lib/queue-quality-profile').QueueQualityProfile;
        resolutionSizeTier?: import('@/lib/model-resolution-defaults').ResolutionSizeTier;
        resolutionOrientation?: import('@/lib/model-resolution-defaults').ResolutionOrientation;
        /** When false, keep queueParamsBase W×H instead of Lightning compose upsnap. */
        preserveInputAspect?: boolean;
        /** Override probed upload dimensions (e.g. locked fitting preview thumbs). */
        figurePixelSize?: { width: number; height: number };
        /** Skip graph enrich passes for tiny fitting draft thumbs. */
        draftPreviewLite?: boolean;
        /** Merged into runtime customTokens before inject (e.g. {{REGION_*}}). */
        customTokens?: Array<{ token: string; value: string }>;
        /** Multi-slot regional edit for AttentionCouple / {{REGION_*}} binding. */
        regionalSlots?: import('@/lib/regional-prompt-slots').RegionalPromptSlot[];
        /** Compose: lock identity from Figure 1 via IP-Adapter after upload. */
        identityLock?: boolean;
        identityLockStrength?: number;
        identityKind?: import('@/lib/compose-identity-lock').ComposeIdentityKind;
        /** Gallery lineage when queueing a derived job (e.g. ControlNet from gallery). */
        parentGalleryEntryId?: string;
        characterId?: string;
        lookId?: string;
        derivedKind?: import('@/lib/comfyui-gallery-entry').ComfyGalleryEntry['derivedKind'];
        sourceImageUrl?: string;
        /** Override the hook tool for this queue (Roleplay → video I2V). */
        queueTool?: string;
        queueModel?: import('@/lib/comfy-models/client').ComfyImageModel;
        /** Video T2V vs I2V vs documented Fal extend. */
        clipMode?: import('@/lib/video-clip-mode').VideoClipMode;
        /** Public Fal clip URL for clipMode extend. */
        videoUrl?: string;
        /** Override shared turbo edit strength for this queue (e.g. fitting draft previews). */
        turboEditStrength?: import('@/lib/turbo-edit-strength').TurboEditStrength;
        /** Override hook hints for this queue — pass '' to skip tool notes on previews. */
        queueHints?: string;
      }
    ) => {
      if (!prompt) {
        return;
      }

      previewGenerationRef.current += 1;
      setComfyUiPreviewUrl(null);
      setComfyUiStatus('Queueing…');
      let failedQueueSnapshot: {
        prompt: string;
        negativePrompt?: string;
        model?: string;
        tool?: string;
        queueParams?: import('@/lib/comfyui-config').WorkflowParamValues;
        workflowJson?: string;
      } | null = null;
      try {
        const pluginPreflight = await runPluginQueuePreflight({
          event: 'queue-preflight',
          prompt,
          model: config.model,
          tool: config.tool,
          denoise: options?.queueParamsBase?.denoise,
          cfg: options?.queueParamsBase?.cfg,
        });
        if (pluginPreflight.blocked) {
          throw new Error(
            pluginPreflight.reason ||
              pluginPreflight.messages.join(' · ') ||
              'Plugin hook blocked the queue.'
          );
        }
        const workingPrompt = pluginPreflight.payload.prompt || prompt;
        const pluginNegative = pluginPreflight.payload.negativePrompt;
        const pluginDenoise = pluginPreflight.payload.denoise;
        const pluginCfg = pluginPreflight.payload.cfg;

        const engineAdapter = getEngineAdapter();
        const engineSettings = loadEngineSettings();
        const cloudEngine = isCloudEngine(engineAdapter.id);
        const effectiveTool = options?.queueTool ?? config.tool;
        const requestedModel = options?.queueModel ?? config.model;

        const queueModel = resolveModelForQueueTool(requestedModel, effectiveTool);
        let runtime:
          | Awaited<
              ReturnType<
                typeof import('@/lib/comfyui-runtime-for-model').resolveRuntimeForQueueAsync
              >
            >
          | undefined;
        let effectiveQualityProfile =
          options?.qualityProfile ?? loadSettingsCache().shared.queueQualityProfile ?? 'final';
        let vramGuard: {
          downgraded: boolean;
          profile: typeof effectiveQualityProfile;
          runtime?: typeof runtime;
        } = { downgraded: false, profile: effectiveQualityProfile };

        if (!cloudEngine) {
          const { resolveRuntimeForQueueAsync } = await import('@/lib/comfyui-runtime-for-model');
          const baseRuntime = await resolveRuntimeForQueueAsync(queueModel, effectiveTool);
          vramGuard = await guardQueueQualityForVram({
            profile: options?.qualityProfile ?? baseRuntime.queueQualityProfile,
            runtime: baseRuntime,
          });
          runtime = {
            ...(vramGuard.runtime ?? baseRuntime),
          };
          effectiveQualityProfile = vramGuard.profile;
          if (options?.draftPreviewLite && runtime) {
            runtime = {
              ...runtime,
              queueQualityProfile: 'draft',
              workflowGraphEnrich: false,
              compactDraftSaves: true,
            };
            effectiveQualityProfile = 'draft';
          }
        }

        if (options?.customTokens?.length && runtime) {
          const byToken = new Map((runtime.customTokens ?? []).map(entry => [entry.token, entry]));
          for (const entry of options.customTokens) {
            if (entry.token?.trim() && entry.value?.trim()) {
              byToken.set(entry.token.trim(), {
                token: entry.token.trim(),
                value: entry.value.trim(),
              });
            }
          }
          runtime.customTokens = [...byToken.values()];
        }

        if (options?.regionalSlots?.length && runtime) {
          runtime.regionalSlots = options.regionalSlots;
        }

        const { positive: preparedPrompt, negative: negativePrompt } = await prepareQueuePrompts({
          model: queueModel,
          positive: injectLoraTriggers(workingPrompt),
          hints: options?.queueHints ?? config.hints,
          sport,
          tool: config.tool,
          explicitNegative: options?.explicitNegative ?? pluginNegative,
          embeddingTokens: loadSettingsCache().shared.sessionEmbeddingTokens,
          turboEditStrength:
            options?.turboEditStrength ?? loadSettingsCache().shared.turboEditStrength,
        });
        failedQueueSnapshot = {
          prompt: preparedPrompt,
          negativePrompt,
          model: queueModel,
          tool: config.tool,
          workflowJson: runtime?.workflowJson,
        };

        if (engineAdapter.id === 'comfyui') {
          const { runWorkflowPreflightWithNodeInstall } = await import('@/lib/workflow-preflight');
          const preflight = await runWorkflowPreflightWithNodeInstall({
            model: queueModel,
            prompts: [preparedPrompt],
            negativePrompt,
            tool: config.tool,
            queueParams: options?.queueParamsBase,
            hasInputImage: Boolean(
              options?.inputImage ||
              options?.inputImageUrl?.trim() ||
              options?.inputImageFilename?.trim() ||
              options?.inputImages?.some(Boolean) ||
              options?.inputImageUrls?.some(url => url?.trim()) ||
              options?.inputImageFilenames?.some(name => name?.trim())
            ),
            hasMaskImage: Boolean(
              options?.maskImage ||
              options?.maskImageUrl?.trim() ||
              options?.maskImageFilename?.trim()
            ),
            hasControlImage: Boolean(
              options?.controlImage ||
              options?.controlImageUrl?.trim() ||
              options?.controlImageFilename?.trim() ||
              options?.controlImages?.some(Boolean) ||
              options?.controlImageUrls?.some(url => url?.trim()) ||
              options?.controlImageFilenames?.some(name => name?.trim())
            ),
            comfy: runtime,
          });
          if (preflight.installMessage) {
            setComfyUiStatus(preflight.installMessage);
          }
          if (!preflight.ok) {
            const playbook = resolveQueueFailurePlaybook(preflight.issues);
            const error = new Error(
              [preflight.installMessage, playbook.message].filter(Boolean).join(' ')
            );
            (error as Error & { href?: string }).href = playbook.href;
            throw error;
          }
        }

        let inputImageFilename = options?.inputImageFilename?.trim();
        let uploadedFigureSize: { width: number; height: number } | undefined;
        let sourceImageRef: { name: string; subfolder?: string; type?: string } | undefined =
          inputImageFilename
            ? { name: inputImageFilename, type: 'input', subfolder: '' }
            : undefined;
        const uploadedFilenames: string[] = [
          ...(options?.inputImageFilenames ?? []).map(name => name?.trim() ?? ''),
        ];
        while (uploadedFilenames.length < 4) {
          uploadedFilenames.push('');
        }

        if (options?.inputImage || options?.inputImageUrl?.trim()) {
          setComfyUiStatus(
            cloudEngine ? 'Uploading reference image…' : 'Uploading image to ComfyUI…'
          );
          if (!uploadedFigureSize && options?.inputImage) {
            try {
              const { probeImageFileDimensions } = await import('@/lib/browser-image-dimensions');
              const probed = await probeImageFileDimensions(options.inputImage);
              if (probed) {
                uploadedFigureSize = probed;
              }
            } catch {
              /* optional */
            }
          }
          const uploaded = await resolveQueueInputImage({
            file: options.inputImage,
            filename: options.inputImageFilename,
            imageUrl: options.inputImageUrl,
            model: queueModel,
          });
          inputImageFilename = uploaded?.filename;
          if (uploaded?.filename) {
            sourceImageRef = {
              name: uploaded.filename,
              subfolder: uploaded.subfolder,
              type: uploaded.type ?? 'input',
            };
          }
          if (uploaded?.width && uploaded?.height && uploaded.width > 0 && uploaded.height > 0) {
            uploadedFigureSize = {
              width: uploaded.width,
              height: uploaded.height,
            };
          }
          if (inputImageFilename) {
            uploadedFilenames[0] = inputImageFilename;
          }
        } else if (inputImageFilename) {
          uploadedFilenames[0] = inputImageFilename;
        }

        // Last resort: probe the raw File / preview URL when upload metadata omitted size
        // (otherwise Lightning inject keeps Settings 1328² and squashes portraits).
        if (!uploadedFigureSize) {
          try {
            const { probeImageFileDimensions, probeImageUrlDimensions } =
              await import('@/lib/browser-image-dimensions');
            if (options?.inputImage) {
              const probed = await probeImageFileDimensions(options.inputImage);
              if (probed) {
                uploadedFigureSize = probed;
              }
            }
            if (!uploadedFigureSize && options?.inputImageUrl?.trim()) {
              const probed = await probeImageUrlDimensions(options.inputImageUrl.trim());
              if (probed) {
                uploadedFigureSize = probed;
              }
            }
          } catch {
            /* optional */
          }
        }

        for (let i = 1; i < 4; i += 1) {
          const file = options?.inputImages?.[i];
          const imageUrl = options?.inputImageUrls?.[i];
          const existing = uploadedFilenames[i]?.trim();
          if (!file && !imageUrl?.trim()) {
            continue;
          }
          setComfyUiStatus(
            cloudEngine ? `Uploading Figure ${i + 1}…` : `Uploading Figure ${i + 1} to ComfyUI…`
          );
          const uploaded = await resolveQueueInputImageFilename({
            file: file ?? undefined,
            filename: existing || undefined,
            imageUrl: imageUrl?.trim() || undefined,
            model: queueModel,
          });
          if (uploaded) {
            uploadedFilenames[i] = uploaded;
          }
        }

        const inputImageFilenames = uploadedFilenames.map(name => name.trim());
        while (
          inputImageFilenames.length > 0 &&
          !inputImageFilenames[inputImageFilenames.length - 1]
        ) {
          inputImageFilenames.pop();
        }
        if (!inputImageFilename && inputImageFilenames[0]) {
          inputImageFilename = inputImageFilenames[0];
        }

        const { inferVideoClipMode, falVideoRequiresFirstFrame, falVideoRequiresParentClip } =
          await import('@/lib/video-clip-mode');
        const clipMode =
          effectiveTool === 'video'
            ? inferVideoClipMode({
                clipMode: options?.clipMode,
                hasInitImage: Boolean(inputImageFilename),
              })
            : undefined;
        const parentVideoUrl = options?.videoUrl?.trim() || '';

        if (cloudEngine && effectiveTool === 'video') {
          if (
            engineAdapter.id !== 'fal' &&
            engineAdapter.id !== 'replicate' &&
            engineAdapter.id !== 'grok' &&
            engineAdapter.id !== 'gemini'
          ) {
            throw new Error(
              `${engineDisplayName(engineAdapter.id)} cannot queue clips. Switch the inference engine to Fal, Replicate, Grok, Gemini, or local WAN.`
            );
          }
          if (falVideoRequiresParentClip(clipMode ?? 't2v') && !parentVideoUrl) {
            throw new Error('Cloud extend needs a public Fal clip URL.');
          }
          if (falVideoRequiresFirstFrame(clipMode ?? 't2v') && !inputImageFilename) {
            throw new Error('Cloud image-to-video needs a first frame.');
          }
        }

        if (cloudEngine && !inputImageFilename) {
          const { resolveCloudIdentityFallback } = await import('@/lib/cloud-identity-fallback');
          const identity = loadSettingsCache().shared;
          const fallback = resolveCloudIdentityFallback({
            inputImageFilename,
            identityFilename: identity.ipAdapterImageFilename,
            identityUrl: identity.ipAdapterImageUrl,
          });
          if (fallback) {
            setComfyUiStatus('Uploading identity reference…');
            const uploaded = await resolveQueueInputImageFilename({
              filename: fallback.inputImageFilename,
              imageUrl: fallback.imageUrl,
              model: queueModel,
            });
            if (uploaded) {
              inputImageFilename = uploaded;
              uploadedFilenames[0] = uploaded;
            } else if (fallback.inputImageFilename) {
              inputImageFilename = fallback.inputImageFilename;
              uploadedFilenames[0] = fallback.inputImageFilename;
            }
          }
        }

        let maskImageFilename = options?.maskImageFilename?.trim();
        if (!cloudEngine && (options?.maskImage || options?.maskImageUrl?.trim())) {
          setComfyUiStatus('Uploading mask to ComfyUI…');
          maskImageFilename = await resolveQueueInputImageFilename({
            file: options.maskImage,
            filename: options.maskImageFilename,
            imageUrl: options.maskImageUrl,
            model: queueModel,
            kind: 'mask',
            originalRef: sourceImageRef,
          });
        }

        let controlImageFilename = options?.controlImageFilename?.trim();
        const controlUploaded: string[] = [
          ...(options?.controlImageFilenames ?? []).map(name => name?.trim() ?? ''),
        ];
        while (controlUploaded.length < 4) {
          controlUploaded.push('');
        }
        if (!cloudEngine && (options?.controlImage || options?.controlImageUrl?.trim())) {
          setComfyUiStatus('Uploading control image to ComfyUI…');
          controlImageFilename = await resolveQueueInputImageFilename({
            file: options.controlImage,
            filename: options.controlImageFilename,
            imageUrl: options.controlImageUrl,
            model: queueModel,
          });
          if (controlImageFilename) {
            controlUploaded[0] = controlImageFilename;
          }
        } else if (controlImageFilename) {
          controlUploaded[0] = controlImageFilename;
        }
        for (let i = 1; i < 4; i += 1) {
          const file = options?.controlImages?.[i];
          const imageUrl = options?.controlImageUrls?.[i];
          const existing = controlUploaded[i]?.trim();
          if (!file && !imageUrl?.trim() && !existing) {
            continue;
          }
          if (!file && !imageUrl?.trim()) {
            continue;
          }
          setComfyUiStatus(`Uploading control image ${i + 1} to ComfyUI…`);
          const uploaded = await resolveQueueInputImageFilename({
            file: file ?? undefined,
            filename: existing || undefined,
            imageUrl: imageUrl?.trim() || undefined,
            model: queueModel,
          });
          if (uploaded) {
            controlUploaded[i] = uploaded;
          }
        }
        const controlImageFilenames = controlUploaded.map(name => name.trim()).filter(Boolean);
        if (!controlImageFilename && controlImageFilenames[0]) {
          controlImageFilename = controlImageFilenames[0];
        }
        const workflow = runtime?.workflowJson?.trim()
          ? (parseWorkflowJson(runtime.workflowJson) ?? undefined)
          : undefined;

        const queueParams = resolveQueueParams({
          model: queueModel,
          tool: effectiveTool,
          base: options?.queueParamsBase,
          workflow,
          inputImageFilename,
          inputImageFilenames: inputImageFilenames.some(Boolean) ? inputImageFilenames : undefined,
          maskImageFilename,
          controlImageFilename,
          controlImageFilenames:
            controlImageFilenames.length > 0 ? controlImageFilenames : undefined,
          qualityProfile: effectiveQualityProfile,
          resolutionSizeTier: options?.resolutionSizeTier,
          resolutionOrientation: options?.resolutionOrientation,
          preserveInputAspect: options?.preserveInputAspect,
          forceNewSeed: true,
          figurePixelSize: options?.figurePixelSize ?? uploadedFigureSize,
        });

        if (pluginDenoise != null && pluginDenoise.toString().trim() !== '') {
          const { resolveUserSamplerDenoiseOverride } =
            await import('@/lib/model-sampler-defaults');
          if (
            !resolveUserSamplerDenoiseOverride(loadSettingsCache().shared.modelSamplerOverrides)
          ) {
            queueParams.denoise = pluginDenoise;
          }
        }
        if (pluginCfg != null && pluginCfg.toString().trim() !== '') {
          queueParams.cfg = pluginCfg;
        }

        // Distilled stacks (Lightning / Rapid AIO): Advanced/plugin CFG or soft
        // edit denoise must not clobber CFG-1 / denoise-1 — that mosaics Compose.
        {
          const { ensureDistilledSamplerParams } = await import('@/lib/model-sampler-defaults');
          const { isQwenRapidAioModel, isWanRapidAioModel } =
            await import('@/lib/model-denoise-defaults');
          const { isQwenLightningModel, isWanLightningModel } =
            await import('@/lib/model-sampling-patch');
          const isDistilled =
            isQwenLightningModel(queueModel) ||
            isWanLightningModel(queueModel) ||
            isQwenRapidAioModel(queueModel) ||
            isWanRapidAioModel(queueModel);
          if (isDistilled) {
            Object.assign(queueParams, ensureDistilledSamplerParams(queueParams, queueModel));
            const { resolveDistilledQueueDenoise } = await import('@/lib/model-denoise-defaults');
            const { resolveUserSamplerDenoiseOverride } =
              await import('@/lib/model-sampler-defaults');
            const userDenoiseOverride = resolveUserSamplerDenoiseOverride(
              loadSettingsCache().shared.modelSamplerOverrides
            );
            const resolvedDenoise = resolveDistilledQueueDenoise(queueModel, {
              tool: config.tool,
              hasInputImage: Boolean(inputImageFilename),
              hasMaskImage: Boolean(maskImageFilename),
              paramsDenoise: queueParams.denoise,
              userDenoiseOverride,
            });
            if (resolvedDenoise != null) {
              queueParams.denoise = resolvedDenoise;
            }
          }
        }

        if (config.tool === 'compose') {
          const { isFluxKleinModel, isZImageModel } = await import('@/lib/model-denoise-defaults');
          if (isFluxKleinModel(queueModel)) {
            const { buildComposeKleinQueuePatch } = await import('@/lib/compose-identity-lock');
            const kleinPatch = buildComposeKleinQueuePatch({
              model: queueModel,
              inputImageFilename,
              inputImageFilenames,
              identityLock: options?.identityLock === true,
              identityLockStrength: options?.identityLockStrength,
              identityKind: options?.identityKind,
            });
            if (kleinPatch) {
              Object.assign(queueParams, kleinPatch);
            }
          } else if (options?.identityLock && !isZImageModel(queueModel)) {
            const { buildComposeIdentityLockQueuePatch } =
              await import('@/lib/compose-identity-lock');
            const identityPatch = buildComposeIdentityLockQueuePatch({
              enabled: true,
              strength: options.identityLockStrength,
              identityKind: options.identityKind,
              inputImageFilename,
            });
            if (identityPatch) {
              Object.assign(queueParams, identityPatch);
            }
          }
        } else if (options?.identityLock) {
          const { buildComposeIdentityLockQueuePatch } =
            await import('@/lib/compose-identity-lock');
          const identityPatch = buildComposeIdentityLockQueuePatch({
            enabled: true,
            strength: options.identityLockStrength,
            identityKind: options.identityKind,
            inputImageFilename,
          });
          if (identityPatch) {
            Object.assign(queueParams, identityPatch);
          }
        }

        if (engineAdapter.id === 'comfyui' && effectiveQualityProfile === 'max') {
          const { holdMaxGenerateJob, shouldHoldMaxUntilIdle } =
            await import('@/lib/held-max-queue');
          if (await shouldHoldMaxUntilIdle()) {
            holdMaxGenerateJob({
              prompt: preparedPrompt,
              negativePrompt,
              model: queueModel,
              tool: effectiveTool,
              params: queueParams,
              comfy: runtime,
              qualityProfile: 'max',
            });
            setComfyUiStatus('Max held until ComfyUI queue is idle (Queue → Orchestration).');
            toastHeldMax({ text: 'Max job held until ComfyUI is idle' });
            return;
          }
        }

        const autoSaveEnabled = loadComfyUiSettings().autoSaveHistoryOnQueue !== false;
        const resolvedHistoryId =
          historyId ??
          (autoSaveEnabled && !historySaved
            ? saveHistory({
                prompt: preparedPrompt,
                hints: config.hints,
                parentHistoryId: resolveParentHistoryId(),
              })
            : undefined);

        const previewComfyUrlHint = cloudEngine
          ? resolveCloudEngineHost(engineAdapter.id)
          : engineAdapter.id === 'diffusers'
            ? engineSettings.diffusersApiUrl
            : runtime?.apiUrl?.trim() || loadComfyUiSettings().apiUrl?.trim() || undefined;

        failedQueueSnapshot = {
          prompt: preparedPrompt,
          negativePrompt,
          model: queueModel,
          tool: config.tool,
          queueParams,
          workflowJson: runtime?.workflowJson,
        };

        const queued = await engineAdapter.postPrompt({
          prompt: preparedPrompt,
          negativePrompt,
          model: cloudEngine
            ? resolveCloudQueueModel(engineAdapter.id, effectiveTool, {
                hasInputImage:
                  Boolean(inputImageFilename) && clipMode !== 't2v' && clipMode !== 'extend',
                clipMode,
              })
            : queueModel,
          params: queueParams,
          front: true,
          ...(cloudEngine
            ? {
                ...resolveCloudQueueExtras(engineAdapter.id, {
                  hasInputImage:
                    Boolean(inputImageFilename) && clipMode !== 't2v' && clipMode !== 'extend',
                  inputImageFilename:
                    clipMode === 't2v' || clipMode === 'extend' ? undefined : inputImageFilename,
                  inputImageFilenames:
                    clipMode === 't2v' || clipMode === 'extend' ? undefined : inputImageFilenames,
                  tool: effectiveTool,
                  clipMode,
                  videoUrl: clipMode === 'extend' ? parentVideoUrl : undefined,
                }),
                qualityProfile: effectiveQualityProfile,
              }
            : engineAdapter.id === 'diffusers'
              ? {
                  engineUrl: engineSettings.diffusersApiUrl,
                  workshopCrop: workshopCropToApi(loadSettingsCache().shared.diffusersWorkshopCrop),
                  modelCheckpointMap: loadSettingsCache().shared.modelCheckpointMap,
                  qualityProfile: effectiveQualityProfile,
                  hasInputImage: Boolean(inputImageFilename),
                }
              : runtime
                ? { comfy: runtime }
                : {}),
        });

        try {
          if (!queued.ok || !queued.promptId) {
            const error = new Error(
              queued.error ?? `${engineDisplayName(engineAdapter.id)} queue failed.`
            );
            if (queued.href?.trim()) {
              (error as Error & { href?: string }).href = queued.href.trim();
            }
            throw error;
          }

          setComfyUiStatus(
            joinQueueStatusNotes(
              [
                `prompt_id ${queued.promptId}`,
                queueModel !== config.model ? `as ${queueModel}` : null,
                queued.workflowSource ? `workflow: ${queued.workflowSource}` : null,
                negativePrompt ? 'with negative' : null,
                options?.identityLock && queueParams.ipAdapterImageFilename
                  ? `identity lock · ${
                      queueParams.identityKind === 'instantid'
                        ? 'InstantID'
                        : queueParams.identityKind === 'pulid'
                          ? 'PuLID'
                          : queueParams.identityKind === 'auto'
                            ? 'InstantID/PuLID auto'
                            : 'IP-Adapter'
                    } ${Number(queueParams.ipAdapterStrength ?? 0.5).toFixed(2)}`
                  : null,
              ],
              {
                model: queueModel,
                qualityProfile: runtime?.queueQualityProfile,
                tool: effectiveTool,
                vramDowngraded: vramGuard.downgraded,
                samplerMemory: Object.keys(rememberedSamplerOverrides(queueModel)).length > 0,
                hasInputImage: Boolean(inputImageFilename),
                comfyUrl: queued.engineUrl,
              }
            )
          );
          toastQueueOutcome({
            ok: true,
            text: `Queued to ${engineDisplayName(engineAdapter.id)} · ${queued.promptId}`,
            href: '/gallery',
          });

          setComfyUiJob({
            promptId: queued.promptId,
            status: 'pending',
            statusMessage: `Submitted to ${engineDisplayName(engineAdapter.id)}`,
            comfyUrl: queued.engineUrl,
            engineId: engineAdapter.id,
          });
          trackComfyUiJob({
            promptId: queued.promptId,
            prompt: preparedPrompt,
            negativePrompt,
            tool: effectiveTool,
            comfyUrl:
              queued.engineUrl ??
              previewComfyUrlHint ??
              (cloudEngine
                ? resolveCloudEngineHost(engineAdapter.id)
                : engineAdapter.id === 'diffusers'
                  ? 'http://127.0.0.1:8190'
                  : 'http://127.0.0.1:8188'),
            clientId: queued.clientId,
            historyId: resolvedHistoryId,
            queueParams,
            workflowJson: runtime?.workflowJson,
            parentGalleryEntryId: options?.parentGalleryEntryId,
            characterId: options?.characterId,
            lookId: options?.lookId,
            derivedKind: options?.derivedKind,
            sourceImageUrl:
              options?.sourceImageUrl ||
              options?.controlImageUrl ||
              options?.inputImageUrl ||
              undefined,
            queueQualityProfile: runtime?.queueQualityProfile ?? effectiveQualityProfile,
            model: cloudEngine
              ? resolveCloudQueueModel(engineAdapter.id, effectiveTool, {
                  hasInputImage:
                    Boolean(inputImageFilename) && clipMode !== 't2v' && clipMode !== 'extend',
                  clipMode,
                })
              : queueModel,
            sessionActiveLoraIds: resolveSharedEffectiveSessionLoraIds(queueModel),
            sessionLoraStrengthOverrides:
              resolveSharedEffectiveSessionLoraStrengthOverrides(queueModel),
            engineId: engineAdapter.id,
          });
          queued.releaseLiveSocket();
          markOnboardingFirstQueue();
          identityRelocateAttemptRef.current = false;
          void dispatchWebhook({
            event: 'comfyui.job.queued',
            promptId: queued.promptId,
            prompt: preparedPrompt,
            negativePrompt,
            model: queueModel,
            tool: effectiveTool,
            status: 'queued',
            queueParams,
            completedAt: Date.now(),
          });
          return queued.promptId;
        } catch (queueError) {
          queued.releaseLiveSocket();
          throw queueError;
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'ComfyUI failed.';
        const sharedIdentity = loadSettingsCache().shared;
        if (
          !identityRelocateAttemptRef.current &&
          sharedIdentity.ipAdapterImageFilename?.trim() &&
          sharedIdentity.ipAdapterImageUrl?.trim()
        ) {
          const { shouldRelocateIdentityLock } = await import('@/lib/identity-lock-host');
          if (shouldRelocateIdentityLock(message)) {
            identityRelocateAttemptRef.current = true;
            setComfyUiStatus('Re-uploading identity to a live host…');
            const { relocateIdentityLockToLiveHost } = await import('@/lib/gallery-identity-lock');
            const relocated = await relocateIdentityLockToLiveHost({
              deadComfyUrl: sharedIdentity.ipAdapterComfyUrl,
              model: config.model,
            });
            if (relocated.ok) {
              return await sendComfyUiRef.current(prompt, sport, historyId, options);
            }
          }
        }
        identityRelocateAttemptRef.current = false;
        const hrefFromError =
          err instanceof Error ? (err as Error & { href?: string }).href : undefined;
        setComfyUiStatus(message);
        const href = hrefFromError || resolveQueueFailureHref(message) || '/queue';
        void import('@/lib/local-observability').then(({ noteQueueFailureMetric }) => {
          noteQueueFailureMetric({ message, href });
        });
        void import('@/lib/last-failed-queue').then(
          ({ saveLastFailedQueue, RETRY_LAST_FAILED_QUEUE_EVENT }) => {
            saveLastFailedQueue(
              failedQueueSnapshot ?? {
                prompt,
                model: config.model,
                tool: config.tool,
              }
            );
            toastQueueOutcome({
              ok: false,
              text: message,
              href,
              actionLabel: 'Retry',
              actionEvent: RETRY_LAST_FAILED_QUEUE_EVENT,
            });
          }
        );
      }
    },
    [config.model, config.tool, config.hints, saveHistory, trackComfyUiJob, historySaved]
  );
  useEffect(() => {
    sendComfyUiRef.current = sendComfyUi;
  }, [sendComfyUi]);

  const previewWorkflow = useCallback(
    async (prompt: string, sport?: AthleticSport | null) => {
      if (!prompt.trim()) {
        return;
      }

      setPreviewStatus('Building preview…');
      setWorkflowPreview(null);
      try {
        const { positive: preparedPrompt, negative: negativePrompt } = await prepareQueuePrompts({
          model: config.model,
          positive: prompt,
          hints: config.hints,
          sport,
          tool: config.tool,
          embeddingTokens: loadSettingsCache().shared.sessionEmbeddingTokens,
          turboEditStrength: loadSettingsCache().shared.turboEditStrength,
        });

        const [{ fetchWorkflowPreview }, { resolveRuntimeForQueueAsync }] = await Promise.all([
          import('@/lib/comfyui-requeue'),
          import('@/lib/comfyui-runtime-for-model'),
        ]);
        const preview = await fetchWorkflowPreview({
          prompt: preparedPrompt,
          negativePrompt,
          model: resolveModelForQueueTool(config.model, config.tool),
          params: resolveQueueParams({
            model: resolveModelForQueueTool(config.model, config.tool),
            tool: config.tool,
          }),
          comfy: await resolveRuntimeForQueueAsync(config.model, config.tool),
        });
        setWorkflowPreview(preview);
        setPreviewStatus('Workflow preview ready (not queued).');
      } catch (err) {
        setPreviewStatus(err instanceof Error ? err.message : 'Preview failed.');
      }
    },
    [config.hints, config.model, config.tool]
  );

  const sendBatchComfyUi = useCallback(
    async (prompts: string[], sport?: AthleticSport | null) => {
      const filtered = prompts.map(entry => entry.trim()).filter(Boolean);
      if (filtered.length === 0) {
        return;
      }

      setComfyUiStatus(`Queueing ${filtered.length}…`);
      try {
        const { resolveRuntimeForQueueAsync } = await import('@/lib/comfyui-runtime-for-model');
        const baseRuntime = await resolveRuntimeForQueueAsync(config.model, config.tool);
        const queueModel = resolveModelForQueueTool(config.model, config.tool);
        const vramGuard = await guardQueueQualityForVram({ runtime: baseRuntime });
        const runtime = vramGuard.runtime ?? baseRuntime;
        const rawNegative = modelUsesNegativePrompt(queueModel)
          ? await resolveQueueNegativePromptRaw({
              model: queueModel,
              hints: config.hints,
              sport,
              tool: config.tool,
            })
          : undefined;
        const steered = applyQueuePromptSteering({
          positive: injectLoraTriggers(filtered[0] ?? ''),
          negative: rawNegative,
          model: queueModel,
          tool: config.tool,
          turboEditStrength: loadSettingsCache().shared.turboEditStrength,
        });
        const negativePrompt = steered.negative;
        const prepared = filtered.map(
          entry =>
            applyQueuePromptSteering({
              positive: injectLoraTriggers(entry),
              negative: rawNegative,
              model: queueModel,
              tool: config.tool,
              turboEditStrength: loadSettingsCache().shared.turboEditStrength,
            }).positive
        );

        const paramsPerPrompt = prepared.map((_, index) =>
          resolveQueueParams({
            model: queueModel,
            tool: config.tool,
            base: {
              seed: String(Math.floor(Math.random() * 2 ** 32) + index),
            },
            qualityProfile: vramGuard.profile,
          })
        );

        const engineAdapter = getEngineAdapter();
        if (engineAdapter.id === 'diffusers' || isCloudEngine(engineAdapter.id)) {
          throw new Error(
            `Batch queue is ComfyUI-only. Switch Settings → Inference engine to ComfyUI, or send a single prompt.`
          );
        }

        if (vramGuard.profile === 'max') {
          const { holdMaxGenerateJob, shouldHoldMaxUntilIdle } =
            await import('@/lib/held-max-queue');
          if (await shouldHoldMaxUntilIdle()) {
            for (const [index, prompt] of prepared.entries()) {
              holdMaxGenerateJob({
                prompt,
                negativePrompt,
                model: queueModel,
                tool: config.tool,
                params: paramsPerPrompt[index],
                comfy: runtime,
                qualityProfile: 'max',
              });
            }
            setComfyUiStatus(`Held ${prepared.length} Max job(s) until ComfyUI queue is idle.`);
            toastHeldMax({
              text: 'Max jobs held until ComfyUI is idle',
              count: prepared.length,
            });
            return;
          }
        }

        const { runWorkflowPreflightWithNodeInstall } = await import('@/lib/workflow-preflight');
        const preflight = await runWorkflowPreflightWithNodeInstall({
          model: queueModel,
          prompts: prepared,
          negativePrompt,
          tool: config.tool,
          queueParams: paramsPerPrompt[0],
          comfy: runtime,
        });
        if (preflight.installMessage) {
          setComfyUiStatus(preflight.installMessage);
        }
        if (!preflight.ok) {
          const playbook = resolveQueueFailurePlaybook(preflight.issues);
          const error = new Error(
            [preflight.installMessage, playbook.message].filter(Boolean).join(' ')
          );
          (error as Error & { href?: string }).href = playbook.href;
          throw error;
        }

        const autoSaveEnabled = loadComfyUiSettings().autoSaveHistoryOnQueue !== false;
        const batchHistoryId =
          autoSaveEnabled && !historySaved && prepared.length > 0
            ? saveHistory({
                prompt: prepared.join('\n\n---\n\n'),
                hints: config.hints,
                metadata: {
                  batchSize: prepared.length,
                  batchPrompts: prepared,
                },
                parentHistoryId: resolveParentHistoryId(),
              })
            : undefined;

        const previewComfyUrlHint =
          runtime?.apiUrl?.trim() || loadComfyUiSettings().apiUrl?.trim() || undefined;

        const queued = await engineAdapter.postPrompt({
          prompts: prepared,
          negativePrompt,
          model: queueModel,
          paramsPerPrompt,
          ...(runtime ? { comfy: runtime } : {}),
        });

        try {
          const data = queued.raw as {
            ok?: boolean;
            queued?: number;
            failed?: number;
            error?: string;
            comfyUrl?: string;
            results?: Array<{
              ok?: boolean;
              promptId?: string;
              comfyUrl?: string;
            }>;
          };

          if (!queued.ok) {
            const error = new Error(queued.error ?? data.error ?? 'ComfyUI batch queue failed.');
            if (queued.href?.trim()) {
              (error as Error & { href?: string }).href = queued.href.trim();
            }
            throw error;
          }

          for (const [index, result] of (data.results ?? []).entries()) {
            if (!result.promptId) {
              continue;
            }
            trackComfyUiJob(
              {
                promptId: result.promptId,
                prompt: prepared[index] ?? prepared[0] ?? '',
                negativePrompt,
                comfyUrl:
                  result.comfyUrl ??
                  data.comfyUrl ??
                  queued.engineUrl ??
                  previewComfyUrlHint ??
                  'http://127.0.0.1:8188',
                clientId: queued.clientId,
                queueParams: paramsPerPrompt[index] ?? paramsPerPrompt[0],
                historyId: index === 0 ? batchHistoryId : undefined,
                queueQualityProfile: runtime?.queueQualityProfile,
                model: queueModel,
                sessionActiveLoraIds: resolveSharedEffectiveSessionLoraIds(queueModel),
                sessionLoraStrengthOverrides:
                  resolveSharedEffectiveSessionLoraStrengthOverrides(queueModel),
              },
              false
            );
          }
          queued.releaseLiveSocket();

          void dispatchWebhook({
            event: 'comfyui.batch.completed',
            tool: config.tool,
            model: queueModel,
            queued: data.queued ?? prepared.length,
            failed: data.failed,
            completedAt: Date.now(),
            message: `Batch queued ${data.queued ?? prepared.length}/${prepared.length}`,
          });

          setComfyUiStatus(
            [
              `queued ${data.queued ?? prepared.length}/${prepared.length}`,
              data.failed ? `${data.failed} failed` : null,
              data.comfyUrl ?? queued.engineUrl,
              negativePrompt ? 'with negative' : null,
            ]
              .filter(Boolean)
              .join(' · ')
          );
          if (data.failed) {
            const batchMessage = `Batch queued with ${data.failed} failure(s)`;
            void import('@/lib/local-observability').then(({ noteQueueFailureMetric }) => {
              noteQueueFailureMetric({ message: batchMessage, href: '/queue' });
            });
          }
          toastQueueOutcome({
            ok: !data.failed,
            text: data.failed
              ? `Batch queued with ${data.failed} failure(s)`
              : `Batch queued ${data.queued ?? prepared.length}/${prepared.length}`,
            href: data.failed ? '/queue' : '/gallery',
          });
        } catch (queueError) {
          queued.releaseLiveSocket();
          throw queueError;
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'ComfyUI batch failed.';
        const hrefFromError =
          err instanceof Error ? (err as Error & { href?: string }).href : undefined;
        setComfyUiStatus(message);
        const href = hrefFromError || resolveQueueFailureHref(message) || '/queue';
        void import('@/lib/local-observability').then(({ noteQueueFailureMetric }) => {
          noteQueueFailureMetric({ message, href });
        });
        toastQueueOutcome({
          ok: false,
          text: message,
          href,
        });
      }
    },
    [config.hints, config.model, config.tool, trackComfyUiJob, saveHistory, historySaved]
  );

  const sendSeedVariationBatch = useCallback(
    async (
      prompt: string,
      count = 3,
      sport?: AthleticSport | null,
      options?: Parameters<typeof sendComfyUi>[3]
    ) => {
      const n = Math.max(1, Math.min(4, Math.trunc(count) || 3));
      if (!prompt.trim()) {
        return { queued: 0, failed: 0 };
      }
      let queued = 0;
      let failed = 0;
      for (let i = 0; i < n; i += 1) {
        try {
          await sendComfyUi(prompt, sport, undefined, options);
          queued += 1;
        } catch {
          failed += 1;
        }
      }
      setComfyUiStatus(
        failed > 0
          ? `Seed batch: ${queued} queued, ${failed} failed.`
          : `Seed batch: queued ${queued} variation${queued === 1 ? '' : 's'}.`
      );
      return { queued, failed };
    },
    [sendComfyUi]
  );

  return {
    comfyUiStatus,
    comfyUiJob,
    comfyUiPreviewUrl,
    workflowPreview,
    previewStatus,
    resetStatuses,
    sendComfyUi,
    sendBatchComfyUi,
    previewWorkflow,
    sendSeedVariationBatch,
  };
}
