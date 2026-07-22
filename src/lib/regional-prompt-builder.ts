export type RegionalPromptRegion = {
  id: string;
  label: string;
  description: string;
};

export type RegionalPromptSegment = {
  regionId: string;
  prompt: string;
};

export const DEFAULT_REGIONAL_REGIONS: RegionalPromptRegion[] = [
  { id: "subject", label: "Subject", description: "Main figure or focal object" },
  { id: "background", label: "Background", description: "Environment behind the subject" },
  { id: "foreground", label: "Foreground", description: "Objects closest to camera" },
  { id: "lighting", label: "Lighting", description: "Light direction, color, mood" },
];

export function buildRegionalPrompt(
  segments: RegionalPromptSegment[],
  regions: RegionalPromptRegion[] = DEFAULT_REGIONAL_REGIONS,
): string {
  const labelById = Object.fromEntries(regions.map((region) => [region.id, region.label]));
  return segments
    .filter((segment) => segment.prompt.trim())
    .map((segment) => `${labelById[segment.regionId] ?? segment.regionId}: ${segment.prompt.trim()}`)
    .join(". ");
}

/** Compact `(region: text)` form useful for attention/weighted prompt packs. */
export function buildRegionalPromptParenForm(
  segments: RegionalPromptSegment[],
  regions: RegionalPromptRegion[] = DEFAULT_REGIONAL_REGIONS,
): string {
  const labelById = Object.fromEntries(regions.map((region) => [region.id, region.label]));
  return segments
    .filter((segment) => segment.prompt.trim())
    .map(
      (segment) =>
        `(${(labelById[segment.regionId] ?? segment.regionId).toLowerCase()}: ${segment.prompt.trim()})`,
    )
    .join(" ");
}

export function buildInpaintInstruction(
  maskDescription: string,
  changeDescription: string,
): string {
  return `In the masked region (${maskDescription.trim()}), ${changeDescription.trim()}. Keep all unmasked areas unchanged.`;
}

export function parseRegionalSegments(raw: string): RegionalPromptSegment[] {
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^([^:]+):\s*(.+)$/);
      if (!match) {
        return { regionId: "subject", prompt: line };
      }
      const label = match[1].trim().toLowerCase();
      const region =
        DEFAULT_REGIONAL_REGIONS.find((entry) => entry.label.toLowerCase() === label)?.id ??
        label.replace(/\s+/g, "-");
      return { regionId: region, prompt: match[2].trim() };
    });
}
