import { buildZipBlob } from './gallery-zip-export';
import {
  galleryEntryLightboxUrls,
  galleryEntryPrimaryViewUrl,
  loadComfyGallery,
} from './comfyui-gallery';
import {
  formatRoleplayStoryMarkdown,
  roleplayStillBasename,
  slugRoleplayExportPart,
  type RoleplayBio,
  type RoleplayStoryBeat,
} from './roleplay';

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function extFromResponse(contentType: string | null, url: string): string {
  const type = contentType?.toLowerCase() ?? '';
  if (type.includes('jpeg') || type.includes('jpg')) {
    return 'jpg';
  }
  if (type.includes('webp')) {
    return 'webp';
  }
  if (type.includes('gif')) {
    return 'gif';
  }
  if (/\.jpe?g(\?|$)/i.test(url)) {
    return 'jpg';
  }
  if (/\.webp(\?|$)/i.test(url)) {
    return 'webp';
  }
  if (/\.gif(\?|$)/i.test(url)) {
    return 'gif';
  }
  return 'png';
}

function stillUrlForBeat(beat: RoleplayStoryBeat): string | null {
  const promptId = beat.promptId?.trim();
  if (promptId) {
    const entry = loadComfyGallery().find(item => item.promptId === promptId);
    if (entry) {
      const lightbox = galleryEntryLightboxUrls(entry)[0]?.trim();
      if (lightbox) {
        return lightbox;
      }
      const view = galleryEntryPrimaryViewUrl(entry)?.trim();
      if (view) {
        return view;
      }
    }
  }
  if (beat.stillStatus === 'completed') {
    return beat.imageUrl?.trim() || null;
  }
  return null;
}

export async function downloadRoleplayUrl(url: string, filename: string): Promise<void> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Download failed (HTTP ${response.status})`);
  }
  const blob = await response.blob();
  triggerDownload(blob, filename);
}

export async function downloadRoleplayStoryBundle(input: {
  bio?: RoleplayBio | null;
  story: RoleplayStoryBeat[];
  tone?: string;
  content?: string;
  personaLabel?: string;
}): Promise<{ files: number; stills: number }> {
  const stillFilenames: Array<string | null> = [];
  const files: Array<{ filename: string; data: Uint8Array }> = [];

  for (const [index, beat] of input.story.entries()) {
    const url = stillUrlForBeat(beat);
    if (!url) {
      stillFilenames.push(null);
      continue;
    }
    try {
      const response = await fetch(url);
      if (!response.ok) {
        stillFilenames.push(null);
        continue;
      }
      const ext = extFromResponse(response.headers.get('content-type'), url);
      const name = `${roleplayStillBasename(beat.title, index)}.${ext}`;
      files.push({
        filename: `stills/${name}`,
        data: new Uint8Array(await response.arrayBuffer()),
      });
      stillFilenames.push(name);
    } catch {
      stillFilenames.push(null);
    }
  }

  const markdown = formatRoleplayStoryMarkdown({
    bio: input.bio,
    story: input.story,
    tone: input.tone,
    content: input.content,
    personaLabel: input.personaLabel,
    stillFilenames,
  });
  files.unshift({
    filename: 'story.md',
    data: new TextEncoder().encode(markdown),
  });

  const blob = buildZipBlob(files);
  const who = slugRoleplayExportPart(input.bio?.name || 'story', 'story');
  const day = new Date().toISOString().slice(0, 10);
  triggerDownload(blob, `roleplay-${who}-${day}.zip`);
  return { files: files.length, stills: stillFilenames.filter(Boolean).length };
}
