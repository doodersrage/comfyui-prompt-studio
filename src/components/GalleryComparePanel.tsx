"use client";

import { useMemo, useState } from "react";
import type { ComfyGalleryEntry } from "@/lib/comfyui-gallery";
import { galleryEntryViewUrls } from "@/lib/comfyui-gallery";
import { Button } from "@/components/ui/Button";
import {
  createEloBracket,
  initEloEntries,
  updateEloRatings,
  type EloEntry,
} from "@/lib/gallery-elo";

type GalleryComparePanelProps = {
  entries: ComfyGalleryEntry[];
  onClose: () => void;
  onPickWinner?: (entry: ComfyGalleryEntry) => void;
  onRate?: (entryId: string, rating: ComfyGalleryEntry["reviewRating"]) => void;
  onFavorite?: (entryId: string) => void;
  onMutate?: (entry: ComfyGalleryEntry) => void;
  onImprove?: (entry: ComfyGalleryEntry) => void;
  onUpscale?: (entry: ComfyGalleryEntry, qualityProfile: "final" | "max") => void;
  onRefine?: (entry: ComfyGalleryEntry) => void;
  status?: string | null;
};

export default function GalleryComparePanel({
  entries,
  onClose,
  onPickWinner,
  onRate,
  onFavorite,
  onMutate,
  onImprove,
  onUpscale,
  onRefine,
  status,
}: GalleryComparePanelProps) {
  const [tournament, setTournament] = useState(false);
  const [elo, setElo] = useState<EloEntry[]>([]);
  const [pairIndex, setPairIndex] = useState(0);
  const pairs = useMemo(
    () => (tournament ? createEloBracket(entries.map((entry) => entry.id)) : []),
    [tournament, entries],
  );

  if (entries.length === 0) {
    return null;
  }

  function startTournament() {
    setTournament(true);
    setElo(initEloEntries(
      entries.map((entry) => entry.id),
      Object.fromEntries(entries.map((entry) => [entry.id, entry.model ?? entry.id.slice(0, 8)])),
    ));
    setPairIndex(0);
  }

  function pickTournamentWinner(winnerId: string, loserId: string) {
    setElo((prev) => updateEloRatings(prev, winnerId, loserId));
    setPairIndex((prev) => prev + 1);
  }

  return (
    <div className="space-y-3 rounded-xl border border-violet-700/40 bg-violet-950/20 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-violet-100">
          Compare {entries.length} selected outputs
        </p>
        <button
          type="button"
          onClick={onClose}
          className="text-xs text-zinc-400 hover:text-zinc-200"
        >
          Close
        </button>
      </div>
      {entries.length >= 2 ? (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" onClick={startTournament}>
            ELO tournament
          </Button>
        </div>
      ) : null}
      {tournament && pairs[pairIndex] ? (
        <p className="text-xs text-violet-200">
          Match {pairIndex + 1}/{pairs.length} — pick the better output
        </p>
      ) : null}
      {tournament && elo.length > 0 && pairIndex >= pairs.length ? (
        <ul className="text-xs text-zinc-300">
          {[...elo].sort((a, b) => b.rating - a.rating).map((entry) => (
            <li key={entry.id}>{entry.label}: {entry.rating} ELO ({entry.matches} matches)</li>
          ))}
        </ul>
      ) : null}
      {status ? <p className="text-xs text-violet-300/90">{status}</p> : null}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {entries.map((entry) => {
          const url = galleryEntryViewUrls(entry)[0] ?? null;
          return (
            <article key={entry.id} className="space-y-2 rounded-lg border border-zinc-800 p-2">
              {url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={url} alt="" className="aspect-square w-full rounded object-cover" />
              ) : (
                <div className="flex aspect-square items-center justify-center rounded bg-zinc-900 text-xs text-zinc-500">
                  No image
                </div>
              )}
              <p className="text-[11px] text-zinc-500">
                {entry.model} · seed {entry.queueParams?.seed ?? "?"}
                {entry.reviewRating ? ` · ${entry.reviewRating}★` : ""}
              </p>
              <pre className="max-h-24 overflow-auto whitespace-pre-wrap text-xs text-zinc-300">
                {entry.prompt}
              </pre>
              <div className="flex flex-wrap gap-1">
                {onPickWinner ? (
                  <Button
                    variant="secondary"
                    className="!min-h-7 px-2 text-[11px]"
                    onClick={() => {
                      if (tournament && pairs[pairIndex]) {
                        const [a, b] = pairs[pairIndex];
                        const loserId = entry.id === a ? b : a;
                        pickTournamentWinner(entry.id, loserId);
                        return;
                      }
                      onPickWinner(entry);
                    }}
                  >
                    {tournament ? "Win match" : "Pick winner"}
                  </Button>
                ) : null}
                {[5, 4, 3, 2, 1].map((rating) => (
                  <button
                    key={rating}
                    type="button"
                    disabled={!onRate}
                    onClick={() => onRate?.(entry.id, rating as ComfyGalleryEntry["reviewRating"])}
                    className={`rounded px-1.5 py-0.5 text-[10px] ${
                      entry.reviewRating === rating
                        ? "bg-violet-700 text-white"
                        : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
                    }`}
                  >
                    {rating}★
                  </button>
                ))}
                {onFavorite ? (
                  <button
                    type="button"
                    onClick={() => onFavorite(entry.id)}
                    className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-300 hover:bg-zinc-700"
                  >
                    {entry.favorite ? "★ Fav" : "☆ Fav"}
                  </button>
                ) : null}
                {onMutate ? (
                  <button
                    type="button"
                    onClick={() => onMutate(entry)}
                    className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-emerald-300 hover:bg-zinc-700"
                  >
                    Mutate
                  </button>
                ) : null}
                {onImprove ? (
                  <button
                    type="button"
                    onClick={() => onImprove(entry)}
                    className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-sky-300 hover:bg-zinc-700"
                  >
                    Improve
                  </button>
                ) : null}
                {onUpscale ? (
                  <>
                    <button
                      type="button"
                      onClick={() => onUpscale(entry, "final")}
                      className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-emerald-300 hover:bg-zinc-700"
                    >
                      Upscale Final
                    </button>
                    <button
                      type="button"
                      onClick={() => onUpscale(entry, "max")}
                      className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-emerald-300 hover:bg-zinc-700"
                    >
                      Upscale Max
                    </button>
                  </>
                ) : null}
                {onRefine ? (
                  <button
                    type="button"
                    onClick={() => onRefine(entry)}
                    className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-amber-200 hover:bg-zinc-700"
                  >
                    Refine
                  </button>
                ) : null}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
