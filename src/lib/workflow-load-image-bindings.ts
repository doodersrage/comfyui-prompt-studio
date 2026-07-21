export type LoadImageBindingKind = "inputImage" | "controlImage" | "maskImage" | "skip";

const CONTROL_IMAGE_TITLE =
  /\b(control|cnet|controlnet|depth|pose|canny|normal|lineart|edge|openpose|scribble)\b/i;
const MASK_IMAGE_TITLE = /\b(mask|inpaint|alpha|matte)\b/i;
const INPUT_IMAGE_TITLE =
  /\b(input|source|reference|ref|edit|init|base|figure\s*1|photo\s*1|image\s*1)\b/i;

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
  if (INPUT_IMAGE_TITLE.test(normalizedTitle)) {
    return "inputImage";
  }

  const index = options?.loadImageIndex ?? 0;
  const count = options?.loadImageCount ?? 1;
  if (count === 1) {
    return "inputImage";
  }
  if (index === 0) {
    return "inputImage";
  }
  if (index === 1) {
    return "controlImage";
  }
  if (/\b(figure\s*2|image\s*2|ref\s*2|reference\s*2|photo\s*2)\b/i.test(normalizedTitle)) {
    return "inputImage";
  }
  if (CONTROL_IMAGE_TITLE.test(normalizedTitle)) {
    return "controlImage";
  }
  if (index >= 2) {
    return "inputImage";
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
