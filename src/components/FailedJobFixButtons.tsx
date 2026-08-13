'use client';

import { Button } from '@/components/ui/Button';
import type { ComfyGalleryEntry } from '@/lib/comfyui-gallery';
import {
  applyQueueFailureFix,
  resolveQueueFailureFixes,
  type QueueFailureFixKind,
} from '@/lib/queue-failure-fix';

export default function FailedJobFixButtons({
  entry,
  poolUrls,
  onStatus,
  onDone,
}: {
  entry: ComfyGalleryEntry;
  poolUrls?: string[];
  onStatus?: (message: string) => void;
  onDone?: () => void;
}) {
  const fixes = resolveQueueFailureFixes(entry, poolUrls);
  if (fixes.length === 0) {
    return null;
  }

  async function runFix(kind: QueueFailureFixKind) {
    const result = await applyQueueFailureFix(entry, kind, { onStatus });
    if (!result.ok) {
      onStatus?.(result.error ?? 'Fix retry failed.');
    }
    onDone?.();
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {fixes.map(fix => (
        <Button
          key={fix.kind}
          size="sm"
          variant="secondary"
          title={fix.reason}
          onClick={() => void runFix(fix.kind)}
        >
          {fix.label}
        </Button>
      ))}
    </div>
  );
}
