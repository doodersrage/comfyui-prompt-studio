'use client';

import type { RefObject } from 'react';
import { Button } from '@/components/ui/Button';
import { ChipButton, FieldDivider, FieldLabel, SelectInput, TextArea } from '@/components/ui/Field';
import { CollapsibleSection, ToolSection, accentFocusClass } from '@/components/ui/ToolPageShell';
import type { FittingClothingOption } from '@/lib/fitting-clothing-options';
import type { FittingKitPreview } from '@/lib/fitting-kit-previews';
import { getFittingKitPreview } from '@/lib/fitting-kit-previews';
import type { FittingSwipeKit } from '@/lib/fitting-room';
import {
  countWardrobeOptionsForFilter,
  normalizeWardrobeCategoryFilter,
  wardrobeCategoryFilterOptions,
  type WardrobeCategoryFilter,
} from '@/lib/wardrobe-catalog-ui';

const ACCENT = 'rose' as const;

export type FittingWardrobeKitSectionProps = {
  busy: boolean;
  leanChrome: boolean;
  wardrobeReady: boolean;
  wardrobeCategoryFilter: WardrobeCategoryFilter;
  wardrobeOptions: FittingClothingOption[];
  wardrobeKitCount: number;
  filteredWardrobeOptions: FittingClothingOption[];
  wardrobeGroups: Map<string, FittingClothingOption[]>;
  swipeDeck: FittingSwipeKit[];
  activeSwipeKit: FittingSwipeKit | null;
  deckSelectionId: string | undefined;
  deckSelectionIndex: number;
  activeThumbRef: RefObject<HTMLButtonElement | null>;
  activeLookId: string;
  kitPreviews: Record<string, FittingKitPreview>;
  autoKitPreviews: boolean;
  hasReference: boolean;
  isolateSubject: boolean;
  referenceIsolated: boolean;
  previewModel: string | null | undefined;
  previewModelLabel: string | null;
  selectedModelLabel?: string;
  sharedModel: string;
  lockedWardrobeId?: string;
  notes: string;
  completedPreviewCount: number;
  inFlightPreviewCount: number;
  previewStatus: string | null;
  onCategoryFilterChange: (filter: WardrobeCategoryFilter) => void;
  onSwipeKit: (delta: number) => void;
  onSelectKit: (wardrobeId: string) => void;
  onToggleAutoKitPreviews: () => void;
  onFillKitPreviews: () => void;
  onNotesChange: (notes: string) => void;
};

export default function FittingWardrobeKitSection({
  busy,
  leanChrome,
  wardrobeReady,
  wardrobeCategoryFilter,
  wardrobeOptions,
  wardrobeKitCount,
  filteredWardrobeOptions,
  wardrobeGroups,
  swipeDeck,
  activeSwipeKit,
  deckSelectionId,
  deckSelectionIndex,
  activeThumbRef,
  activeLookId,
  kitPreviews,
  autoKitPreviews,
  hasReference,
  isolateSubject,
  referenceIsolated,
  previewModel,
  previewModelLabel,
  selectedModelLabel,
  sharedModel,
  lockedWardrobeId,
  notes,
  completedPreviewCount,
  inFlightPreviewCount,
  previewStatus,
  onCategoryFilterChange,
  onSwipeKit,
  onSelectKit,
  onToggleAutoKitPreviews,
  onFillKitPreviews,
  onNotesChange,
}: FittingWardrobeKitSectionProps) {
  return (
    <ToolSection
      title="Wardrobe kit"
      description="Filter by clothing type, swipe kits on the locked plate, or pick from the catalog."
      data-testid="fitting-kit-strip"
    >
      <label className="space-y-2">
        <FieldLabel>Clothing type</FieldLabel>
        <SelectInput
          value={wardrobeCategoryFilter}
          disabled={!wardrobeReady || busy}
          className={accentFocusClass(ACCENT)}
          onChange={event =>
            onCategoryFilterChange(normalizeWardrobeCategoryFilter(event.target.value))
          }
        >
          {wardrobeCategoryFilterOptions().map(option => (
            <option key={option.value} value={option.value}>
              {option.label}
              {option.value !== 'all' && wardrobeReady
                ? ` (${countWardrobeOptionsForFilter(wardrobeOptions, option.value)})`
                : option.value === 'all' && wardrobeReady
                  ? ` (${countWardrobeOptionsForFilter(wardrobeOptions, 'all')})`
                  : ''}
            </option>
          ))}
        </SelectInput>
        {wardrobeReady && wardrobeCategoryFilter !== 'all' ? (
          <p className="type-caption text-[var(--text-muted)]">
            Showing {wardrobeKitCount} kit{wardrobeKitCount === 1 ? '' : 's'} in this type.
          </p>
        ) : null}
      </label>
      <FieldDivider />
      {swipeDeck.length > 0 ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="secondary"
              disabled={!wardrobeReady || busy || swipeDeck.length < 2}
              onClick={() => onSwipeKit(-1)}
            >
              Prev
            </Button>
            <span className="type-caption min-w-0 flex-1 text-center text-[var(--text-muted)]">
              {activeSwipeKit ? (
                <>
                  <span className="block truncate">
                    {activeSwipeKit.label}
                    {activeSwipeKit.group ? ` · ${activeSwipeKit.group}` : ''}
                  </span>
                  {swipeDeck.length > 1 ? (
                    <span className="mt-0.5 block text-[var(--text-muted)]">
                      {deckSelectionIndex + 1} / {swipeDeck.length}
                    </span>
                  ) : null}
                </>
              ) : (
                'Pick a kit to swipe'
              )}
            </span>
            <Button
              size="sm"
              variant="secondary"
              disabled={!wardrobeReady || busy || swipeDeck.length < 2}
              onClick={() => onSwipeKit(1)}
            >
              Next
            </Button>
          </div>
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
            {swipeDeck.map(kit => {
              const preview = activeLookId
                ? getFittingKitPreview(kitPreviews, kit.id, activeLookId)
                : undefined;
              const thumb = preview?.status === 'completed' ? preview.imageUrl?.trim() : '';
              const pending = preview?.status === 'queued' || preview?.status === 'running';
              const selected = deckSelectionId === kit.id;
              return (
                <button
                  key={kit.id}
                  ref={selected ? activeThumbRef : undefined}
                  type="button"
                  data-active={selected ? 'true' : 'false'}
                  disabled={busy}
                  title={kit.label}
                  aria-label={kit.label}
                  aria-current={selected ? 'true' : undefined}
                  onClick={() => onSelectKit(kit.id)}
                  className={`shrink-0 rounded-md border p-1 transition ${
                    selected
                      ? 'border-[var(--accent-border)] bg-[var(--accent-muted)] shadow-[0_0_0_1px_var(--accent-border)]'
                      : 'border-[var(--border-default)] bg-transparent hover:border-[var(--border-strong)] hover:bg-[var(--bg-hover)]'
                  }`}
                >
                  {thumb ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={thumb} alt="" className="block h-20 w-16 rounded object-cover" />
                  ) : (
                    <span
                      className={`flex h-20 w-16 items-center justify-center rounded border border-[var(--border-subtle)] type-caption ${
                        pending ? 'text-[var(--text-muted)]' : 'text-[var(--text-muted)]'
                      }`}
                    >
                      {pending ? '…' : '—'}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <CollapsibleSection
            title="Draft previews & catalog"
            summary="Auto draft thumbs, full catalog pick, and optional notes."
            defaultOpen={!leanChrome}
            persistKey="fitting-kit-advanced"
          >
            <div className="flex flex-wrap items-center gap-2">
              <ChipButton
                active={autoKitPreviews}
                disabled={busy || !hasReference}
                onClick={onToggleAutoKitPreviews}
              >
                Auto draft previews
              </ChipButton>
              <Button
                size="sm"
                variant="secondary"
                disabled={
                  busy ||
                  !hasReference ||
                  !activeLookId ||
                  !previewModel ||
                  swipeDeck.length === 0 ||
                  (isolateSubject && referenceIsolated !== true)
                }
                onClick={() => void onFillKitPreviews()}
              >
                Preview kits
              </Button>
              {completedPreviewCount > 0 || inFlightPreviewCount > 0 ? (
                <span className="type-caption text-[var(--text-muted)]">
                  {completedPreviewCount} preview{completedPreviewCount === 1 ? '' : 's'}
                  {inFlightPreviewCount > 0 ? ` · ${inFlightPreviewCount} rendering` : ''}
                </span>
              ) : null}
            </div>
            {previewStatus ? (
              <p className="type-caption text-[var(--text-muted)]">{previewStatus}</p>
            ) : hasReference && autoKitPreviews ? (
              <p className="type-caption text-[var(--text-muted)]">
                Draft previews use {previewModelLabel ?? 'a fast edit model'} · 4-step draft ·
                256×384 (3 at a time). Queue try-on keeps your sidebar model and settings.
              </p>
            ) : previewModelLabel ? (
              <p className="type-caption text-[var(--text-muted)]">
                Preview kits: {previewModelLabel} · 4-step draft · 256×384 · 3 concurrent. Queue
                try-on uses {selectedModelLabel ?? sharedModel}.
              </p>
            ) : null}
            <label className="mt-3 space-y-2">
              <FieldLabel>Full catalog</FieldLabel>
              <SelectInput
                value={lockedWardrobeId ?? ''}
                disabled={!wardrobeReady || busy}
                className={accentFocusClass(ACCENT)}
                onChange={event => {
                  onSelectKit(event.target.value);
                }}
              >
                {filteredWardrobeOptions
                  .filter(option => !option.group)
                  .map(option => (
                    <option key={option.value || 'default'} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                {[...wardrobeGroups.entries()].map(([group, groupOptions]) => (
                  <optgroup key={group} label={group}>
                    {groupOptions.map(option => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </SelectInput>
            </label>
            <label className="mt-3 space-y-2">
              <FieldLabel>Notes (optional)</FieldLabel>
              <TextArea
                data-testid="fitting-notes"
                rows={2}
                value={notes}
                className={accentFocusClass(ACCENT)}
                placeholder="e.g. slightly oversized blazer, sneakers untied"
                onChange={event => onNotesChange(event.target.value)}
              />
            </label>
          </CollapsibleSection>
        </div>
      ) : null}
      {swipeDeck.length === 0 ? (
        <>
          <label className="mt-3 space-y-2">
            <FieldLabel>Full catalog</FieldLabel>
            <SelectInput
              value={lockedWardrobeId ?? ''}
              disabled={!wardrobeReady || busy}
              className={accentFocusClass(ACCENT)}
              onChange={event => {
                onSelectKit(event.target.value);
              }}
            >
              {filteredWardrobeOptions
                .filter(option => !option.group)
                .map(option => (
                  <option key={option.value || 'default'} value={option.value}>
                    {option.label}
                  </option>
                ))}
              {[...wardrobeGroups.entries()].map(([group, groupOptions]) => (
                <optgroup key={group} label={group}>
                  {groupOptions.map(option => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </SelectInput>
          </label>
          <FieldDivider />
          <label className="space-y-2">
            <FieldLabel>Notes (optional)</FieldLabel>
            <TextArea
              rows={2}
              value={notes}
              className={accentFocusClass(ACCENT)}
              placeholder="e.g. slightly oversized blazer, sneakers untied"
              onChange={event => onNotesChange(event.target.value)}
            />
          </label>
        </>
      ) : null}
    </ToolSection>
  );
}
