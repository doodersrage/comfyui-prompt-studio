export type ImageRefPart = {
  role: string;
  focus?: string;
  strength?: number;
  prompt: string;
};

const ROLE_GUIDANCE: Record<string, string> = {
  primary: "Primary subject reference",
  style: "Style reference — match palette, rendering style, and mood",
  composition: "Composition reference — match framing, layout, and camera angle",
  color: "Color palette reference — match dominant colors and grading",
  structure: "Structure reference — match pose, depth, or spatial layout",
};

export function normalizeRefRole(role: string, index: number): string {
  const trimmed = role.trim().toLowerCase();
  if (ROLE_GUIDANCE[trimmed]) {
    return trimmed;
  }
  if (trimmed.includes("style")) return "style";
  if (trimmed.includes("color")) return "color";
  if (trimmed.includes("comp")) return "composition";
  if (trimmed.includes("struct") || trimmed.includes("pose")) return "structure";
  if (index === 0) return "primary";
  return "reference";
}

export function mergeImagePromptParts(parts: ImageRefPart[]): string {
  return parts
    .map((part, index) => {
      const role = normalizeRefRole(part.role, index);
      const guidance = ROLE_GUIDANCE[role] ?? `Reference ${index + 1}`;
      const strength =
        typeof part.strength === "number"
          ? ` (influence ${Math.round(Math.min(1, Math.max(0, part.strength)) * 100)}%)`
          : "";
      const focus = part.focus && part.focus !== "full" ? ` · focus: ${part.focus}` : "";
      return `[${guidance}${strength}${focus}] ${part.prompt.trim()}`;
    })
    .filter((entry) => entry.trim())
    .join("\n\n");
}
