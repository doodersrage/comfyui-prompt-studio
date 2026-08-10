'use client';

import { Button } from '@/components/ui/Button';
import { HISTORY_PAGE_SIZE_OPTIONS, type HistoryPageSize } from '@/lib/history-pagination';

type ListPaginatorProps = {
  page: number;
  totalPages: number;
  totalItems: number;
  rangeStart: number;
  rangeEnd: number;
  pageSize: HistoryPageSize;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (pageSize: HistoryPageSize) => void;
};

export default function ListPaginator({
  page,
  totalPages,
  totalItems,
  rangeStart,
  rangeEnd,
  pageSize,
  onPageChange,
  onPageSizeChange,
}: ListPaginatorProps) {
  if (totalItems === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/60 px-4 py-3 shadow-[var(--shadow-surface)] backdrop-blur-sm">
      <p className="type-caption text-[var(--text-muted)]">
        Showing {rangeStart}–{rangeEnd} of {totalItems}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {onPageSizeChange ? (
          <label className="flex items-center gap-1.5 text-[11px] text-[var(--text-muted)]">
            Per page
            <select
              value={pageSize}
              onChange={event => onPageSizeChange(Number(event.target.value) as HistoryPageSize)}
              className="ui-input rounded-lg px-2 py-1 text-[11px]"
            >
              {HISTORY_PAGE_SIZE_OPTIONS.map(size => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <Button
          variant="secondary"
          size="sm"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          Previous
        </Button>
        <span className="type-caption px-1 text-[var(--text-secondary)]">
          Page {page} of {totalPages}
        </span>
        <Button
          variant="secondary"
          size="sm"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          Next
        </Button>
      </div>
    </div>
  );
}
