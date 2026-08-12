'use client';

import { useEffect, useState } from 'react';
import {
  getInstantIdHealth,
  getPulidHealth,
  type IdentityPackHealth,
} from '@/lib/identity-pack-health';
import { fetchComfyObjectInfoNodeTypesCached } from '@/lib/comfyui-object-info-cache';

type IdentityPackHealthChipsProps = {
  refreshKey?: number;
};

function chipTone(status: IdentityPackHealth['status']): string {
  if (status === 'ready') {
    return 'border-[var(--tint-success-border)] bg-[var(--tint-success-bg)] text-[var(--tint-success-text)]';
  }
  if (status === 'detected') {
    return 'border-[var(--tint-warning-border)] bg-[var(--tint-warning-bg)] text-[var(--tint-warning-text)]';
  }
  return 'border-[var(--tint-danger-border)] bg-[var(--tint-danger-bg)] text-[var(--tint-danger-text)]';
}

function PackChip({ health }: { health: IdentityPackHealth }) {
  const title = health.kind === 'pulid' ? 'PuLID' : 'InstantID';
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium ${chipTone(health.status)}`}
    >
      {title}: {health.label}
      {health.detail && health.status !== 'missing' ? ` · ${health.detail}` : ''}
    </span>
  );
}

export default function IdentityPackHealthChips({ refreshKey = 0 }: IdentityPackHealthChipsProps) {
  const [instant, setInstant] = useState<IdentityPackHealth | null>(null);
  const [pulid, setPulid] = useState<IdentityPackHealth | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const nodeTypes = await fetchComfyObjectInfoNodeTypesCached().catch(() => null);
      if (cancelled) {
        return;
      }
      setInstant(getInstantIdHealth(nodeTypes));
      setPulid(getPulidHealth(nodeTypes));
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  if (!instant || !pulid) {
    return null;
  }

  const missingBoth = instant.status === 'missing' && pulid.status === 'missing';

  return (
    <div className="mt-3 space-y-2">
      <div className="flex flex-wrap gap-2">
        <PackChip health={instant} />
        <PackChip health={pulid} />
      </div>
      {missingBoth ? (
        <p className="text-xs text-[var(--text-muted)]">
          Scaffold InstantID / PuLID workflows in the library, or install the custom nodes so
          Compose identity lock can auto-insert them.
        </p>
      ) : null}
    </div>
  );
}
