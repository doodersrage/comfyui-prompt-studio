"use client";

import { useEffect, useState } from "react";
import {
  getInstantIdHealth,
  getPulidHealth,
  type IdentityPackHealth,
} from "@/lib/identity-pack-health";
import { fetchComfyObjectInfoNodeTypesCached } from "@/lib/comfyui-object-info-cache";

type IdentityPackHealthChipsProps = {
  refreshKey?: number;
};

function chipTone(status: IdentityPackHealth["status"]): string {
  if (status === "ready") {
    return "border-emerald-500/35 bg-emerald-500/10 text-emerald-200";
  }
  if (status === "detected") {
    return "border-amber-500/35 bg-amber-500/10 text-amber-100";
  }
  return "border-rose-500/35 bg-rose-500/10 text-rose-100";
}

function PackChip({ health }: { health: IdentityPackHealth }) {
  const title = health.kind === "pulid" ? "PuLID" : "InstantID";
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium ${chipTone(health.status)}`}
    >
      {title}: {health.label}
      {health.detail && health.status !== "missing" ? ` · ${health.detail}` : ""}
    </span>
  );
}

export default function IdentityPackHealthChips({
  refreshKey = 0,
}: IdentityPackHealthChipsProps) {
  const [instant, setInstant] = useState<IdentityPackHealth | null>(null);
  const [pulid, setPulid] = useState<IdentityPackHealth | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const nodeTypes = await fetchComfyObjectInfoNodeTypesCached().catch(
        () => null,
      );
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

  const missingBoth =
    instant.status === "missing" && pulid.status === "missing";

  return (
    <div className="mt-3 space-y-2">
      <div className="flex flex-wrap gap-2">
        <PackChip health={instant} />
        <PackChip health={pulid} />
      </div>
      {missingBoth ? (
        <p className="text-xs text-zinc-500">
          Scaffold InstantID / PuLID workflows in the library, or install the
          custom nodes so Compose identity lock can auto-insert them.
        </p>
      ) : null}
    </div>
  );
}
