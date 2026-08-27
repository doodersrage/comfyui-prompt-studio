'use client';

import type { ReactNode } from 'react';
import { Button, ButtonLink } from '@/components/ui/Button';

export type RoleplayFilmCutActionsProps = {
  assemblingFilm: boolean;
  busy: boolean;
  storyEmpty: boolean;
  filmNeedsCast: boolean;
  filmCharacterId: string | null | undefined;
  filmStatus: string | null | undefined;
  onCutFilm: () => void;
  onSaveToCast: () => void;
  /** Optional leading controls (e.g. Download story) kept in the same flex row. */
  children?: ReactNode;
};

export default function RoleplayFilmCutActions({
  assemblingFilm,
  busy,
  storyEmpty,
  filmNeedsCast,
  filmCharacterId,
  filmStatus,
  onCutFilm,
  onSaveToCast,
  children,
}: RoleplayFilmCutActionsProps) {
  return (
    <>
      <div className="flex flex-wrap gap-2">
        {children}
        <Button
          variant="secondary"
          loading={assemblingFilm}
          loadingLabel="Cutting film"
          disabled={storyEmpty || (busy && !assemblingFilm)}
          onClick={onCutFilm}
        >
          Cut film
        </Button>
        {filmNeedsCast ? (
          <Button
            variant="ghost"
            disabled={busy}
            onClick={onSaveToCast}
            data-testid="roleplay-save-film-cast"
          >
            Save to Cast
          </Button>
        ) : null}
        {filmCharacterId && filmStatus && !assemblingFilm ? (
          <ButtonLink
            href={`/characters/${encodeURIComponent(filmCharacterId)}?media=films`}
            size="sm"
            variant="ghost"
            data-testid="roleplay-open-cast-film"
            onClick={() => {
              void import('@/lib/onboarding-hooks').then(({ markOnboardingWatchFirstFilm }) => {
                markOnboardingWatchFirstFilm();
              });
            }}
          >
            Open on Cast
          </ButtonLink>
        ) : null}
        {filmCharacterId && filmStatus && !assemblingFilm ? (
          <ButtonLink
            href={`/gallery?character=${encodeURIComponent(filmCharacterId)}&derivedKind=film`}
            size="sm"
            variant="ghost"
            data-testid="roleplay-open-gallery"
          >
            Open in Gallery
          </ButtonLink>
        ) : null}
        {filmCharacterId && filmStatus && !assemblingFilm ? (
          <ButtonLink
            href={`/play?character=${encodeURIComponent(filmCharacterId)}`}
            size="sm"
            variant="secondary"
            data-testid="roleplay-campaign-complete"
          >
            Campaign complete — Open Play
          </ButtonLink>
        ) : null}
      </div>
      {filmStatus ? <p className="type-caption text-[var(--text-muted)]">{filmStatus}</p> : null}
    </>
  );
}
