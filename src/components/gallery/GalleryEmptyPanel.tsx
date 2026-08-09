'use client';

import { ButtonLink } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/ViewState';
import { resolveGenerateEmptyCta } from '@/lib/empty-cta';

type GalleryEmptyPanelProps = {
  filtered: boolean;
  onClearFilters: () => void;
};

export default function GalleryEmptyPanel({ filtered, onClearFilters }: GalleryEmptyPanelProps) {
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
    <div className="space-y-4">
      <EmptyState
        icon="inbox"
        title="No gallery outputs yet"
        description="Queue prompts from any tool with Send to ComfyUI, or import sidecars and ComfyUI history below."
        action={generateCta}
      />
      <div className="rounded-2xl border border-violet-500/15 bg-violet-500/5 px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
        <p className="text-sm font-medium text-zinc-100">Getting started</p>
        <ul className="mt-2 space-y-1.5 text-[12px] leading-relaxed text-zinc-400">
          <li>
            Open <strong className="font-medium text-zinc-300">Generate</strong>, create a prompt,
            and click <strong className="font-medium text-zinc-300">Send to ComfyUI</strong>.
          </li>
          <li>
            Use <strong className="font-medium text-zinc-300">Review mode</strong> to rate outputs
            with keyboard <kbd className="rounded bg-zinc-900 px-1">1–5</kbd> and build
            avoided-token feedback.
          </li>
          <li>
            Select <strong className="font-medium text-zinc-300">2–4 cards</strong> to compare
            variants, pick a winner, or queue follow-up experiments.
          </li>
        </ul>
        <div className="mt-4 flex flex-wrap gap-2">
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
