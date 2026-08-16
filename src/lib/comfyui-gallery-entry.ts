import type { ComfyOutputImage } from './comfyui-outputs';
import type { WorkflowParamValues } from './comfyui-config';
import type { ComfyGalleryJobStatus } from './comfyui-gallery-types';

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
  /** Character OS record this job was queued as. */
  characterId?: string;
  /** Character look id active at queue time. */
  lookId?: string;
  /** How this entry was derived from parentGalleryEntryId. */
  derivedKind?:
    | 'upscale'
    | 'refine'
    | 'soft-pass'
    | 'variation'
    | 'moire-clean'
    | 'face-detail'
    | 'controlnet'
    | 'i2v'
    | 'extend'
    | 'film';
  /** Resolved queue params (seed, width, cfg, etc.). */
  queueParams?: WorkflowParamValues;
  /**
   * Exact workflow JSON queued for this job (capped). Preferred for exact replay
   * before fetching ComfyUI history. May be omitted from list projections —
   * see `hasStoredWorkflow` + `getGalleryEntryById`.
   */
  workflowJson?: string;
  /** True when a stored graph exists (list projection may omit the JSON body). */
  hasStoredWorkflow?: boolean;
  /** Set when the queued graph was too large to persist for exact replay. */
  workflowJsonOmitted?: boolean;
  /** Original source image URL at queue time (Comfy view or app proxy). */
  sourceImageUrl?: string;
  /** Inpaint mask URL at queue time when available. */
  maskImageUrl?: string;
  /** ControlNet reference view URLs at queue time (multi-ref stack). */
  controlImageUrls?: string[];
  /** Queue quality profile used when this job was queued (draft / final / max). */
  queueQualityProfile?: import('./queue-quality-profile').QueueQualityProfile;
  /** Session LoRA library ids active when this job was queued (for re-edit same stack). */
  sessionActiveLoraIds?: string[];
  /** Session LoRA strength tweaks active when this job was queued. */
  sessionLoraStrengthOverrides?: import('./lora-stack').SessionLoraStrengthOverrides;
  /** Session textual-inversion stems active when this job was queued. */
  sessionEmbeddingTokens?: string[];
  /** Quick review rating from gallery review mode. */
  reviewRating?: 1 | 2 | 3 | 4 | 5;
  /** Short freeform review note from lightbox / review mode. */
  reviewNote?: string;
  /** Optional project/campaign id. */
  projectId?: string;
  /** Owner account when user auth is enabled. */
  userId?: string;
  comfyUrl: string;
  /** Inference engine that produced this job (`comfyui` default). */
  engineId?: import('./engine/types').EngineId;
  /** WebSocket client id used when queueing (for live latent previews). */
  clientId?: string;
  status: ComfyGalleryJobStatus;
  /** Optional vision-derived tags for search/filter. */
  visionTags?: string[];
  /** User-applied labels (distinct from LLM visionTags). */
  userTags?: string[];
  /** Cached aesthetic score (0–100) from heuristic or vision. */
  aestheticScore?: number;
  /** How aestheticScore was produced. */
  aestheticScoreMethod?: 'heuristic' | 'vision' | 'embedding';
  statusMessage?: string;
  queuePosition?: number | null;
  /** Live sampler/node progress from ComfyUI WebSocket (cleared when finished). */
  progressValue?: number;
  progressMax?: number;
  progressNode?: string | null;
  queuedAt: number;
  completedAt?: number;
  /** Durable thumb under PROMPT_DATA_DIR (`gallery-media/{owner}/{id}/thumb.webp`). */
  durableThumbPath?: string;
  /** Durable original still for user uploads (`gallery-media/{owner}/{id}/original`). */
  durableOriginalPath?: string;
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
  /** Cached corpus text — populated on hydration, reused across all semantic/similar searches. */
  _corpus?: string;
};
