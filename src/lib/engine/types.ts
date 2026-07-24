/**
 * Thin browser-facing seam for queue / status / view / upload / progress.
 * ComfyUI is the only backend today; gallery, prompts, and quality profiles
 * stay studio-owned above this interface.
 */

export type EngineId = "comfyui" | "diffusers";

export type EngineJobStatus =
  | "pending"
  | "running"
  | "completed"
  | "error"
  | "unknown";

export type EngineOutputImage = {
  filename: string;
  subfolder: string;
  type: string;
  format?: string;
};

export type EngineQueueResult = {
  ok: boolean;
  promptId?: string;
  clientId?: string;
  /** Engine host URL (Comfy `comfyUrl` today). */
  engineUrl?: string;
  error?: string;
  status?: number;
  workflowSource?: string;
  raw?: Record<string, unknown>;
  /** Call after gallery register + poll schedule. */
  releaseLiveSocket: () => void;
};

export type EngineStatusResult = {
  promptId: string;
  status: EngineJobStatus;
  statusMessage?: string;
  engineUrl: string;
  images?: EngineOutputImage[];
  queuePosition?: number | null;
  renderDurationMs?: number;
  executionStartedAt?: number;
};

export type EngineUploadedImage = {
  name: string;
  subfolder?: string;
  type?: string;
};

export type EngineViewPathOptions = {
  width?: number;
};

export type EngineUploadInput = {
  file: File;
  engineUrl?: string;
  /** Optional model hint for runtime URL resolution (Comfy path). */
  model?: string;
};

export type EngineProgressEvent = {
  promptId: string;
  node?: string | null;
  status: "executing" | "progress" | "finished" | "error" | "preview";
  message?: string;
  value?: number;
  max?: number;
  previewUrl?: string;
};

export type EngineProgressSubscription = {
  close: () => void;
  ready: Promise<void>;
  setPromptId: (promptId: string) => void;
  clientId: string;
};

export type EngineSubscribeProgressInput = {
  engineUrl?: string;
  promptId?: string;
  clientId?: string;
  onProgress: (progress: EngineProgressEvent) => void;
  onError?: (message: string) => void;
};

/** Browser-facing engine I/O — mirrors postPrompt / status / view / upload / progress. */
export interface EngineAdapter {
  id: EngineId;

  /** Queue a prompt (today: POST /api/comfyui). */
  postPrompt(body: Record<string, unknown>): Promise<EngineQueueResult>;

  /** Poll job status (today: GET /api/comfyui/status). */
  fetchJobStatus(
    promptId: string,
    engineUrl?: string,
  ): Promise<EngineStatusResult | null>;

  /** Studio-proxied view URL for an output image. */
  buildViewPath(
    engineUrl: string,
    image: EngineOutputImage,
    options?: EngineViewPathOptions,
  ): string;

  /** Upload an input image for img2img / refine / mask paths. */
  uploadInputImage(input: EngineUploadInput): Promise<EngineUploadedImage>;

  /**
   * Subscribe to live progress + latent previews (today: `/api/comfyui/live`).
   * Gallery poller attaches after queue; `postPrompt` may open a holder socket first.
   */
  subscribeProgress(
    input: EngineSubscribeProgressInput,
  ): EngineProgressSubscription;

  /**
   * Open the live bridge before queue so previews bind to `clientId`.
   * Waits briefly for readiness; never blocks queue for long.
   */
  openProgressBeforeQueue(input: {
    clientId: string;
    engineUrl?: string;
  }): Promise<EngineProgressSubscription>;
}
