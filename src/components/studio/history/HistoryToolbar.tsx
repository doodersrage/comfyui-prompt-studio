'use client';

import {
  loadHistorySavedViews,
  upsertHistorySavedView,
  deleteHistorySavedView,
  type HistorySavedView,
} from '@/lib/history-saved-views';
import {
  downloadTextFile,
  exportHistoryCsv,
  exportHistoryJsonl,
} from '@/lib/history-export-formats';
import type { HistoryFilter } from '@/lib/history-filter';
import type { PromptHistoryEntry } from '@/hooks/usePromptHistory';
import type { PromptProject } from '@/lib/prompt-projects';
import { ToolMetaPanel, accentFocusClass } from '@/components/ui/ToolPageShell';
import type { ToolAccent } from '@/lib/tool-theme';
import { FieldLabel } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import type { HistoryDensity } from '@/lib/history-density';
import type { HistoryPageSize } from '@/lib/history-pagination';

export type HistoryToolbarProps = {
  accent: ToolAccent;
  entries: PromptHistoryEntry[];
  filteredEntries: PromptHistoryEntry[];
  favoriteEntries: PromptHistoryEntry[];
  historyFilter: HistoryFilter;
  onHistoryFilterChange: React.Dispatch<React.SetStateAction<HistoryFilter>>;
  projects: PromptProject[];
  activeProjectId?: string;
  onActiveProjectChange: (projectId: string | undefined) => void;
  density: HistoryDensity;
  onDensityChange: (density: HistoryDensity) => void;
  pageSize: HistoryPageSize;
  useVirtualHistory: boolean;
  paginationPage: number;
  paginationTotalPages: number;
  onSendBatchFavorites: (prompts: string[]) => void;
  onClearHistory: () => void;
  onRemoveEntries?: (ids: string[]) => void;
  onAddTagToEntries?: (ids: string[], tag: string) => void;
  onImportBackup: (file: File) => void | Promise<void>;
  onBackupStatusChange: (status: string | null) => void;
  bulkTagDraft: string;
  onBulkTagDraftChange: (value: string) => void;
  savedViews: HistorySavedView[];
  onSavedViewsChange: (views: HistorySavedView[]) => void;
  viewNameDraft: string;
  onViewNameDraftChange: (value: string) => void;
  historyToolOptions: string[];
  historyModelOptions: string[];
  historyTagOptions: string[];
};

export default function HistoryToolbar({
  accent,
  entries,
  filteredEntries,
  favoriteEntries,
  historyFilter,
  onHistoryFilterChange,
  projects,
  activeProjectId,
  onActiveProjectChange,
  density,
  onDensityChange,
  pageSize,
  useVirtualHistory,
  paginationPage,
  paginationTotalPages,
  onSendBatchFavorites,
  onClearHistory,
  onRemoveEntries,
  onAddTagToEntries,
  onImportBackup,
  onBackupStatusChange,
  bulkTagDraft,
  onBulkTagDraftChange,
  savedViews,
  onSavedViewsChange,
  viewNameDraft,
  onViewNameDraftChange,
  historyToolOptions,
  historyModelOptions,
  historyTagOptions,
}: HistoryToolbarProps) {
  return (
    <ToolMetaPanel>
      <div className="flex min-w-0 flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <p className="type-heading shrink-0">
          {filteredEntries.length}
          {filteredEntries.length !== entries.length ? ` of ${entries.length}` : ''} entries
          {useVirtualHistory
            ? ' · virtual scroll'
            : filteredEntries.length > pageSize
              ? ` · page ${paginationPage}/${paginationTotalPages}`
              : ''}
        </p>
        <div className="ui-list-actions w-full justify-start lg:w-auto lg:justify-end">
          <div className="flex items-center gap-1 rounded-full border border-[var(--border-subtle)] p-0.5">
            {(
              [
                ['comfortable', 'Comfortable'],
                ['compact', 'Compact'],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={density === value}
                className={`rounded-full px-2.5 py-1 text-xs transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)] ${
                  density === value
                    ? 'bg-[var(--accent)] text-white'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                }`}
                onClick={() => {
                  onDensityChange(value);
                }}
              >
                {label}
              </button>
            ))}
          </div>
          {favoriteEntries.length > 0 && (
            <Button
              variant="accent-outline"
              size="sm"
              onClick={() => onSendBatchFavorites(favoriteEntries.map(entry => entry.prompt))}
            >
              Queue favorites ({favoriteEntries.length})
            </Button>
          )}
          {entries.length > 0 && (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  downloadTextFile(
                    exportHistoryCsv(filteredEntries),
                    'history-filtered.csv',
                    'text/csv;charset=utf-8'
                  )
                }
              >
                Export CSV
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  downloadTextFile(
                    exportHistoryJsonl(filteredEntries),
                    'history-filtered.jsonl',
                    'application/jsonl;charset=utf-8'
                  )
                }
              >
                Export JSONL
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  void import('@/lib/studio-backup').then(({ downloadHistoryExport }) => {
                    downloadHistoryExport(filteredEntries);
                  });
                }}
              >
                Export filtered
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  void import('@/lib/studio-backup').then(({ downloadHistoryExport }) => {
                    downloadHistoryExport(entries);
                  });
                }}
              >
                Export all
              </Button>
              <Button variant="ghost" size="sm" onClick={onClearHistory}>
                Clear all
              </Button>
              {filteredEntries.length > 0 &&
              filteredEntries.length !== entries.length &&
              onRemoveEntries ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    if (
                      window.confirm(
                        `Delete ${filteredEntries.length} filtered entries? This cannot be undone.`
                      )
                    ) {
                      onRemoveEntries(filteredEntries.map(entry => entry.id));
                      onBackupStatusChange(`Removed ${filteredEntries.length} filtered entries.`);
                    }
                  }}
                >
                  Delete filtered ({filteredEntries.length})
                </Button>
              ) : null}
            </>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              void import('@/lib/studio-backup').then(({ downloadStudioBackup }) => {
                downloadStudioBackup();
                onBackupStatusChange('Studio backup downloaded.');
              });
            }}
          >
            Export backup
          </Button>
          <label className="ui-btn-ghost ui-btn-sm ui-file-input-label cursor-pointer px-4">
            Import backup
            <input
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={event => {
                const file = event.target.files?.[0];
                if (file) {
                  void onImportBackup(file);
                }
                event.target.value = '';
              }}
            />
          </label>
        </div>
      </div>

      {entries.length > 0 && (
        <div className="grid gap-4 pt-2 sm:grid-cols-2 xl:grid-cols-3">
          <div className="space-y-2">
            <FieldLabel htmlFor="history-search">Search</FieldLabel>
            <input
              id="history-search"
              value={historyFilter.query ?? ''}
              onChange={event =>
                onHistoryFilterChange(previous => ({
                  ...previous,
                  query: event.target.value || undefined,
                }))
              }
              placeholder="prompt, hints, tool…"
              className="ui-input px-[var(--input-padding-x)] py-[var(--input-padding-y)] type-body"
            />
          </div>
          <div className="space-y-2">
            <FieldLabel htmlFor="history-tool">Tool</FieldLabel>
            <select
              id="history-tool"
              value={historyFilter.tool ?? 'all'}
              onChange={event =>
                onHistoryFilterChange(previous => ({
                  ...previous,
                  tool: event.target.value === 'all' ? undefined : event.target.value,
                }))
              }
              className="ui-input px-3 py-[var(--input-padding-y)] type-body"
            >
              <option value="all">All tools</option>
              {historyToolOptions.map(tool => (
                <option key={tool} value={tool}>
                  {tool}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <FieldLabel htmlFor="history-model">Model</FieldLabel>
            <select
              id="history-model"
              value={historyFilter.model ?? 'all'}
              onChange={event =>
                onHistoryFilterChange(previous => ({
                  ...previous,
                  model: event.target.value === 'all' ? undefined : event.target.value,
                }))
              }
              className="ui-input px-3 py-[var(--input-padding-y)] type-body"
            >
              <option value="all">All models</option>
              {historyModelOptions.map(model => (
                <option key={model} value={model}>
                  {model}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <FieldLabel htmlFor="history-tag">Tag</FieldLabel>
            <select
              id="history-tag"
              value={historyFilter.tag ?? 'all'}
              onChange={event =>
                onHistoryFilterChange(previous => ({
                  ...previous,
                  tag: event.target.value === 'all' ? undefined : event.target.value,
                }))
              }
              className="ui-input px-3 py-[var(--input-padding-y)] type-body"
            >
              <option value="all">All tags</option>
              {historyTagOptions.map(tag => (
                <option key={tag} value={tag}>
                  {tag}
                </option>
              ))}
            </select>
          </div>
          <label className="flex items-center gap-3 self-end pb-1 type-body">
            <input
              type="checkbox"
              checked={historyFilter.semanticSearch === true}
              onChange={event =>
                onHistoryFilterChange(previous => ({
                  ...previous,
                  semanticSearch: event.target.checked || undefined,
                }))
              }
              className={`h-4 w-4 rounded-[var(--radius-sm)] ${accentFocusClass(accent)}`}
            />
            Semantic search
          </label>
          {projects.length > 0 && (
            <div className="space-y-2">
              <FieldLabel htmlFor="history-project">Project</FieldLabel>
              <select
                id="history-project"
                value={activeProjectId ?? 'all'}
                onChange={event => {
                  const value = event.target.value === 'all' ? undefined : event.target.value;
                  onActiveProjectChange(value);
                }}
                className="ui-input px-3 py-[var(--input-padding-y)] type-body"
              >
                <option value="all">All projects</option>
                {projects.map(project => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <label className="flex items-center gap-3 self-end pb-1 type-body">
            <input
              type="checkbox"
              checked={historyFilter.favoritesOnly === true}
              onChange={event =>
                onHistoryFilterChange(previous => ({
                  ...previous,
                  favoritesOnly: event.target.checked || undefined,
                }))
              }
              className={`h-4 w-4 rounded-[var(--radius-sm)] ${accentFocusClass(accent)}`}
            />
            Favorites only
          </label>
          <label className="flex items-center gap-3 self-end pb-1 type-body">
            <input
              type="checkbox"
              checked={historyFilter.videoOnly === true}
              onChange={event =>
                onHistoryFilterChange(previous => ({
                  ...previous,
                  videoOnly: event.target.checked || undefined,
                }))
              }
              className={`h-4 w-4 rounded-[var(--radius-sm)] ${accentFocusClass(accent)}`}
            />
            Video lineage only
          </label>
          <div className="flex flex-wrap items-end gap-2 sm:col-span-2 xl:col-span-3">
            <div className="min-w-[10rem] flex-1 space-y-2">
              <FieldLabel htmlFor="history-saved-view-name">Saved filter</FieldLabel>
              <input
                id="history-saved-view-name"
                value={viewNameDraft}
                onChange={event => onViewNameDraftChange(event.target.value)}
                placeholder="Campaign keepers, video drafts…"
                className="ui-input px-[var(--input-padding-x)] py-[var(--input-padding-y)] type-body"
              />
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                const name = viewNameDraft.trim() || `Filter ${savedViews.length + 1}`;
                upsertHistorySavedView({
                  id: `history-view-${Date.now().toString(36)}`,
                  name,
                  filter: historyFilter,
                });
                onSavedViewsChange(loadHistorySavedViews());
                onViewNameDraftChange('');
                onBackupStatusChange(`Saved history filter “${name}”.`);
              }}
            >
              Save filter
            </Button>
            {savedViews.map(view => (
              <div key={view.id} className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    onHistoryFilterChange(view.filter);
                    onBackupStatusChange(`Applied filter “${view.name}”.`);
                  }}
                >
                  {view.name}
                </Button>
                <button
                  type="button"
                  aria-label={`Delete saved filter ${view.name}`}
                  className="rounded px-1 text-xs text-[var(--text-muted)] hover:text-[var(--tint-danger-text)]"
                  onClick={() => {
                    deleteHistorySavedView(view.id);
                    onSavedViewsChange(loadHistorySavedViews());
                  }}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
          {filteredEntries.length > 0 && onAddTagToEntries ? (
            <div className="flex flex-wrap items-end gap-2 sm:col-span-2 xl:col-span-3">
              <div className="min-w-[10rem] flex-1 space-y-2">
                <FieldLabel htmlFor="history-bulk-tag">Tag filtered</FieldLabel>
                <input
                  id="history-bulk-tag"
                  value={bulkTagDraft}
                  onChange={event => onBulkTagDraftChange(event.target.value)}
                  placeholder="campaign, keeper, …"
                  className="ui-input px-[var(--input-padding-x)] py-[var(--input-padding-y)] type-body"
                />
              </div>
              <Button
                variant="secondary"
                size="sm"
                disabled={!bulkTagDraft.trim()}
                onClick={() => {
                  const tag = bulkTagDraft.trim();
                  if (!tag) {
                    return;
                  }
                  onAddTagToEntries(
                    filteredEntries.map(entry => entry.id),
                    tag
                  );
                  onBulkTagDraftChange('');
                  onBackupStatusChange(`Tagged ${filteredEntries.length} entries “${tag}”.`);
                }}
              >
                Apply to {filteredEntries.length}
              </Button>
            </div>
          ) : null}
          <div className="space-y-2">
            <FieldLabel htmlFor="history-rating">Min rating</FieldLabel>
            <select
              id="history-rating"
              value={historyFilter.minRating ?? 0}
              onChange={event => {
                const value = Number(event.target.value);
                onHistoryFilterChange(previous => ({
                  ...previous,
                  minRating: value > 0 ? value : undefined,
                }));
              }}
              className="ui-input px-3 py-[var(--input-padding-y)] type-body"
            >
              <option value={0}>Any</option>
              {[1, 2, 3, 4, 5].map(rating => (
                <option key={rating} value={rating}>
                  {rating}+ stars
                </option>
              ))}
            </select>
          </div>
        </div>
      )}
    </ToolMetaPanel>
  );
}
