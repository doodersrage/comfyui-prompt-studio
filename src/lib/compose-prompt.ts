import type { CustomWorkflowToken, WorkflowParamValues } from "./comfyui-config";
import {
  DEFAULT_INPUT_IMAGE_TOKEN,
  DEFAULT_INPUT_IMAGE_2_TOKEN,
  DEFAULT_INPUT_IMAGE_3_TOKEN,
  DEFAULT_INPUT_IMAGE_4_TOKEN,
} from "./comfyui-config";
import { buildQwenEditPrompt, parseQwenEditSegments } from "./qwen-edit-builder";
import {
  MAX_INPUT_IMAGE_FILENAMES,
  normalizeInputImageFilenames,
} from "./workflow-load-image-bindings";

export const COMPOSE_DEFAULT_MODEL = "qwen-image-edit-2511-lightning-8" as const;

export const MAX_COMPOSE_FIGURES = MAX_INPUT_IMAGE_FILENAMES;

export type ComposeMode = "transfer" | "modify";

export { isComposeCapableModel } from "./model-denoise-defaults";
export { normalizeInputImageFilenames };

const FIGURE_LABEL_RE = /\b(?:figure|image|ref|picture|photo)\s*[1-4]\b/i;

const MULTI_INPUT_IMAGE_TOKENS = [
  DEFAULT_INPUT_IMAGE_TOKEN,
  DEFAULT_INPUT_IMAGE_2_TOKEN,
  DEFAULT_INPUT_IMAGE_3_TOKEN,
  DEFAULT_INPUT_IMAGE_4_TOKEN,
] as const;

/** Sync `inputImageFilename` + `inputImageFilenames` on queue params. */
export function applyInputImageFilenamesToParams(
  params: WorkflowParamValues,
  filenames: string[],
): WorkflowParamValues {
  const next = { ...params };
  const normalized = filenames
    .map((entry) => entry.trim())
    .filter(Boolean)
    .slice(0, MAX_COMPOSE_FIGURES);
  if (normalized.length === 0) {
    delete next.inputImageFilename;
    delete next.inputImageFilenames;
    return next;
  }
  next.inputImageFilename = normalized[0];
  next.inputImageFilenames = normalized;
  return next;
}

export function multiInputImageCustomTokens(
  filenames: string[],
): CustomWorkflowToken[] {
  const tokens: CustomWorkflowToken[] = [];
  for (let i = 0; i < MULTI_INPUT_IMAGE_TOKENS.length; i += 1) {
    const value = filenames[i]?.trim();
    if (!value) {
      continue;
    }
    tokens.push({ token: MULTI_INPUT_IMAGE_TOKENS[i], value });
  }
  return tokens;
}

export function inputImageTokenForFigureIndex(index: number): string {
  return MULTI_INPUT_IMAGE_TOKENS[index] ?? DEFAULT_INPUT_IMAGE_TOKEN;
}

export const COMPOSE_TRANSFER_TEMPLATES: Array<{
  id: string;
  label: string;
  instruction: string;
}> = [
  {
    id: "outfit",
    label: "Outfit transfer",
    instruction:
      "Keep the pose and framing from Figure 1. Replace the outfit with the jacket style from Figure 2, matching lighting.",
  },
  {
    id: "background",
    label: "Background transfer",
    instruction:
      "Keep the person from Figure 1 unchanged in identity, pose, and proportions. Replace the background with the environment from Figure 2, matching perspective and lighting so both sources read as one scene.",
  },
  {
    id: "subject-object",
    label: "Object transfer",
    instruction:
      "Keep the scene and lighting from Figure 1. Add the object from Figure 2 into Figure 1 with matching scale, perspective, and shadows.",
  },
  {
    id: "three-way",
    label: "Style + subject",
    instruction:
      "Keep pose from Figure 1, apply the outfit from Figure 2, and place the subject into the environment from Figure 3.",
  },
];

export const COMPOSE_MODIFY_TEMPLATES: Array<{
  id: string;
  label: string;
  instruction: string;
}> = [
  {
    id: "keep-replace",
    label: "Keep / replace",
    instruction: [
      "keep: subject face, pose, and proportions",
      "replace: background with a rainy neon alley at night",
      "add: steam rising from sidewalk grates",
      "remove: visible logos and text",
    ].join("\n"),
  },
  {
    id: "lighting",
    label: "Relight",
    instruction:
      "Keep the subject identity, pose, and framing from Figure 1. Replace the lighting with soft golden-hour side light and warmer skin tones.",
  },
];

/**
 * Transfer (≥2 figs): auto-prefix Figure labels when the user omitted them.
 * Modify: expand keep/replace lines via qwen-edit-builder when present.
 */
export function buildComposeInstruction(input: {
  mode: ComposeMode;
  instruction: string;
  figureCount: number;
}): string {
  const raw = input.instruction.trim();
  if (!raw) {
    return "";
  }

  if (input.mode === "modify") {
    if (/^(keep|replace|add|remove)\s*:/im.test(raw)) {
      const built = buildQwenEditPrompt(parseQwenEditSegments(raw));
      return built || raw;
    }
    return raw;
  }

  if (FIGURE_LABEL_RE.test(raw) || input.figureCount < 2) {
    return raw;
  }

  const labels = Array.from({ length: Math.min(input.figureCount, MAX_COMPOSE_FIGURES) }, (_, i) =>
    `Figure ${i + 1}`,
  ).join(", ");
  return `Using ${labels}: ${raw}`;
}

export function composeFigureCountFromFilenames(
  filenames: Array<string | undefined | null> | undefined,
): number {
  return (filenames ?? []).filter((entry) => Boolean(entry?.trim())).length;
}
