export type LoadImageBindingKind =
  | "inputImage"
  | "inputImage2"
  | "inputImage3"
  | "inputImage4"
  | "controlImage"
  | "maskImage"
  | "skip";

const CONTROL_IMAGE_TITLE =
  /\b(control|cnet|controlnet|depth|pose|canny|normal|lineart|edge|openpose|scribble)\b/i;
const MASK_IMAGE_TITLE = /\b(mask|inpaint|alpha|matte)\b/i;
const FIGURE_INDEX_TITLE =
  /\b(?:figure|image|ref|reference|photo|picture)\s*([1-4])\b/i;
const INPUT_IMAGE_TITLE =
  /\b(input|source|reference|ref|edit|init|base|figure\s*1|photo\s*1|image\s*1)\b/i;

const INPUT_IMAGE_KINDS: LoadImageBindingKind[] = [
  "inputImage",
  "inputImage2",
  "inputImage3",
  "inputImage4",
];

export function inputImageBindingForFigureIndex(
  figureIndex: number,
): LoadImageBindingKind {
  if (figureIndex <= 1) {
    return "inputImage";
  }
  if (figureIndex === 2) {
    return "inputImage2";
  }
  if (figureIndex === 3) {
    return "inputImage3";
  }
  if (figureIndex === 4) {
    return "inputImage4";
  }
  return "skip";
}

export function figureIndexForLoadImageBinding(
  kind: LoadImageBindingKind,
): number | null {
  switch (kind) {
    case "inputImage":
      return 1;
    case "inputImage2":
      return 2;
    case "inputImage3":
      return 3;
    case "inputImage4":
      return 4;
    default:
      return null;
  }
}

export function isInputImageBindingKind(
  kind: LoadImageBindingKind,
): kind is "inputImage" | "inputImage2" | "inputImage3" | "inputImage4" {
  return INPUT_IMAGE_KINDS.includes(kind);
}

export function inferLoadImageBinding(
  classType: string,
  title: string,
  options?: {
    loadImageIndex?: number;
    loadImageCount?: number;
  },
): LoadImageBindingKind {
  if (classType === "LoadImageMask") {
    return "maskImage";
  }

  if (classType !== "LoadImage" && classType !== "LoadImageOutput") {
    return "skip";
  }

  const normalizedTitle = title.trim();
  if (CONTROL_IMAGE_TITLE.test(normalizedTitle)) {
    return "controlImage";
  }
  if (MASK_IMAGE_TITLE.test(normalizedTitle)) {
    return "maskImage";
  }

  const figureMatch = normalizedTitle.match(FIGURE_INDEX_TITLE);
  if (figureMatch?.[1]) {
    return inputImageBindingForFigureIndex(Number(figureMatch[1]));
  }

  if (INPUT_IMAGE_TITLE.test(normalizedTitle)) {
    return "inputImage";
  }

  const index = options?.loadImageIndex ?? 0;
  const count = options?.loadImageCount ?? 1;
  if (count === 1) {
    return "inputImage";
  }
  // Sequential unbound LoadImages after Figure 1 → Figure 2–4 (not controlImage).
  if (index >= 0 && index < INPUT_IMAGE_KINDS.length) {
    return INPUT_IMAGE_KINDS[index]!;
  }

  return "skip";
}

export function countLoadImageNodes(
  parsed: Record<string, { class_type?: string }>,
): number {
  return Object.values(parsed).filter((node) => {
    const classType = node.class_type ?? "";
    return classType === "LoadImage" || classType === "LoadImageOutput";
  }).length;
}

export const MAX_INPUT_IMAGE_FILENAMES = 4;

/** Normalize figure filenames: prefer array; fall back to single primary. */
export function normalizeInputImageFilenames(
  inputImageFilename?: string | null,
  inputImageFilenames?: Array<string | undefined | null> | null,
): string[] {
  const fromArray = (inputImageFilenames ?? [])
    .map((entry) => entry?.trim() ?? "")
    .filter(Boolean);
  if (fromArray.length > 0) {
    const next = fromArray.slice(0, MAX_INPUT_IMAGE_FILENAMES);
    const primary = inputImageFilename?.trim();
    if (primary && next[0] !== primary) {
      next[0] = primary;
    }
    return next;
  }
  const primary = inputImageFilename?.trim();
  return primary ? [primary] : [];
}
