'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import {
  deleteRoleplayLibrarySession,
  loadRoleplayLibrary,
  ROLEPLAY_LIBRARY_UPDATED_EVENT,
  type RoleplayLibrarySession,
} from '@/lib/roleplay-library';
import { ROLEPLAY_CONTENT, ROLEPLAY_TONES } from '@/lib/roleplay';

function formatSessionWhen(value: number): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(value);
  } catch {
    return new Date(value).toLocaleString();
  }
}

function sessionMeta(session: RoleplayLibrarySession): string {
  const tone =
    ROLEPLAY_TONES.find(entry => entry.id === session.snapshot.tone)?.label ??
    session.snapshot.tone;
  const content =
    ROLEPLAY_CONTENT.find(entry => entry.id === session.snapshot.content)?.label ??
    session.snapshot.content;
  const beats = session.beatCount === 1 ? '1 beat' : `${session.beatCount} beats`;
  return [beats, tone, content, formatSessionWhen(session.updatedAt)].filter(Boolean).join(' · ');
}

export default function RoleplayLibraryPanel({
  activeSessionId,
  busy,
  onContinue,
  onNew,
  onDeleted,
}: {
  activeSessionId?: string;
  busy?: boolean;
  onContinue: (session: RoleplayLibrarySession) => void;
  onNew: () => void;
  onDeleted?: (id: string) => void;
}) {
  const [sessions, setSessions] = useState<RoleplayLibrarySession[]>(() => loadRoleplayLibrary());

  const refresh = useCallback(() => {
    setSessions(loadRoleplayLibrary());
  }, []);

  useEffect(() => {
    window.addEventListener(ROLEPLAY_LIBRARY_UPDATED_EVENT, refresh);
    return () => window.removeEventListener(ROLEPLAY_LIBRARY_UPDATED_EVENT, refresh);
  }, [refresh]);

  if (sessions.length === 0) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-[var(--text-muted)]">
          Sessions with a bio or story are archived here automatically. Continue one later, or start
          a new cast.
        </p>
        <Button variant="secondary" size="sm" disabled={busy} onClick={onNew}>
          New session
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-[var(--text-muted)]">
          {sessions.length} saved {sessions.length === 1 ? 'session' : 'sessions'}. Continue one or
          delete it.
        </p>
        <Button variant="secondary" size="sm" disabled={busy} onClick={onNew}>
          New session
        </Button>
      </div>
      <ul className="space-y-2">
        {sessions.map(session => {
          const active = session.id === activeSessionId;
          return (
            <li
              key={session.id}
              className="flex items-center gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-muted)]/30 p-2.5"
            >
              {session.coverImageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={session.coverImageUrl}
                  alt=""
                  className="h-14 w-14 shrink-0 rounded-lg object-cover"
                />
              ) : (
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-[var(--bg-muted)] text-xs text-[var(--text-muted)]">
                  RP
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-[var(--text-primary)]">
                  {session.title}
                  {active ? (
                    <span className="ml-2 type-caption text-[var(--accent-text)]">Open</span>
                  ) : null}
                </p>
                <p className="truncate type-caption text-[var(--text-muted)]">
                  {sessionMeta(session)}
                </p>
              </div>
              <div className="flex shrink-0 flex-col gap-1 sm:flex-row">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={busy || active}
                  onClick={() => onContinue(session)}
                >
                  Continue
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  onClick={() => {
                    if (
                      !window.confirm(
                        `Delete “${session.title}” from the library? This does not delete gallery stills.`
                      )
                    ) {
                      return;
                    }
                    deleteRoleplayLibrarySession(session.id);
                    refresh();
                    onDeleted?.(session.id);
                  }}
                >
                  Delete
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
