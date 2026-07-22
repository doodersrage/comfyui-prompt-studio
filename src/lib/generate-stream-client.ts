/**
 * Browser-side SSE reader for `POST /api/generate/stream`. Progressively
 * reports raw text deltas via `onDelta` while accumulating them, then
 * resolves with the finalized (sanitized/formatted) result once the server
 * emits its `done` event. Throws on `error` events, non-2xx responses
 * (e.g. 429 busy), or a stream that ends without a `done` event — callers
 * should catch and fall back to the non-streaming `/api/generate` endpoint.
 */

export type GenerateStreamResult = {
  prompt: string;
  mode: "positive" | "negative";
  provider: "llm" | "template";
  model: string;
  comfyNode: string;
  limits: {
    minChars?: number;
    maxChars: number;
    maxSentences: number;
    maxTokens: number;
  };
  metadata?: {
    wardrobeAssignments?: Array<{
      wardrobeId?: string | null;
      footwearId?: string | null;
      accessoriesId?: string | null;
    }>;
  };
};

export type GenerateStreamHandlers = {
  onDelta?: (delta: string, accumulated: string) => void;
};

class GenerateStreamBusyError extends Error {
  readonly retryAfter?: number;
  constructor(message: string, retryAfter?: number) {
    super(message);
    this.name = "GenerateStreamBusyError";
    this.retryAfter = retryAfter;
  }
}

export { GenerateStreamBusyError };

function parseSseBlock(
  block: string,
): { event: string; data: unknown } | null {
  let event = "message";
  const dataLines: string[] = [];

  for (const line of block.split("\n")) {
    if (line.startsWith("event:")) {
      event = line.slice("event:".length).trim();
    } else if (line.startsWith("data:")) {
      dataLines.push(line.slice("data:".length).trim());
    }
  }

  if (dataLines.length === 0) {
    return null;
  }

  try {
    return { event, data: JSON.parse(dataLines.join("\n")) };
  } catch {
    return null;
  }
}

export async function streamGeneratePrompt(
  body: Record<string, unknown>,
  handlers?: GenerateStreamHandlers,
  init?: { signal?: AbortSignal },
): Promise<GenerateStreamResult> {
  const response = await fetch("/api/generate/stream", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: init?.signal,
  });

  if (!response.ok || !response.body) {
    let message = `Stream request failed (${response.status}).`;
    let retryAfter: number | undefined;
    try {
      const data = (await response.json()) as { error?: string; retryAfter?: number };
      message = data?.error ?? message;
      retryAfter = data?.retryAfter;
    } catch {
      // response wasn't JSON (or body already consumed) — keep the generic message
    }

    if (response.status === 429) {
      throw new GenerateStreamBusyError(message, retryAfter);
    }
    throw new Error(message);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let accumulated = "";
  let result: GenerateStreamResult | null = null;
  let streamErrorMessage: string | null = null;

  const handleBlock = (block: string) => {
    const parsed = parseSseBlock(block);
    if (!parsed) {
      return;
    }

    if (parsed.event === "delta") {
      const text = (parsed.data as { text?: string })?.text;
      if (typeof text === "string" && text) {
        accumulated += text;
        handlers?.onDelta?.(text, accumulated);
      }
      return;
    }

    if (parsed.event === "done") {
      result = parsed.data as GenerateStreamResult;
      return;
    }

    if (parsed.event === "error") {
      streamErrorMessage =
        (parsed.data as { message?: string })?.message ?? "Generation failed.";
    }
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      let boundary = buffer.indexOf("\n\n");
      while (boundary !== -1) {
        handleBlock(buffer.slice(0, boundary));
        buffer = buffer.slice(boundary + 2);
        boundary = buffer.indexOf("\n\n");
      }
    }
    if (buffer.trim()) {
      handleBlock(buffer);
    }
  } finally {
    reader.releaseLock();
  }

  if (streamErrorMessage) {
    throw new Error(streamErrorMessage);
  }
  if (!result) {
    throw new Error("Prompt stream ended without a result.");
  }
  return result;
}
