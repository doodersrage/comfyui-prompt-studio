'use client';

import { useGalleryHandoff } from '@/hooks/useGalleryHandoff';
import { sharedLlmRequestBody } from '@/lib/llm-request-options';
import { sharedPatchFromGalleryHandoff, type GalleryHandoffPayload } from '@/lib/gallery-handoff';
import { normalizeControlNetMode, type ControlNetMode } from '@/lib/controlnet-prompt';
import type { WorkflowParamValues } from '@/lib/comfyui-config';
import { fileToDataUrl } from '@/lib/browser-file-data-url';
import { resolveLocalImageFile, scanStillWithVision } from '@/lib/vision-still-scan-client';
import type { ControlNetToolOrchestrationCore } from '@/hooks/controlnet/useControlNetToolOrchestrationCore';

export function useControlNetToolOrchestrationPart2(ctx: ControlNetToolOrchestrationCore) {
  const {
    shared,
    updateShared,
    actions,
    mode,
    subject,
    scene,
    detailNotes,
    slotModes,
    setMode,
    setSlotStrengths,
    setSlotModes,
    setSubject,
    refFile,
    setRefFile,
    refPreview,
    setRefPreview,
    scanning,
    setScanning,
    extraRefFiles,
    setExtraRefFiles,
    extraRefPreviews,
    setExtraRefPreviews,
    output,
    setOutput,
    rawPrompt,
    setRawPrompt,
    source,
    setSource,
    loading,
    setLoading,
    error,
    setError,
    copied,
    setCopied,
    setHandoffQueueParams,
    setHandoffParentGalleryEntryId,
    setHandoffSourceImageUrl,
    setHandoffControlImageUrls,
    handoffControlImageUrls,
    handoffSourceImageUrl,
    hintText,
  } = ctx;

  function onRefChange(file: File | null) {
    if (refPreview?.startsWith('blob:')) {
      URL.revokeObjectURL(refPreview);
    }
    setRefFile(file);
    setRefPreview(file ? URL.createObjectURL(file) : null);
  }

  async function scanWithVision() {
    const preview = refPreview || handoffSourceImageUrl || handoffControlImageUrls[0];
    if (!refFile && !preview) {
      setError('Upload a reference image first.');
      return;
    }
    setScanning(true);
    setError(null);
    try {
      const image = await resolveLocalImageFile(refFile, preview, 'controlnet-ref.png');
      const prompt = await scanStillWithVision({
        image,
        purpose: 'controlnet',
        model: shared.model,
        detail: shared.detail,
        extraHints: [subject, scene].filter(Boolean).join(' · ') || undefined,
        shared,
      });
      setSubject(prompt);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Vision scan failed.');
    } finally {
      setScanning(false);
    }
  }

  function onExtraRefChange(index: number, file: File | null) {
    setExtraRefPreviews(previous => {
      const next = [...previous];
      if (next[index]?.startsWith('blob:')) {
        URL.revokeObjectURL(next[index]!);
      }
      next[index] = file ? URL.createObjectURL(file) : null;
      return next;
    });
    setExtraRefFiles(previous => {
      const next = [...previous];
      next[index] = file;
      return next;
    });
  }

  function applyGalleryHandoff(handoff: {
    prompt: string;
    model?: string;
    queueParams?: WorkflowParamValues;
    controlImageUrls?: string[];
    file: File | null;
    previewUrl: string | null;
    payload: GalleryHandoffPayload;
  }) {
    setOutput(handoff.prompt);
    setSubject(handoff.prompt.slice(0, 800));
    setHandoffQueueParams(handoff.queueParams);
    setHandoffParentGalleryEntryId(handoff.payload.galleryEntryId?.trim() || undefined);
    const sharedPatch = sharedPatchFromGalleryHandoff(handoff.payload);
    const restoredModes = (
      handoff.queueParams?.controlNetModes?.length
        ? handoff.queueParams.controlNetModes
        : [handoff.queueParams?.controlNetMode]
    )
      .map(value => normalizeControlNetMode(value))
      .filter(Boolean) as ControlNetMode[];
    if (restoredModes[0]) {
      setMode(restoredModes[0]);
    }
    setSlotModes(previous => {
      const next = [...previous];
      for (let i = 0; i < 4; i += 1) {
        next[i] = restoredModes[i] ?? restoredModes[0] ?? next[i]!;
      }
      return next;
    });
    const restoredStrengths = (handoff.queueParams?.controlNetStrengths ?? []).map(value => {
      const num = typeof value === 'number' ? value : Number(value);
      return Number.isFinite(num) ? Math.min(2, Math.max(0, num)) : 1;
    });
    if (restoredStrengths.length > 0) {
      setSlotStrengths(previous => {
        const next = [...previous];
        for (let i = 0; i < 4; i += 1) {
          next[i] = restoredStrengths[i] ?? restoredStrengths[0] ?? next[i]!;
        }
        return next;
      });
    }
    const controlUrls = (handoff.controlImageUrls ?? [])
      .map(url => url?.trim() || '')
      .filter(Boolean);
    setHandoffControlImageUrls(controlUrls);
    const primaryUrl =
      controlUrls[0] || handoff.previewUrl?.trim() || handoff.payload.imageUrl?.trim() || undefined;
    setHandoffSourceImageUrl(primaryUrl);
    if (handoff.model) {
      updateShared({ model: handoff.model as typeof shared.model, ...sharedPatch });
    } else if (Object.keys(sharedPatch).length > 0) {
      updateShared(sharedPatch);
    }
    if (handoff.file) {
      onRefChange(handoff.file);
    } else if (primaryUrl) {
      setRefPreview(primaryUrl);
    }
    const extras = controlUrls.slice(1, 4);
    if (extras.length > 0) {
      setExtraRefPreviews(previous => {
        const next = [...previous];
        for (let i = 0; i < 3; i += 1) {
          if (next[i]?.startsWith('blob:')) {
            URL.revokeObjectURL(next[i]!);
          }
          next[i] = extras[i] ?? null;
        }
        return next;
      });
    }
  }

  useGalleryHandoff('controlnet', applyGalleryHandoff);

  async function generate() {
    setLoading(true);
    setError(null);
    setCopied(false);
    actions.resetStatuses();

    try {
      const payload: Record<string, unknown> = {
        mode,
        subject,
        scene,
        detail: detailNotes,
        model: shared.model,
        detailLevel: shared.detail,
        ...sharedLlmRequestBody(shared),
      };
      if (refFile) {
        payload.image = await fileToDataUrl(refFile);
        payload.mimeType = refFile.type || 'image/jpeg';
      }

      const response = await fetch('/api/controlnet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = (await response.json()) as {
        prompt?: string;
        error?: string;
        source?: 'text' | 'vision';
      };
      if (!response.ok) {
        throw new Error(data.error ?? 'ControlNet prompt failed.');
      }

      const serverPrompt = data.prompt ?? '';
      const prompt = await actions.finalizePrompt(serverPrompt, hintText);
      setRawPrompt(
        serverPrompt.trim() && serverPrompt.trim() !== prompt.trim()
          ? serverPrompt.trim()
          : undefined
      );
      setOutput(prompt);
      setSource(data.source ?? (refFile ? 'vision' : 'text'));
    } catch (err) {
      setOutput('');
      setRawPrompt(undefined);
      setError(err instanceof Error ? err.message : 'ControlNet prompt failed.');
    } finally {
      setLoading(false);
    }
  }

  async function copyOutput() {
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
  }

  return {
    onRefChange,
    scanWithVision,
    onExtraRefChange,
    generate,
    copyOutput,
    scanning,
    output,
    rawPrompt,
    source,
    loading,
    error,
    copied,
  };
}
