"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { loadPromptRecipes, runPromptRecipeSteps, type PromptRecipe } from "@/lib/prompt-recipes";
import { queueSameSeedShootout, DEFAULT_SHOOTOUT_MODELS } from "@/lib/model-shootout";

type ResultQuickActionsProps = {
  prompt: string;
  negativePrompt?: string;
  model?: string;
  seed?: number;
};

export default function ResultQuickActions({
  prompt,
  negativePrompt,
  model = "sdxl",
  seed,
}: ResultQuickActionsProps) {
  const [status, setStatus] = useState<string | null>(null);
  const recipes = loadPromptRecipes().slice(0, 8);

  if (!prompt.trim()) {
    return null;
  }

  async function runRecipe(recipe: PromptRecipe) {
    setStatus(`Running ${recipe.name}…`);
    const result = await runPromptRecipeSteps(prompt, recipe.steps, model);
    setStatus(result.log.join(" · "));
  }

  async function runShootout() {
    setStatus("Queueing model shootout…");
    const resolvedSeed = seed ?? Math.floor(Math.random() * 1_000_000);
    const result = await queueSameSeedShootout({
      prompt: prompt.trim(),
      negativePrompt,
      models: DEFAULT_SHOOTOUT_MODELS.map((entry) => entry.model),
      seed: resolvedSeed,
    });
    setStatus(
      result.errors.length > 0
        ? `Queued ${result.queued} · ${result.errors[0]}`
        : `Queued ${result.queued} models (seed ${resolvedSeed}).`,
    );
  }

  return (
    <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/35 p-3 space-y-2">
      <p className="type-caption text-zinc-500">Quick actions</p>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" onClick={() => void runShootout()}>
          Same-seed shootout
        </Button>
        {recipes.map((recipe) => (
          <Button key={recipe.id} variant="ghost" size="sm" onClick={() => void runRecipe(recipe)}>
            {recipe.name}
          </Button>
        ))}
      </div>
      {status ? <p className="text-xs text-emerald-400">{status}</p> : null}
    </div>
  );
}
