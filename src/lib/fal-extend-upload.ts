import { canFalExtendFromParentUrl } from './video-clip-mode';

/** Upload a local / same-origin clip to Fal CDN so extend-video can fetch it. */
export async function uploadClipToFalCdn(input: {
  url?: string;
  file?: File;
  falApiKey?: string;
}): Promise<string> {
  let file = input.file;
  if (!file) {
    const url = input.url?.trim() || '';
    if (!url) {
      throw new Error('Need a local clip to upload to Fal.');
    }
    if (canFalExtendFromParentUrl(url)) {
      return url;
    }
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error('Could not read the local clip to upload to Fal.');
    }
    const blob = await response.blob();
    file = new File([blob], 'parent-clip.mp4', { type: blob.type || 'video/mp4' });
  }
  const form = new FormData();
  form.append('file', file);
  if (input.falApiKey?.trim()) {
    form.append('falApiKey', input.falApiKey.trim());
  }
  const response = await fetch('/api/fal/media', { method: 'POST', body: form });
  const raw = (await response.json().catch(() => ({}))) as { fileUrl?: string; error?: string };
  const fileUrl = raw.fileUrl?.trim() || '';
  if (!response.ok || !canFalExtendFromParentUrl(fileUrl)) {
    throw new Error(raw.error?.trim() || 'Fal clip upload failed.');
  }
  return fileUrl;
}

export async function resolveFalExtendParentUrl(input: {
  parentUrl?: string | null;
  file?: File;
  falApiKey?: string;
}): Promise<string | null> {
  const parent = input.parentUrl?.trim() || '';
  if (canFalExtendFromParentUrl(parent)) {
    return parent;
  }
  if (!parent && !input.file) {
    return null;
  }
  try {
    return await uploadClipToFalCdn({
      url: parent || undefined,
      file: input.file,
      falApiKey: input.falApiKey,
    });
  } catch {
    return null;
  }
}
