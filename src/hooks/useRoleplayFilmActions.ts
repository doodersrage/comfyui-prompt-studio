'use client';

import { useCallback, useRef, useState, type MutableRefObject } from 'react';
import {
  assembleAndStampFilm,
  downloadFilmBlob,
  stampAssembledFilm,
} from '@/lib/character-film-assemble';
import { roleplayWatchPlaylist } from '@/lib/character-film';
import {
  applyCharacterRecord,
  characterFromRoleplaySession,
  getCharacter,
  loadCharacters,
  upsertCharacterFromRoleplaySession,
} from '@/lib/character-os';
import { snapshotRoleplaySession } from '@/lib/roleplay-library';
import {
  loadSettingsCache,
  saveSharedSettings,
  type RoleplayToolCache,
} from '@/lib/settings-cache';
import type { RoleplayStoryBeat } from '@/lib/roleplay';

export function useRoleplayFilmActions(input: {
  toolSettings: RoleplayToolCache;
  storyRef: MutableRefObject<RoleplayStoryBeat[]>;
  bioName?: string;
}) {
  const [assemblingFilm, setAssemblingFilm] = useState(false);
  const [filmStatus, setFilmStatus] = useState<string | null>(null);
  const [filmNeedsCast, setFilmNeedsCast] = useState(false);
  const assembledFilmRef = useRef<{ filename: string; data: Uint8Array } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cutRoleplayFilm = useCallback(async () => {
    const shots = roleplayWatchPlaylist(input.storyRef.current);
    if (shots.length === 0) {
      setError('Need a completed still or clip before cutting a film.');
      return;
    }
    const name = input.toolSettings.characterName?.trim() || input.bioName?.trim() || 'roleplay';
    const session = snapshotRoleplaySession(input.toolSettings);
    const fromSession = session ? characterFromRoleplaySession(session) : null;
    const character =
      (fromSession ? getCharacter(fromSession.id) : undefined) ||
      loadCharacters().find(entry => {
        const labels = [entry.name, entry.characterName].map(value => value?.trim().toLowerCase());
        return labels.includes(name.toLowerCase());
      });
    setAssemblingFilm(true);
    setError(null);
    setFilmNeedsCast(false);
    setFilmStatus('Checking shots…');
    try {
      const result = await assembleAndStampFilm({
        shots,
        characterId: character?.id ?? '',
        characterName: name,
        lookId: character?.activeLookId,
        onProgress: progress => setFilmStatus(progress.label),
      });
      downloadFilmBlob(result.blob, result.filename);
      assembledFilmRef.current = {
        filename: result.filename,
        data: new Uint8Array(await result.blob.arrayBuffer()),
      };
      if (character && result.persisted) {
        setFilmNeedsCast(false);
        setFilmStatus(`Saved ${result.filename} to ${character.name} and started the download.`);
      } else {
        setFilmNeedsCast(true);
        setFilmStatus(
          character
            ? `Downloaded ${result.filename}. Save to Cast to stamp a studio copy.`
            : `Downloaded ${result.filename} unstamped. Save to Cast to attach this film to a character.`
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not assemble the film.');
      setFilmStatus(null);
    } finally {
      setAssemblingFilm(false);
    }
  }, [input.bioName, input.storyRef, input.toolSettings]);

  const saveFilmToCast = useCallback(() => {
    const session = snapshotRoleplaySession(input.toolSettings);
    if (!session) {
      setError('Name the character and add a beat before saving to Cast.');
      return;
    }
    const created = upsertCharacterFromRoleplaySession(session);
    if (!created) {
      setError('Name the character before saving to Cast.');
      return;
    }
    saveSharedSettings({
      ...loadSettingsCache().shared,
      ...applyCharacterRecord(created),
    });
    const film = assembledFilmRef.current;
    if (!film) {
      setFilmNeedsCast(false);
      setFilmStatus(`Saved ${created.name} to Cast.`);
      return;
    }
    void (async () => {
      const stamped = await stampAssembledFilm({
        blob: new Blob([film.data.slice()]),
        filename: film.filename,
        characterId: created.id,
        characterName: created.name,
        lookId: created.activeLookId,
      });
      setFilmNeedsCast(false);
      setFilmStatus(
        stamped.persisted
          ? `Saved ${created.name} to Cast and stamped ${film.filename}.`
          : `Saved ${created.name} to Cast. Studio storage could not keep the film.`
      );
    })();
  }, [input.toolSettings]);

  return {
    assemblingFilm,
    filmStatus,
    filmNeedsCast,
    cutRoleplayFilm,
    saveFilmToCast,
    filmError: error,
    assembledFilmRef,
    clearFilmError: () => setError(null),
  };
}
