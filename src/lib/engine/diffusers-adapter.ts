"use client";

import { loadEngineSettings } from "@/lib/engine-settings";
import { createComfyUiClientId } from "@/lib/comfyui-websocket";
import { buildDiffusersViewPath } from "./view-paths";
import type {
  EngineAdapter,
  EngineJobStatus,
  EngineOutputImage,
  EngineProgressSubscription,
  EngineQueueResult,
  EngineStatusResult,
  EngineSubscribeProgressInput,
  EngineUploadInput,
  EngineViewPathOptions,
} from "./types";

function normalizeJobStatus(status: string | undefined): EngineJobStatus {
  if (
    status === "pending" ||
    status === "running" ||
    status === "completed" ||
    status === "error"
  ) {
    return status;
  }
  return "unknown";
}

function createNoopSubscription(clientId: string): EngineProgressSubscription {
  return {
    close: () => undefined,
    ready: Promise.resolve(),
    setPromptId: () => undefined,
    clientId,
  };
}

async function fetchDiffusersStatusViaProxy(
  promptId: string,
  engineUrl?: string,
): Promise<EngineStatusResult | null> {
  const params = new URLSearchParams({ promptId });
  if (engineUrl?.trim()) {
    params.set("engineUrl", engineUrl.trim());
  }
  const response = await fetch(`/api/diffusers/status?${params.toString()}`);
  if (!response.ok) {
    return null;
  }
  const raw = (await response.json()) as Record<string, unknown>;
  const images = Array.isArray(raw.images)
    ? (raw.images as EngineOutputImage[])
    : undefined;
  return {
    promptId,
    status: normalizeJobStatus(
      typeof raw.status === "string" ? raw.status : undefined,
    ),
    statusMessage:
      typeof raw.statusMessage === "string" ? raw.statusMessage : undefined,
    engineUrl:
      (typeof raw.engineUrl === "string" && raw.engineUrl.trim()) ||
      engineUrl?.trim() ||
      "",
    images,
    queuePosition:
      typeof raw.queuePosition === "number" || raw.queuePosition === null
        ? (raw.queuePosition as number | null)
        : undefined,
    progressValue:
      typeof raw.progressValue === "number" ? raw.progressValue : undefined,
    progressMax:
      typeof raw.progressMax === "number" ? raw.progressMax : undefined,
  };
}

/** Diffusers txt2img implementation of EngineAdapter. */
export const diffusersEngineAdapter: EngineAdapter = {
  id: "diffusers",

  async postPrompt(body: Record<string, unknown>): Promise<EngineQueueResult> {
    const settings = loadEngineSettings();
    const clientId =
      (typeof body.clientId === "string" && body.clientId.trim()) ||
      createComfyUiClientId();
    const engineUrlHint =
      (typeof body.engineUrl === "string" && body.engineUrl.trim()) ||
      settings.diffusersApiUrl ||
      undefined;

    const payload = {
      prompt: body.prompt,
      negativePrompt: body.negativePrompt,
      model: body.model,
      params: body.params,
      workshopCrop: body.workshopCrop,
      clientId,
      engineUrl: engineUrlHint,
    };

    try {
      const response = await fetch("/api/diffusers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const raw = (await response.json().catch(() => ({}))) as Record<
        string,
        unknown
      >;
      const promptId =
        typeof raw.promptId === "string" ? raw.promptId.trim() : undefined;
      const engineUrl =
        (typeof raw.engineUrl === "string" && raw.engineUrl.trim()) ||
        (typeof raw.comfyUrl === "string" && raw.comfyUrl.trim()) ||
        engineUrlHint;

      if (!response.ok || !promptId) {
        return {
          ok: false,
          status: response.status,
          error:
            typeof raw.error === "string"
              ? raw.error
              : "Diffusers queue failed.",
          engineUrl,
          raw,
          releaseLiveSocket: () => undefined,
        };
      }

      return {
        ok: true,
        status: response.status,
        promptId,
        clientId:
          (typeof raw.clientId === "string" && raw.clientId.trim()) || clientId,
        engineUrl,
        workflowSource:
          typeof raw.workflowSource === "string" ? raw.workflowSource : "diffusers",
        raw,
        releaseLiveSocket: () => undefined,
      };
    } catch (error) {
      return {
        ok: false,
        status: 0,
        error:
          error instanceof Error ? error.message : "Diffusers queue failed.",
        raw: {},
        releaseLiveSocket: () => undefined,
      };
    }
  },

  async fetchJobStatus(
    promptId: string,
    engineUrl?: string,
  ): Promise<EngineStatusResult | null> {
    const hint = engineUrl?.trim() || loadEngineSettings().diffusersApiUrl;
    return fetchDiffusersStatusViaProxy(promptId, hint);
  },

  buildViewPath(
    engineUrl: string,
    image: EngineOutputImage,
    options?: EngineViewPathOptions,
  ): string {
    return buildDiffusersViewPath(engineUrl, image, options);
  },

  async uploadInputImage(input: EngineUploadInput) {
    const formData = new FormData();
    formData.append("image", input.file, input.file.name);
    const engineUrl =
      input.engineUrl?.trim() || loadEngineSettings().diffusersApiUrl;
    if (engineUrl) {
      formData.append("engineUrl", engineUrl);
    }

    const response = await fetch("/api/diffusers/upload", {
      method: "POST",
      body: formData,
    });
    const data = (await response.json()) as {
      name?: string;
      subfolder?: string;
      type?: string;
      error?: string;
    };
    if (!response.ok || !data.name?.trim()) {
      throw new Error(data.error ?? "Diffusers image upload failed.");
    }
    return {
      name: data.name.trim(),
      subfolder: data.subfolder?.trim() || undefined,
      type: data.type?.trim() || undefined,
    };
  },

  subscribeProgress(input: EngineSubscribeProgressInput): EngineProgressSubscription {
    const clientId = input.clientId?.trim() || createComfyUiClientId();
    let promptId = input.promptId?.trim() || "";
    let closed = false;
    let timer: ReturnType<typeof setInterval> | undefined;

    const poll = async () => {
      if (closed || !promptId) {
        return;
      }
      try {
        const status = await fetchDiffusersStatusViaProxy(
          promptId,
          input.engineUrl,
        );
        if (!status || closed) {
          return;
        }
        if (status.status === "running" || status.status === "pending") {
          input.onProgress({
            promptId,
            status: "progress",
            message: status.statusMessage,
            value: status.progressValue,
            max: status.progressMax,
          });
          return;
        }
        if (status.status === "completed") {
          input.onProgress({
            promptId,
            status: "finished",
            message: status.statusMessage ?? "Completed",
          });
          closed = true;
          if (timer) {
            clearInterval(timer);
          }
          return;
        }
        if (status.status === "error") {
          input.onProgress({
            promptId,
            status: "error",
            message: status.statusMessage ?? "Diffusers job failed.",
          });
          input.onError?.(status.statusMessage ?? "Diffusers job failed.");
          closed = true;
          if (timer) {
            clearInterval(timer);
          }
        }
      } catch (error) {
        input.onError?.(
          error instanceof Error ? error.message : "Diffusers progress poll failed.",
        );
      }
    };

    timer = setInterval(() => {
      void poll();
    }, 750);
    void poll();

    return {
      close: () => {
        closed = true;
        if (timer) {
          clearInterval(timer);
        }
      },
      ready: Promise.resolve(),
      setPromptId: (next) => {
        promptId = next.trim();
      },
      clientId,
    };
  },

  async openProgressBeforeQueue(input) {
    return createNoopSubscription(input.clientId);
  },
};
