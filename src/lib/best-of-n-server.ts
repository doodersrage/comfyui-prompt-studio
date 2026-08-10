import { runServerScheduledBatch } from './server-scheduled-batch';
import { rankPromptsWithLlm } from './best-of-n-rank-server';
import type { UserScheduledCampaign } from './auth/types';

export { rankPromptsWithLlm } from './best-of-n-rank-server';

export async function runUserCampaignWithBestOfN(
  campaign: UserScheduledCampaign
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
    const { queueBatchToComfyUi } = await import('./comfyui-client');
    const result = await queueBatchToComfyUi(
      prompts.map(prompt => ({ prompt })),
      undefined
    );
    queued = result.queued;
  }

  return { prompts, queued, ranked };
}
