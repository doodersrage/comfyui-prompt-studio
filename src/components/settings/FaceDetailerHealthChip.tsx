"use client";

import { useEffect, useState } from "react";
import {
  getFaceDetailerHealth,
  type FaceDetailerHealth,
} from "@/lib/face-detailer-health";

type FaceDetailerHealthChipProps = {
  refreshKey?: number;
};

export default function FaceDetailerHealthChip({
  refreshKey = 0,
}: FaceDetailerHealthChipProps) {
  const [health, setHealth] = useState<FaceDetailerHealth | null>(null);

  useEffect(() => {
    setHealth(getFaceDetailerHealth());
  }, [refreshKey]);

  if (!health) {
    return null;
  }

  const tone =
    health.status === "ready"
      ? "border-emerald-500/35 bg-emerald-500/10 text-emerald-200"
      : health.status === "detected"
        ? "border-amber-500/35 bg-amber-500/10 text-amber-100"
        : "border-rose-500/35 bg-rose-500/10 text-rose-100";

  return (
    <div className="mt-3 space-y-1">
      <span
        className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium ${tone}`}
      >
        FaceDetailer: {health.label}
        {health.workflowName ? ` · ${health.workflowName}` : ""}
      </span>
      {health.status === "missing" ? (
        <p className="text-xs text-zinc-500">
          Scaffold a FaceDetailer workflow in the library (or pin{" "}
          <code className="text-zinc-400">faceDetailer=&lt;id&gt;</code> in the
          model workflow map) so Gallery → Face detail appears.
        </p>
      ) : null}
    </div>
  );
}
