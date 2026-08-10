'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { MonoTextArea, TextInput } from '@/components/ui/Field';
import { ToolSection } from '@/components/ui/ToolPageShell';

export default function StyleTransplantPanel() {
  const [styleSource, setStyleSource] = useState('');
  const [subjectPrompt, setSubjectPrompt] = useState('');
  const [result, setResult] = useState('');
  const [loading, setLoading] = useState(false);

  async function runTransplant() {
    setLoading(true);
    try {
      const response = await fetch('/api/style-transplant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ styleSource, subjectPrompt }),
      });
      const data = (await response.json()) as { prompt?: string; error?: string };
      if (!response.ok) {
        throw new Error(data.error ?? 'Transplant failed.');
      }
      setResult(data.prompt ?? '');
    } catch (error) {
      setResult(error instanceof Error ? error.message : 'Transplant failed.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <ToolSection title="Style transplant">
      <p className="mb-3 text-sm text-[var(--text-muted)]">
        Apply lighting, camera, and mood language from one prompt onto another subject.
      </p>
      <div className="grid gap-3">
        <label className="space-y-2 text-sm">
          <span className="type-caption text-[var(--text-muted)]">Style source</span>
          <MonoTextArea
            value={styleSource}
            onChange={event => setStyleSource(event.target.value)}
            rows={4}
          />
        </label>
        <label className="space-y-2 text-sm">
          <span className="type-caption text-[var(--text-muted)]">Subject prompt</span>
          <MonoTextArea
            value={subjectPrompt}
            onChange={event => setSubjectPrompt(event.target.value)}
            rows={4}
          />
        </label>
        <Button disabled={loading} onClick={() => void runTransplant()}>
          {loading ? 'Transplanting…' : 'Transplant style'}
        </Button>
        {result && !loading && !result.startsWith('Transplant failed') ? (
          <div className="flex flex-wrap gap-2 pt-1">
            <Link
              href={`/?hints=${encodeURIComponent(result)}&hintSource=manual`}
              className="rounded-lg border border-[var(--border-default)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] transition hover:border-[var(--border-default)] hover:bg-[var(--bg-muted)]/40 hover:text-[var(--text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-500"
            >
              Use in Generate
            </Link>
            <Link
              href={`/plugins/nsfw-generator?hints=${encodeURIComponent(result)}&hintSource=manual`}
              className="rounded-lg border border-[var(--border-default)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] transition hover:border-fuchsia-500/40 hover:bg-fuchsia-500/10 hover:text-fuchsia-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-fuchsia-500"
            >
              Use in Adult generator
            </Link>
            <Link
              href={`/character?hints=${encodeURIComponent(result)}&hintSource=manual&mode=solo`}
              className="rounded-lg border border-[var(--border-default)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] transition hover:border-[var(--border-default)] hover:bg-[var(--bg-muted)]/40 hover:text-[var(--text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-500"
            >
              Use in Character
            </Link>
          </div>
        ) : null}
        {result ? <TextInput readOnly value={result} /> : null}
      </div>
    </ToolSection>
  );
}
