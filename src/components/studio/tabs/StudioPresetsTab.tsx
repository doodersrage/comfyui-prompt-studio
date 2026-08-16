'use client';

import dynamic from 'next/dynamic';
import type { SharedToolSettings, StudioToolCache } from '@/lib/settings-cache';
import { removeSavedIdentityBundle, upsertSavedIdentityBundle } from '@/lib/settings-cache';
import type { ScenePreset } from '@/lib/scene-presets';
import {
  applyScenePresetLocks,
  buildScenePresetFromCurrent,
  deleteScenePreset,
  loadScenePresets,
  upsertScenePreset,
} from '@/lib/scene-presets';
import { buildShareableSceneParams, buildScenePresetShareUrl } from '@/lib/scene-preset-url';
import {
  buildPromptBriefFromCurrent,
  downloadPromptBrief,
  parsePromptBriefFile,
  applyPromptBrief,
} from '@/lib/prompt-brief';
import { buildPresetPack, downloadPresetPack, parsePresetPack } from '@/lib/preset-packs';
import {
  buildSceneStarterPack,
  downloadSceneStarterPack,
  parseSceneStarterPack,
} from '@/lib/scene-starter-packs';
import type { UserSceneStarterPreset } from '@/lib/user-scene-starter-presets';
import {
  buildCharacterIdentityBundle,
  downloadCharacterIdentityBundle,
  parseCharacterIdentityBundle,
  type CharacterIdentityBundle,
} from '@/lib/character-identity-bundle';
import { characterFromBundle, upsertCharacter } from '@/lib/character-os';
import {
  deleteUserSceneStarterPreset,
  loadUserSceneStarterPresets,
  toggleUserSceneStarterFavorite,
  upsertUserSceneStarterPreset,
} from '@/lib/user-scene-starter-presets';
import { resolveGenerateEmptyCta } from '@/lib/empty-cta';
import { ToolSection, accentButtonClass } from '@/components/ui/ToolPageShell';
import type { ToolAccent } from '@/lib/tool-theme';
import { FieldLabel } from '@/components/ui/Field';
import { Button, PrimaryButton } from '@/components/ui/Button';
import { DataList, DataListActions, DataListPrimary, DataListRow } from '@/components/ui/DataList';
import { EmptyState } from '@/components/ui/ViewState';

const SharedToolControls = dynamic(() => import('@/components/SharedToolControls'), {
  ssr: false,
  loading: () => (
    <div className="h-40 animate-pulse rounded-2xl bg-[var(--surface-muted)]/50" aria-hidden />
  ),
});

export type StudioPresetsTabProps = {
  accent: ToolAccent;
  shared: SharedToolSettings;
  toolSettings: StudioToolCache;
  compareHints: string;
  filledTemplate: string;
  presetName: string;
  presetHints: string;
  presetPackName: string;
  sceneStarterPackName: string;
  identityBundleName: string;
  scenePresets: ScenePreset[];
  userSceneStarters: UserSceneStarterPreset[];
  copiedPresetShareId: string | null;
  onPresetNameChange: (name: string) => void;
  onPresetHintsChange: (hints: string) => void;
  onPresetPackNameChange: (name: string) => void;
  onSceneStarterPackNameChange: (name: string) => void;
  onIdentityBundleNameChange: (name: string) => void;
  onScenePresetsChange: (presets: ScenePreset[]) => void;
  onUserSceneStartersChange: (presets: UserSceneStarterPreset[]) => void;
  onCompareHintsChange: (hints: string) => void;
  onCopiedPresetShareIdChange: (id: string | null) => void;
  onUpdateShared: (partial: Partial<SharedToolSettings>) => void;
  onUpdateToolSettings: (partial: Partial<StudioToolCache>) => void;
  onBackupStatusChange: (status: string) => void;
  onApplyIdentityBundle: (bundle: CharacterIdentityBundle) => void;
  onOpenCharacterWithIdentity: (bundle: CharacterIdentityBundle) => void;
};

export default function StudioPresetsTab({
  accent,
  shared,
  toolSettings,
  compareHints,
  filledTemplate,
  presetName,
  presetHints,
  presetPackName,
  sceneStarterPackName,
  identityBundleName,
  scenePresets,
  userSceneStarters,
  copiedPresetShareId,
  onPresetNameChange,
  onPresetHintsChange,
  onPresetPackNameChange,
  onSceneStarterPackNameChange,
  onIdentityBundleNameChange,
  onScenePresetsChange,
  onUserSceneStartersChange,
  onCompareHintsChange,
  onCopiedPresetShareIdChange,
  onUpdateShared,
  onUpdateToolSettings,
  onBackupStatusChange,
  onApplyIdentityBundle,
  onOpenCharacterWithIdentity,
}: StudioPresetsTabProps) {
  return (
    <ToolSection>
      <p className="text-sm text-[var(--text-secondary)]">
        Save named bundles of hints and shared locks (kit, location, seed) for quick reuse across
        Generate, Character, and Background.
      </p>

      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          onClick={() => {
            const brief = buildPromptBriefFromCurrent({
              label: presetName.trim() || 'Studio brief',
              hints: presetHints.trim() || filledTemplate || 'scene hints',
              model: shared.model,
              detailLevel: shared.detail,
              tool: 'studio',
            });
            downloadPromptBrief(brief);
            onBackupStatusChange('Prompt brief downloaded.');
          }}
        >
          Export prompt brief
        </Button>
        <label className="ui-btn-secondary cursor-pointer px-4 py-2 text-sm">
          Import prompt brief
          <input
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={event => {
              const file = event.target.files?.[0];
              if (!file) {
                return;
              }
              void file
                .text()
                .then(raw => {
                  const brief = parsePromptBriefFile(raw);
                  applyPromptBrief(brief);
                  onPresetNameChange(brief.label);
                  onPresetHintsChange(brief.hints);
                  onBackupStatusChange(`Loaded prompt brief “${brief.label}”.`);
                })
                .catch(error => {
                  onBackupStatusChange(error instanceof Error ? error.message : 'Import failed.');
                });
            }}
          />
        </label>
      </div>

      <SharedToolControls
        shared={shared}
        onModelChange={model => onUpdateShared({ model })}
        onDetailChange={detail => onUpdateShared({ detail })}
        onWorkflowPresetChange={id => onUpdateShared({ selectedWorkflowFileId: id })}
        lockedWardrobeId={shared.lockedWardrobeId}
        lockedLocation={shared.lockedLocation}
        lockedVariationSeed={shared.lockedVariationSeed}
        onClearLockedWardrobe={() => onUpdateShared({ lockedWardrobeId: undefined })}
        onClearLockedLocation={() => onUpdateShared({ lockedLocation: undefined })}
        onClearLockedVariationSeed={() => onUpdateShared({ lockedVariationSeed: undefined })}
      />

      <div className="grid gap-3 border-t border-[var(--border-subtle)] pt-4 sm:grid-cols-2">
        <div className="space-y-1">
          <FieldLabel htmlFor="studio-preset-name">Preset name</FieldLabel>
          <input
            id="studio-preset-name"
            value={presetName}
            onChange={event => onPresetNameChange(event.target.value)}
            placeholder="Gravel duo night race"
            className="ui-input w-full px-[var(--input-padding-x)] py-[var(--input-padding-y)] type-body"
          />
        </div>
        <div className="space-y-1">
          <FieldLabel htmlFor="studio-preset-hints">Hints (optional)</FieldLabel>
          <input
            id="studio-preset-hints"
            value={presetHints}
            onChange={event => onPresetHintsChange(event.target.value)}
            placeholder={compareHints}
            className="ui-input w-full px-[var(--input-padding-x)] py-[var(--input-padding-y)] type-body"
          />
        </div>
      </div>

      <PrimaryButton
        accentClassName={accentButtonClass(accent)}
        disabled={!presetName.trim()}
        onClick={() => {
          const preset = buildScenePresetFromCurrent({
            name: presetName,
            hints: presetHints || compareHints,
            tool: 'studio',
            shared,
          });
          upsertScenePreset(preset);
          onScenePresetsChange(loadScenePresets());
          onPresetNameChange('');
          onBackupStatusChange(`Saved preset “${preset.name}”.`);
        }}
      >
        Save current locks as preset
      </PrimaryButton>

      <div className="space-y-3 border-t border-[var(--border-subtle)] pt-4">
        <p className="text-sm font-medium text-[var(--text-primary)]">Preset packs</p>
        <p className="text-xs text-[var(--text-muted)]">
          Export or import bundles of scene presets for sharing across machines.
        </p>
        <input
          value={presetPackName}
          onChange={event => onPresetPackNameChange(event.target.value)}
          placeholder="Pack name"
          className="ui-input w-full px-[var(--input-padding-x)] py-[var(--input-padding-y)] type-body"
        />
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            disabled={!presetPackName.trim() || scenePresets.length === 0}
            onClick={() =>
              downloadPresetPack(
                buildPresetPack({
                  name: presetPackName.trim(),
                  presets: scenePresets,
                })
              )
            }
          >
            Export pack
          </Button>
          <label className="cursor-pointer rounded-lg border border-[var(--border-default)] px-4 py-2 text-sm text-[var(--text-primary)] hover:border-[var(--border-strong)]">
            Import pack
            <input
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={event => {
                const file = event.target.files?.[0];
                if (!file) {
                  return;
                }
                void file
                  .text()
                  .then(raw => {
                    const pack = parsePresetPack(raw);
                    for (const preset of pack.presets) {
                      upsertScenePreset(preset);
                    }
                    onScenePresetsChange(loadScenePresets());
                    onBackupStatusChange(`Imported preset pack “${pack.name}”.`);
                  })
                  .catch(err => {
                    onBackupStatusChange(err instanceof Error ? err.message : 'Import failed.');
                  });
              }}
            />
          </label>
        </div>
      </div>

      <div className="space-y-3 border-t border-[var(--border-subtle)] pt-4">
        <p className="text-sm font-medium text-[var(--text-primary)]">Scene starter presets</p>
        <p className="text-xs text-[var(--text-muted)]">
          Saved from Generate/Character preset panels or promoted from Gallery analytics. These
          appear in the preset catalog on Generate and Character.
        </p>
        <input
          value={sceneStarterPackName}
          onChange={event => onSceneStarterPackNameChange(event.target.value)}
          placeholder="Starter pack name"
          className="ui-input w-full px-[var(--input-padding-x)] py-[var(--input-padding-y)] type-body"
        />
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            disabled={!sceneStarterPackName.trim() || userSceneStarters.length === 0}
            onClick={() =>
              downloadSceneStarterPack(
                buildSceneStarterPack({
                  name: sceneStarterPackName.trim(),
                  presets: userSceneStarters,
                })
              )
            }
          >
            Export starter pack
          </Button>
          <label className="cursor-pointer rounded-lg border border-[var(--border-default)] px-4 py-2 text-sm text-[var(--text-primary)] hover:border-[var(--border-strong)]">
            Import starter pack
            <input
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={event => {
                const file = event.target.files?.[0];
                if (!file) {
                  return;
                }
                void file
                  .text()
                  .then(raw => {
                    const pack = parseSceneStarterPack(raw);
                    for (const preset of pack.presets) {
                      upsertUserSceneStarterPreset(preset);
                    }
                    onUserSceneStartersChange(loadUserSceneStarterPresets());
                    onBackupStatusChange(`Imported scene starter pack “${pack.name}”.`);
                  })
                  .catch(err => {
                    onBackupStatusChange(err instanceof Error ? err.message : 'Import failed.');
                  });
              }}
            />
          </label>
        </div>
        {userSceneStarters.length === 0 ? (
          <EmptyState
            compact
            icon="preset"
            title="No scene starters yet"
            description="Save a starter from Generate or Character, or promote high-scoring tokens from Analytics. They appear in those tools’ preset catalogs."
            action={resolveGenerateEmptyCta({
              label: 'Open Generate',
              href: '/',
            })}
          />
        ) : (
          <DataList scrollable={false}>
            {userSceneStarters.map(preset => (
              <DataListRow key={preset.id} className="!items-start !py-4">
                <DataListPrimary
                  title={
                    <>
                      {preset.favorite ? '★ ' : null}
                      {preset.label}
                    </>
                  }
                  subtitle={preset.hints}
                />
                <div className="ui-list-actions">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="type-caption"
                    onClick={() => {
                      toggleUserSceneStarterFavorite(preset.id);
                      onUserSceneStartersChange(loadUserSceneStarterPresets());
                    }}
                  >
                    {preset.favorite ? 'Unfavorite' : 'Favorite'}
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    className="type-caption"
                    onClick={() => {
                      deleteUserSceneStarterPreset(preset.id);
                      onUserSceneStartersChange(loadUserSceneStarterPresets());
                    }}
                  >
                    Remove
                  </Button>
                </div>
              </DataListRow>
            ))}
          </DataList>
        )}
      </div>

      <div className="space-y-3 border-t border-[var(--border-subtle)] pt-4">
        <p className="text-sm font-medium text-[var(--text-primary)]">Character identity bundles</p>
        <p className="text-xs text-[var(--text-muted)]">
          Export/import — or save to a browser-local list — reusable character sheets: locks, hints,
          pinned descriptor, and a portable IP-Adapter reference (image/strength/model — see
          Settings → ComfyUI). Enable LoRAs from the LoRA stack on each tool.
        </p>
        <input
          value={identityBundleName}
          onChange={event => onIdentityBundleNameChange(event.target.value)}
          placeholder="Character name"
          className="ui-input w-full px-[var(--input-padding-x)] py-[var(--input-padding-y)] type-body"
        />
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            disabled={!identityBundleName.trim()}
            onClick={() =>
              downloadCharacterIdentityBundle(
                buildCharacterIdentityBundle({
                  name: identityBundleName,
                  shared,
                  hints: presetHints || compareHints,
                })
              )
            }
          >
            Export bundle
          </Button>
          <Button
            variant="secondary"
            disabled={!identityBundleName.trim()}
            onClick={() => {
              const bundle = buildCharacterIdentityBundle({
                name: identityBundleName,
                shared,
                hints: presetHints || compareHints,
              });
              onUpdateToolSettings({
                savedIdentityBundles: upsertSavedIdentityBundle(
                  toolSettings.savedIdentityBundles,
                  bundle
                ),
              });
              upsertCharacter(characterFromBundle(bundle));
              onBackupStatusChange(`Saved identity bundle “${bundle.name}” to your list.`);
            }}
          >
            Save to list
          </Button>
          <label className="cursor-pointer rounded-lg border border-[var(--border-default)] px-4 py-2 text-sm text-[var(--text-primary)] hover:border-[var(--border-strong)]">
            Import bundle
            <input
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={event => {
                const file = event.target.files?.[0];
                if (!file) {
                  return;
                }
                void file
                  .text()
                  .then(raw => {
                    const bundle = parseCharacterIdentityBundle(raw);
                    onApplyIdentityBundle(bundle);
                    onBackupStatusChange(`Imported identity bundle “${bundle.name}”.`);
                  })
                  .catch(err => {
                    onBackupStatusChange(err instanceof Error ? err.message : 'Import failed.');
                  });
              }}
            />
          </label>
        </div>
        {(toolSettings.savedIdentityBundles ?? []).length > 0 ? (
          <div className="space-y-2 pt-2">
            <p className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">
              Saved bundles ({(toolSettings.savedIdentityBundles ?? []).length})
            </p>
            <DataList scrollable={false}>
              {(toolSettings.savedIdentityBundles ?? []).map(bundle => (
                <DataListRow key={bundle.name} className="!items-start !py-3">
                  <DataListPrimary
                    title={bundle.name}
                    subtitle={
                      [bundle.model, bundle.ipAdapterImageFilename ? 'IP-Adapter ref' : null]
                        .filter(Boolean)
                        .join(' · ') || undefined
                    }
                  />
                  <div className="ui-list-actions">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="type-caption"
                      onClick={() => {
                        onApplyIdentityBundle(bundle);
                        onBackupStatusChange(`Applied identity bundle “${bundle.name}”.`);
                      }}
                    >
                      Apply
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      className="type-caption"
                      onClick={() => onOpenCharacterWithIdentity(bundle)}
                    >
                      Open Character
                    </Button>
                    <Button
                      variant="danger"
                      size="sm"
                      className="type-caption"
                      onClick={() =>
                        onUpdateToolSettings({
                          savedIdentityBundles: removeSavedIdentityBundle(
                            toolSettings.savedIdentityBundles,
                            bundle.name
                          ),
                        })
                      }
                    >
                      Remove
                    </Button>
                  </div>
                </DataListRow>
              ))}
            </DataList>
          </div>
        ) : null}
      </div>

      {scenePresets.length === 0 ? (
        <EmptyState
          icon="preset"
          title="No scene presets saved"
          description="Enter a name and optional hints above, then save your current locks as a reusable preset you can apply or share with Duo."
          action={{
            label: 'Name a preset',
            onClick: () => {
              document.getElementById('studio-preset-name')?.focus();
            },
          }}
        />
      ) : (
        <DataList scrollable={false} className="mt-[var(--block-gap)]">
          {scenePresets.map(preset => (
            <DataListRow key={preset.id} className="!items-start !py-4">
              <DataListPrimary
                title={preset.name}
                subtitle={
                  <>
                    {preset.hints ? preset.hints : 'No hints'}
                    {preset.sharedLocks?.lockedLocation
                      ? ` · location: ${preset.sharedLocks.lockedLocation}`
                      : ''}
                  </>
                }
              />
              <DataListActions>
                <Button
                  variant="ghost"
                  size="sm"
                  className="type-caption"
                  onClick={() => {
                    onUpdateShared(applyScenePresetLocks(preset));
                    if (preset.hints) {
                      onCompareHintsChange(preset.hints);
                    }
                    onBackupStatusChange(`Applied preset “${preset.name}”.`);
                  }}
                >
                  Apply locks
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="type-caption"
                  onClick={() => {
                    const url = buildScenePresetShareUrl(
                      '/character',
                      buildShareableSceneParams({
                        hints: preset.hints,
                        sportPresetId: preset.sportPresetId,
                        shared: {
                          lockedWardrobeId: preset.sharedLocks?.lockedWardrobeId,
                          lockedLocation: preset.sharedLocks?.lockedLocation,
                          lockedVariationSeed: preset.sharedLocks?.lockedVariationSeed,
                        },
                      }),
                      { mode: 'duo' }
                    );
                    const absolute =
                      typeof window !== 'undefined' ? `${window.location.origin}${url}` : url;
                    void navigator.clipboard.writeText(absolute);
                    onCopiedPresetShareIdChange(preset.id);
                    window.setTimeout(() => onCopiedPresetShareIdChange(null), 2000);
                  }}
                >
                  {copiedPresetShareId === preset.id ? 'Copied link!' : 'Copy share link'}
                </Button>
                <a
                  href={buildScenePresetShareUrl(
                    '/character',
                    buildShareableSceneParams({
                      hints: preset.hints,
                      sportPresetId: preset.sportPresetId,
                      shared: {
                        lockedWardrobeId: preset.sharedLocks?.lockedWardrobeId,
                        lockedLocation: preset.sharedLocks?.lockedLocation,
                        lockedVariationSeed: preset.sharedLocks?.lockedVariationSeed,
                      },
                    }),
                    { mode: 'duo' }
                  )}
                  className="ui-btn-ghost ui-btn-sm type-caption"
                >
                  Open Character (duo)
                </a>
                <Button
                  variant="danger"
                  size="sm"
                  className="type-caption"
                  onClick={() => {
                    deleteScenePreset(preset.id);
                    onScenePresetsChange(loadScenePresets());
                  }}
                >
                  Delete
                </Button>
              </DataListActions>
            </DataListRow>
          ))}
        </DataList>
      )}
    </ToolSection>
  );
}
