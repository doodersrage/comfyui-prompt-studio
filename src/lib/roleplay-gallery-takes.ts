/**
 * Gallery take management for roleplay story beats: still/clip take
 * arrays, retry/patch helpers, and queue-result merging, extracted from
 * roleplay.ts to keep that file from growing without bound.
 */
import {
  type RoleplayStoryBeat,
  type RoleplayStillTake,
  type RoleplayClipTake,
  type RoleplayStillStatus,
  MAX_ROLEPLAY_STILL_TAKES,
  MAX_ROLEPLAY_CLIP_TAKES,
} from './roleplay';

export type RoleplayGalleryStill = {
  promptId: string;
  status: 'pending' | 'running' | 'completed' | 'error';
  imageUrl?: string | null;
};

function stillStatusFromGallery(
  status: RoleplayGalleryStill['status']
): Exclude<RoleplayStillStatus, 'writing'> {
  if (status === 'pending') {
    return 'queued';
  }
  return status;
}

function takeHasStill(take: RoleplayStillTake): boolean {
  return Boolean(take.promptId?.trim() || take.imageUrl?.trim() || take.stillStatus);
}

function activeFieldsFromTake(
  take: RoleplayStillTake | undefined
): Pick<RoleplayStoryBeat, 'promptId' | 'imageUrl' | 'stillStatus'> {
  return {
    promptId: take?.promptId,
    imageUrl: take?.imageUrl,
    stillStatus: take?.stillStatus,
  };
}

export function roleplayStillTakes(beat: RoleplayStoryBeat): RoleplayStillTake[] {
  const stored = Array.isArray(beat.stillTakes) ? beat.stillTakes.filter(takeHasStill) : [];
  const current: RoleplayStillTake = {
    promptId: beat.promptId,
    imageUrl: beat.imageUrl,
    stillStatus: beat.stillStatus,
  };
  if (stored.length === 0) {
    return takeHasStill(current) ? [current] : [];
  }
  if (!takeHasStill(current)) {
    return stored.slice(-MAX_ROLEPLAY_STILL_TAKES);
  }
  const index =
    typeof beat.stillTakeIndex === 'number' &&
    Number.isInteger(beat.stillTakeIndex) &&
    beat.stillTakeIndex >= 0 &&
    beat.stillTakeIndex < stored.length
      ? beat.stillTakeIndex
      : stored.length - 1;
  const overlay = (take: RoleplayStillTake): RoleplayStillTake => ({
    promptId: current.promptId ?? take.promptId,
    imageUrl: current.imageUrl ?? take.imageUrl,
    stillStatus: current.stillStatus ?? take.stillStatus,
  });
  const currentId = current.promptId?.trim();
  if (currentId) {
    const found = stored.findIndex(take => take.promptId?.trim() === currentId);
    if (found >= 0) {
      return stored.map((take, takeIndex) => (takeIndex === found ? overlay(take) : take));
    }
    return [...stored, current].slice(-MAX_ROLEPLAY_STILL_TAKES);
  }
  return stored.map((take, takeIndex) => (takeIndex === index ? overlay(take) : take));
}

export function roleplayStillTakeIndex(beat: RoleplayStoryBeat): number {
  const takes = roleplayStillTakes(beat);
  if (takes.length === 0) {
    return 0;
  }
  if (
    typeof beat.stillTakeIndex === 'number' &&
    Number.isInteger(beat.stillTakeIndex) &&
    beat.stillTakeIndex >= 0 &&
    beat.stillTakeIndex < takes.length
  ) {
    return beat.stillTakeIndex;
  }
  const currentId = beat.promptId?.trim();
  if (currentId) {
    const found = takes.findIndex(take => take.promptId?.trim() === currentId);
    if (found >= 0) {
      return found;
    }
  }
  return takes.length - 1;
}

export function shownRoleplayStillTake(beat: RoleplayStoryBeat): RoleplayStillTake | undefined {
  const takes = roleplayStillTakes(beat);
  return takes[roleplayStillTakeIndex(beat)];
}

export function lastCompletedRoleplayStillUrl(beat: RoleplayStoryBeat): string | null {
  const takes = roleplayStillTakes(beat);
  for (let index = takes.length - 1; index >= 0; index -= 1) {
    const url = takes[index]?.stillStatus === 'completed' ? takes[index]?.imageUrl?.trim() : '';
    if (url) {
      return url;
    }
  }
  return beat.stillStatus === 'completed' ? beat.imageUrl?.trim() || null : null;
}

export function roleplayBeatPromptIds(beat: RoleplayStoryBeat): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const take of roleplayStillTakes(beat)) {
    const id = take.promptId?.trim();
    if (id && !seen.has(id)) {
      seen.add(id);
      ids.push(id);
    }
  }
  const current = beat.promptId?.trim();
  if (current && !seen.has(current)) {
    ids.push(current);
  }
  for (const take of roleplayClipTakes(beat)) {
    const id = take.clipPromptId?.trim();
    if (id && !seen.has(id)) {
      seen.add(id);
      ids.push(id);
    }
  }
  const clipId = beat.clipPromptId?.trim();
  if (clipId && !seen.has(clipId)) {
    ids.push(clipId);
  }
  return ids;
}

export function roleplayStoryPromptIds(story: RoleplayStoryBeat[] | undefined): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const beat of story ?? []) {
    for (const id of roleplayBeatPromptIds(beat)) {
      if (!seen.has(id)) {
        seen.add(id);
        ids.push(id);
      }
    }
  }
  return ids;
}

export function roleplayStillHasInFlightTake(beat: RoleplayStoryBeat): boolean {
  return roleplayStillTakes(beat).some(
    take =>
      take.stillStatus === 'writing' ||
      take.stillStatus === 'queued' ||
      take.stillStatus === 'running'
  );
}

export function canRetryRoleplayStill(beat: RoleplayStoryBeat): boolean {
  if (!beat.prompt?.trim() || roleplayStillHasInFlightTake(beat)) {
    return false;
  }
  return roleplayStillTakes(beat).some(
    take =>
      take.stillStatus === 'completed' ||
      take.stillStatus === 'error' ||
      Boolean(take.promptId?.trim()) ||
      Boolean(take.imageUrl?.trim())
  );
}

export function selectRoleplayStillTakePatch(
  beat: RoleplayStoryBeat,
  index: number
): Partial<RoleplayStoryBeat> {
  const takes = roleplayStillTakes(beat);
  if (takes.length === 0) {
    return {};
  }
  const nextIndex = Math.max(0, Math.min(takes.length - 1, Math.trunc(index)));
  return {
    stillTakes: takes,
    stillTakeIndex: nextIndex,
    ...activeFieldsFromTake(takes[nextIndex]),
  };
}

export function beginRoleplayStillRetryPatch(beat: RoleplayStoryBeat): Partial<RoleplayStoryBeat> {
  const previous = roleplayStillTakes(beat).filter(take =>
    Boolean(take.promptId?.trim() || take.imageUrl?.trim())
  );
  const capped = previous.slice(-(MAX_ROLEPLAY_STILL_TAKES - 1));
  const nextTakes: RoleplayStillTake[] = [...capped, { stillStatus: 'writing' }];
  return {
    stillTakes: nextTakes,
    stillTakeIndex: nextTakes.length - 1,
    promptId: undefined,
    imageUrl: undefined,
    stillStatus: 'writing',
  };
}

function takeHasClip(take: RoleplayClipTake): boolean {
  return Boolean(take.clipPromptId?.trim() || take.clipUrl?.trim() || take.clipStatus);
}

function activeClipFieldsFromTake(
  take: RoleplayClipTake | undefined
): Pick<RoleplayStoryBeat, 'clipPromptId' | 'clipUrl' | 'clipStatus'> {
  return {
    clipPromptId: take?.clipPromptId,
    clipUrl: take?.clipUrl,
    clipStatus: take?.clipStatus,
  };
}

export function roleplayClipTakes(beat: RoleplayStoryBeat): RoleplayClipTake[] {
  const stored = Array.isArray(beat.clipTakes) ? beat.clipTakes.filter(takeHasClip) : [];
  const current: RoleplayClipTake = {
    clipPromptId: beat.clipPromptId,
    clipUrl: beat.clipUrl,
    clipStatus: beat.clipStatus,
  };
  if (stored.length === 0) {
    return takeHasClip(current) ? [current] : [];
  }
  if (!takeHasClip(current)) {
    return stored.slice(-MAX_ROLEPLAY_CLIP_TAKES);
  }
  const index =
    typeof beat.clipTakeIndex === 'number' &&
    Number.isInteger(beat.clipTakeIndex) &&
    beat.clipTakeIndex >= 0 &&
    beat.clipTakeIndex < stored.length
      ? beat.clipTakeIndex
      : stored.length - 1;
  const overlay = (take: RoleplayClipTake): RoleplayClipTake => ({
    clipPromptId: current.clipPromptId ?? take.clipPromptId,
    clipUrl: current.clipUrl ?? take.clipUrl,
    clipStatus: current.clipStatus ?? take.clipStatus,
  });
  const currentId = current.clipPromptId?.trim();
  if (currentId) {
    const found = stored.findIndex(take => take.clipPromptId?.trim() === currentId);
    if (found >= 0) {
      return stored.map((take, takeIndex) => (takeIndex === found ? overlay(take) : take));
    }
    return [...stored, current].slice(-MAX_ROLEPLAY_CLIP_TAKES);
  }
  return stored.map((take, takeIndex) => (takeIndex === index ? overlay(take) : take));
}

export function roleplayClipTakeIndex(beat: RoleplayStoryBeat): number {
  const takes = roleplayClipTakes(beat);
  if (takes.length === 0) {
    return 0;
  }
  if (
    typeof beat.clipTakeIndex === 'number' &&
    Number.isInteger(beat.clipTakeIndex) &&
    beat.clipTakeIndex >= 0 &&
    beat.clipTakeIndex < takes.length
  ) {
    return beat.clipTakeIndex;
  }
  const currentId = beat.clipPromptId?.trim();
  if (currentId) {
    const found = takes.findIndex(take => take.clipPromptId?.trim() === currentId);
    if (found >= 0) {
      return found;
    }
  }
  return takes.length - 1;
}

export function roleplayClipHasInFlightTake(beat: RoleplayStoryBeat): boolean {
  return roleplayClipTakes(beat).some(
    take =>
      take.clipStatus === 'writing' || take.clipStatus === 'queued' || take.clipStatus === 'running'
  );
}

export function canRetryRoleplayClip(beat: RoleplayStoryBeat): boolean {
  if (roleplayClipHasInFlightTake(beat)) {
    return false;
  }
  const hasPrompt = Boolean(beat.prompt?.trim() || beat.blurb?.trim());
  const hasStill = Boolean(lastCompletedRoleplayStillUrl(beat));
  if (!hasPrompt && !hasStill) {
    return false;
  }
  return roleplayClipTakes(beat).some(
    take =>
      take.clipStatus === 'completed' ||
      take.clipStatus === 'error' ||
      Boolean(take.clipPromptId?.trim()) ||
      Boolean(take.clipUrl?.trim())
  );
}

export function selectRoleplayClipTakePatch(
  beat: RoleplayStoryBeat,
  index: number
): Partial<RoleplayStoryBeat> {
  const takes = roleplayClipTakes(beat);
  if (takes.length === 0) {
    return {};
  }
  const nextIndex = Math.max(0, Math.min(takes.length - 1, Math.trunc(index)));
  return {
    clipTakes: takes,
    clipTakeIndex: nextIndex,
    ...activeClipFieldsFromTake(takes[nextIndex]),
  };
}

export function beginRoleplayClipRetryPatch(beat: RoleplayStoryBeat): Partial<RoleplayStoryBeat> {
  const previous = roleplayClipTakes(beat).filter(take =>
    Boolean(take.clipPromptId?.trim() || take.clipUrl?.trim())
  );
  const capped = previous.slice(-(MAX_ROLEPLAY_CLIP_TAKES - 1));
  const nextTakes: RoleplayClipTake[] = [...capped, { clipStatus: 'writing' }];
  return {
    clipTakes: nextTakes,
    clipTakeIndex: nextTakes.length - 1,
    clipPromptId: undefined,
    clipUrl: undefined,
    clipStatus: 'writing',
  };
}

export function roleplayClipQueueResultPatch(
  beat: RoleplayStoryBeat,
  promptId: string | undefined
): Partial<RoleplayStoryBeat> {
  const status: RoleplayStillStatus = promptId ? 'queued' : 'error';
  const takes = roleplayClipTakes(beat);
  const nextTake: RoleplayClipTake = { clipPromptId: promptId, clipStatus: status };
  if (takes.length === 0) {
    return {
      clipTakes: [nextTake],
      clipTakeIndex: 0,
      clipPromptId: promptId,
      clipUrl: undefined,
      clipStatus: status,
    };
  }
  const index = roleplayClipTakeIndex(beat);
  const nextTakes = takes.map((take, takeIndex) =>
    takeIndex === index ? { ...take, clipPromptId: promptId, clipStatus: status } : take
  );
  return {
    clipTakes: nextTakes,
    clipTakeIndex: index,
    clipPromptId: promptId,
    clipUrl: nextTakes[index]?.clipUrl,
    clipStatus: status,
  };
}

export function roleplayStillQueueResultPatch(
  beat: RoleplayStoryBeat,
  promptId: string | undefined
): Partial<RoleplayStoryBeat> {
  const status: RoleplayStillStatus = promptId ? 'queued' : 'error';
  const takes = roleplayStillTakes(beat);
  const nextTake: RoleplayStillTake = { promptId, stillStatus: status };
  if (takes.length === 0) {
    return {
      stillTakes: [nextTake],
      stillTakeIndex: 0,
      promptId,
      imageUrl: undefined,
      stillStatus: status,
    };
  }
  const index = roleplayStillTakeIndex(beat);
  const nextTakes = takes.map((take, takeIndex) =>
    takeIndex === index ? { ...take, promptId, stillStatus: status } : take
  );
  return {
    stillTakes: nextTakes,
    stillTakeIndex: index,
    promptId,
    imageUrl: nextTakes[index]?.imageUrl,
    stillStatus: status,
  };
}

export function mergeRoleplayStoryStills(
  story: RoleplayStoryBeat[] | undefined,
  stills: RoleplayGalleryStill[]
): { story: RoleplayStoryBeat[]; changed: boolean } {
  const byPromptId = new Map(
    stills.map(entry => [entry.promptId.trim(), entry] as const).filter(([id]) => Boolean(id))
  );
  let changed = false;
  const next = (story ?? []).map(beat => {
    const takes = roleplayStillTakes(beat);
    let takeChanged = false;
    const updatedTakes = takes.map(take => {
      const id = take.promptId?.trim();
      if (!id) {
        return take;
      }
      const match = byPromptId.get(id);
      if (!match) {
        return take;
      }
      const imageUrl = match.imageUrl?.trim() || take.imageUrl;
      const stillStatus = stillStatusFromGallery(match.status);
      if (take.imageUrl === imageUrl && take.stillStatus === stillStatus) {
        return take;
      }
      takeChanged = true;
      return { ...take, imageUrl, stillStatus };
    });
    const clipTakes = roleplayClipTakes(beat);
    let clipTakeChanged = false;
    const updatedClipTakes = clipTakes.map(take => {
      const id = take.clipPromptId?.trim();
      if (!id) {
        return take;
      }
      const match = byPromptId.get(id);
      if (!match) {
        return take;
      }
      const clipUrl = match.imageUrl?.trim() || take.clipUrl;
      const clipStatus = stillStatusFromGallery(match.status);
      if (take.clipUrl === clipUrl && take.clipStatus === clipStatus) {
        return take;
      }
      clipTakeChanged = true;
      return { ...take, clipUrl, clipStatus };
    });

    if (!takeChanged && !clipTakeChanged) {
      return beat;
    }
    changed = true;
    const indexedBeat = { ...beat, stillTakes: updatedTakes };
    const index = roleplayStillTakeIndex(indexedBeat);
    const shown = updatedTakes[index];
    const indexedClipBeat = { ...beat, clipTakes: updatedClipTakes };
    const clipIndex = roleplayClipTakeIndex(indexedClipBeat);
    const shownClip = updatedClipTakes[clipIndex];
    return {
      ...beat,
      ...(updatedTakes.length > 0
        ? {
            stillTakes: updatedTakes,
            stillTakeIndex: index,
            ...activeFieldsFromTake(shown),
          }
        : {}),
      ...(updatedClipTakes.length > 0
        ? {
            clipTakes: updatedClipTakes,
            clipTakeIndex: clipIndex,
            ...activeClipFieldsFromTake(shownClip),
          }
        : {}),
    };
  });
  return { story: next, changed };
}
