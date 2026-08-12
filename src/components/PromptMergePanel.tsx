'use client';

import { useState } from 'react';
import BrandBars from '@/components/BrandBars';
import { Button } from '@/components/ui/Button';
import { FieldLabel } from '@/components/ui/Field';

export default function PromptMergePanel(props: { leftDefault?: string; rightDefault?: string }) {
  const [left, setLeft] = useState(props.leftDefault ?? '');
  const [right, setRight] = useState(props.rightDefault ?? '');
  const [merged, setMerged] = useState('');
  const [lintErrors, setLintErrors] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  async function merge() {
    setLoading(true);
    try {
      const response = await fetch('/api/prompt/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ left, right }),
      });
      const data = (await response.json()) as {
        merged?: string;
        lintErrors?: string[];
        error?: string;
      };
      if (!response.ok) {
        throw new Error(data.error ?? 'Merge failed.');
      }
      setMerged(data.merged ?? '');
      setLintErrors(data.lintErrors ?? []);
    } catch (error) {
      setMerged(error instanceof Error ? error.message : 'Merge failed.');
      setLintErrors([]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="ui-panel-accent mt-6 space-y-4 p-4">
      <div>
        <p className="text-sm font-medium text-[var(--text-primary)]">Cherry-pick merge</p>
        <p className="ui-meta mt-0.5 flex items-center gap-1.5">
          <BrandBars />
          Combine prompts
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <FieldLabel htmlFor="merge-left">Left prompt</FieldLabel>
          <textarea
            id="merge-left"
            value={left}
            onChange={event => setLeft(event.target.value)}
            rows={4}
            className="ui-input w-full px-(--input-padding-x) py-(--input-padding-y) type-body"
          />
        </div>
        <div>
          <FieldLabel htmlFor="merge-right">Right prompt</FieldLabel>
          <textarea
            id="merge-right"
            value={right}
            onChange={event => setRight(event.target.value)}
            rows={4}
            className="ui-input w-full px-(--input-padding-x) py-(--input-padding-y) type-body"
          />
        </div>
      </div>
      <Button variant="secondary" loading={loading} onClick={() => void merge()}>
        Merge prompts
      </Button>
      {merged ? <pre className="ui-code-block max-h-48 overflow-auto">{merged}</pre> : null}
      {lintErrors.length > 0 ? (
        <ul className="ui-alert-warning space-y-1 text-xs">
          {lintErrors.map(entry => (
            <li key={entry}>{entry}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
