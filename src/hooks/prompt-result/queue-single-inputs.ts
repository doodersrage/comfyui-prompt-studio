import type { ComfyImageModel } from '@/lib/comfy-models/client';
import type { WorkflowParamValues } from '@/lib/comfyui-config';
import { loadSettingsCache } from '@/lib/settings-cache';
import { engineDisplayName } from '@/lib/engine/capabilities';
import type { EngineAdapter } from '@/lib/engine/types';
import { resolveQueueInputImage, resolveQueueInputImageFilename } from '@/lib/queue-input-image';
import type { SendComfyUiOptions } from '@/hooks/prompt-result/comfy-ui-types';

export type QueueSingleInputsResult = {
  inputImageFilename?: string;
  inputImageFilenames: string[];
  uploadedFigureSize?: { width: number; height: number };
  clipMode?: import('@/lib/video-clip-mode').VideoClipMode;
  parentVideoUrl: string;
  maskImageFilename?: string;
  controlImageFilename?: string;
  controlImageFilenames: string[];
};

export async function resolveQueueSingleInputs(input: {
  options?: SendComfyUiOptions;
  queueModel: ComfyImageModel;
  effectiveTool: string;
  cloudEngine: boolean;
  engineAdapter: EngineAdapter;
  setComfyUiStatus: (status: string) => void;
}): Promise<QueueSingleInputsResult> {
  const { options, queueModel, effectiveTool, cloudEngine, engineAdapter, setComfyUiStatus } =
    input;

  let inputImageFilename = options?.inputImageFilename?.trim();
  let uploadedFigureSize: { width: number; height: number } | undefined;
  let sourceImageRef: { name: string; subfolder?: string; type?: string } | undefined =
    inputImageFilename ? { name: inputImageFilename, type: 'input', subfolder: '' } : undefined;
  const uploadedFilenames: string[] = [
    ...(options?.inputImageFilenames ?? []).map(name => name?.trim() ?? ''),
  ];
  while (uploadedFilenames.length < 4) {
    uploadedFilenames.push('');
  }

  if (options?.inputImage || options?.inputImageUrl?.trim()) {
    setComfyUiStatus(cloudEngine ? 'Uploading reference image…' : 'Uploading image to ComfyUI…');
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
      uploadedFigureSize = { width: uploaded.width, height: uploaded.height };
    }
    if (inputImageFilename) {
      uploadedFilenames[0] = inputImageFilename;
    }
  } else if (inputImageFilename) {
    uploadedFilenames[0] = inputImageFilename;
  }

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
  while (inputImageFilenames.length > 0 && !inputImageFilenames[inputImageFilenames.length - 1]) {
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

  return {
    inputImageFilename,
    inputImageFilenames,
    uploadedFigureSize,
    clipMode,
    parentVideoUrl,
    maskImageFilename,
    controlImageFilename,
    controlImageFilenames,
  };
}
