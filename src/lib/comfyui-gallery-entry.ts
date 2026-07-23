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
  /** Gallery entry this job was derived from (upscale, refine, variation). */
  parentGalleryEntryId?: string;
  /** How this entry was derived from parentGalleryEntryId. */
  derivedKind?: "upscale" | "refine" | "variation" | "moire-clean" | "face-detail";
  /** Resolved queue params (seed, width, cfg, etc.). */
  queueParams?: WorkflowParamValues;
  /** Original source image URL at queue time (Comfy view or app proxy). */
  sourceImageUrl?: string;
  /** Inpaint mask URL at queue time when available. */
  maskImageUrl?: string;
  /** Queue quality profile used when this job was queued (draft / final / max). */
  queueQualityProfile?: import("./queue-quality-profile").QueueQualityProfile;
  /** Session LoRA library ids active when this job was queued (for re-edit same stack). */
  sessionActiveLoraIds?: string[];
  /** Quick review rating from gallery review mode. */
  reviewRating?: 1 | 2 | 3 | 4 | 5;
  /** Optional project/campaign id. */
  projectId?: string;
  /** Owner account when user auth is enabled. */
  userId?: string;
  comfyUrl: string;
  /** WebSocket client id used when queueing (for live latent previews). */
  clientId?: string;
  status: ComfyGalleryJobStatus;
  /** Optional vision-derived tags for search/filter. */
  visionTags?: string[];
  /** Cached aesthetic score (0–100) from heuristic or vision. */
  aestheticScore?: number;
  /** How aestheticScore was produced. */
  aestheticScoreMethod?: "heuristic" | "vision" | "embedding";
  statusMessage?: string;
  queuePosition?: number | null;
  /** Live sampler/node progress from ComfyUI WebSocket (cleared when finished). */
  progressValue?: number;
  progressMax?: number;
  progressNode?: string | null;
  queuedAt: number;
  completedAt?: number;
  /**
   * Workflow execution duration in ms (ComfyUI execution_start → success/error
   * when available; otherwise may be filled from queuedAt→completedAt wall clock).
   */
  renderDurationMs?: number;
  /** ComfyUI execution_start timestamp (ms) when parsed from history messages. */
  executionStartedAt?: number;
  favorite?: boolean;
  images: ComfyOutputImage[];
  /** Set once an OOM/execution_error auto-retry has been attempted for this job (max one retry). */
  oomRetryAttempted?: boolean;
};
