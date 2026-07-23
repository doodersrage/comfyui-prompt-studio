import { chatCompletion, allowTemplateFallback, isLlmEnabled } from "./llm-client";
import { getComfyModelDefinition } from "./comfy-models/client";
import { isWanLightningModel } from "./model-sampling-patch";

export type VideoPromptRequest = {
  subject: string;
  motion?: string;
  camera?: string;
  durationSec?: number;
  style?: string;
  model?: string;
  /** Force template composition even when LLM is enabled. */
  preferTemplate?: boolean;
};

export function buildVideoPrompt(request: VideoPromptRequest): string {
  const subject = request.subject.trim();
  const motion = request.motion?.trim();
  const camera = request.camera?.trim();
  const style = request.style?.trim();
  const duration =
    typeof request.durationSec === "number" && request.durationSec > 0
      ? `${request.durationSec}s clip`
      : "short clip";
  const lightning = isWanLightningModel(request.model);

  const parts = [
    `${duration}.`,
    subject ? `Subject/action: ${subject}.` : "",
    motion ? `Motion: ${motion}.` : "",
    camera
      ? `Camera: ${camera}.`
      : lightning
        ? "Camera: one gentle continuous move, stable framing."
        : "Camera: stable cinematic framing with gentle movement.",
    style ? `Look: ${style}.` : "",
    lightning
      ? "Single clear subject, one continuous action — keep the shot simple for 4-step Lightning."
      : "",
    "Maintain temporal continuity; avoid flicker, morphing faces, and abrupt scene cuts.",
    "Keep a stable limb count and coherent hands; do not invent extra arms, legs, people, or props mid-clip.",
  ];
  return parts.filter(Boolean).join(" ");
}

function buildVideoLlmSystemPrompt(model?: string): string {
  const def = model ? getComfyModelDefinition(model) : null;
  const label = def?.label ?? "video diffusion";
  const lightning = isWanLightningModel(model);
  return [
    `You write concise prompts for ${label} text-to-video / image-to-video.`,
    lightning
      ? "Optimize for 4-step CFG-1 Lightning: one subject, one continuous motion, simple camera language, minimal competing details."
      : "Emphasize subject action, camera language, motion continuity, and lighting.",
    "Avoid flicker, morphing faces, identity drift, and abrupt cuts.",
    "Keep anatomy stable across frames: consistent limb count, coherent hands/fingers, no duplicate subjects, no suddenly appearing or disappearing props.",
    lightning
      ? "Do not write multi-subject or highly intricate choreography — Lightning drafts collapse under clutter."
      : "",
    "Return only the prompt text — no markdown, titles, or commentary.",
    lightning
      ? "Keep the prompt under ~55 words."
      : "Keep the prompt under ~80 words unless the subject description needs more.",
  ]
    .filter(Boolean)
    .join(" ");
}

function buildVideoLlmUserPrompt(request: VideoPromptRequest): string {
  const lines = [
    `Subject/action: ${request.subject.trim()}`,
    request.motion?.trim() ? `Motion: ${request.motion.trim()}` : "",
    request.camera?.trim()
      ? `Camera: ${request.camera.trim()}`
      : "Camera: stable cinematic framing with gentle movement",
    request.style?.trim() ? `Look/style: ${request.style.trim()}` : "",
    typeof request.durationSec === "number" && request.durationSec > 0
      ? `Duration target: ${request.durationSec}s`
      : "",
  ];
  return lines.filter(Boolean).join("\n");
}

/**
 * LLM-backed video prompt with template fallback when LLM is disabled or fails
 * (and template fallback is allowed).
 */
export async function generateVideoPrompt(request: VideoPromptRequest): Promise<{
  prompt: string;
  method: "llm" | "template";
}> {
  const template = buildVideoPrompt(request);
  if (request.preferTemplate || !isLlmEnabled()) {
    return { prompt: template, method: "template" };
  }

  try {
    const content = await chatCompletion({
      messages: [
        { role: "system", content: buildVideoLlmSystemPrompt(request.model) },
        { role: "user", content: buildVideoLlmUserPrompt(request) },
      ],
      maxTokens: 320,
      temperature: 0.7,
      usageContext: { route: "video-prompt" },
    });
    const trimmed = content.trim();
    if (!trimmed) {
      throw new Error("Empty LLM response.");
    }
    return { prompt: trimmed, method: "llm" };
  } catch (error) {
    if (allowTemplateFallback()) {
      return { prompt: template, method: "template" };
    }
    throw error;
  }
}
