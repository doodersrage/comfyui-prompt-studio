/**
 * Browser-side film assemble: paint the cut onto a canvas, record it, stamp the gallery.
 */

import { addComfyGalleryEntry } from './comfyui-gallery';
import { loadComfyUiSettings } from './comfyui-settings';
import {
  canStampAssembledFilm,
  filmDownloadFilename,
  type FilmPlaylistShot,
} from './character-film';
import { persistGalleryOriginal } from './gallery-media-client';

const MAX_EDGE = 1280;
const FRAME_RATE = 30;
const VIDEO_BITS_PER_SECOND = 3_000_000;

export type AssembleFilmProgress = {
  ratio: number;
  label: string;
};

function even(value: number): number {
  const rounded = Math.max(2, Math.round(value));
  return rounded % 2 === 0 ? rounded : rounded + 1;
}

function fitSize(width: number, height: number): { width: number; height: number } {
  const w = width > 0 ? width : 1024;
  const h = height > 0 ? height : 1024;
  const edge = Math.max(w, h);
  if (edge <= MAX_EDGE) {
    return { width: even(w), height: even(h) };
  }
  const scale = MAX_EDGE / edge;
  return { width: even(w * scale), height: even(h * scale) };
}

function pickRecorderMime(): { mimeType: string; extension: string } {
  const candidates = [
    { mimeType: 'video/webm;codecs=vp9', extension: 'webm' },
    { mimeType: 'video/webm;codecs=vp8', extension: 'webm' },
    { mimeType: 'video/webm', extension: 'webm' },
    { mimeType: 'video/mp4', extension: 'mp4' },
  ];
  for (const candidate of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(candidate.mimeType)) {
      return candidate;
    }
  }
  return { mimeType: '', extension: 'webm' };
}

function wait(ms: number): Promise<void> {
  return new Promise(resolve => {
    window.setTimeout(resolve, ms);
  });
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Could not load that still.'));
    image.src = url;
  });
}

function loadVideo(url: string): Promise<HTMLVideoElement> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.onloadeddata = () => resolve(video);
    video.onerror = () => reject(new Error('Could not load that clip.'));
    video.src = url;
  });
}

function drawCover(
  context: CanvasRenderingContext2D,
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  canvasWidth: number,
  canvasHeight: number
): void {
  context.fillStyle = '#000';
  context.fillRect(0, 0, canvasWidth, canvasHeight);
  if (sourceWidth <= 0 || sourceHeight <= 0) {
    return;
  }
  const scale = Math.max(canvasWidth / sourceWidth, canvasHeight / sourceHeight);
  const drawWidth = sourceWidth * scale;
  const drawHeight = sourceHeight * scale;
  context.drawImage(
    source,
    (canvasWidth - drawWidth) / 2,
    (canvasHeight - drawHeight) / 2,
    drawWidth,
    drawHeight
  );
}

async function paintFor(
  context: CanvasRenderingContext2D,
  draw: () => void,
  durationSec: number
): Promise<void> {
  const until = performance.now() + durationSec * 1000;
  const tick = () =>
    new Promise<void>(resolve => {
      const step = () => {
        draw();
        if (performance.now() >= until) {
          resolve();
          return;
        }
        requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
  await tick();
}

async function probeSize(shots: FilmPlaylistShot[]): Promise<{ width: number; height: number }> {
  for (const shot of shots) {
    try {
      if (shot.kind === 'clip') {
        const video = await loadVideo(shot.url);
        const size = fitSize(video.videoWidth, video.videoHeight);
        video.removeAttribute('src');
        video.load();
        return size;
      }
      const image = await loadImage(shot.url);
      return fitSize(image.naturalWidth, image.naturalHeight);
    } catch {
      // Try the next shot for a usable frame size.
    }
  }
  return { width: 1024, height: 1024 };
}

export async function assembleFilmBlob(
  shots: FilmPlaylistShot[],
  options?: { onProgress?: (progress: AssembleFilmProgress) => void }
): Promise<{ blob: Blob; mimeType: string; extension: string }> {
  if (typeof document === 'undefined' || typeof MediaRecorder === 'undefined') {
    throw new Error('Assemble needs a browser that can record canvas video.');
  }
  if (shots.length === 0) {
    throw new Error('Include at least one shot in the cut.');
  }

  options?.onProgress?.({ ratio: 0.02, label: 'Checking shots…' });
  for (const shot of shots) {
    try {
      if (shot.kind === 'clip') {
        const video = await loadVideo(shot.url);
        video.removeAttribute('src');
        video.load();
      } else {
        await loadImage(shot.url);
      }
    } catch {
      throw new Error(
        shot.kind === 'clip'
          ? 'Could not load that clip (CORS or a missing file). Same-origin / proxied URLs work; remote hosts must allow canvas.'
          : 'Could not load that still (CORS or a missing file).'
      );
    }
  }

  const { width, height } = await probeSize(shots);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.position = 'fixed';
  canvas.style.left = '-9999px';
  canvas.style.top = '0';
  document.body.appendChild(canvas);

  const context = canvas.getContext('2d', { alpha: false });
  if (!context) {
    canvas.remove();
    throw new Error('Could not open a drawing surface.');
  }
  context.fillStyle = '#000';
  context.fillRect(0, 0, width, height);

  const stream = canvas.captureStream(FRAME_RATE);
  const picked = pickRecorderMime();
  const recorder = picked.mimeType
    ? new MediaRecorder(stream, {
        mimeType: picked.mimeType,
        videoBitsPerSecond: VIDEO_BITS_PER_SECOND,
      })
    : new MediaRecorder(stream, { videoBitsPerSecond: VIDEO_BITS_PER_SECOND });
  const chunks: BlobPart[] = [];
  recorder.ondataavailable = event => {
    if (event.data.size > 0) {
      chunks.push(event.data);
    }
  };

  const stopped = new Promise<void>((resolve, reject) => {
    recorder.onstop = () => resolve();
    recorder.onerror = () => reject(new Error('The browser stopped recording the film.'));
  });

  recorder.start(250);
  await wait(80);

  try {
    for (const [index, shot] of shots.entries()) {
      options?.onProgress?.({
        ratio: index / shots.length,
        label: `Recording ${index + 1} of ${shots.length} · ${shot.title}`,
      });
      if (shot.kind === 'still') {
        const image = await loadImage(shot.url);
        await paintFor(
          context,
          () => drawCover(context, image, image.naturalWidth, image.naturalHeight, width, height),
          shot.holdSec && shot.holdSec > 0 ? shot.holdSec : 2.5
        );
        continue;
      }
      const video = await loadVideo(shot.url);
      video.currentTime = 0;
      const played = await video.play().then(
        () => true,
        () => false
      );
      if (played) {
        await new Promise<void>((resolve, reject) => {
          const draw = () => {
            drawCover(context, video, video.videoWidth, video.videoHeight, width, height);
            if (video.ended) {
              resolve();
              return;
            }
            requestAnimationFrame(draw);
          };
          video.onended = () => resolve();
          video.onerror = () => reject(new Error(`Could not play ${shot.title}.`));
          requestAnimationFrame(draw);
        });
      } else {
        const duration = Number.isFinite(video.duration) ? video.duration : 0;
        const step = 1 / FRAME_RATE;
        for (let time = 0; time <= duration; time += step) {
          await new Promise<void>((resolve, reject) => {
            video.onseeked = () => {
              drawCover(context, video, video.videoWidth, video.videoHeight, width, height);
              resolve();
            };
            video.onerror = () => reject(new Error(`Could not play ${shot.title}.`));
            video.currentTime = Math.min(time, duration);
          });
        }
      }
      video.pause();
      video.removeAttribute('src');
      video.load();
    }
  } finally {
    if (recorder.state !== 'inactive') {
      recorder.stop();
    }
    for (const track of stream.getTracks()) {
      track.stop();
    }
    canvas.remove();
  }

  await stopped;
  options?.onProgress?.({ ratio: 1, label: 'Packing film' });
  const mimeType = recorder.mimeType || picked.mimeType || 'video/webm';
  const blob = new Blob(chunks, { type: mimeType });
  if (blob.size === 0) {
    throw new Error('The assembled film was empty.');
  }
  const extension = mimeType.includes('mp4') ? 'mp4' : picked.extension;
  return { blob, mimeType, extension };
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function downloadFilmBlob(blob: Blob, filename: string): void {
  triggerDownload(blob, filename);
}

export async function stampAssembledFilm(input: {
  blob: Blob;
  filename: string;
  characterId: string;
  characterName: string;
  lookId?: string;
  mimeType?: string;
  onProgress?: (progress: AssembleFilmProgress) => void;
}): Promise<{ persisted: boolean; entryId?: string }> {
  if (!canStampAssembledFilm(input.blob.size)) {
    return { persisted: false };
  }
  const id = crypto.randomUUID();
  const mimeType = input.mimeType || input.blob.type || 'video/webm';
  const file = new File([input.blob], input.filename, { type: mimeType });
  input.onProgress?.({ ratio: 1, label: 'Saving film to gallery' });
  const persisted = await persistGalleryOriginal(id, file);
  if (!persisted || persisted.skipped || !persisted.originalPath || !persisted.originalUrl) {
    return { persisted: false };
  }

  const settings = loadComfyUiSettings();
  addComfyGalleryEntry({
    id,
    promptId: `film-${id}`,
    prompt: `Assembled film · ${input.characterName.trim() || 'character'}`,
    tool: 'roleplay',
    derivedKind: 'film',
    characterId: input.characterId,
    lookId: input.lookId,
    comfyUrl: settings.apiUrl?.trim() || 'http://127.0.0.1:8188',
    status: 'completed',
    completedAt: Date.now(),
    images: [
      {
        filename: input.filename,
        subfolder: '',
        type: 'output',
        format: mimeType,
      },
    ],
    durableOriginalPath: persisted.originalPath,
    durableThumbPath: persisted.thumbPath,
    sourceImageUrl: persisted.originalUrl,
    userTags: ['film'],
  });

  return { persisted: true, entryId: id };
}

export async function assembleAndStampFilm(input: {
  shots: FilmPlaylistShot[];
  characterId: string;
  characterName: string;
  lookId?: string;
  onProgress?: (progress: AssembleFilmProgress) => void;
}): Promise<{
  filename: string;
  blob: Blob;
  persisted: boolean;
  entryId?: string;
}> {
  const assembled = await assembleFilmBlob(input.shots, { onProgress: input.onProgress });
  const filename = filmDownloadFilename(input.characterName, assembled.extension);
  const stamped = await stampAssembledFilm({
    blob: assembled.blob,
    filename,
    characterId: input.characterId,
    characterName: input.characterName,
    lookId: input.lookId,
    mimeType: assembled.mimeType,
    onProgress: input.onProgress,
  });
  return { filename, blob: assembled.blob, ...stamped };
}
