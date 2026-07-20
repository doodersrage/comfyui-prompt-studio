import type { ComfyOutputImage } from "./comfyui-outputs";
import type { WorkflowParamValues } from "./comfyui-config";
import type { ComfyGalleryJobStatus } from "./comfyui-gallery-types";

export type ComfyGalleryEntry = {
  id: string;
  promptId: string;
  prompt: string;
  negativePrompt?: string;
  tool?: string;
  model?: string;
  /** Links back to Studio prompt history entry. */
  historyId?: string;
  /** Resolved queue params (seed, width, cfg, etc.). */
  queueParams?: WorkflowParamValues;
  /** Quick review rating from gallery review mode. */
  reviewRating?: 1 | 2 | 3 | 4 | 5;
  /** Optional project/campaign id. */
  projectId?: string;
  comfyUrl: string;
  status: ComfyGalleryJobStatus;
  statusMessage?: string;
  queuePosition?: number | null;
  queuedAt: number;
  completedAt?: number;
  favorite?: boolean;
  images: ComfyOutputImage[];
};
