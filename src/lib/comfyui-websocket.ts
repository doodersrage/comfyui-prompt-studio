"use client";

import { comfyPreviewBinaryToObjectUrl } from "./comfyui-preview-binary";

export type ComfyUiWebSocketProgress = {
  promptId: string;
  node?: string | null;
  status: "executing" | "progress" | "finished" | "error" | "preview";
  message?: string;
  value?: number;
  max?: number;
  /** Object URL for the latest latent preview frame (caller should revoke prior). */
  previewUrl?: string;
};

function toWebSocketUrl(comfyUrl: string, clientId: string): string {
  const trimmed = comfyUrl.trim().replace(/\/+$/, "");
  let base: string;
  if (trimmed.startsWith("https://")) {
    base = trimmed.replace(/^https:/, "wss:") + "/ws";
  } else if (trimmed.startsWith("http://")) {
    base = trimmed.replace(/^http:/, "ws:") + "/ws";
  } else {
    base = `ws://${trimmed}/ws`;
  }
  return `${base}?clientId=${encodeURIComponent(clientId)}`;
}

function asFiniteNumber(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined;
  }
  return value;
}

function formatStepMessage(value: number, max: number, node?: string | null): string {
  const safeMax = Math.max(1, Math.floor(max));
  const safeValue = Math.max(0, Math.min(Math.floor(value), safeMax));
  const percent = Math.round((safeValue / safeMax) * 100);
  const step = `Step ${safeValue}/${safeMax} (${percent}%)`;
  return node ? `${step} · node ${node}` : step;
}

type WsPayload = {
  type?: string;
  data?: {
    prompt_id?: string;
    node?: string | null;
    value?: number;
    max?: number;
    exception_message?: string;
    nodes?: Record<
      string,
      {
        value?: number;
        max?: number;
        state?: string;
        node_id?: string;
        real_node_id?: string;
      }
    >;
  };
};

export function createComfyUiClientId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID().replace(/-/g, "");
  }
  return `client${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`;
}

export function subscribeComfyUiWebSocket(input: {
  comfyUrl: string;
  promptId: string;
  /** Must match the client_id sent with /prompt for preview association. */
  clientId?: string;
  onProgress: (progress: ComfyUiWebSocketProgress) => void;
  onError?: (message: string) => void;
}): () => void {
  if (typeof window === "undefined" || typeof WebSocket === "undefined") {
    return () => {};
  }

  const clientId = input.clientId?.trim() || createComfyUiClientId();
  let socket: WebSocket | null = null;
  let closed = false;
  let lastPreviewUrl: string | null = null;

  try {
    socket = new WebSocket(toWebSocketUrl(input.comfyUrl, clientId));
  } catch (err) {
    input.onError?.(
      err instanceof Error ? err.message : "WebSocket connection failed.",
    );
    return () => {};
  }

  const publishPreview = (buffer: ArrayBuffer) => {
    const url = comfyPreviewBinaryToObjectUrl(buffer);
    if (!url) {
      return;
    }
    if (lastPreviewUrl) {
      URL.revokeObjectURL(lastPreviewUrl);
    }
    lastPreviewUrl = url;
    input.onProgress({
      promptId: input.promptId,
      status: "preview",
      previewUrl: url,
      message: "Live preview",
    });
  };

  socket.binaryType = "arraybuffer";

  socket.onmessage = (event) => {
    if (typeof event.data !== "string") {
      if (event.data instanceof ArrayBuffer) {
        publishPreview(event.data);
      } else if (event.data instanceof Blob) {
        void event.data.arrayBuffer().then((buffer) => {
          if (!closed) {
            publishPreview(buffer);
          }
        });
      }
      return;
    }

    try {
      const payload = JSON.parse(event.data) as WsPayload;
      const promptId = payload.data?.prompt_id;
      if (promptId && promptId !== input.promptId) {
        return;
      }

      if (payload.type === "progress") {
        const value = asFiniteNumber(payload.data?.value);
        const max = asFiniteNumber(payload.data?.max);
        if (value == null || max == null || max <= 0) {
          return;
        }
        const node = payload.data?.node ?? null;
        input.onProgress({
          promptId: input.promptId,
          node,
          status: "progress",
          value,
          max,
          message: formatStepMessage(value, max, node),
        });
        return;
      }

      if (payload.type === "progress_state") {
        const nodes = payload.data?.nodes;
        if (!nodes || typeof nodes !== "object") {
          return;
        }
        const running = Object.values(nodes).find(
          (node) => node?.state === "running" && asFiniteNumber(node.max),
        );
        if (!running) {
          return;
        }
        const value = asFiniteNumber(running.value) ?? 0;
        const max = asFiniteNumber(running.max) ?? 1;
        const node = running.real_node_id ?? running.node_id ?? null;
        input.onProgress({
          promptId: input.promptId,
          node,
          status: "progress",
          value,
          max,
          message: formatStepMessage(value, max, node),
        });
        return;
      }

      if (payload.type === "executing") {
        if (promptId !== input.promptId) {
          return;
        }
        const node = payload.data?.node ?? null;
        input.onProgress({
          promptId: input.promptId,
          node,
          status: node ? "executing" : "finished",
          message: node ? `Running node ${node}` : "Execution finished",
        });
        return;
      }

      if (payload.type === "execution_error") {
        if (promptId !== input.promptId) {
          return;
        }
        const detail = payload.data?.exception_message?.trim();
        input.onProgress({
          promptId: input.promptId,
          status: "error",
          message: detail ? `ComfyUI error: ${detail}` : "ComfyUI execution error",
        });
      }
    } catch {
      // ignore malformed text frames
    }
  };

  socket.onerror = () => {
    if (!closed) {
      input.onError?.("WebSocket error");
    }
  };

  return () => {
    closed = true;
    if (lastPreviewUrl) {
      URL.revokeObjectURL(lastPreviewUrl);
      lastPreviewUrl = null;
    }
    socket?.close();
    socket = null;
  };
}
