import { listUsersWithCampaigns, updateUserProfile } from "./auth/store";
import { runServerScheduledBatch } from "./server-scheduled-batch";
import {
  readUserServerStorage,
  writeUserExportSnapshot,
} from "./user-server-storage";
import type { UserScheduledCampaign } from "./auth/types";

function shouldRunCampaign(campaign: UserScheduledCampaign, now = Date.now()): boolean {
  if (!campaign.enabled) {
    return false;
  }
  const intervalMs = Math.max(5, campaign.intervalMin) * 60_000;
  return now - (campaign.lastRunAt ?? 0) >= intervalMs;
}

export async function runServerUserMaintenance(): Promise<{
  campaignsRun: number;
  exportsWritten: number;
}> {
  let campaignsRun = 0;
  let exportsWritten = 0;

  for (const user of listUsersWithCampaigns()) {
    const campaign = user.scheduledCampaign;
    if (!campaign || !shouldRunCampaign(campaign)) {
      continue;
    }

    await runServerScheduledBatch({
      target: campaign.target,
      count: campaign.count,
      autoQueueComfyUi: campaign.autoQueueComfyUi,
    });

    updateUserProfile(user.id, {
      scheduledCampaign: { ...campaign, lastRunAt: Date.now() },
    });
    campaignsRun += 1;
  }

  const { listUsers } = await import("./auth/store");
  for (const user of listUsers()) {
    if (!user.exportEnabled) {
      continue;
    }
    const history = readUserServerStorage<unknown>(user.id, "prompt-history");
    const gallery = readUserServerStorage<unknown>(user.id, "comfy-gallery");
    if (!history && !gallery) {
      continue;
    }
    writeUserExportSnapshot(user.id, user.username, {
      exportedAt: Date.now(),
      history,
      gallery,
    });
    exportsWritten += 1;
  }

  return { campaignsRun, exportsWritten };
}
