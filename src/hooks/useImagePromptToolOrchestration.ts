'use client';

import { useCallback, useState } from 'react';
import { useCachedSettings } from '@/hooks/useCachedSettings';
import { useSeedToolDraft } from '@/hooks/useSeedToolDraft';
import { useGalleryHandoff } from '@/hooks/useGalleryHandoff';
import { usePromptResultActions } from '@/hooks/usePromptResultActions';
import type { ComfyImageModel } from '@/lib/comfy-models/client';
import type { WorkflowParamValues } from '@/lib/comfyui-config';
import { getComfyModelDefinition } from '@/lib/comfy-models/client';
import { getReformatTargetModel } from '@/lib/reformat-target';
import { DEFAULT_IMAGE_PROMPT_TOOL_CACHE } from '@/lib/settings-cache';
import { sharedLlmRequestBody } from '@/lib/llm-request-options';
import { rememberDraftFields } from '@/lib/remember-draft-fields';
import type { EnrichedToolGenerateResult, ToolGenerateResult } from '@/lib/specialized/types';
import { getImagePromptPreset } from '@/lib/image-prompt-presets';
import { prepareVisionScanImagePayload } from '@/lib/vision-scan-still';

export type RefImageUpload = {
  id: string;
  file: File;
  previewUrl: string;
  role: string;
  strength: number;
};

export function useImagePromptToolOrchestration() {
  const { mounted, shared, toolSettings, updateShared, updateToolSettings } = useCachedSettings(
    'imagePrompt',
    DEFAULT_IMAGE_PROMPT_TOOL_CACHE
  );
  const [refImages, setRefImages] = useState<RefImageUpload[]>([]);
  const [output, setOutput] = useState('');
  const [result, setResult] = useState<
    (ToolGenerateResult & { diagnostics?: EnrichedToolGenerateResult['diagnostics'] }) | null
  >(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [refineIntent, setRefineIntent] = useState('');
  const [handoffQueueParams, setHandoffQueueParams] = useState<WorkflowParamValues | undefined>();

  useSeedToolDraft(mounted, {
    toolKey: 'image-prompt',
    label: 'Image → Prompt',
    href: '/image-prompt',
    fields: [toolSettings.extraHints, output],
  });

  const actions = usePromptResultActions({
    tool: 'imagePrompt',
    model: shared.model,
    detail: shared.detail,
    hints: toolSettings.extraHints,
    autoFixRules: shared.autoFixRules !== false,
    reformatTarget: getReformatTargetModel(shared.model),
  });

  const selectedModel = getComfyModelDefinition(shared.model);
  const inferredSport = result?.diagnostics?.inferred.sport ?? null;
  const selectedPreset = getImagePromptPreset(toolSettings.descriptionPreset ?? 'standard');

  const addRefImage = useCallback((nextFile: File, role = '', replace = false) => {
    setRefImages(previous => {
      if (!replace && previous.length >= 4) {
        return previous;
      }
      const entry: RefImageUpload = {
        id: `${Date.now()}-${nextFile.name}`,
        file: nextFile,
        previewUrl: URL.createObjectURL(nextFile),
        role: role || (replace ? 'primary' : `reference ${previous.length + 1}`),
        strength: replace || previous.length === 0 ? 1 : 0.75,
      };
      if (replace) {
        for (const image of previous) {
          URL.revokeObjectURL(image.previewUrl);
        }
        return [entry];
      }
      return [...previous, entry];
    });
  }, []);

  const applyGalleryHandoff = useCallback(
    (handoff: {
      prompt: string;
      model?: string;
      queueParams?: WorkflowParamValues;
      file: File | null;
      previewUrl: string | null;
    }) => {
      updateToolSettings({
        extraHints: `Reference prompt from gallery:\n${handoff.prompt.slice(0, 1200)}`,
      });
      rememberDraftFields({
        toolKey: 'image-prompt',
        label: 'Image → Prompt',
        href: '/image-prompt',
        fields: [handoff.prompt.slice(0, 240)],
      });
      setHandoffQueueParams(handoff.queueParams);
      if (handoff.model) {
        updateShared({ model: handoff.model as ComfyImageModel });
      }
      if (handoff.file) {
        addRefImage(handoff.file, 'gallery reference');
      }
    },
    [addRefImage, updateShared, updateToolSettings]
  );

  useGalleryHandoff('imagePrompt', applyGalleryHandoff);

  const removeRefImage = useCallback((id: string) => {
    setRefImages(previous => {
      const target = previous.find(entry => entry.id === id);
      if (target) {
        URL.revokeObjectURL(target.previewUrl);
      }
      return previous.filter(entry => entry.id !== id);
    });
  }, []);

  const onFileChange = useCallback(
    (nextFile: File | null) => {
      if (!nextFile) {
        setRefImages(previous => {
          for (const entry of previous) {
            URL.revokeObjectURL(entry.previewUrl);
          }
          return [];
        });
        return;
      }
      addRefImage(nextFile, 'primary', true);
    },
    [addRefImage]
  );

  const generate = useCallback(async () => {
    if (refImages.length === 0) {
      setError('Upload at least one image.');
      return;
    }

    setLoading(true);
    setError(null);
    setCopied(false);
    actions.resetStatuses();

    try {
      let data: ToolGenerateResult & { error?: string };

      if (refImages.length === 1) {
        const { image, mimeType } = await prepareVisionScanImagePayload(refImages[0].file);
        const response = await fetch('/api/image-prompt', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({
            image,
            mimeType,
            model: shared.model,
            detail: shared.detail,
            focus: toolSettings.focus ?? 'full',
            descriptionPreset: toolSettings.descriptionPreset ?? 'standard',
            extraHints: toolSettings.extraHints?.trim() || undefined,
            ...sharedLlmRequestBody(shared),
          }),
        });
        data = (await response.json()) as ToolGenerateResult & { error?: string };
        if (!response.ok) {
          throw new Error(data.error ?? 'Generation failed.');
        }
      } else {
        const images = await Promise.all(
          refImages.map(async entry => {
            const payload = await prepareVisionScanImagePayload(entry.file);
            return {
              image: payload.image,
              mimeType: payload.mimeType,
              role: entry.role,
              focus: toolSettings.focus ?? 'full',
              strength: entry.strength,
            };
          })
        );
        const response = await fetch('/api/image-prompt/multi', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            images,
            model: shared.model,
            detail: shared.detail,
            descriptionPreset: toolSettings.descriptionPreset ?? 'standard',
            extraHints: toolSettings.extraHints?.trim() || undefined,
            ...sharedLlmRequestBody(shared),
          }),
        });
        data = (await response.json()) as ToolGenerateResult & { error?: string };
        if (!response.ok) {
          throw new Error(data.error ?? 'Generation failed.');
        }
      }

      const prompt = await actions.finalizePrompt(data.prompt, toolSettings.extraHints);
      setOutput(prompt);
      setResult({ ...data, prompt });
      rememberDraftFields({
        toolKey: 'image-prompt',
        label: 'Image → Prompt',
        href: '/image-prompt',
        fields: [prompt, toolSettings.extraHints],
      });
    } catch (err) {
      setOutput('');
      setResult(null);
      setError(err instanceof Error ? err.message : 'Generation failed.');
    } finally {
      setLoading(false);
    }
  }, [refImages, shared, toolSettings, actions]);

  const copyOutput = useCallback(async () => {
    if (!output) return;
    try {
      await navigator.clipboard.writeText(output);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Could not copy to clipboard.');
    }
  }, [output]);

  const refine = useCallback(async () => {
    const primary = refImages[0];
    if (!primary || !refineIntent.trim()) {
      setError('Upload an image and describe what you wanted.');
      return;
    }

    setLoading(true);
    setError(null);
    actions.resetStatuses();

    let stage = 'read-image';
    try {
      const { image, mimeType } = await prepareVisionScanImagePayload(primary.file);
      stage = 'request';
      const response = await fetch('/api/refine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image,
          mimeType,
          model: shared.model,
          detail: shared.detail,
          currentPrompt: output || undefined,
          intentHints: refineIntent.trim(),
          ...sharedLlmRequestBody(shared),
        }),
      });

      stage = 'parse-response';
      const data = (await response.json()) as EnrichedToolGenerateResult & {
        error?: string;
        stage?: string;
      };

      if (!response.ok) {
        const serverStage = data.stage ? ` [${data.stage}]` : '';
        throw new Error(`${data.error ?? 'Refine failed.'}${serverStage}`);
      }

      stage = 'finalize';
      const prompt = await actions.finalizePrompt(data.prompt, refineIntent);
      setOutput(prompt);
      setResult({
        ...data,
        prompt,
        diagnostics: data.diagnostics ?? actions.diagnostics ?? undefined,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Refine failed.';
      setError(
        message.includes('[') || message.startsWith('Refine failed')
          ? message
          : `Refine failed at ${stage}: ${message}`
      );
    } finally {
      setLoading(false);
    }
  }, [refImages, refineIntent, output, shared, actions]);

  return {
    mounted,
    shared,
    toolSettings,
    updateShared,
    updateToolSettings,
    refImages,
    setRefImages,
    output,
    setOutput,
    result,
    loading,
    error,
    copied,
    refineIntent,
    setRefineIntent,
    handoffQueueParams,
    actions,
    selectedModel,
    inferredSport,
    selectedPreset,
    addRefImage,
    removeRefImage,
    onFileChange,
    generate,
    copyOutput,
    refine,
  };
}
