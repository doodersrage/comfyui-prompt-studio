"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ToolSection } from "@/components/ui/ToolPageShell";
import { Button } from "@/components/ui/Button";
import {
  galleryEntryThumbUrls,
  loadComfyGallery,
  COMFYUI_GALLERY_UPDATED_EVENT,
} from "@/lib/comfyui-gallery";
import type { ExperimentGroup } from "@/lib/experiment-groups";
import {
  clearExperimentWinner,
  loadExperimentWinners,
  markExperimentWinner,
} from "@/lib/experiment-winners";
import { toastBulkQueueSummary } from "@/lib/app-toast";
import { downloadCompareExport } from "@/lib/gallery-compare-export";
import { requeueComfyJobs } from "@/lib/comfyui-requeue";
import { resolveRequeueImageUrlsFromEntry } from "@/lib/queue-requeue-images";
import { scheduleAfterCommit } from "@/lib/schedule-after-commit";
import { EmptyState } from "@/components/ui/ViewState";

export default function ExperimentDashboardPanel() {
  const [groups, setGroups] = useState<ExperimentGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [winners, setWinners] = useState(loadExperimentWinners);
  const [expandedGroupId, setExpandedGroupId] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    try {
      const entries = loadComfyGallery();
      const response = await fetch("/api/experiments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entries }),
      });
      const data = (await response.json()) as { groups?: ExperimentGroup[] };
      setGroups(data.groups ?? []);
      setWinners(loadExperimentWinners());
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    scheduleAfterCommit(() => {
      void refresh();
    });
    const handler = () => void refresh();
    window.addEventListener(COMFYUI_GALLERY_UPDATED_EVENT, handler);
    return () => window.removeEventListener(COMFYUI_GALLERY_UPDATED_EVENT, handler);
  }, []);

  const expandedGroup = useMemo(
    () => groups.find((group) => group.id === expandedGroupId) ?? null,
    [expandedGroupId, groups],
  );

  return (
    <ToolSection title="Experiment dashboard">
      <p className="text-sm text-zinc-400">
        Groups gallery outputs by shared prompt text and tracks seed / CFG / steps variants.
        Crown a winner, compare outputs, or re-queue the group.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="secondary" loading={loading} onClick={() => void refresh()}>
          Refresh experiments
        </Button>
      </div>

      {groups.length === 0 ? (
        <EmptyState
          compact
          className="mt-4"
          icon="compare"
          title="No experiment groups yet"
          description="Queue multiple seeds or CFG/steps variants for the same prompt in Gallery — they'll group here automatically."
          action={{ label: "Open Gallery", href: "/gallery" }}
        />
      ) : (
        <ul className="mt-4 space-y-3">
          {groups.map((group) => {
            const winner = winners[group.id];
            const winnerEntry = winner
              ? group.entries.find((entry) => entry.id === winner.entryId)
              : undefined;
            return (
              <li key={group.id} className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-zinc-100">{group.label}</p>
                    <p className="mt-1 text-xs text-zinc-500">
                      {group.entries.length} outputs · seeds: {group.variants.seeds.join(", ") || "—"}
                      {group.variants.cfgValues.length
                        ? ` · CFG: ${group.variants.cfgValues.join(", ")}`
                        : ""}
                    </p>
                    {winnerEntry ? (
                      <p className="mt-1 text-xs text-emerald-300">
                        Winner: seed {winnerEntry.queueParams?.seed ?? "—"}
                        {winnerEntry.reviewRating ? ` · rated ${winnerEntry.reviewRating}/5` : ""}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="ghost"
                      className="!min-h-8 px-2 text-xs"
                      onClick={() =>
                        setExpandedGroupId((previous) =>
                          previous === group.id ? null : group.id,
                        )
                      }
                    >
                      {expandedGroupId === group.id ? "Hide" : "Expand"}
                    </Button>
                    <Link
                      href={`/gallery?q=${encodeURIComponent(group.parentPrompt.slice(0, 120))}`}
                      className="ui-btn-secondary !min-h-8 px-3 text-xs"
                    >
                      Open in gallery
                    </Link>
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {group.entries.slice(0, 4).map((entry) => {
                    const thumb = galleryEntryThumbUrls(entry)[0];
                    const isWinner = winner?.entryId === entry.id;
                    return (
                      <div
                        key={entry.id}
                        className={`overflow-hidden rounded-lg border ${
                          isWinner ? "border-emerald-500/60" : "border-zinc-800"
                        }`}
                      >
                        {thumb ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={thumb}
                            alt=""
                            loading="lazy"
                            decoding="async"
                            className="aspect-square w-full object-cover"
                          />
                        ) : (
                          <div className="flex aspect-square items-center justify-center text-[10px] text-zinc-500">
                            No preview
                          </div>
                        )}
                        <div className="space-y-1 p-2">
                          <p className="text-[10px] text-zinc-500">
                            seed {entry.queueParams?.seed ?? "—"}
                            {entry.reviewRating ? ` · ${entry.reviewRating}/5` : ""}
                          </p>
                          <button
                            type="button"
                            className={`w-full rounded border px-2 py-1 text-[10px] ${
                              isWinner
                                ? "border-emerald-500/50 text-emerald-200"
                                : "border-zinc-700 text-zinc-300 hover:border-zinc-500"
                            }`}
                            onClick={() => {
                              if (isWinner) {
                                clearExperimentWinner(group.id);
                              } else {
                                markExperimentWinner(group.id, entry.id);
                              }
                              setWinners(loadExperimentWinners());
                            }}
                          >
                            {isWinner ? "Winner ✓" : "Crown winner"}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {expandedGroupId === group.id && expandedGroup?.id === group.id ? (
                  <div className="mt-4 flex flex-wrap gap-2 border-t border-zinc-800 pt-4">
                    <Button
                      variant="secondary"
                      className="!min-h-8"
                      disabled={group.entries.length < 2}
                      onClick={() => downloadCompareExport(group.entries.slice(0, 4), "html")}
                    >
                      Export compare HTML
                    </Button>
                    <Button
                      variant="secondary"
                      className="!min-h-8"
                      disabled={group.entries.length < 2}
                      onClick={() => downloadCompareExport(group.entries.slice(0, 4), "json")}
                    >
                      Export compare JSON
                    </Button>
                    <Button
                      variant="secondary"
                      className="!min-h-8"
                      onClick={() => {
                        setStatus("Re-queueing experiment group…");
                        void requeueComfyJobs(
                          group.entries.map((entry) => {
                            const urls = resolveRequeueImageUrlsFromEntry(entry);
                            return {
                              prompt: entry.prompt,
                              negativePrompt: entry.negativePrompt,
                              model: entry.model,
                              tool: entry.tool,
                              queueParams: entry.queueParams,
                              sourceImageUrl: urls.sourceImageUrl,
                              maskImageUrl: urls.maskImageUrl,
                              newSeed: true,
                            };
                          }),
                          (message) => setStatus(message),
                        ).then(({ queued, failed }) => {
                          setStatus(`Re-queued ${queued} job(s) with new seeds.`);
                          toastBulkQueueSummary({
                            label: "Experiment re-queue finished",
                            queued,
                            failed,
                          });
                        });
                      }}
                    >
                      Re-queue with new seeds
                    </Button>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {status ? <p className="mt-4 text-sm text-emerald-400">{status}</p> : null}
    </ToolSection>
  );
}
