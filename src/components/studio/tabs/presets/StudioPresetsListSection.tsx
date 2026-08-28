'use client';

import { applyScenePresetLocks, deleteScenePreset, loadScenePresets } from '@/lib/scene-presets';
import { buildShareableSceneParams, buildScenePresetShareUrl } from '@/lib/scene-preset-url';
import { Button } from '@/components/ui/Button';
import { DataList, DataListActions, DataListPrimary, DataListRow } from '@/components/ui/DataList';
import { EmptyState } from '@/components/ui/ViewState';
import type { StudioPresetsTabProps } from '@/components/studio/tabs/StudioPresetsTab';

export function StudioPresetsListSection({
  scenePresets,
  copiedPresetShareId,
  onScenePresetsChange,
  onCompareHintsChange,
  onCopiedPresetShareIdChange,
  onUpdateShared,
  onBackupStatusChange,
}: StudioPresetsTabProps) {
  return (
    <>
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
    </>
  );
}
