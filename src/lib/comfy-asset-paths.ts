import fs from "node:fs";
import path from "node:path";

export type ComfyAssetKind =
  | "checkpoint"
  | "unet"
  | "vae"
  | "lora"
  | "upscale"
  | "refiner";

/** Preferred relative folders under COMFYUI_ROOT (first existing wins for unet). */
const KIND_RELATIVE_DIRS: Record<ComfyAssetKind, string[]> = {
  checkpoint: ["models/checkpoints"],
  refiner: ["models/checkpoints"],
  unet: ["models/diffusion_models", "models/unet"],
  vae: ["models/vae"],
  lora: ["models/loras"],
  upscale: ["models/upscale_models"],
};

export function getComfyUiRoot(env: NodeJS.ProcessEnv = process.env): string | null {
  const raw = env.COMFYUI_ROOT?.trim();
  if (!raw) {
    return null;
  }
  return path.resolve(raw);
}

export function isComfyUiRootConfigured(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const root = getComfyUiRoot(env);
  return Boolean(root && fs.existsSync(root));
}

export function relativeDirsForKind(kind: ComfyAssetKind): string[] {
  return KIND_RELATIVE_DIRS[kind];
}

/**
 * Pick the on-disk models subfolder for a kind.
 * Prefers the first candidate that already exists; otherwise the primary path.
 */
export function resolveKindModelsDir(
  root: string,
  kind: ComfyAssetKind,
): string {
  const candidates = relativeDirsForKind(kind).map((rel) =>
    path.resolve(root, rel),
  );
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return candidates[0]!;
}

function assertSafeFilename(filename: string): string {
  const trimmed = filename.trim();
  if (!trimmed) {
    throw new Error("Filename is required.");
  }
  if (trimmed.includes("\0")) {
    throw new Error("Invalid filename.");
  }
  if (path.isAbsolute(trimmed)) {
    throw new Error("Filename must be a relative path without parent segments.");
  }
  const normalized = path.normalize(trimmed);
  if (
    normalized.startsWith("..") ||
    normalized.split(/[/\\]/).some((segment) => segment === "..")
  ) {
    throw new Error("Filename must be a relative path without parent segments.");
  }
  return normalized;
}

/**
 * Resolve destination path under COMFYUI_ROOT/models for a catalog filename.
 * Throws if the resolved path escapes the models tree.
 */
export function resolveAssetDestinationPath(input: {
  root: string;
  kind: ComfyAssetKind;
  filename: string;
}): { modelsDir: string; destPath: string; partialPath: string } {
  const root = path.resolve(input.root);
  const modelsRoot = path.resolve(root, "models");
  const modelsDir = resolveKindModelsDir(root, input.kind);
  const safeName = assertSafeFilename(input.filename);
  const destPath = path.resolve(modelsDir, safeName);
  const relativeToModels = path.relative(modelsRoot, destPath);
  if (
    relativeToModels.startsWith("..") ||
    path.isAbsolute(relativeToModels)
  ) {
    throw new Error("Resolved asset path escapes COMFYUI_ROOT/models.");
  }
  return {
    modelsDir,
    destPath,
    partialPath: `${destPath}.partial`,
  };
}

export function assetFileExistsOnDisk(input: {
  root: string;
  kind: ComfyAssetKind;
  filename: string;
}): boolean {
  try {
    const { destPath } = resolveAssetDestinationPath(input);
    return fs.existsSync(destPath);
  } catch {
    return false;
  }
}
