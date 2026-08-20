'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePromptHistory } from '@/hooks/usePromptHistory';
import type { GenerationDiagnostics } from '@/lib/generation-diagnostics';
import { formatPromptPair, modelUsesNegativePrompt } from '@/lib/prompt-pair';
import { buildPromptSidecar, downloadPromptSidecar } from '@/lib/prompt-sidecar';
import type { ComfyImageModel } from '@/lib/comfy-models/client';
import type { DetailLevel } from '@/lib/detail-level';
import type { AthleticSport } from '@/lib/athletic-sport-profiles';
import { resolveModelForQueueTool } from '@/lib/queue-tool-model';
import { guardQueueQualityForVram } from '@/lib/vram-queue-guard';
import { rememberedSamplerOverrides } from '@/lib/sampler-memory';
import {
  startComposeFromResult,
  startControlNetFromResult,
  startImproveFromResult,
  startInpaintFromResult,
  startOutpaintFromResult,
  startPromptEditorFromResult,
  startRefineFromResult,
  startVideoFromResult,
} from '@/lib/improve-output';
import type { WorkflowParamValues } from '@/lib/comfyui-config';
import { parseWorkflowJson } from '@/lib/comfyui-config';
import { galleryEntryPrimaryViewUrl } from '@/lib/comfyui-gallery';
import { scheduleComfyGalleryPoll } from '@/lib/comfyui-gallery-poller';
import { registerComfyGalleryJob } from '@/lib/comfyui-gallery-client';
import { attachGalleryPromptIdToHistory, linkGalleryToHistory } from '@/lib/prompt-lineage';
import { resolveQueueNegativePrompt } from '@/lib/queue-negative';
import { loadActiveProjectId } from '@/lib/prompt-projects';
import { clearLineageParent, resolveParentHistoryId } from '@/lib/prompt-lineage-session';
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
import { computePromptContentHash, nextPromptVersionFields } from '@/lib/prompt-versioning';
import { loadPromptHistoryStore } from '@/lib/prompt-history';
import { resolveQueueInputImage, resolveQueueInputImageFilename } from '@/lib/queue-input-image';
import { resolveQueueParams } from '@/lib/queue-params-settings';
import { toastHeldMax, toastQueueOutcome } from '@/lib/app-toast';
import { applyQueuePromptSteering, prepareQueuePrompts } from '@/lib/queue-prompt-prep';
import { resolveQueueNegativePromptRaw } from '@/lib/queue-negative';
import { joinQueueStatusNotes } from '@/lib/queue-status-notes';
import { runPluginQueuePreflight } from '@/lib/plugin-queue-hooks';
import { dispatchWebhook } from '@/lib/webhook-settings';
import { markOnboardingFirstQueue } from '@/lib/onboarding-hooks';
import { resolveQueueFailureHref, resolveQueueFailurePlaybook } from '@/lib/queue-failure-playbook';
import { formatComfyUiJobStatusLine, type ComfyUiJobTrackerState } from '@/lib/comfyui-job-status';

type WorkflowPreviewResult = Awaited<
  ReturnType<typeof import('@/lib/comfyui-requeue').fetchWorkflowPreview>
>;

export type PromptResultActionsConfig = {
  tool: string;
  model: ComfyImageModel;
  detail?: DetailLevel;
  hints?: string;
  autoFixRules?: boolean;
  /** Target model for cross-model reformat chain. */
  reformatTarget?: ComfyImageModel;
};

export function usePromptResultActions(config: PromptResultActionsConfig) {
  const { addEntry } = usePromptHistory();
  const [preDiagnostics, setPreDiagnostics] = useState<GenerationDiagnostics | null>(null);
  const [diagnostics, setDiagnostics] = useState<GenerationDiagnostics | null>(null);
  const [historySaved, setHistorySaved] = useState(false);
  const [fixStatus, setFixStatus] = useState<string | null>(null);
  const [comfyUiStatus, setComfyUiStatus] = useState<string | null>(null);
  const [comfyUiJob, setComfyUiJob] = useState<ComfyUiJobTrackerState | null>(null);
  const [comfyUiPreviewUrl, setComfyUiPreviewUrl] = useState<string | null>(null);
  const [pairCopied, setPairCopied] = useState(false);
  const [compactStatus, setCompactStatus] = useState<string | null>(null);
  const [reformatStatus, setReformatStatus] = useState<string | null>(null);
  const [pipelineStatus, setPipelineStatus] = useState<string | null>(null);
  const [workflowPreview, setWorkflowPreview] = useState<WorkflowPreviewResult | null>(null);
  const [previewStatus, setPreviewStatus] = useState<string | null>(null);
  /** Bumped on each queue so stale gallery polls cannot overwrite a newer job preview. */
  const previewGenerationRef = useRef(0);
  const identityRelocateAttemptRef = useRef(false);
  const sendComfyUiRef = useRef<
    (
      prompt: string,
      sport?: AthleticSport | null,
      historyId?: string,
      options?: object
    ) => Promise<string | undefined>
  >(async () => undefined);

  const resetStatuses = useCallback(() => {
    setHistorySaved(false);
    setFixStatus(null);
    setComfyUiStatus(null);
    setComfyUiJob(null);
    setComfyUiPreviewUrl(null);
    setPairCopied(false);
    setCompactStatus(null);
    setReformatStatus(null);
    setPipelineStatus(null);
    setWorkflowPreview(null);
    setPreviewStatus(null);
  }, []);

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

  const runPreLint = useCallback(async (hints?: string) => {
    const corpus = hints?.trim();
    if (!corpus) {
      setPreDiagnostics(null);
      return null;
    }

    const response = await fetch('/api/lint', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hints: corpus }),
    });

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as GenerationDiagnostics;
    setPreDiagnostics(data);
    return data;
  }, []);

  const lintPrompt = useCallback(
    async (prompt: string, hints?: string) => {
      const response = await fetch('/api/lint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hints: hints ?? config.hints, prompt }),
      });

      if (!response.ok) {
        return null;
      }

      const data = (await response.json()) as GenerationDiagnostics;
      setDiagnostics(data);
      return data;
    },
    [config.hints]
  );

  const fetchNegative = useCallback(
    async (sport?: AthleticSport | null) => {
      return resolveQueueNegativePrompt({
        model: config.model,
        hints: config.hints,
        sport,
        tool: config.tool,
      });
    },
    [config.hints, config.model]
  );

  const applyRuleFix = useCallback(
    async (prompt: string, hints?: string) => {
      const response = await fetch('/api/fix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hints: hints ?? config.hints, prompt }),
      });

      const data = (await response.json()) as {
        prompt?: string;
        changes?: Array<{ description: string }>;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(data.error ?? 'Fix failed.');
      }

      return data;
    },
    [config.hints]
  );

  const maybeAutoFix = useCallback(
    async (prompt: string, hints?: string, lint?: GenerationDiagnostics | null) => {
      if (config.autoFixRules === false) {
        return prompt;
      }

      const hasErrors = lint?.issues.some(issue => issue.severity === 'error');
      if (!hasErrors) {
        return prompt;
      }

      try {
        const data = await applyRuleFix(prompt, hints);
        if (data.prompt && data.prompt !== prompt) {
          setFixStatus(
            data.changes?.length
              ? `Auto-fixed: ${data.changes.map(c => c.description).join('; ')}`
              : 'Auto-fix applied.'
          );
          return data.prompt;
        }
      } catch {
        // keep original prompt
      }

      return prompt;
    },
    [applyRuleFix, config.autoFixRules]
  );

  const finalizePrompt = useCallback(
    async (prompt: string, hints?: string) => {
      const lint = await lintPrompt(prompt, hints);
      return maybeAutoFix(prompt, hints, lint);
    },
    [lintPrompt, maybeAutoFix]
  );

  const fixPrompt = useCallback(
    async (prompt: string, onFixed: (next: string) => void, hints?: string) => {
      if (!prompt) {
        return;
      }

      setFixStatus('Applying rule fixes…');
      try {
        const data = await applyRuleFix(prompt, hints);
        if (data.prompt) {
          onFixed(data.prompt);
          await lintPrompt(data.prompt, hints);
        }
        setFixStatus(
          data.changes?.length
            ? `Fixed: ${data.changes.map(change => change.description).join('; ')}`
            : 'No rule-based fixes needed.'
        );
      } catch (err) {
        setFixStatus(err instanceof Error ? err.message : 'Fix failed.');
      }
    },
    [applyRuleFix, lintPrompt]
  );

  const saveHistory = useCallback(
    (input: {
      prompt: string;
      hints?: string;
      metadata?: Record<string, unknown>;
      parentHistoryId?: string;
    }): string | undefined => {
      if (!input.prompt) {
        return undefined;
      }

      const projectId = loadActiveProjectId();
      const parentHistoryId = resolveParentHistoryId(input.parentHistoryId);
      const shared = loadSettingsCache().shared;
      const versioningEnabled = shared.promptVersioningEnabled !== false;

      let versionFields:
        | {
            promptVersion: number;
            promptContentHash: string;
            versionRootId: string;
          }
        | undefined;
      let entryId: string | undefined;

      if (versioningEnabled) {
        entryId = crypto.randomUUID();
        const parent = parentHistoryId
          ? loadPromptHistoryStore().find(entry => entry.id === parentHistoryId)
          : undefined;
        versionFields = nextPromptVersionFields({
          contentHash: computePromptContentHash({
            prompt: input.prompt,
            model: config.model,
            loraIds: shared.sessionActiveLoraIds,
          }),
          parent: parent
            ? {
                id: parent.id,
                promptVersion: parent.promptVersion,
                versionRootId: parent.versionRootId,
              }
            : null,
          newEntryId: entryId,
        });
      }

      const historyId = addEntry({
        ...(entryId ? { id: entryId } : {}),
        tool: config.tool,
        prompt: input.prompt,
        hints: input.hints ?? config.hints,
        model: config.model,
        diagnostics: diagnostics ?? undefined,
        ...(versionFields ?? {}),
        metadata: {
          ...(input.metadata ?? {}),
          ...(parentHistoryId ? { parentHistoryId } : {}),
          ...(projectId ? { projectId } : {}),
        },
      });
      setHistorySaved(true);
      void import('@/lib/webhook-settings').then(({ dispatchWebhook }) => {
        void dispatchWebhook({
          event: 'prompt.history.saved',
          tool: config.tool,
          model: config.model,
          prompt: input.prompt.slice(0, 500),
          completedAt: Date.now(),
        });
      });
      void import('@/lib/plugin-queue-hooks').then(({ dispatchPluginLifecycleHooks }) => {
        void dispatchPluginLifecycleHooks({
          event: 'prompt-history-saved',
          tool: config.tool,
          model: config.model,
          prompt: input.prompt.slice(0, 500),
          completedAt: Date.now(),
        });
      });
      if (parentHistoryId) {
        clearLineageParent();
      }
      return historyId;
    },
    [addEntry, config.tool, config.model, config.hints, diagnostics]
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
          hints: config.hints,
          sport,
          tool: config.tool,
          explicitNegative: options?.explicitNegative ?? pluginNegative,
          embeddingTokens: loadSettingsCache().shared.sessionEmbeddingTokens,
          turboEditStrength: loadSettingsCache().shared.turboEditStrength,
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
          forceNewSeed: true,
          figurePixelSize: uploadedFigureSize,
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

  const copyPromptPair = useCallback(
    async (prompt: string, sport?: AthleticSport | null, explicitNegative?: string) => {
      if (!prompt) {
        return;
      }

      try {
        const { positive, negative } = await prepareQueuePrompts({
          model: config.model,
          positive: prompt,
          hints: config.hints,
          sport,
          tool: config.tool,
          explicitNegative,
          embeddingTokens: loadSettingsCache().shared.sessionEmbeddingTokens,
          turboEditStrength: loadSettingsCache().shared.turboEditStrength,
        });
        const text = formatPromptPair({
          positive,
          negative,
          model: config.model,
        });
        await navigator.clipboard.writeText(text);
        setPairCopied(true);
        window.setTimeout(() => setPairCopied(false), 2000);
      } catch {
        setFixStatus('Could not copy prompt pair.');
      }
    },
    [config.hints, config.model, config.tool]
  );

  const compactPrompt = useCallback(
    async (prompt: string, onCompacted: (next: string) => void) => {
      if (!prompt.trim()) {
        return;
      }

      setCompactStatus('Compacting…');
      try {
        const response = await fetch('/api/compact', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt,
            model: config.model,
            detail: config.detail ?? 'balanced',
          }),
        });

        const data = (await response.json()) as {
          prompt?: string;
          beforeChars?: number;
          afterChars?: number;
          maxChars?: number;
          error?: string;
        };

        if (!response.ok) {
          throw new Error(data.error ?? 'Compact failed.');
        }

        if (data.prompt) {
          onCompacted(data.prompt);
          await lintPrompt(data.prompt, config.hints);
        }

        setCompactStatus(
          data.beforeChars != null && data.afterChars != null
            ? `Compacted ${data.beforeChars} → ${data.afterChars} chars (max ${data.maxChars})`
            : 'Compacted to model limit.'
        );
      } catch (err) {
        setCompactStatus(err instanceof Error ? err.message : 'Compact failed.');
      }
    },
    [config.model, config.detail, config.hints, lintPrompt]
  );

  const reformatForModel = useCallback(
    async (
      prompt: string,
      onReformatted: (next: string) => void,
      targetModel?: ComfyImageModel
    ) => {
      const model = targetModel ?? config.reformatTarget;
      if (!prompt.trim() || !model) {
        return;
      }

      setReformatStatus(`Reformatting for ${model}…`);
      try {
        const response = await fetch('/api/format', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            input: prompt,
            mode: 'positive',
            model,
            detail: config.detail ?? 'balanced',
            smartFormat: true,
          }),
        });

        const data = (await response.json()) as { prompt?: string; error?: string };

        if (!response.ok) {
          throw new Error(data.error ?? 'Reformat failed.');
        }

        if (data.prompt) {
          onReformatted(data.prompt);
          saveHistory({
            prompt: data.prompt,
            hints: config.hints,
            parentHistoryId: resolveParentHistoryId(),
            metadata: { reformattedFrom: config.model, reformattedTo: model },
          });
        }

        setReformatStatus(`Reformatted for ${model}.`);
      } catch (err) {
        setReformatStatus(err instanceof Error ? err.message : 'Reformat failed.');
      }
    },
    [config.detail, config.hints, config.model, config.reformatTarget, saveHistory]
  );

  const exportSidecar = useCallback(
    async (
      prompt: string,
      extras?: {
        comfyNode?: string;
        metadata?: Record<string, unknown>;
        variationSeed?: string | null;
      }
    ) => {
      if (!prompt.trim()) {
        return;
      }

      let negative: string | undefined;
      if (modelUsesNegativePrompt(config.model)) {
        negative = (await fetchNegative()) ?? undefined;
      }

      downloadPromptSidecar(
        buildPromptSidecar({
          positive: prompt,
          negative,
          model: config.model,
          detail: config.detail,
          comfyNode: extras?.comfyNode,
          hints: config.hints,
          tool: config.tool,
          variationSeed: extras?.variationSeed ?? undefined,
          diagnostics,
          metadata: extras?.metadata,
        })
      );
    },
    [config.model, config.detail, config.hints, config.tool, diagnostics, fetchNegative]
  );

  const runExportPipeline = useCallback(
    async (
      prompt: string,
      onUpdate: (next: string) => void,
      options?: {
        sport?: AthleticSport | null;
        maxChars?: number;
        queueComfyUi?: boolean;
        inputImage?: File | null;
        inputImageFilename?: string;
        inputImageUrl?: string;
        inputImages?: Array<File | null | undefined>;
        inputImageUrls?: Array<string | undefined>;
        inputImageFilenames?: string[];
        maskImage?: File | null;
        maskImageFilename?: string;
        maskImageUrl?: string;
        queueParamsBase?: WorkflowParamValues;
        identityLock?: boolean;
        identityLockStrength?: number;
        identityKind?: import('@/lib/compose-identity-lock').ComposeIdentityKind;
      }
    ) => {
      if (!prompt.trim()) {
        return;
      }

      setPipelineStatus('Linting…');
      let current = prompt;

      try {
        const lint = await lintPrompt(current, config.hints);
        const hasErrors = lint?.issues.some(issue => issue.severity === 'error');

        if (hasErrors && config.autoFixRules !== false) {
          setPipelineStatus('Applying rule fixes…');
          const data = await applyRuleFix(current, config.hints);
          if (data.prompt) {
            current = data.prompt;
            onUpdate(current);
            await lintPrompt(current, config.hints);
          }
        }

        if (options?.maxChars && current.length > options.maxChars) {
          setPipelineStatus('Compacting to model limit…');
          const response = await fetch('/api/compact', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              prompt: current,
              model: config.model,
              detail: config.detail ?? 'balanced',
            }),
          });
          const data = (await response.json()) as { prompt?: string; error?: string };
          if (response.ok && data.prompt) {
            current = data.prompt;
            onUpdate(current);
          }
        }

        setPipelineStatus('Copying prompt pair…');
        await copyPromptPair(current, options?.sport);

        if (options?.queueComfyUi) {
          setPipelineStatus('Queueing ComfyUI…');
          await sendComfyUi(current, options?.sport, undefined, {
            inputImage: options?.inputImage,
            inputImageFilename: options?.inputImageFilename,
            inputImageUrl: options?.inputImageUrl,
            inputImages: options?.inputImages,
            inputImageUrls: options?.inputImageUrls,
            inputImageFilenames: options?.inputImageFilenames,
            maskImage: options?.maskImage,
            maskImageFilename: options?.maskImageFilename,
            maskImageUrl: options?.maskImageUrl,
            queueParamsBase: options?.queueParamsBase,
            identityLock: options?.identityLock,
            identityLockStrength: options?.identityLockStrength,
            identityKind: options?.identityKind,
          });
          setPipelineStatus('Pipeline complete · pair copied · queued');
        } else {
          setPipelineStatus('Pipeline complete · pair copied');
        }
      } catch (err) {
        setPipelineStatus(err instanceof Error ? err.message : 'Pipeline failed.');
      }
    },
    [
      applyRuleFix,
      config.autoFixRules,
      config.detail,
      config.hints,
      config.model,
      copyPromptPair,
      lintPrompt,
      sendComfyUi,
    ]
  );

  const improveOutput = useCallback(
    (prompt: string, previewUrl?: string | null) => {
      if (!prompt.trim()) {
        return;
      }
      startImproveFromResult({
        prompt,
        previewUrl,
        model: config.model,
        tool: config.tool,
      });
    },
    [config.model, config.tool]
  );

  const refineOutput = useCallback(
    (prompt: string, previewUrl?: string | null, negativePrompt?: string) => {
      if (!prompt.trim()) {
        return;
      }
      startRefineFromResult({
        prompt,
        previewUrl,
        negativePrompt,
        model: config.model,
        tool: config.tool,
      });
    },
    [config.model, config.tool]
  );

  const editPromptOutput = useCallback(
    (prompt: string, previewUrl?: string | null, negativePrompt?: string, hints?: string) => {
      if (!prompt.trim()) {
        return;
      }
      startPromptEditorFromResult({
        prompt,
        previewUrl,
        negativePrompt,
        hints: hints ?? config.hints,
        model: config.model,
        tool: config.tool,
      });
    },
    [config.hints, config.model, config.tool]
  );

  const inpaintOutput = useCallback(
    (prompt: string, previewUrl?: string | null, negativePrompt?: string) => {
      if (!prompt.trim() && !previewUrl) {
        return;
      }
      startInpaintFromResult({
        prompt: prompt.trim() || 'edit masked region',
        previewUrl,
        negativePrompt,
        model: config.model,
        tool: config.tool,
      });
    },
    [config.model, config.tool]
  );

  const outpaintOutput = useCallback(
    (prompt: string, previewUrl?: string | null, negativePrompt?: string) => {
      if (!prompt.trim() && !previewUrl) {
        return;
      }
      startOutpaintFromResult({
        prompt: prompt.trim() || 'continue the scene naturally with matching lighting',
        previewUrl,
        negativePrompt,
        model: config.model,
        tool: config.tool,
      });
    },
    [config.model, config.tool]
  );

  const composeOutput = useCallback(
    (prompt: string, previewUrl?: string | null, negativePrompt?: string) => {
      if (!prompt.trim() && !previewUrl) {
        return;
      }
      startComposeFromResult({
        prompt: prompt.trim() || 'compose edit',
        previewUrl,
        negativePrompt,
        model: config.model,
        tool: config.tool,
      });
    },
    [config.model, config.tool]
  );

  const videoOutput = useCallback(
    (prompt: string, previewUrl?: string | null, negativePrompt?: string) => {
      if (!prompt.trim() && !previewUrl) {
        return;
      }
      startVideoFromResult({
        prompt: prompt.trim() || 'cinematic motion',
        previewUrl,
        negativePrompt,
        model: config.model,
        tool: config.tool,
      });
    },
    [config.model, config.tool]
  );

  const controlNetOutput = useCallback(
    (prompt: string, previewUrl?: string | null, negativePrompt?: string) => {
      if (!prompt.trim() && !previewUrl) {
        return;
      }
      startControlNetFromResult({
        prompt: prompt.trim() || 'guided composition',
        previewUrl,
        negativePrompt,
        model: config.model,
        tool: config.tool,
      });
    },
    [config.model, config.tool]
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
    preDiagnostics,
    diagnostics,
    historySaved,
    fixStatus,
    comfyUiStatus,
    comfyUiJob,
    comfyUiPreviewUrl,
    pairCopied,
    resetStatuses,
    runPreLint,
    lintPrompt,
    finalizePrompt,
    fixPrompt,
    saveHistory,
    sendComfyUi,
    sendBatchComfyUi,
    previewWorkflow,
    workflowPreview,
    previewStatus,
    copyPromptPair,
    compactPrompt,
    reformatForModel,
    compactStatus,
    reformatStatus,
    runExportPipeline,
    exportSidecar,
    pipelineStatus,
    setDiagnostics,
    improveOutput,
    refineOutput,
    editPromptOutput,
    inpaintOutput,
    outpaintOutput,
    composeOutput,
    videoOutput,
    controlNetOutput,
    sendSeedVariationBatch,
  };
}
