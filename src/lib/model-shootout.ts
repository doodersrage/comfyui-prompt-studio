export type ShootoutModel = {
  model: string;
  label: string;
};

export const DEFAULT_SHOOTOUT_MODELS: ShootoutModel[] = [
  { model: "sdxl", label: "SDXL" },
  { model: "flux-2-klein", label: "FLUX Klein" },
  { model: "sd1.5", label: "SD 1.5" },
];

export async function queueSameSeedShootout(input: {
  prompt: string;
  negativePrompt?: string;
  models: string[];
  seed: number;
}): Promise<{ queued: number; errors: string[] }> {
  const errors: string[] = [];
  let queued = 0;

  for (const model of input.models) {
    try {
      const response = await fetch("/api/comfyui", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompts: [
            {
              prompt: input.prompt,
              negativePrompt: input.negativePrompt,
              params: { seed: input.seed, model },
            },
          ],
        }),
      });
      if (!response.ok) {
        const data = (await response.json()) as { error?: string };
        errors.push(data.error ?? `Failed for ${model}`);
        continue;
      }
      queued += 1;
    } catch (error) {
      errors.push(error instanceof Error ? error.message : `Failed for ${model}`);
    }
  }

  return { queued, errors };
}
