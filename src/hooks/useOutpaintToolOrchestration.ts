'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useCachedSettings } from '@/hooks/useCachedSettings';
import { useGalleryHandoff } from '@/hooks/useGalleryHandoff';
import { usePromptResultActions } from '@/hooks/usePromptResultActions';
import type { ComfyImageModel } from '@/lib/comfy-models/client';
import { getComfyModelDefinition } from '@/lib/comfy-models/client';
import { DEFAULT_OUTPAINT_DENOISE, isInpaintModel } from '@/lib/model-denoise-defaults';
import {
  buildOutpaintInstruction,
  normalizeOutpaintInsets,
  outpaintInsetsHavePad,
  renderOutpaintPadAndMask,
} from '@/lib/outpaint-canvas';
import { sharedPatchFromGalleryHandoff } from '@/lib/gallery-handoff';
import { DEFAULT_OUTPAINT_TOOL_CACHE } from '@/lib/settings-cache';
import { rememberDraftFields } from '@/lib/remember-draft-fields';
import { resolveLocalImageFile, scanStillWithVision } from '@/lib/vision-still-scan-client';

const DEFAULT_OUTPAINT_MODEL: ComfyImageModel = 'flux-inpaint';

function dataUrlToFile(dataUrl: string, filename: string): File {
  const [header, base64] = dataUrl.split(',');
  const mime = /data:(.*?);/.exec(header ?? '')?.[1] ?? 'image/png';
  const binary = atob(base64 ?? '');
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new File([bytes], filename, { type: mime });
}

export function useOutpaintToolOrchestration() {
  const { mounted, shared, toolSettings, updateShared, updateToolSettings } = useCachedSettings(
    'outpaint',
    DEFAULT_OUTPAINT_TOOL_CACHE
  );
  const modelInitializedRef = useRef(false);

  const intent =
    toolSettings.intent?.trim() ||
    DEFAULT_OUTPAINT_TOOL_CACHE.intent ||
    'continue the scene naturally with matching lighting';
  const pad = {
    top: toolSettings.padTop ?? DEFAULT_OUTPAINT_TOOL_CACHE.padTop,
    right: toolSettings.padRight ?? DEFAULT_OUTPAINT_TOOL_CACHE.padRight,
    bottom: toolSettings.padBottom ?? DEFAULT_OUTPAINT_TOOL_CACHE.padBottom,
    left: toolSettings.padLeft ?? DEFAULT_OUTPAINT_TOOL_CACHE.padLeft,
  };

  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [output, setOutput] = useState('');
  const [copied, setCopied] = useState(false);
  const [lastQueueOptions, setLastQueueOptions] = useState<{
    inputImage: File;
    maskImage: File;
    queueParamsBase: { width: string; height: string; denoise: string };
  } | null>(null);

  const actions = usePromptResultActions({
    tool: 'outpaint',
    model: shared.model,
    detail: shared.detail,
    hints: intent,
    autoFixRules: shared.autoFixRules !== false,
  });

  const selectedModel = getComfyModelDefinition(shared.model);
  const liveInstruction = useMemo(
    () => buildOutpaintInstruction(normalizeOutpaintInsets(pad), intent),
    [intent, pad]
  );
  const resultOutput = output.trim() || liveInstruction;

  useEffect(() => {
    if (!mounted || modelInitializedRef.current) {
      return;
    }
    modelInitializedRef.current = true;
    if (!isInpaintModel(shared.model)) {
      updateShared({ model: DEFAULT_OUTPAINT_MODEL });
    }
  }, [mounted, shared.model, updateShared]);

  const setIntent = useCallback(
    (value: string) => {
      updateToolSettings({ intent: value });
      rememberDraftFields({
        toolKey: 'outpaint',
        label: 'Outpaint',
        href: '/outpaint',
        fields: [value],
      });
    },
    [updateToolSettings]
  );

  const setPadSide = useCallback(
    (side: 'top' | 'right' | 'bottom' | 'left', value: number) => {
      const key =
        side === 'top'
          ? 'padTop'
          : side === 'right'
            ? 'padRight'
            : side === 'bottom'
              ? 'padBottom'
              : 'padLeft';
      updateToolSettings({ [key]: Math.max(0, Math.min(1024, Math.round(value) || 0)) });
    },
    [updateToolSettings]
  );

  const revokeSourceUrl = useCallback((url: string | null) => {
    if (url?.startsWith('blob:')) {
      URL.revokeObjectURL(url);
    }
  }, []);

  const onFile = useCallback(
    (file: File | null) => {
      setSourceUrl(current => {
        revokeSourceUrl(current);
        return file ? URL.createObjectURL(file) : null;
      });
      setError(null);
      setStatus(file ? `Loaded ${file.name}` : null);
    },
    [revokeSourceUrl]
  );

  const scanWithVision = useCallback(async () => {
    if (!sourceUrl) {
      setError('Upload a source image first.');
      return;
    }
    setScanning(true);
    setError(null);
    try {
      const image = await resolveLocalImageFile(null, sourceUrl, 'outpaint-source.png');
      const prompt = await scanStillWithVision({
        image,
        purpose: 'outpaint',
        model: shared.model,
        detail: shared.detail,
        extraHints: intent.trim() || undefined,
        shared,
      });
      setIntent(prompt);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Vision scan failed.');
    } finally {
      setScanning(false);
    }
  }, [intent, setIntent, shared, sourceUrl]);

  const applyGalleryHandoff = useCallback(
    (handoff: {
      prompt: string;
      model?: string;
      file: File | null;
      previewUrl: string | null;
      payload: import('@/lib/gallery-handoff').GalleryHandoffPayload;
    }) => {
      if (handoff.prompt.trim()) {
        setIntent(handoff.prompt.trim());
      }
      if (handoff.file || handoff.previewUrl) {
        setSourceUrl(current => {
          revokeSourceUrl(current);
          return handoff.previewUrl;
        });
      }
      const patch = sharedPatchFromGalleryHandoff(handoff.payload);
      const modelPatch =
        handoff.model && isInpaintModel(handoff.model)
          ? { model: handoff.model as ComfyImageModel }
          : {};
      if (Object.keys(patch).length > 0 || Object.keys(modelPatch).length > 0) {
        updateShared({ ...patch, ...modelPatch });
      }
      setStatus('Loaded gallery handoff.');
    },
    [revokeSourceUrl, setIntent, updateShared]
  );

  useGalleryHandoff('outpaint', applyGalleryHandoff);

  const runOutpaint = useCallback(async () => {
    if (!sourceUrl) {
      setError('Choose a source image first.');
      return;
    }
    const insets = normalizeOutpaintInsets(pad);
    if (!outpaintInsetsHavePad(insets)) {
      setError('Set at least one pad side above zero.');
      return;
    }
    if (!isInpaintModel(shared.model)) {
      updateShared({ model: DEFAULT_OUTPAINT_MODEL });
    }
    setBusy(true);
    setError(null);
    setStatus('Preparing padded canvas + mask…');
    try {
      const image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('Could not decode source image.'));
        img.src = sourceUrl;
      });
      const rendered = await renderOutpaintPadAndMask(image, insets);
      const imageFile = dataUrlToFile(rendered.imageDataUrl, 'outpaint-source.png');
      const maskFile = dataUrlToFile(rendered.maskDataUrl, 'outpaint-mask.png');
      const instruction = buildOutpaintInstruction(insets, intent);
      const denoise =
        typeof shared.editDenoiseStrength === 'number' &&
        Number.isFinite(shared.editDenoiseStrength)
          ? shared.editDenoiseStrength
          : DEFAULT_OUTPAINT_DENOISE;
      const queueOptions = {
        inputImage: imageFile,
        maskImage: maskFile,
        queueParamsBase: {
          width: String(rendered.width),
          height: String(rendered.height),
          denoise: String(denoise),
        },
      };
      setLastQueueOptions(queueOptions);
      setOutput(instruction);
      setStatus('Queueing outpaint…');
      await actions.sendComfyUi(instruction, undefined, undefined, queueOptions);
      setStatus(actions.comfyUiStatus ?? 'Outpaint queued.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Outpaint failed.');
      setStatus(null);
    } finally {
      setBusy(false);
    }
  }, [actions, intent, pad, shared.editDenoiseStrength, shared.model, sourceUrl, updateShared]);

  const copyOutput = useCallback(async () => {
    if (!resultOutput.trim()) {
      return;
    }
    await navigator.clipboard.writeText(resultOutput);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }, [resultOutput]);

  const clearSource = useCallback(() => {
    onFile(null);
    setStatus(null);
    setError(null);
  }, [onFile]);

  return {
    mounted,
    shared,
    toolSettings,
    updateShared,
    updateToolSettings,
    intent,
    pad,
    sourceUrl,
    scanning,
    status,
    error,
    busy,
    output,
    setOutput,
    copied,
    lastQueueOptions,
    actions,
    selectedModel,
    resultOutput,
    setIntent,
    setPadSide,
    onFile,
    scanWithVision,
    runOutpaint,
    copyOutput,
    clearSource,
  };
}
