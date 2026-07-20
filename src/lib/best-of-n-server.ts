import { chatCompletion } from "./llm-client";
import { runServerScheduledBatch } from "./server-scheduled-batch";
import type { UserScheduledCampaign } from "./auth/types";

export async function rankPromptsWithLlm(
  prompts: string[],
  keep: number,
): Promise<string[]> {
  if (prompts.length <= keep) {
    return prompts;
  }

  const numbered = prompts.map((prompt, index) => `${index + 1}. ${prompt}`).join("\n\n");
  const text = await chatCompletion({
    maxTokens: 120,
    temperature: 0.2,
    messages: [
      {
        role: "system",
        content:
          "Pick the best image prompts. Reply with comma-separated 1-based indices only, best first.",
      },
      {
        role: "user",
        content: `Keep the top ${keep} prompts from this list:\n\n${numbered}`,
      },
    ],
    usageContext: { route: "best-of-n-rank" },
  });

  const indices = text
    .match(/\d+/g)
    ?.map((value) => Number(value) - 1)
    .filter((index) => index >= 0 && index < prompts.length) ?? [];

  const picked: string[] = [];
  for (const index of indices) {
    if (!picked.includes(prompts[index])) {
      picked.push(prompts[index]);
    }
    if (picked.length >= keep) {
      break;
    }
  }

  return picked.length > 0 ? picked : prompts.slice(0, keep);
}

export async function runUserCampaignWithBestOfN(
  campaign: UserScheduledCampaign,
): Promise<{ prompts: string[]; queued: number; ranked: boolean }> {
  const multiplier = campaign.bestOfN && campaign.bestOfN > 1 ? campaign.bestOfN : 1;
  const generateCount = campaign.count * multiplier;

  const batch = await runServerScheduledBatch({
    target: campaign.target,
    count: generateCount,
    autoQueueComfyUi: false,
  });

  let prompts = batch.prompts;
  let ranked = false;

  if (multiplier > 1 && prompts.length > campaign.count) {
    prompts = await rankPromptsWithLlm(prompts, campaign.count);
    ranked = true;
  }

  let queued = 0;
  if (campaign.autoQueueComfyUi && prompts.length > 0) {
    const { queueBatchToComfyUi } = await import("./comfyui-client");
    const result = await queueBatchToComfyUi(
      prompts.map((prompt) => ({ prompt })),
      undefined,
    );
    queued = result.queued;
  }

  return { prompts, queued, ranked };
}
