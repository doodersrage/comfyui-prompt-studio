import type { MutableRefObject } from 'react';
import type { ComfyImageModel } from '@/lib/comfy-models/client';
import type { WorkflowParamValues } from '@/lib/comfyui-config';
import { rememberedSamplerOverrides } from '@/lib/sampler-memory';
import {
  resolveSharedEffectiveSessionLoraIds,
  resolveSharedEffectiveSessionLoraStrengthOverrides,
} from '@/lib/comfyui-settings';
import { loadSettingsCache } from '@/lib/settings-cache';
import { engineDisplayName, isCloudEngine } from '@/lib/engine/capabilities';
import {
  loadEngineSettings,
  resolveCloudEngineHost,
  resolveCloudQueueExtras,
  resolveCloudQueueModel,
} from '@/lib/engine-settings';
import { workshopCropToApi } from '@/lib/diffusers-defaults';
import { toastQueueOutcome } from '@/lib/app-toast';
import { joinQueueStatusNotes } from '@/lib/queue-status-notes';
import { dispatchWebhook } from '@/lib/webhook-settings';
import { markOnboardingFirstQueue } from '@/lib/onboarding-hooks';
import type {
  ComfyUiTrackerApi,
  SendComfyUiOptions,
  TrackComfyUiJobInput,
} from '@/hooks/prompt-result/comfy-ui-types';

type QueueRuntime = Awaited<
  ReturnType<typeof import('@/lib/comfyui-runtime-for-model').resolveRuntimeForQueueAsync>
>;

export async function postQueueSinglePrompt(input: {
  engineAdapter: ReturnType<typeof import('@/lib/engine').getEngineAdapter>;
  preparedPrompt: string;
  negativePrompt: string | undefined;
  queueModel: ComfyImageModel;
  configModel: ComfyImageModel;
  effectiveTool: string;
  queueParams: WorkflowParamValues;
  runtime: QueueRuntime | undefined;
  effectiveQualityProfile: import('@/lib/queue-quality-profile').QueueQualityProfile;
  inputImageFilename: string | undefined;
  inputImageFilenames: string[];
  clipMode: import('@/lib/video-clip-mode').VideoClipMode | undefined;
  parentVideoUrl: string | undefined;
  previewComfyUrlHint: string | undefined;
  resolvedHistoryId: string | undefined;
  options: SendComfyUiOptions | undefined;
  vramGuard: { downgraded: boolean };
  tracker: Pick<ComfyUiTrackerApi, 'setComfyUiStatus' | 'setComfyUiJob' | 'trackComfyUiJob'>;
  identityRelocateAttemptRef: MutableRefObject<boolean>;
}): Promise<string> {
  const {
    engineAdapter,
    preparedPrompt,
    negativePrompt,
    queueModel,
    configModel,
    effectiveTool,
    queueParams,
    runtime,
    effectiveQualityProfile,
    inputImageFilename,
    inputImageFilenames,
    clipMode,
    parentVideoUrl,
    previewComfyUrlHint,
    resolvedHistoryId,
    options,
    vramGuard,
    tracker,
    identityRelocateAttemptRef,
  } = input;

  const { setComfyUiStatus, setComfyUiJob, trackComfyUiJob } = tracker;
  const engineSettings = loadEngineSettings();
  const cloudEngine = isCloudEngine(engineAdapter.id);

  const queued = await engineAdapter.postPrompt({
    prompt: preparedPrompt,
    negativePrompt,
    model: cloudEngine
      ? resolveCloudQueueModel(engineAdapter.id, effectiveTool, {
          hasInputImage: Boolean(inputImageFilename) && clipMode !== 't2v' && clipMode !== 'extend',
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
          queueModel !== configModel ? `as ${queueModel}` : null,
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

    const trackInput: TrackComfyUiJobInput = {
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
        options?.sourceImageUrl || options?.controlImageUrl || options?.inputImageUrl || undefined,
      queueQualityProfile: runtime?.queueQualityProfile ?? effectiveQualityProfile,
      model: cloudEngine
        ? resolveCloudQueueModel(engineAdapter.id, effectiveTool, {
            hasInputImage:
              Boolean(inputImageFilename) && clipMode !== 't2v' && clipMode !== 'extend',
            clipMode,
          })
        : queueModel,
      sessionActiveLoraIds: resolveSharedEffectiveSessionLoraIds(queueModel),
      sessionLoraStrengthOverrides: resolveSharedEffectiveSessionLoraStrengthOverrides(queueModel),
      engineId: engineAdapter.id,
    };
    trackComfyUiJob(trackInput);
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
}
