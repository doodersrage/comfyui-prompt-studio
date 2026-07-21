"use client";

export type ComfyUiWebSocketProgress = {
  promptId: string;
  node?: string | null;
  status: "executing" | "progress" | "finished" | "error";
  message?: string;
  value?: number;
  max?: number;
};

function toWebSocketUrl(comfyUrl: string): string {
  const trimmed = comfyUrl.trim().replace(/\/+$/, "");
  if (trimmed.startsWith("https://")) {
    return trimmed.replace(/^https:/, "wss:") + "/ws";
  }
  if (trimmed.startsWith("http://")) {
    return trimmed.replace(/^http:/, "ws:") + "/ws";
  }
  return `ws://${trimmed}/ws`;
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

export function subscribeComfyUiWebSocket(input: {
  comfyUrl: string;
  promptId: string;
  onProgress: (progress: ComfyUiWebSocketProgress) => void;
  onError?: (message: string) => void;
}): () => void {
  if (typeof window === "undefined" || typeof WebSocket === "undefined") {
    return () => {};
  }

  const clientId = crypto.randomUUID().replace(/-/g, "");
  let socket: WebSocket | null = null;
  let closed = false;

  try {
    socket = new WebSocket(`${toWebSocketUrl(input.comfyUrl)}?clientId=${clientId}`);
  } catch (err) {
    input.onError?.(
      err instanceof Error ? err.message : "WebSocket connection failed.",
    );
    return () => {};
  }

  socket.onmessage = (event) => {
    if (typeof event.data !== "string") {
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
      // ignore malformed / binary frames
    }
  };

  socket.onerror = () => {
    if (!closed) {
      input.onError?.("WebSocket error");
    }
  };

  return () => {
    closed = true;
    socket?.close();
    socket = null;
  };
}
