'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button, ButtonLink } from '@/components/ui/Button';
import { ToolBadge, ToolLayout, ToolSection } from '@/components/ui/ToolPageShell';
import CharacterOsPicker from '@/components/CharacterOsPicker';
import { useCachedSettings } from '@/hooks/useCachedSettings';
import {
  addCharacterLookPack,
  applyCharacterRecord,
  characterFromShared,
  getCharacter,
  getCharacterLookPack,
  lookPacksOf,
  upsertCharacter,
} from '@/lib/character-os';
import {
  clearLookPackShareHash,
  downloadLookPackFile,
  loadLookPack,
  buildPortableLookPackShareLink,
  copyPortableLookPackShareLink,
  parseLookPackFile,
  readPortableLookPackFromHash,
  saveLookPack,
  type LookPack,
} from '@/lib/look-pack';
import { markOnboardingFirstPlayCampaign } from '@/lib/onboarding-hooks';
import {
  clearPlayCampaignState,
  loadPlayCampaignState,
  PLAY_CAMPAIGN_STEPS,
  playCampaignHref,
  resolveCampaignLookPackId,
  savePlayCampaignState,
  stagePlayCampaignHandoff,
  type PlayCampaignStepId,
} from '@/lib/play-campaign';
import {
  loadSettingsCache,
  saveSharedSettings,
  DEFAULT_ROLEPLAY_TOOL_CACHE,
} from '@/lib/settings-cache';
import { scheduleAfterCommit } from '@/lib/schedule-after-commit';

const ACCENT = 'amber' as const;

type PlayCampaignWizardProps = {
  /** When embedded on Cast home, skip character pick if id is known. */
  initialCharacterId?: string;
};

export default function PlayCampaignWizard({ initialCharacterId }: PlayCampaignWizardProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { mounted, shared, updateShared } = useCachedSettings(
    'roleplay',
    DEFAULT_ROLEPLAY_TOOL_CACHE
  );
  const [status, setStatus] = useState<string | null>(null);
  const [shareCopyStatus, setShareCopyStatus] = useState<string | null>(null);
  const [stepOverride, setStepOverride] = useState<PlayCampaignStepId | null>(null);
  const lookPackFileRef = useRef<HTMLInputElement | null>(null);

  const queryCharacterId = searchParams.get('character')?.trim() || '';
  const queryLookPackId = searchParams.get('lookPack')?.trim() || '';
  const characterId = (
    initialCharacterId ||
    queryCharacterId ||
    shared.activeCharacterId ||
    ''
  ).trim();
  const character = characterId ? getCharacter(characterId) : undefined;

  const durableCampaign = useMemo(() => {
    if (!mounted) {
      return null;
    }
    const saved = loadPlayCampaignState();
    if (!saved || saved.stepIndex <= 0) {
      return null;
    }
    return saved;
  }, [mounted]);

  const campaignCharacterMismatch = Boolean(
    durableCampaign && characterId && durableCampaign.characterId !== characterId
  );

  const savedCampaign =
    durableCampaign && characterId && durableCampaign.characterId === characterId
      ? durableCampaign
      : null;

  const effectiveLookPackId =
    resolveCampaignLookPackId({
      queryLookPackId,
      savedLookPackId: savedCampaign?.lookPackId ?? durableCampaign?.lookPackId,
    }) ?? '';

  const restoredStep = useMemo((): PlayCampaignStepId | null => {
    if (!mounted || !savedCampaign) {
      return null;
    }
    return PLAY_CAMPAIGN_STEPS[savedCampaign.stepIndex]?.id ?? 'character';
  }, [mounted, savedCampaign]);

  const activeStep = stepOverride ?? restoredStep ?? 'character';

  const resumeStep = savedCampaign ? (PLAY_CAMPAIGN_STEPS[savedCampaign.stepIndex] ?? null) : null;
  const campaignComplete = Boolean(savedCampaign?.completedAt);

  const savedLookPacks = useMemo(() => (character ? lookPacksOf(character) : []), [character]);

  const activeLookPack = useMemo((): LookPack | null => {
    if (effectiveLookPackId && character) {
      return getCharacterLookPack(character.id, effectiveLookPackId)?.pack ?? null;
    }
    return loadLookPack() ?? null;
  }, [character, effectiveLookPackId]);

  const portableShareLink = useMemo(() => {
    if (!activeLookPack) {
      return null;
    }
    return buildPortableLookPackShareLink({
      pack: activeLookPack,
      name: character?.name,
      id: effectiveLookPackId || undefined,
    });
  }, [activeLookPack, character?.name, effectiveLookPackId]);

  const persistCharacter = useCallback(
    (id: string) => {
      const record = getCharacter(id);
      if (!record) {
        return;
      }
      saveSharedSettings({
        ...loadSettingsCache().shared,
        ...applyCharacterRecord(record),
      });
      updateShared(applyCharacterRecord(record));
    },
    [updateShared]
  );

  // Cross-machine share: ingest `#lookpack=` portable payload once on mount.
  useEffect(() => {
    if (!mounted) {
      return;
    }
    const portable = readPortableLookPackFromHash();
    if (!portable) {
      return;
    }
    clearLookPackShareHash();
    scheduleAfterCommit(() => {
      if (!character) {
        const defaultName =
          portable.name?.trim() || portable.pack.characterId?.trim() || 'Imported look';
        const name =
          typeof window !== 'undefined'
            ? window
                .prompt('Name the new Cast character for this look pack', defaultName)
                ?.trim() || defaultName
            : defaultName;
        const createdList = upsertCharacter(
          characterFromShared(loadSettingsCache().shared, { name })
        );
        const record = createdList.at(-1) ?? getCharacter(createdList[0]?.id ?? '');
        if (!record) {
          saveLookPack(portable.pack);
          setStatus('Look pack staged — could not create a Cast character.');
          return;
        }
        const withPack = addCharacterLookPack(record.id, portable.name || 'Imported look', {
          ...portable.pack,
          characterId: record.id,
          source: 'saved',
        });
        const entry = withPack ? lookPacksOf(withPack)[0] : undefined;
        persistCharacter(record.id);
        saveLookPack({
          ...portable.pack,
          characterId: record.id,
          source: 'saved',
        });
        if (entry) {
          router.replace(
            `/play?character=${encodeURIComponent(record.id)}&lookPack=${encodeURIComponent(entry.id)}`
          );
        } else {
          router.replace(`/play?character=${encodeURIComponent(record.id)}`);
        }
        setStatus(`Created Cast "${record.name}" from share link.`);
        return;
      }
      const saved = addCharacterLookPack(character.id, portable.name || 'Shared look', {
        ...portable.pack,
        characterId: character.id,
        source: 'saved',
      });
      const entry = saved ? lookPacksOf(saved)[0] : undefined;
      saveLookPack({ ...portable.pack, characterId: character.id, source: 'saved' });
      if (entry) {
        router.replace(
          `/play?character=${encodeURIComponent(character.id)}&lookPack=${encodeURIComponent(entry.id)}`
        );
      }
      setStatus(`Imported shared look pack onto ${character.name}.`);
    });
    // One-shot hash ingest.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted]);

  // Resume: restore saved look pack into session + URL when campaign has lookPackId.
  useEffect(() => {
    if (!mounted || !savedCampaign || !character) {
      return;
    }
    const packId = savedCampaign.lookPackId;
    if (!packId || queryLookPackId) {
      return;
    }
    const saved = getCharacterLookPack(character.id, packId);
    if (!saved) {
      return;
    }
    saveLookPack({ ...saved.pack, characterId: character.id, source: 'saved' });
    router.replace(playCampaignHref(character.id, packId));
  }, [mounted, savedCampaign, character, queryLookPackId, router]);

  const goToStep = useCallback(
    (stepId: PlayCampaignStepId, pack?: LookPack | null) => {
      if (!characterId) {
        setStatus('Pick a Cast character first.');
        return;
      }
      persistCharacter(characterId);
      const stepIndex = PLAY_CAMPAIGN_STEPS.findIndex(entry => entry.id === stepId);
      savePlayCampaignState({
        version: 1,
        characterId,
        lookPackId: effectiveLookPackId || undefined,
        stepIndex: stepIndex >= 0 ? stepIndex : 0,
        updatedAt: Date.now(),
      });
      if (stepId !== 'character') {
        markOnboardingFirstPlayCampaign();
        void import('@/lib/local-observability').then(
          ({ noteCampaignStepMetric, noteCampaignMaxStepMetric }) => {
            noteCampaignStepMetric();
            noteCampaignMaxStepMetric(stepIndex >= 0 ? stepIndex : 0);
          }
        );
      }
      const handoff = pack ?? activeLookPack;
      if (handoff && stepId !== 'character' && stepId !== 'moodboard') {
        stagePlayCampaignHandoff({ ...handoff, characterId });
      }
      const step = PLAY_CAMPAIGN_STEPS.find(entry => entry.id === stepId);
      if (!step) {
        return;
      }
      router.push(step.href({ characterId, pack: handoff }));
    },
    [activeLookPack, characterId, effectiveLookPackId, persistCharacter, router]
  );

  const startNewCampaign = useCallback(() => {
    if (!characterId) {
      setStatus('Pick a Cast character first.');
      return;
    }
    void import('@/lib/onboarding-hooks').then(({ markOnboardingWatchFirstFilm }) => {
      markOnboardingWatchFirstFilm();
    });
    clearPlayCampaignState();
    setStepOverride(null);
    goToStep('moodboard', activeLookPack);
  }, [activeLookPack, characterId, goToStep]);

  const applySavedLookPack = useCallback(
    (lookPackId: string) => {
      if (!character) {
        return;
      }
      const saved = getCharacterLookPack(character.id, lookPackId);
      if (!saved) {
        setStatus('That look pack is no longer on this character.');
        return;
      }
      saveLookPack(saved.pack);
      scheduleAfterCommit(() => setStatus(`Loaded "${saved.name}" — continue to Fitting or Day.`));
      router.replace(
        `/play?character=${encodeURIComponent(character.id)}&lookPack=${encodeURIComponent(saved.id)}`
      );
    },
    [character, router]
  );

  if (!mounted) {
    return null;
  }

  return (
    <div data-testid="play-campaign">
      <ToolLayout
        accent={ACCENT}
        badge={<ToolBadge accent={ACCENT}>Play campaign</ToolBadge>}
        title="Play campaign"
        description="One guided loop: Moodboard vibe → Fitting try-ons → Day reel → Roleplay story."
      >
        <ToolSection
          title="Character"
          description="The campaign stays tied to one Cast record."
          data-testid="play-campaign-character"
        >
          <CharacterOsPicker
            shared={shared}
            hints={character?.hints}
            onApply={patch => {
              try {
                updateShared(patch);
                if (patch.activeCharacterId) {
                  persistCharacter(patch.activeCharacterId);
                }
              } catch (err) {
                setStatus(err instanceof Error ? err.message : 'Could not apply that character.');
              }
            }}
          />
          {character ? (
            <p className="type-caption mt-2 text-[var(--text-muted)]">
              Active: {character.name}
              {activeLookPack ? ' · look pack staged' : ''}
            </p>
          ) : (
            <div
              className="mt-3 flex flex-wrap items-center gap-2"
              data-testid="play-campaign-create-character"
            >
              <p className="type-caption text-[var(--text-muted)]">
                Pick a Cast character above, or create one before Moodboard.
              </p>
              <ButtonLink href="/characters" size="sm" variant="secondary">
                Open Cast
              </ButtonLink>
            </div>
          )}
        </ToolSection>

        <ToolSection
          title="Share look pack"
          description="Export JSON to another machine, or import a pack onto this Cast character (creates Cast when none is selected)."
        >
          <input
            ref={lookPackFileRef}
            type="file"
            accept="application/json,.json"
            className="sr-only"
            data-testid="play-look-pack-import"
            onChange={event => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (!file) {
                return;
              }
              void parseLookPackFile(file).then(portable => {
                if (!portable) {
                  setStatus('That file is not a Prompt Studio look pack.');
                  return;
                }
                if (!character) {
                  const defaultName =
                    portable.name?.trim() || portable.pack.characterId?.trim() || 'Imported look';
                  const name =
                    typeof window !== 'undefined'
                      ? window
                          .prompt('Name the new Cast character for this look pack', defaultName)
                          ?.trim() || defaultName
                      : defaultName;
                  const createdList = upsertCharacter(
                    characterFromShared(loadSettingsCache().shared, { name })
                  );
                  const record = createdList.at(-1) ?? getCharacter(createdList[0]?.id ?? '');
                  if (!record) {
                    saveLookPack(portable.pack);
                    setStatus('Look pack staged — could not create a Cast character.');
                    return;
                  }
                  const withPack = addCharacterLookPack(
                    record.id,
                    portable.name || 'Imported look',
                    {
                      ...portable.pack,
                      characterId: record.id,
                      source: 'saved',
                    }
                  );
                  const entry = withPack ? lookPacksOf(withPack)[0] : undefined;
                  persistCharacter(record.id);
                  saveLookPack({
                    ...portable.pack,
                    characterId: record.id,
                    source: 'saved',
                  });
                  if (entry) {
                    router.replace(
                      `/play?character=${encodeURIComponent(record.id)}&lookPack=${encodeURIComponent(entry.id)}`
                    );
                  } else {
                    router.replace(`/play?character=${encodeURIComponent(record.id)}`);
                  }
                  setStatus(`Created Cast "${record.name}" and imported the look pack.`);
                  return;
                }
                const saved = addCharacterLookPack(
                  character.id,
                  portable.name || 'Imported look',
                  portable.pack
                );
                const entry = saved ? lookPacksOf(saved)[0] : undefined;
                saveLookPack({ ...portable.pack, characterId: character.id, source: 'saved' });
                if (entry) {
                  router.replace(
                    `/play?character=${encodeURIComponent(character.id)}&lookPack=${encodeURIComponent(entry.id)}`
                  );
                }
                setStatus(`Imported "${portable.name || 'look pack'}" onto ${character.name}.`);
              });
            }}
          />
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="secondary"
              disabled={!activeLookPack}
              data-testid="play-look-pack-export"
              onClick={() => {
                if (!activeLookPack) {
                  return;
                }
                const saved = effectiveLookPackId
                  ? getCharacterLookPack(characterId, effectiveLookPackId)
                  : undefined;
                downloadLookPackFile({
                  pack: activeLookPack,
                  name: saved?.name || character?.name || 'look-pack',
                  id: saved?.id,
                });
                setStatus('Downloaded look pack JSON.');
              }}
            >
              Export JSON
            </Button>
            <Button size="sm" variant="secondary" onClick={() => lookPackFileRef.current?.click()}>
              Import JSON
            </Button>
            {activeLookPack && portableShareLink ? (
              <>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={portableShareLink.tooLarge}
                  data-testid="play-campaign-share-copy"
                  onClick={() => {
                    void copyPortableLookPackShareLink({
                      pack: activeLookPack,
                      name: character?.name,
                      id: effectiveLookPackId || undefined,
                    }).then(result => {
                      if (result.tooLarge) {
                        setShareCopyStatus('Pack too large for a URL — use Export JSON instead.');
                        return;
                      }
                      setShareCopyStatus(
                        result.ok ? 'Share link copied.' : (result.error ?? 'Could not copy link.')
                      );
                    });
                  }}
                >
                  Copy share link
                </Button>
                {portableShareLink.tooLarge ? (
                  <p
                    className="type-caption w-full text-[var(--text-muted)]"
                    data-testid="play-campaign-share-too-large"
                  >
                    Pack too large for a URL ({portableShareLink.tokenChars} chars) — use Export
                    JSON.
                  </p>
                ) : null}
              </>
            ) : null}
          </div>
          {shareCopyStatus ? (
            <p className="type-caption mt-2 text-[var(--text-muted)]">{shareCopyStatus}</p>
          ) : null}
        </ToolSection>

        {savedLookPacks.length > 0 ? (
          <ToolSection
            title="Saved look packs"
            description="Reuse a vibe without re-running Moodboard vision."
            data-testid="play-campaign-look-packs"
          >
            <ul className="ui-list">
              {savedLookPacks.map(entry => (
                <li key={entry.id} className="ui-list-row items-center">
                  <div className="ui-list-primary min-w-0">
                    <p className="type-heading">{entry.name}</p>
                    <p className="type-caption text-[var(--text-muted)]">
                      {new Date(entry.savedAt).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => applySavedLookPack(entry.id)}
                    >
                      Load
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        downloadLookPackFile({
                          pack: entry.pack,
                          name: entry.name,
                          id: entry.id,
                        })
                      }
                    >
                      Export
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </ToolSection>
        ) : null}

        <ToolSection
          title="Steps"
          description="Each step carries character + look pack when staged."
          data-testid="play-campaign-steps"
        >
          <ol className="space-y-2">
            {PLAY_CAMPAIGN_STEPS.map((step, index) => {
              const isActive = step.id === activeStep;
              return (
                <li
                  key={step.id}
                  data-testid={`play-campaign-step-${step.id}`}
                  className={`rounded-[var(--radius-md)] border px-3 py-3 ${
                    isActive
                      ? 'border-[var(--accent-border)] bg-[var(--accent-muted)] shadow-[inset_3px_0_0_0_var(--accent)]'
                      : 'border-[var(--border-subtle)]'
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="type-overline mb-1 text-[var(--text-muted)]">
                        Step {index + 1}
                      </p>
                      <p className="type-heading">{step.label}</p>
                      <p className="type-caption text-[var(--text-muted)]">{step.description}</p>
                    </div>
                    <Button
                      size="sm"
                      variant={isActive ? 'primary' : 'secondary'}
                      disabled={!characterId && step.id !== 'character'}
                      onClick={() => {
                        setStepOverride(step.id);
                        if (step.id === 'character' && characterId) {
                          router.push(`/characters/${encodeURIComponent(characterId)}`);
                          return;
                        }
                        goToStep(step.id, activeLookPack);
                      }}
                    >
                      Open
                    </Button>
                  </div>
                </li>
              );
            })}
          </ol>
        </ToolSection>

        {status ? <p className="type-caption text-[var(--text-muted)]">{status}</p> : null}

        {durableCampaign && campaignCharacterMismatch ? (
          <p
            className="type-caption text-[var(--text-muted)]"
            data-testid="play-campaign-resume-mismatch"
          >
            Saved campaign is for another Cast character.{' '}
            <ButtonLink
              href={playCampaignHref(durableCampaign.characterId, durableCampaign.lookPackId)}
              size="sm"
              variant="ghost"
            >
              Switch to resume character
            </ButtonLink>{' '}
            or restart below.
          </p>
        ) : null}

        <div className="flex flex-wrap gap-2">
          {campaignComplete ? (
            <>
              <div
                className="w-full rounded-[var(--radius-md)] border border-[var(--tint-success-border)] bg-[var(--tint-success-bg)] px-3 py-2.5"
                data-testid="play-campaign-complete"
              >
                <p className="type-caption text-[var(--tint-success-text)]">
                  Campaign complete
                  {savedCampaign?.completedAt
                    ? ` · ${new Date(savedCampaign.completedAt).toLocaleString()}`
                    : ''}{' '}
                  — film cut. Watch it on Cast, cut another Day film, or start another loop.
                </p>
              </div>
              {characterId ? (
                <ButtonLink
                  href={`/characters/${encodeURIComponent(characterId)}?media=films`}
                  size="sm"
                  variant="primary"
                  data-testid="play-campaign-open-cast-film"
                  onClick={() => {
                    void import('@/lib/onboarding-hooks').then(
                      ({ markOnboardingWatchFirstFilm }) => {
                        markOnboardingWatchFirstFilm();
                      }
                    );
                  }}
                >
                  Open film on Cast
                </ButtonLink>
              ) : null}
              {characterId ? (
                <ButtonLink
                  href={`/day?character=${encodeURIComponent(characterId)}`}
                  size="sm"
                  variant="secondary"
                  data-testid="play-campaign-cut-another"
                >
                  Cut another Day film
                </ButtonLink>
              ) : null}
              <Button
                size="sm"
                variant="ghost"
                disabled={!characterId}
                data-testid="play-campaign-start-new"
                onClick={startNewCampaign}
              >
                Start new campaign
              </Button>
            </>
          ) : (
            <>
              {resumeStep ? (
                <Button
                  size="sm"
                  variant="primary"
                  disabled={!characterId}
                  data-testid="play-campaign-continue"
                  onClick={() => goToStep(resumeStep.id, activeLookPack)}
                >
                  Continue at {resumeStep.label}
                </Button>
              ) : null}
              <Button
                size="sm"
                variant={resumeStep ? 'secondary' : 'primary'}
                disabled={!characterId}
                data-testid="play-campaign-start-moodboard"
                onClick={() => goToStep('moodboard', activeLookPack)}
              >
                {resumeStep ? 'Restart at Moodboard' : 'Start at Moodboard'}
              </Button>
            </>
          )}
          <ButtonLink href="/characters" size="sm" variant="ghost">
            Cast roster
          </ButtonLink>
        </div>
      </ToolLayout>
    </div>
  );
}
