import {
  isIncompleteVisionFragment,
  isThinkingOnlyArtifact,
  repairVisionDraft,
  stripPromptArtifacts,
} from "./prompt-cleanup";

export type LlmUsageContext = {
  userId?: string;
  username?: string;
  route?: string;
};

function logLlmUsageSafe(entry: Parameters<typeof import("./llm-usage-log").logLlmUsage>[0]): void {
  if (typeof window !== "undefined") {
    return;
  }
  void import("./llm-usage-log").then(({ logLlmUsage }) => logLlmUsage(entry));
}

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string | ChatContentPart[];
  /** Ollama native multimodal field (raw base64, no data URL prefix) */
  images?: string[];
};

export type ChatContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

export type LlmConfig = {
  baseUrl: string;
  apiKey: string;
  model: string;
  visionModel: string;
};

export function getLlmConfig(): LlmConfig {
  const baseUrl =
    process.env.LLM_API_BASE_URL?.replace(/\/$/, "") ??
    "http://localhost:11434/v1";
  const apiKey = process.env.LLM_API_KEY ?? "";
  const model = process.env.LLM_MODEL ?? "dolphin-llama3";
  const visionModel =
    process.env.LLM_VISION_MODEL?.trim() ||
    process.env.LLM_MODEL?.trim() ||
    model;

  return { baseUrl, apiKey, model, visionModel };
}

export function getVisionModel(): string {
  const visionModel = process.env.LLM_VISION_MODEL?.trim();
  if (!visionModel) {
    throw new Error(
      "LLM_VISION_MODEL is not set. Image → Prompt requires a vision model (e.g. qwen3-vl:latest). Add it to .env.local and restart the dev server.",
    );
  }
  return visionModel;
}

export function isLlmEnabled(): boolean {
  return process.env.LLM_ENABLED !== "false";
}

export function allowTemplateFallback(): boolean {
  return process.env.ALLOW_TEMPLATE_FALLBACK !== "false";
}

export function getLlmTemperature(override?: number): number {
  if (typeof override === "number" && override >= 0 && override <= 2) {
    return override;
  }

  const configured = Number(process.env.LLM_TEMPERATURE);
  return Number.isFinite(configured) && configured >= 0 && configured <= 2
    ? configured
    : 0.95;
}

function isOllamaBaseUrl(baseUrl: string): boolean {
  return /ollama\.com/i.test(baseUrl) || /:11434(\/|$)/.test(baseUrl);
}

function ollamaNativeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/v1\/?$/, "");
}

export function extractBase64FromDataUrl(dataUrl: string): {
  mimeType: string;
  base64: string;
} {
  const match = dataUrl.match(/^data:(image\/[^;]+);base64,(.+)$/i);
  if (!match) {
    throw new Error("Image must be a base64 data URL (data:image/...;base64,...).");
  }

  return {
    mimeType: match[1]!,
    base64: match[2]!,
  };
}

type AssistantMessage = {
  content?: string | ChatContentPart[] | null;
  reasoning?: string | null;
  thinking?: string | null;
};

function extractContentText(content?: string | ChatContentPart[] | null): string {
  if (typeof content === "string" && content.trim()) {
    return content.trim();
  }

  if (Array.isArray(content)) {
    return content
      .filter((part): part is { type: "text"; text: string } => part.type === "text")
      .map((part) => part.text)
      .join("\n")
      .trim();
  }

  return "";
}

function extractThinkingFallback(
  reasoning?: string | null,
  thinking?: string | null,
): string {
  for (const raw of [reasoning, thinking]) {
    if (!raw?.trim()) {
      continue;
    }

    let candidate = raw.trim();

    const handoff = candidate.match(
      /(?:final prompt|output prompt|the prompt(?: text)?|prompt output|scene description)\s*[:\n]+\s*([\s\S]+)$/i,
    );
    if (handoff?.[1]?.trim()) {
      candidate = handoff[1].trim();
    } else {
      const paragraphs = candidate
        .split(/\n{2,}/)
        .map((part) => part.trim())
        .filter(Boolean);
      if (paragraphs.length > 1) {
        const last = paragraphs.at(-1)!;
        if (
          last.length >= 30 &&
          !/^(?:let me|i need to|first,? i|the user wants|analyze)/i.test(last)
        ) {
          candidate = last;
        }
      }
    }

    candidate = repairVisionDraft(stripPromptArtifacts(candidate));
    if (
      candidate.length >= 20 &&
      !isThinkingOnlyArtifact(candidate) &&
      !isIncompleteVisionFragment(candidate)
    ) {
      return candidate;
    }
  }

  return "";
}

function normalizeVisionModelOutput(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) {
    return "";
  }

  const repaired = repairVisionDraft(stripPromptArtifacts(trimmed));
  const minUsable = 60;

  if (
    repaired.length >= minUsable &&
    !isThinkingOnlyArtifact(repaired) &&
    !isIncompleteVisionFragment(repaired)
  ) {
    return repaired;
  }

  const lightlyCleaned = stripPromptArtifacts(trimmed);
  if (
    lightlyCleaned.length >= minUsable &&
    lightlyCleaned.length > repaired.length &&
    !isThinkingOnlyArtifact(lightlyCleaned) &&
    !isIncompleteVisionFragment(lightlyCleaned)
  ) {
    return lightlyCleaned;
  }

  if (
    repaired.length >= 20 &&
    !isThinkingOnlyArtifact(repaired) &&
    !isIncompleteVisionFragment(repaired)
  ) {
    return repaired;
  }

  return "";
}

function extractModelOutputText(message?: AssistantMessage): string {
  if (!message) {
    return "";
  }

  const contentText = extractContentText(message.content);
  if (contentText) {
    const normalized = normalizeVisionModelOutput(contentText);
    if (
      normalized &&
      !isThinkingOnlyArtifact(normalized) &&
      !isIncompleteVisionFragment(normalized)
    ) {
      return normalized;
    }
  }

  const thinkingText = extractThinkingFallback(message.reasoning, message.thinking);
  if (
    thinkingText &&
    !isIncompleteVisionFragment(thinkingText) &&
    !isThinkingOnlyArtifact(thinkingText)
  ) {
    return thinkingText;
  }

  if (contentText) {
    const repaired = repairVisionDraft(stripPromptArtifacts(contentText));
    if (repaired.length >= 20 && !isIncompleteVisionFragment(repaired)) {
      return repaired;
    }
  }

  return "";
}

function chatMessageToOllamaContent(content: string | ChatContentPart[]): string {
  if (typeof content === "string") {
    return content;
  }

  return content
    .filter((part): part is { type: "text"; text: string } => part.type === "text")
    .map((part) => part.text)
    .join("\n");
}

function mapExtraBodyToOllamaOptions(
  extraBody?: Record<string, unknown>,
): Record<string, unknown> {
  if (!extraBody) {
    return {};
  }

  const options: Record<string, unknown> = {};

  if (typeof extraBody.top_p === "number") {
    options.top_p = extraBody.top_p;
  }
  if (typeof extraBody.seed === "number") {
    options.seed = extraBody.seed;
  }
  if (typeof extraBody.frequency_penalty === "number") {
    options.frequency_penalty = extraBody.frequency_penalty;
  }
  if (typeof extraBody.presence_penalty === "number") {
    options.presence_penalty = extraBody.presence_penalty;
  }

  return options;
}

async function ollamaNativeChatCompletion(options: {
  baseUrl: string;
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  maxTokens: number;
  temperature?: number;
  extraBody?: Record<string, unknown>;
}): Promise<string> {
  const response = await fetch(`${ollamaNativeBaseUrl(options.baseUrl)}/api/chat`, {
    method: "POST",
    headers: buildAuthHeaders(options.apiKey),
    body: JSON.stringify({
      model: options.model,
      messages: options.messages.map((message) => ({
        role: message.role,
        content: chatMessageToOllamaContent(message.content),
      })),
      stream: false,
      think: false,
      options: {
        temperature: getLlmTemperature(options.temperature),
        num_predict: options.maxTokens,
        ...mapExtraBodyToOllamaOptions(options.extraBody),
      },
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(
      `Ollama chat request failed (${response.status}): ${detail.slice(0, 300)}`,
    );
  }

  const data = (await response.json()) as {
    message?: {
      content?: string;
      thinking?: string;
      reasoning?: string;
    };
  };

  const text = extractModelOutputText(data.message);
  if (!text) {
    throw new Error(
      "LLM returned an empty response. If using a thinking model, ensure Ollama supports think:false or returns content.",
    );
  }

  return text;
}

function buildAuthHeaders(apiKey: string): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  return headers;
}

async function ollamaNativeVisionCompletion(options: {
  baseUrl: string;
  apiKey: string;
  model: string;
  systemPrompt: string;
  textPrompt: string;
  imageBase64: string;
  maxTokens: number;
  temperature?: number;
  think?: boolean;
}): Promise<string> {
  const body: Record<string, unknown> = {
    model: options.model,
    messages: [
      { role: "system", content: options.systemPrompt },
      {
        role: "user",
        content: options.textPrompt,
        images: [options.imageBase64],
      },
    ],
    stream: false,
    options: {
      temperature: getLlmTemperature(options.temperature),
      num_predict: options.maxTokens,
    },
  };

  if (typeof options.think === "boolean") {
    body.think = options.think;
  }

  const response = await fetch(`${ollamaNativeBaseUrl(options.baseUrl)}/api/chat`, {
    method: "POST",
    headers: buildAuthHeaders(options.apiKey),
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(
      `Ollama vision request failed (${response.status}): ${detail.slice(0, 300)}`,
    );
  }

  const data = (await response.json()) as {
    message?: AssistantMessage;
  };

  const text = extractModelOutputText(data.message);
  if (!text) {
    throw new Error(
      "Vision model returned an empty response. If using a thinking model, ensure Ollama supports think:false or returns content.",
    );
  }

  return text;
}

async function ollamaNativeVisionCompletionWithFallback(options: {
  baseUrl: string;
  apiKey: string;
  model: string;
  systemPrompt: string;
  textPrompt: string;
  imageBase64: string;
  maxTokens: number;
  temperature?: number;
}): Promise<string> {
  const attempts: Array<boolean | undefined> = [false, true, undefined];

  let lastError: Error | null = null;
  for (const think of attempts) {
    try {
      return await ollamaNativeVisionCompletion({ ...options, think });
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }
  }

  throw (
    lastError ??
    new Error("Vision model returned an empty response after all Ollama attempts.")
  );
}

async function openAiCompatibleChatCompletion(options: {
  baseUrl: string;
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  maxTokens: number;
  temperature?: number;
  extraBody?: Record<string, unknown>;
}): Promise<string> {
  const response = await fetch(`${options.baseUrl}/chat/completions`, {
    method: "POST",
    headers: buildAuthHeaders(options.apiKey),
    body: JSON.stringify({
      model: options.model,
      messages: options.messages,
      temperature: getLlmTemperature(options.temperature),
      max_tokens: options.maxTokens,
      stream: false,
      top_p: 0.9,
      think: false,
      ...options.extraBody,
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(
      `LLM request failed (${response.status}): ${detail.slice(0, 300)}`,
    );
  }

  const data = (await response.json()) as {
    choices?: Array<{
      message?: AssistantMessage;
    }>;
  };

  const text = extractModelOutputText(data.choices?.[0]?.message);
  if (!text) {
    throw new Error("LLM returned an empty response.");
  }

  return text;
}

export async function chatCompletion(options: {
  messages: ChatMessage[];
  maxTokens: number;
  temperature?: number;
  model?: string;
  extraBody?: Record<string, unknown>;
  usageContext?: LlmUsageContext;
}): Promise<string> {
  const started = Date.now();
  const { baseUrl, apiKey, model } = getLlmConfig();
  const resolvedModel = options.model ?? model;
  const extraBody = { think: false, ...options.extraBody };

  try {
    if (isOllamaBaseUrl(baseUrl)) {
      try {
        const text = await ollamaNativeChatCompletion({
          baseUrl,
          apiKey,
          model: resolvedModel,
          messages: options.messages,
          maxTokens: options.maxTokens,
          temperature: options.temperature,
          extraBody,
        });
        logLlmUsageSafe({
          at: started,
          userId: options.usageContext?.userId,
          username: options.usageContext?.username,
          route: options.usageContext?.route ?? "chat",
          model: resolvedModel,
          durationMs: Date.now() - started,
          ok: true,
        });
        return text;
      } catch (nativeError) {
        console.warn(
          "[llm-client] Ollama native chat failed, trying OpenAI-compatible endpoint:",
          nativeError instanceof Error ? nativeError.message : nativeError,
        );
      }
    }

    const text = await openAiCompatibleChatCompletion({
      baseUrl,
      apiKey,
      model: resolvedModel,
      messages: options.messages,
      maxTokens: options.maxTokens,
      temperature: options.temperature,
      extraBody,
    });
    logLlmUsageSafe({
      at: started,
      userId: options.usageContext?.userId,
      username: options.usageContext?.username,
      route: options.usageContext?.route ?? "chat",
      model: resolvedModel,
      durationMs: Date.now() - started,
      ok: true,
    });
    return text;
  } catch (error) {
    logLlmUsageSafe({
      at: started,
      userId: options.usageContext?.userId,
      username: options.usageContext?.username,
      route: options.usageContext?.route ?? "chat",
      model: resolvedModel,
      durationMs: Date.now() - started,
      ok: false,
    });
    throw error;
  }
}

export async function visionCompletion(options: {
  systemPrompt: string;
  textPrompt: string;
  imageDataUrl: string;
  maxTokens: number;
  temperature?: number;
}): Promise<string> {
  const { baseUrl, apiKey } = getLlmConfig();
  const visionModel = getVisionModel();
  const { base64 } = extractBase64FromDataUrl(options.imageDataUrl);

  if (isOllamaBaseUrl(baseUrl)) {
    try {
      return await ollamaNativeVisionCompletionWithFallback({
        baseUrl,
        apiKey,
        model: visionModel,
        systemPrompt: options.systemPrompt,
        textPrompt: options.textPrompt,
        imageBase64: base64,
        maxTokens: options.maxTokens,
        temperature: options.temperature,
      });
    } catch (nativeError) {
      console.warn(
        "[llm-client] Ollama native vision failed, trying OpenAI-compatible endpoint:",
        nativeError instanceof Error ? nativeError.message : nativeError,
      );
    }
  }

  return openAiCompatibleChatCompletion({
    baseUrl,
    apiKey,
    model: visionModel,
    messages: [
      { role: "system", content: options.systemPrompt },
      {
        role: "user",
        content: [
          { type: "text", text: options.textPrompt },
          { type: "image_url", image_url: { url: options.imageDataUrl } },
        ],
      },
    ],
    maxTokens: options.maxTokens,
    temperature: options.temperature,
    extraBody: { think: false },
  });
}
