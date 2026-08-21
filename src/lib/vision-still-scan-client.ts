import { sharedLlmRequestBody } from './llm-request-options';
import type { SharedToolSettings } from './settings-cache';
import type { StillScanPurpose } from './vision-still-scan';

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Could not read image file.'));
    reader.readAsDataURL(file);
  });
}

export async function resolveLocalImageFile(
  file: File | null,
  previewUrl: string | null | undefined,
  fallbackName: string
): Promise<File> {
  if (file) {
    return file;
  }
  const url = previewUrl?.trim();
  if (!url) {
    throw new Error('Upload a reference image first.');
  }
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Could not load the still (HTTP ${response.status}).`);
  }
  const blob = await response.blob();
  if (blob.type && !blob.type.startsWith('image/') && blob.type !== 'application/octet-stream') {
    throw new Error('Vision scan needs a still image, not a clip.');
  }
  return new File([blob], fallbackName, { type: blob.type || 'image/png' });
}

export async function scanStillWithVision(options: {
  image: File;
  purpose: StillScanPurpose;
  model?: string;
  detail?: string;
  extraHints?: string;
  shared?: Pick<
    SharedToolSettings,
    | 'sessionLlmTemperature'
    | 'sessionAllowTemplateFallback'
    | 'sessionLlmModel'
    | 'sessionLlmVisionModel'
    | 'sessionLlmEnabled'
    | 'sessionLlmProvider'
    | 'sessionLlmApiKey'
  >;
}): Promise<string> {
  const image = await fileToDataUrl(options.image);
  const response = await fetch('/api/vision-scan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({
      purpose: options.purpose,
      image,
      mimeType: options.image.type || 'image/png',
      model: options.model,
      detail: options.detail,
      extraHints: options.extraHints,
      ...(options.shared ? sharedLlmRequestBody(options.shared) : {}),
    }),
  });
  const data = (await response.json()) as { prompt?: string; error?: string };
  if (!response.ok || !data.prompt?.trim()) {
    throw new Error(data.error ?? 'Vision scan failed.');
  }
  return data.prompt.trim();
}
