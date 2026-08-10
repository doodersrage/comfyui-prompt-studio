'use client';

import { galleryEntryThumbUrls, loadComfyGallery, type ComfyGalleryEntry } from './comfyui-gallery';
import { rankImagesWithVision, type BestOfNImageCandidate } from './best-of-n-rank';
import { markExperimentWinner } from './experiment-winners';

async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Failed to read image.'));
    reader.readAsDataURL(blob);
  });
}

export async function galleryEntryToDataUrl(entry: ComfyGalleryEntry): Promise<string | null> {
  const imageUrl = galleryEntryThumbUrls(entry)[0];
  if (!imageUrl) {
    return null;
  }
  try {
    const response = await fetch(imageUrl);
    if (!response.ok) {
      return null;
    }
    return blobToDataUrl(await response.blob());
  } catch {
    return null;
  }
}

export async function waitForGalleryPromptIds(
  promptIds: string[],
  options?: { timeoutMs?: number; pollMs?: number }
): Promise<ComfyGalleryEntry[]> {
  const timeoutMs = options?.timeoutMs ?? 20 * 60_000;
  const pollMs = options?.pollMs ?? 4_000;
  const wanted = new Set(promptIds.filter(Boolean));
  if (wanted.size === 0) {
    return [];
  }

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const entries = loadComfyGallery().filter(entry => wanted.has(entry.promptId));
    const terminal = entries.filter(
      entry => entry.status === 'completed' || entry.status === 'error'
    );
    if (terminal.length >= wanted.size) {
      return entries.filter(entry => entry.status === 'completed');
    }
    await new Promise(resolve => window.setTimeout(resolve, pollMs));
  }

  return loadComfyGallery().filter(
    entry => wanted.has(entry.promptId) && entry.status === 'completed'
  );
}

export async function buildVisionCandidatesFromEntries(
  entries: ComfyGalleryEntry[]
): Promise<BestOfNImageCandidate[]> {
  const candidates: BestOfNImageCandidate[] = [];
  for (const entry of entries) {
    const imageDataUrl = await galleryEntryToDataUrl(entry);
    if (!imageDataUrl) {
      continue;
    }
    candidates.push({
      id: entry.id,
      prompt: entry.prompt,
      imageDataUrl,
    });
  }
  return candidates;
}

export async function rankGalleryEntriesWithVision(
  entries: ComfyGalleryEntry[],
  keep: number
): Promise<ComfyGalleryEntry[]> {
  if (entries.length <= keep) {
    return entries;
  }
  const candidates = await buildVisionCandidatesFromEntries(entries);
  if (candidates.length <= keep) {
    return entries.slice(0, keep);
  }
  const ranked = await rankImagesWithVision(candidates, keep);
  const rankOrder = new Map(ranked.map((entry, index) => [entry.id, index]));
  return [...entries]
    .filter(entry => rankOrder.has(entry.id))
    .sort((a, b) => (rankOrder.get(a.id) ?? 99) - (rankOrder.get(b.id) ?? 99));
}

export async function crownBestVisionEntryForGroup(
  groupId: string,
  entries: ComfyGalleryEntry[]
): Promise<ComfyGalleryEntry | null> {
  const ranked = await rankGalleryEntriesWithVision(entries, 1);
  const winner = ranked[0];
  if (!winner) {
    return null;
  }
  markExperimentWinner(groupId, winner.id);
  return winner;
}

export async function runPostQueueVisionCull(
  promptIds: string[],
  keep: number
): Promise<{ kept: ComfyGalleryEntry[]; completed: number }> {
  const completed = await waitForGalleryPromptIds(promptIds);
  const kept = await rankGalleryEntriesWithVision(completed, keep);
  return { kept, completed: completed.length };
}
