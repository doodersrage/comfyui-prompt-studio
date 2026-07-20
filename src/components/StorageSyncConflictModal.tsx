"use client";

import { useState } from "react";
import type { StorageNamespaceConflict, MergeChoice } from "@/lib/storage-merge";
import type { StorageNamespace } from "@/lib/storage-namespaces";
import { Button } from "@/components/ui/Button";

type Props = {
  conflicts: StorageNamespaceConflict[];
  onResolve: (choices: Partial<Record<StorageNamespace, MergeChoice>>) => void;
  onDismiss: () => void;
};

export default function StorageSyncConflictModal({ conflicts, onResolve, onDismiss }: Props) {
  const [choices, setChoices] = useState<Partial<Record<StorageNamespace, MergeChoice>>>({});

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm">
      <div className="w-full max-w-lg space-y-4 rounded-2xl border border-zinc-700/80 bg-zinc-950/95 p-6 shadow-2xl">
        <div>
          <h2 className="type-heading text-zinc-50">Storage sync conflict</h2>
          <p className="mt-1 text-sm text-zinc-400">
            Browser and server data differ. Choose how to merge each namespace.
          </p>
        </div>
        <ul className="space-y-3">
          {conflicts.map((conflict) => (
            <li key={conflict.namespace} className="rounded-xl border border-zinc-800 p-3">
              <p className="text-sm font-medium text-zinc-200">{conflict.namespace}</p>
              <p className="mt-1 text-xs text-zinc-500">
                Local: {conflict.localCount ?? 0} · Server: {conflict.serverCount ?? 0}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {(["local", "server", "merge"] as MergeChoice[]).map((choice) => (
                  <button
                    key={choice}
                    type="button"
                    onClick={() =>
                      setChoices((prev) => ({
                        ...prev,
                        [conflict.namespace as StorageNamespace]: choice,
                      }))
                    }
                    className={`rounded-full px-3 py-1 text-xs transition ${
                      choices[conflict.namespace as StorageNamespace] === choice
                        ? "bg-violet-600 text-white"
                        : "border border-zinc-700 text-zinc-400 hover:border-violet-500/40"
                    }`}
                  >
                    {choice}
                  </button>
                ))}
              </div>
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => onResolve(choices)}
            disabled={conflicts.some((c) => !choices[c.namespace as StorageNamespace])}
          >
            Apply merge
          </Button>
          <Button variant="ghost" onClick={onDismiss}>
            Decide later
          </Button>
        </div>
      </div>
    </div>
  );
}
