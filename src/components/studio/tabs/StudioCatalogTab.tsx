'use client';

import type { SharedToolSettings } from '@/lib/settings-cache';
import { saveLocationBlocklist } from '@/hooks/usePromptHistory';
import { ToolBlockGroup, ToolSection } from '@/components/ui/ToolPageShell';
import type { ToolAccent } from '@/lib/tool-theme';
import { Button } from '@/components/ui/Button';
import { DataList, DataListActions, DataListPrimary, DataListRow } from '@/components/ui/DataList';
import { DataListSkeleton, EmptyState, ErrorState } from '@/components/ui/ViewState';

export type CatalogClothing = {
  id: string;
  label: string;
  category: string;
};

export type CatalogLocation = {
  id: string;
  label: string;
};

export type StudioCatalogTabProps = {
  accent: ToolAccent;
  shared: SharedToolSettings;
  catalogQuery: string;
  catalogLoading: boolean;
  catalogError: string | null;
  catalogClothing: CatalogClothing[];
  catalogLocations: CatalogLocation[];
  sortedCatalogClothing: CatalogClothing[];
  sortedCatalogLocations: CatalogLocation[];
  blocklist: string[];
  onCatalogQueryChange: (query: string) => void;
  onBlocklistChange: (blocklist: string[]) => void;
  onPresetHintsAppend: (label: string, kind: 'clothing' | 'location') => void;
  onBackupStatusChange: (status: string) => void;
  onUpdateShared: (partial: Partial<SharedToolSettings>) => void;
  onLoadCatalog: (query: string) => void | Promise<void>;
};

export default function StudioCatalogTab({
  shared,
  catalogQuery,
  catalogLoading,
  catalogError,
  sortedCatalogClothing,
  sortedCatalogLocations,
  blocklist,
  onCatalogQueryChange,
  onBlocklistChange,
  onPresetHintsAppend,
  onBackupStatusChange,
  onUpdateShared,
  onLoadCatalog,
}: StudioCatalogTabProps) {
  function toggleBlockLocation(label: string) {
    const next = blocklist.includes(label)
      ? blocklist.filter(entry => entry !== label)
      : [...blocklist, label];
    onBlocklistChange(next);
    saveLocationBlocklist(next);
  }

  return (
    <ToolSection title="Catalog browser">
      <input
        value={catalogQuery}
        onChange={event => onCatalogQueryChange(event.target.value)}
        placeholder="Search clothing or locations…"
        className="ui-input px-[var(--input-padding-x)] py-[var(--input-padding-y)] type-body"
      />

      <div className="mt-[var(--block-gap)] grid gap-[var(--block-gap)] lg:grid-cols-2">
        {catalogError ? (
          <div className="lg:col-span-2">
            <ErrorState
              title="Catalog unavailable"
              description={catalogError}
              action={{
                label: 'Retry',
                onClick: () => void onLoadCatalog(catalogQuery),
              }}
            />
          </div>
        ) : catalogLoading ? (
          <>
            <ToolBlockGroup title="Clothing">
              <DataListSkeleton rows={6} />
            </ToolBlockGroup>
            <ToolBlockGroup title="Locations">
              <DataListSkeleton rows={6} />
            </ToolBlockGroup>
          </>
        ) : (
          <>
            <ToolBlockGroup title="Clothing">
              {sortedCatalogClothing.length === 0 ? (
                <EmptyState
                  compact
                  icon="catalog"
                  title="No clothing found"
                  description={
                    catalogQuery.trim()
                      ? 'Nothing matched your search. Try a shorter query or clear the filter.'
                      : 'The catalog returned no wardrobe entries.'
                  }
                  action={
                    catalogQuery.trim()
                      ? {
                          label: 'Clear search',
                          onClick: () => onCatalogQueryChange(''),
                        }
                      : {
                          label: 'Reload catalog',
                          onClick: () => void onLoadCatalog(''),
                        }
                  }
                />
              ) : (
                <DataList>
                  {sortedCatalogClothing.map(entry => (
                    <DataListRow key={entry.id}>
                      <DataListPrimary title={entry.label} subtitle={entry.category} />
                      <DataListActions>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="type-caption"
                          onClick={() => {
                            onPresetHintsAppend(entry.label, 'clothing');
                            onBackupStatusChange(`Added “${entry.label}” to preset hints.`);
                          }}
                        >
                          Insert
                        </Button>
                        <Button
                          variant={shared.lockedWardrobeId === entry.id ? 'info' : 'ghost'}
                          size="sm"
                          className="type-caption"
                          onClick={() => onUpdateShared({ lockedWardrobeId: entry.id })}
                        >
                          {shared.lockedWardrobeId === entry.id ? 'Locked' : 'Lock kit'}
                        </Button>
                      </DataListActions>
                    </DataListRow>
                  ))}
                </DataList>
              )}
            </ToolBlockGroup>
            <ToolBlockGroup title={`Locations · blocklist (${blocklist.length})`}>
              {sortedCatalogLocations.length === 0 ? (
                <EmptyState
                  compact
                  icon="catalog"
                  title="No locations found"
                  description={
                    catalogQuery.trim()
                      ? 'Nothing matched your search. Try a different keyword or clear the filter.'
                      : 'The catalog returned no location entries.'
                  }
                  action={
                    catalogQuery.trim()
                      ? {
                          label: 'Clear search',
                          onClick: () => onCatalogQueryChange(''),
                        }
                      : {
                          label: 'Reload catalog',
                          onClick: () => void onLoadCatalog(''),
                        }
                  }
                />
              ) : (
                <DataList>
                  {sortedCatalogLocations.map(entry => {
                    const blocked = blocklist.includes(entry.label);
                    const locked = shared.lockedLocation === entry.label;
                    return (
                      <DataListRow key={entry.id}>
                        <button
                          type="button"
                          onClick={() => toggleBlockLocation(entry.label)}
                          className="ui-list-primary text-left transition hover:text-[var(--text-primary)]"
                        >
                          <p
                            className={`type-heading ui-truncate ${
                              blocked
                                ? 'text-[var(--tint-danger-text)]'
                                : 'text-[var(--text-primary)]'
                            }`}
                          >
                            {entry.label}
                            {blocked ? ' · blocked' : ''}
                          </p>
                        </button>
                        <DataListActions>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="type-caption"
                            onClick={() => {
                              onPresetHintsAppend(entry.label, 'location');
                              onBackupStatusChange(`Added location “${entry.label}”.`);
                            }}
                          >
                            Insert
                          </Button>
                          <Button
                            variant={locked ? 'secondary' : 'ghost'}
                            size="sm"
                            className="type-caption"
                            onClick={() =>
                              onUpdateShared({
                                lockedLocation: locked ? undefined : entry.label,
                              })
                            }
                          >
                            {locked ? 'Locked' : 'Lock location'}
                          </Button>
                        </DataListActions>
                      </DataListRow>
                    );
                  })}
                </DataList>
              )}
            </ToolBlockGroup>
          </>
        )}
      </div>
    </ToolSection>
  );
}
