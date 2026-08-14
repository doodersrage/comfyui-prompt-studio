import 'server-only';

import fs from 'node:fs';
import path from 'node:path';
import { resolvePromptDataDir } from './prompt-data-paths';
import { isServerStorageEnabled } from './server-storage';

const SAFE_ID = /^[A-Za-z0-9._-]{1,128}$/;

export type DurableMediaFile = {
  buffer: Buffer;
  contentType: string;
};

function mediaOwner(userId?: string | null): string {
  const raw = userId?.trim() || '_global';
  return SAFE_ID.test(raw) ? raw : '_global';
}

function assertSafeId(id: string, label: string): string {
  const trimmed = id.trim();
  if (!SAFE_ID.test(trimmed)) {
    throw new Error(`Invalid ${label}.`);
  }
  return trimmed;
}

function dataRoot(): string {
  return resolvePromptDataDir();
}

function thumbDir(owner: string, entryId: string): string {
  return path.join(/* turbopackIgnore: true */ dataRoot(), 'gallery-media', owner, entryId);
}

function identityDir(owner: string): string {
  return path.join(/* turbopackIgnore: true */ dataRoot(), 'identity', owner);
}

export function durableThumbRelativePath(owner: string, entryId: string): string {
  return `gallery-media/${owner}/${entryId}/thumb.webp`;
}

export function persistGalleryOriginalFile(input: {
  userId?: string | null;
  entryId: string;
  buffer: Buffer;
  contentType?: string;
  filename?: string;
}): { relativePath: string } {
  if (!isServerStorageEnabled()) {
    throw new Error('Server storage is disabled.');
  }
  const owner = mediaOwner(input.userId);
  const entryId = assertSafeId(input.entryId, 'gallery id');
  const dir = thumbDir(owner, entryId);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'original'), input.buffer);
  fs.writeFileSync(
    path.join(dir, 'original.meta.json'),
    JSON.stringify({
      contentType: input.contentType?.trim() || 'application/octet-stream',
      filename: input.filename?.trim() || 'upload.png',
    })
  );
  return { relativePath: `gallery-media/${owner}/${entryId}/original` };
}

export function readGalleryOriginalFile(input: {
  userId?: string | null;
  entryId: string;
}): (DurableMediaFile & { filename?: string }) | null {
  if (!isServerStorageEnabled()) {
    return null;
  }
  const owner = mediaOwner(input.userId);
  const entryId = assertSafeId(input.entryId, 'gallery id');
  const filePath = path.join(thumbDir(owner, entryId), 'original');
  if (!fs.existsSync(filePath)) {
    return null;
  }
  let contentType = 'application/octet-stream';
  let filename: string | undefined;
  try {
    const metaRaw = fs.readFileSync(
      path.join(thumbDir(owner, entryId), 'original.meta.json'),
      'utf8'
    );
    const meta = JSON.parse(metaRaw) as { contentType?: string; filename?: string };
    if (typeof meta.contentType === 'string' && meta.contentType.trim()) {
      contentType = meta.contentType.trim();
    }
    if (typeof meta.filename === 'string' && meta.filename.trim()) {
      filename = meta.filename.trim();
    }
  } catch {
    // Missing meta is fine — serve as octet-stream.
  }
  return {
    buffer: fs.readFileSync(filePath),
    contentType,
    filename,
  };
}

export function persistGalleryThumbFile(input: {
  userId?: string | null;
  entryId: string;
  buffer: Buffer;
}): { relativePath: string } {
  if (!isServerStorageEnabled()) {
    throw new Error('Server storage is disabled.');
  }
  const owner = mediaOwner(input.userId);
  const entryId = assertSafeId(input.entryId, 'gallery id');
  const dir = thumbDir(owner, entryId);
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, 'thumb.webp');
  fs.writeFileSync(filePath, input.buffer);
  return { relativePath: durableThumbRelativePath(owner, entryId) };
}

export function readGalleryThumbFile(input: {
  userId?: string | null;
  entryId: string;
}): DurableMediaFile | null {
  if (!isServerStorageEnabled()) {
    return null;
  }
  const owner = mediaOwner(input.userId);
  const entryId = assertSafeId(input.entryId, 'gallery id');
  const filePath = path.join(thumbDir(owner, entryId), 'thumb.webp');
  if (!fs.existsSync(filePath)) {
    return null;
  }
  return {
    buffer: fs.readFileSync(filePath),
    contentType: 'image/webp',
  };
}

export function persistIdentityFile(input: {
  userId?: string | null;
  buffer: Buffer;
  contentType?: string;
  filename?: string;
}): { relativePath: string } {
  if (!isServerStorageEnabled()) {
    throw new Error('Server storage is disabled.');
  }
  const owner = mediaOwner(input.userId);
  const dir = identityDir(owner);
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, 'lock');
  fs.writeFileSync(filePath, input.buffer);
  const meta = {
    contentType: input.contentType?.trim() || 'application/octet-stream',
    filename: input.filename?.trim() || 'identity.png',
  };
  fs.writeFileSync(path.join(dir, 'lock.meta.json'), JSON.stringify(meta));
  return { relativePath: `identity/${owner}/lock` };
}

export function readIdentityFile(input: { userId?: string | null }): DurableMediaFile | null {
  if (!isServerStorageEnabled()) {
    return null;
  }
  const owner = mediaOwner(input.userId);
  const filePath = path.join(identityDir(owner), 'lock');
  if (!fs.existsSync(filePath)) {
    return null;
  }
  let contentType = 'application/octet-stream';
  try {
    const metaRaw = fs.readFileSync(path.join(identityDir(owner), 'lock.meta.json'), 'utf8');
    const meta = JSON.parse(metaRaw) as { contentType?: string };
    if (typeof meta.contentType === 'string' && meta.contentType.trim()) {
      contentType = meta.contentType.trim();
    }
  } catch {
    // Missing meta is fine — serve as octet-stream.
  }
  return {
    buffer: fs.readFileSync(filePath),
    contentType,
  };
}
