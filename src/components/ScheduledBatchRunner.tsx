"use client";

import { useEffect, useRef } from "react";
import {
  loadScheduledBatchConfig,
  saveScheduledBatchConfig,
  shouldRunScheduledBatch,
} from "@/lib/scheduled-batch";

export default function ScheduledBatchRunner() {
  const runningRef = useRef(false);

  useEffect(() => {
    const interval = window.setInterval(() => {
      void (async () => {
        if (runningRef.current) {
          return;
        }

        const config = loadScheduledBatchConfig();
        if (!shouldRunScheduledBatch(config)) {
          return;
        }

        runningRef.current = true;
        try {
          const { loadSettingsCache } = await import("@/lib/settings-cache");
          const { avoidedTokensRequestBody } = await import("@/lib/avoided-tokens");
          const { resolveQueueNegativePrompt } = await import("@/lib/queue-negative");
          const { resolveRuntimeForQueue } = await import("@/lib/comfyui-runtime-for-model");
          const { resolveQueueParams } = await import("@/lib/queue-params-settings");
          const { registerComfyGalleryJob } = await import("@/lib/comfyui-gallery-client");
          const { scheduleComfyGalleryPoll } = await import("@/lib/comfyui-gallery-poller");
          const { registerScheduledBatchQueue } = await import("@/lib/scheduled-batch-tracker");
          const { dispatchWebhook } = await import("@/lib/webhook-settings");

          const { shared } = loadSettingsCache();
          const prompts: string[] = [];

          if (config.target === "topics") {
            const response = await fetch("/api/topics/batch", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                topics: Array.from({ length: config.count }, (_, index) =>
                  config.genre?.trim()
                    ? `${config.genre.trim()} scene ${index + 1}`
                    : `Scheduled scene ${index + 1}`,
                ),
                target: "generate",
                model: shared.model,
                detail: shared.detail,
                ...avoidedTokensRequestBody(),
              }),
            });
            const data = (await response.json()) as {
              results?: Array<{ prompt?: string }>;
            };
            if (response.ok) {
              for (const entry of data.results ?? []) {
                if (entry.prompt?.trim()) {
                  prompts.push(entry.prompt.trim());
                }
              }
            }
          } else {
            for (let index = 0; index < config.count; index += 1) {
              const response = await fetch("/api/random-scene", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  model: shared.model,
                  detail: shared.detail,
                  genre: config.genre?.trim() || undefined,
                  includePeople: true,
                  wildness: 50,
                  ...avoidedTokensRequestBody(),
                }),
              });
              const data = (await response.json()) as { prompt?: string };
              if (response.ok && data.prompt?.trim()) {
                prompts.push(data.prompt.trim());
              }
            }
          }

          if (config.autoQueueComfyUi && prompts.length > 0) {
            const negativePrompt = await resolveQueueNegativePrompt({
              model: shared.model,
              hints: config.genre,
              tool: "scheduled-batch",
            });
            const runtime = resolveRuntimeForQueue(shared.model, "scheduled-batch");
            const paramsPerPrompt = prompts.map((_, index) =>
              resolveQueueParams({
                model: shared.model,
                tool: "scheduled-batch",
                base: {
                  seed: String(Math.floor(Math.random() * 2 ** 32) + index),
                },
              }),
            );
            const response = await fetch("/api/comfyui", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                prompts,
                negativePrompt,
                paramsPerPrompt,
                ...(runtime ? { comfy: runtime } : {}),
              }),
            });
            const data = (await response.json()) as {
              results?: Array<{ promptId?: string; comfyUrl?: string }>;
              comfyUrl?: string;
            };
            if (response.ok) {
              let queuedJobs = 0;
              for (const [index, result] of (data.results ?? []).entries()) {
                if (!result.promptId) {
                  continue;
                }
                queuedJobs += 1;
                const comfyUrl = result.comfyUrl ?? data.comfyUrl ?? "http://127.0.0.1:8188";
                registerComfyGalleryJob({
                  promptId: result.promptId,
                  prompt: prompts[index] ?? "",
                  negativePrompt,
                  tool: "scheduled-batch",
                  model: shared.model,
                  comfyUrl,
                  queueParams: paramsPerPrompt[index],
                  queueQualityProfile: runtime.queueQualityProfile,
                });
                void scheduleComfyGalleryPoll(result.promptId, {
                  comfyUrl,
                });
              }
              registerScheduledBatchQueue(queuedJobs);
            }
          }

          saveScheduledBatchConfig({ ...config, lastRunAt: Date.now() });
          void dispatchWebhook({
            event: "scheduled.batch.run",
            tool: "scheduled-batch",
            model: shared.model,
            queued: prompts.length,
            completedAt: Date.now(),
            message: config.autoQueueComfyUi
              ? `Generated ${prompts.length} prompts and queued to ComfyUI`
              : `Generated ${prompts.length} prompts`,
          });
        } finally {
          runningRef.current = false;
        }
      })();
    }, 60_000);

    return () => window.clearInterval(interval);
  }, []);

  return null;
}
