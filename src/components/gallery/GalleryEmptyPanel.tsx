'use client';

import BrandBars from '@/components/BrandBars';
import BrandStudioIllustration from '@/components/BrandStudioIllustration';
import { ButtonLink } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/ViewState';
import { resolveGenerateEmptyCta } from '@/lib/empty-cta';

type GalleryEmptyPanelProps = {
  filtered: boolean;
  onClearFilters: () => void;
  onUpload?: () => void;
};

export default function GalleryEmptyPanel({
  filtered,
  onClearFilters,
  onUpload,
}: GalleryEmptyPanelProps) {
  if (filtered) {
    return (
      <EmptyState
        icon="search"
        title="No entries match these filters"
        description="Try clearing search, status, or project filters — or turn off semantic search."
        action={{
          label: 'Clear filters',
          onClick: onClearFilters,
        }}
      />
    );
  }

  const generateCta = resolveGenerateEmptyCta();

  return (
    <div className="ui-brand-empty relative space-y-4 overflow-hidden">
      <div className="ui-brand-watermark" aria-hidden>
        <BrandStudioIllustration size={200} />
      </div>
      <EmptyState
        branded
        icon="inbox"
        title="No gallery outputs yet"
        description="Queue prompts from any tool with Send to ComfyUI, upload your own stills, or import sidecars and ComfyUI history below."
        action={generateCta}
      />
      <div className="ui-panel-accent relative px-4 py-4">
        <p className="flex items-center gap-2 text-sm font-medium text-[var(--text-primary)]">
          <BrandBars size="md" />
          Getting started
        </p>
        <ul className="mt-2 space-y-1.5 text-[12px] leading-relaxed text-[var(--text-muted)]">
          <li>
            Open <strong className="font-medium text-[var(--text-secondary)]">Generate</strong>,
            create a prompt, and click{' '}
            <strong className="font-medium text-[var(--text-secondary)]">Send to ComfyUI</strong>.
          </li>
          <li>
            Use <strong className="font-medium text-[var(--text-secondary)]">Upload images</strong>{' '}
            to add stills from disk — they stay in the gallery for Play, Compose, and identity lock.
          </li>
          <li>
            Use <strong className="font-medium text-[var(--text-secondary)]">Review mode</strong> to
            rate outputs with keyboard <kbd className="ui-kbd">1–5</kbd> and build avoided-token
            feedback.
          </li>
          <li>
            Select <strong className="font-medium text-[var(--text-secondary)]">2–4 cards</strong>{' '}
            to compare variants, pick a winner, or queue follow-up experiments.
          </li>
        </ul>
        <div className="mt-4 flex flex-wrap gap-2">
          {onUpload ? (
            <button type="button" className="ui-btn-secondary ui-btn-sm" onClick={onUpload}>
              Upload images
            </button>
          ) : null}
          <ButtonLink href={generateCta.href} size="sm">
            {generateCta.label}
          </ButtonLink>
          <ButtonLink href="/gallery?review=1" variant="ghost" size="sm">
            Try review mode
          </ButtonLink>
        </div>
      </div>
    </div>
  );
}
