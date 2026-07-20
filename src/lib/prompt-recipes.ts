import { readBrowserValue, writeBrowserValue } from "./browser-storage";

export type PromptRecipeStep =
  | "generate"
  | "lint"
  | "fix"
  | "compact"
  | "queue";

export type PromptRecipe = {
  id: string;
  name: string;
  steps: PromptRecipeStep[];
  createdAt: number;
};

const KEY = "comfy-prompt-recipes-v1";

export function loadPromptRecipes(): PromptRecipe[] {
  if (typeof window === "undefined") {
    return [];
  }
  return readBrowserValue<PromptRecipe[]>(KEY) ?? [];
}

export function savePromptRecipes(recipes: PromptRecipe[]): void {
  writeBrowserValue(KEY, recipes);
}

export function upsertPromptRecipe(recipe: Omit<PromptRecipe, "createdAt"> & { createdAt?: number }): PromptRecipe {
  const next: PromptRecipe = {
    ...recipe,
    createdAt: recipe.createdAt ?? Date.now(),
  };
  savePromptRecipes([next, ...loadPromptRecipes().filter((entry) => entry.id !== recipe.id)]);
  return next;
}

export async function runPromptRecipeSteps(
  prompt: string,
  steps: PromptRecipeStep[],
  model: string,
): Promise<{ prompt: string; log: string[] }> {
  let current = prompt;
  const log: string[] = [];

  for (const step of steps) {
    if (step === "lint") {
      const response = await fetch("/api/lint", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: current, model }),
      });
      const data = (await response.json()) as { ok?: boolean };
      log.push(data.ok ? "Lint passed" : "Lint reported issues");
      continue;
    }
    if (step === "fix") {
      const response = await fetch("/api/fix", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: current, model }),
      });
      const data = (await response.json()) as { prompt?: string };
      if (data.prompt) {
        current = data.prompt;
        log.push("Applied rule fixes");
      }
      continue;
    }
    if (step === "compact") {
      const response = await fetch("/api/compact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: current, model }),
      });
      const data = (await response.json()) as { prompt?: string };
      if (data.prompt) {
        current = data.prompt;
        log.push("Compacted prompt");
      }
      continue;
    }
    if (step === "queue") {
      await fetch("/api/comfyui", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompts: [{ prompt: current }] }),
      });
      log.push("Queued to ComfyUI");
    }
  }

  return { prompt: current, log };
}
