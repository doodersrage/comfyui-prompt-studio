"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";

type Props = {
  imageDataUrl: string;
  prompt: string;
  onApplyRating?: (rating: 1 | 2 | 3 | 4 | 5) => void;
};

export default function GalleryVisionReviewButton({
  imageDataUrl,
  prompt,
  onApplyRating,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    suggestedRating: number;
    tags: string[];
    critique: string;
  } | null>(null);

  async function runReview() {
    setLoading(true);
    try {
      const response = await fetch("/api/gallery/vision-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageDataUrl, prompt }),
      });
      const data = (await response.json()) as {
        suggestedRating?: number;
        tags?: string[];
        critique?: string;
        error?: string;
      };
      if (!response.ok) {
        throw new Error(data.error ?? "Vision review failed.");
      }
      setResult({
        suggestedRating: data.suggestedRating ?? 3,
        tags: data.tags ?? [],
        critique: data.critique ?? "",
      });
    } catch (error) {
      setResult({
        suggestedRating: 0,
        tags: [],
        critique: error instanceof Error ? error.message : "Vision review failed.",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2">
      <Button size="sm" variant="secondary" disabled={loading} onClick={() => void runReview()}>
        {loading ? "Analyzing…" : "Vision review"}
      </Button>
      {result ? (
        <div className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-3 text-xs text-zinc-300">
          {result.suggestedRating > 0 ? (
            <p className="text-violet-200">Suggested: {result.suggestedRating}★</p>
          ) : null}
          <p className="mt-1">{result.critique}</p>
          {result.tags.length > 0 ? (
            <p className="mt-1 text-zinc-500">{result.tags.join(" · ")}</p>
          ) : null}
          {result.suggestedRating >= 1 && result.suggestedRating <= 5 && onApplyRating ? (
            <button
              type="button"
              className="mt-2 text-violet-300 hover:text-violet-100"
              onClick={() =>
                onApplyRating(result.suggestedRating as 1 | 2 | 3 | 4 | 5)
              }
            >
              Apply {result.suggestedRating}★
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
