import { getComfyUiBaseUrl } from "./comfyui-client";
import {
  allowTemplateFallback,
  getLlmConfig,
  getLlmTemperature,
  isLlmEnabled,
} from "./llm-client";
import { isQueueArtifactExportEnabled } from "./queue-artifacts";
import { isServerStorageEnabled } from "./server-storage";
import { getEmailConfig, isEmailConfigured } from "./email/config";
import { isAuthExplicitlyEnabled } from "./auth/config";

export type ServerEnvField = {
  key: string;
  label: string;
  value: string;
  configured: boolean;
  uiOverride?: string;
  hint?: string;
};

export type ServerEnvGroup = {
  id: "llm" | "comfyui" | "security" | "storage" | "email" | "automation";
  title: string;
  fields: ServerEnvField[];
};

export type ServerEnvSummary = {
  groups: ServerEnvGroup[];
};

function flag(value: string | undefined | null): boolean {
  return Boolean(value?.trim());
}

function hostList(value: string | undefined): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : "any (no allowlist)";
}

export function getServerEnvSummary(): ServerEnvSummary {
  const llm = getLlmConfig();
  let comfyUrl = "";
  try {
    comfyUrl = getComfyUiBaseUrl();
  } catch {
    comfyUrl = "";
  }

  const email = getEmailConfig();
  const groups: ServerEnvGroup[] = [
    {
      id: "llm",
      title: "LLM (server defaults)",
      fields: [
        {
          key: "LLM_ENABLED",
          label: "LLM enabled",
          value: isLlmEnabled() ? "true" : "false",
          configured: true,
          uiOverride: "Settings → LLM → template only / force on",
          hint: "Set false for template-only mode.",
        },
        {
          key: "LLM_API_BASE_URL",
          label: "API base URL",
          value: llm.baseUrl,
          configured: true,
        },
        {
          key: "LLM_API_KEY",
          label: "API key",
          value: llm.apiKey ? "•••• configured" : "not set",
          configured: flag(llm.apiKey),
        },
        {
          key: "LLM_MODEL",
          label: "Text model",
          value: llm.model,
          configured: true,
          uiOverride: "Settings → LLM → session text model override",
        },
        {
          key: "LLM_VISION_MODEL",
          label: "Vision model",
          value: llm.visionModel,
          configured: flag(process.env.LLM_VISION_MODEL),
          uiOverride: "Settings → LLM → session vision model override",
          hint: "Falls back to LLM_MODEL when unset. Required for Image → Prompt and Refine.",
        },
        {
          key: "LLM_TEMPERATURE",
          label: "Temperature",
          value: String(getLlmTemperature()),
          configured: flag(process.env.LLM_TEMPERATURE),
          uiOverride: "Settings → LLM → session temperature slider",
        },
        {
          key: "LLM_EMBED_MODEL",
          label: "Embedding model",
          value:
            process.env.LLM_EMBED_MODEL?.trim() ||
            process.env.OLLAMA_EMBED_MODEL?.trim() ||
            "server default",
          configured: flag(
            process.env.LLM_EMBED_MODEL ?? process.env.OLLAMA_EMBED_MODEL,
          ),
          hint: "Gallery semantic search embeddings.",
        },
        {
          key: "ALLOW_TEMPLATE_FALLBACK",
          label: "Template fallback",
          value: allowTemplateFallback() ? "allowed" : "disabled",
          configured: true,
          uiOverride: "Settings → LLM → template fallback chips",
        },
      ],
    },
    {
      id: "comfyui",
      title: "ComfyUI (server defaults)",
      fields: [
        {
          key: "COMFYUI_API_URL",
          label: "Default ComfyUI URL",
          value: comfyUrl || "not configured",
          configured: flag(comfyUrl),
          uiOverride: "Settings → ComfyUI → connection (browser override)",
        },
        {
          key: "DIFFUSERS_API_URL",
          label: "Default Diffusers URL",
          value: process.env.DIFFUSERS_API_URL?.trim() || "http://127.0.0.1:8190",
          configured: flag(process.env.DIFFUSERS_API_URL),
          hint: "Proxied by /api/diffusers when Settings → Inference engine is Diffusers.",
          uiOverride: "Settings → ComfyUI → Inference engine",
        },
        {
          key: "PROMPT_ENGINE",
          label: "Default inference engine",
          value: process.env.PROMPT_ENGINE?.trim() || "comfyui",
          configured: flag(process.env.PROMPT_ENGINE),
          hint: "comfyui (default) or diffusers — browser Settings override wins.",
          uiOverride: "Settings → ComfyUI → Inference engine",
        },
        {
          key: "COMFYUI_ROOT",
          label: "ComfyUI install root",
          value: flag(process.env.COMFYUI_ROOT)
            ? process.env.COMFYUI_ROOT!.trim()
            : "not set",
          configured: flag(process.env.COMFYUI_ROOT),
          hint: "Same-machine path for curated model weight downloads into models/.",
          uiOverride: "Settings → ComfyUI → Model assets",
        },
        {
          key: "HF_TOKEN",
          label: "Hugging Face token",
          value: flag(process.env.HF_TOKEN ?? process.env.HUGGING_FACE_HUB_TOKEN)
            ? "configured"
            : "not set",
          configured: flag(process.env.HF_TOKEN ?? process.env.HUGGING_FACE_HUB_TOKEN),
          hint: "Optional Bearer token for gated / rate-limited Hugging Face downloads.",
        },
        {
          key: "COMFYUI_ALLOW_CLIENT_URL",
          label: "Allow client URL override",
          value:
            process.env.COMFYUI_ALLOW_CLIENT_URL === "false" ? "false" : "true",
          configured: true,
          hint: "Set false in production to block SSRF via custom URLs.",
        },
        {
          key: "COMFYUI_ALLOWED_HOSTS",
          label: "Allowed ComfyUI hosts",
          value: hostList(process.env.COMFYUI_ALLOWED_HOSTS),
          configured: flag(process.env.COMFYUI_ALLOWED_HOSTS),
        },
        {
          key: "COMFYUI_POOL",
          label: "ComfyUI URL pool",
          value: flag(process.env.COMFYUI_POOL)
            ? `${process.env.COMFYUI_POOL!.split(",").filter(Boolean).length} endpoint(s) — round-robin`
            : "not set (single URL only)",
          configured: flag(process.env.COMFYUI_POOL),
          hint: "Comma-separated URLs; server picks one per request.",
        },
        {
          key: "COMFYUI_WORKFLOW_PATH",
          label: "Workflow file path",
          value: flag(process.env.COMFYUI_WORKFLOW_PATH)
            ? process.env.COMFYUI_WORKFLOW_PATH!.trim()
            : "not set",
          configured: flag(process.env.COMFYUI_WORKFLOW_PATH),
          uiOverride: "Settings → ComfyUI → workflow library / JSON",
        },
        {
          key: "COMFYUI_WORKFLOW_DIR",
          label: "Workflow directory",
          value: flag(process.env.COMFYUI_WORKFLOW_DIR)
            ? process.env.COMFYUI_WORKFLOW_DIR!.trim()
            : "not set",
          configured: flag(process.env.COMFYUI_WORKFLOW_DIR),
          hint: "Exposes server workflow files in the library panel.",
        },
        {
          key: "COMFYUI_WORKFLOW_PATHS",
          label: "Workflow path list",
          value: flag(process.env.COMFYUI_WORKFLOW_PATHS) ? "configured" : "not set",
          configured: flag(process.env.COMFYUI_WORKFLOW_PATHS),
        },
        {
          key: "COMFYUI_WORKFLOW_JSON",
          label: "Inline workflow JSON",
          value: flag(process.env.COMFYUI_WORKFLOW_JSON) ? "configured" : "not set",
          configured: flag(process.env.COMFYUI_WORKFLOW_JSON),
        },
        {
          key: "COMFYUI_POSITIVE_NODE_ID",
          label: "Legacy positive node ID",
          value: process.env.COMFYUI_POSITIVE_NODE_ID?.trim() || "not set",
          configured: flag(process.env.COMFYUI_POSITIVE_NODE_ID),
        },
        {
          key: "COMFYUI_NEGATIVE_NODE_ID",
          label: "Legacy negative node ID",
          value: process.env.COMFYUI_NEGATIVE_NODE_ID?.trim() || "not set",
          configured: flag(process.env.COMFYUI_NEGATIVE_NODE_ID),
        },
        {
          key: "COMFYUI_QUEUE_EXPORT_DIR",
          label: "Queue export directory",
          value: flag(process.env.COMFYUI_QUEUE_EXPORT_DIR)
            ? process.env.COMFYUI_QUEUE_EXPORT_DIR!.trim()
            : "not set",
          configured: isQueueArtifactExportEnabled(),
          hint: "Writes JSON sidecars after queue when set.",
        },
        {
          key: "COMFYUI_POSITIVE_TOKEN",
          label: "Positive placeholder token",
          value: process.env.COMFYUI_POSITIVE_TOKEN?.trim() || "default ({{POSITIVE}})",
          configured: flag(process.env.COMFYUI_POSITIVE_TOKEN),
          uiOverride: "Settings → ComfyUI → injection tokens (browser override)",
        },
        {
          key: "COMFYUI_NEGATIVE_TOKEN",
          label: "Negative placeholder token",
          value: process.env.COMFYUI_NEGATIVE_TOKEN?.trim() || "default ({{NEGATIVE}})",
          configured: flag(process.env.COMFYUI_NEGATIVE_TOKEN),
          uiOverride: "Settings → ComfyUI → injection tokens (browser override)",
        },
      ],
    },
    {
      id: "security",
      title: "Security & integrations",
      fields: [
        {
          key: "PROMPT_API_TOKEN",
          label: "API bearer token",
          value: flag(process.env.PROMPT_API_TOKEN) ? "•••• configured" : "not set",
          configured: flag(process.env.PROMPT_API_TOKEN),
          hint: "Protects API routes for scripts and ComfyUI nodes.",
        },
        {
          key: "PROMPT_AUTH_ENABLED",
          label: "Login required",
          value: isAuthExplicitlyEnabled() ? "true" : "false",
          configured: true,
          hint: "Set 1/true/yes to require sign-in for the app.",
        },
        {
          key: "API_RATE_LIMIT_MAX",
          label: "API rate limit (requests/window)",
          value: process.env.API_RATE_LIMIT_MAX?.trim() || "120 (default)",
          configured: flag(process.env.API_RATE_LIMIT_MAX),
        },
        {
          key: "API_RATE_LIMIT_WINDOW_SEC",
          label: "API rate limit window (seconds)",
          value: process.env.API_RATE_LIMIT_WINDOW_SEC?.trim() || "60 (default)",
          configured: flag(process.env.API_RATE_LIMIT_WINDOW_SEC),
        },
        {
          key: "WEBHOOK_ALLOW_PRIVATE",
          label: "Allow private webhook URLs",
          value:
            process.env.WEBHOOK_ALLOW_PRIVATE === "true" ? "true" : "false",
          configured: true,
          hint: "Settings → Automation → webhooks still needs a public URL by default.",
        },
        {
          key: "PROMPT_API_URL",
          label: "Prompt API URL (batch runner)",
          value: process.env.PROMPT_API_URL?.trim() || "http://127.0.0.1:47832",
          configured: flag(process.env.PROMPT_API_URL),
          hint: "Used by server scheduled-batch runner.",
        },
      ],
    },
    {
      id: "storage",
      title: "Persistence",
      fields: [
        {
          key: "PROMPT_DATA_DIR",
          label: "Server data directory",
          value: flag(process.env.PROMPT_DATA_DIR)
            ? process.env.PROMPT_DATA_DIR!.trim()
            : "not set",
          configured: isServerStorageEnabled(),
          uiOverride: "Settings → Data → storage sync (when enabled)",
          hint: "Enables browser ↔ server backup of settings, history, and gallery.",
        },
      ],
    },
    {
      id: "email",
      title: "Email (SMTP)",
      fields: [
        {
          key: "PROMPT_EMAIL_ENABLED",
          label: "Email enabled",
          value: email.enabled ? "true" : "false",
          configured: isEmailConfigured(),
          hint: "Auto-enabled when SMTP host and from address are set.",
        },
        {
          key: "PROMPT_SMTP_HOST",
          label: "SMTP host",
          value: email.smtp.host || "not set",
          configured: flag(email.smtp.host),
        },
        {
          key: "PROMPT_EMAIL_FROM",
          label: "From address",
          value: email.from || "not set",
          configured: flag(email.from),
        },
        {
          key: "PROMPT_ADMIN_EMAIL",
          label: "Admin fallback email",
          value: email.adminEmail ?? "not set",
          configured: flag(email.adminEmail),
          hint: "Used when a user has no email on file.",
        },
        {
          key: "PROMPT_EMAIL_NOTIFY_BATCH",
          label: "Notify on batch completion",
          value: email.notifyBatch ? "true" : "false",
          configured: true,
        },
        {
          key: "PROMPT_EMAIL_NOTIFY_PASSWORD",
          label: "Notify on password change",
          value: email.notifyPassword ? "true" : "false",
          configured: true,
        },
      ],
    },
    {
      id: "automation",
      title: "Server scheduled batch",
      fields: [
        {
          key: "TRAINER_URL",
          label: "LoRA trainer webhook URL",
          value: flag(process.env.TRAINER_URL)
            ? process.env.TRAINER_URL!.trim()
            : "not set",
          configured: flag(process.env.TRAINER_URL),
          uiOverride: "Settings → ComfyUI → LoRA train (browser trainer URL fallback)",
          hint: "When set, POST /api/lora-train start posts a job payload here instead of spawning a process.",
        },
        {
          key: "TRAINER_COMMAND",
          label: "LoRA trainer command",
          value: flag(process.env.TRAINER_COMMAND)
            ? process.env.TRAINER_COMMAND!.trim()
            : "not set",
          configured: flag(process.env.TRAINER_COMMAND),
          uiOverride: "Settings → ComfyUI → LoRA train (browser trainer command fallback)",
          hint: "Spawned without a shell when TRAINER_URL is unset. Otherwise start records a manual job.",
        },
        {
          key: "SERVER_SCHEDULED_BATCH",
          label: "Server scheduled batch enabled",
          value: process.env.SERVER_SCHEDULED_BATCH === "true" ? "true" : "false",
          configured: true,
          uiOverride: "Settings → Automation → scheduled batch (browser-only alternative)",
          hint: "Runs on the server itself, independent of any open browser tab.",
        },
        {
          key: "SERVER_SCHEDULED_BATCH_INTERVAL_MIN",
          label: "Interval (minutes)",
          value: process.env.SERVER_SCHEDULED_BATCH_INTERVAL_MIN?.trim() || "60 (default)",
          configured: flag(process.env.SERVER_SCHEDULED_BATCH_INTERVAL_MIN),
        },
        {
          key: "SERVER_SCHEDULED_BATCH_TARGET",
          label: "Target",
          value:
            process.env.SERVER_SCHEDULED_BATCH_TARGET === "topics"
              ? "topics"
              : "random-scene (default)",
          configured: flag(process.env.SERVER_SCHEDULED_BATCH_TARGET),
        },
        {
          key: "SERVER_SCHEDULED_BATCH_COUNT",
          label: "Count per run",
          value: process.env.SERVER_SCHEDULED_BATCH_COUNT?.trim() || "3 (default)",
          configured: flag(process.env.SERVER_SCHEDULED_BATCH_COUNT),
        },
        {
          key: "SERVER_SCHEDULED_BATCH_QUEUE",
          label: "Auto-queue to ComfyUI",
          value: process.env.SERVER_SCHEDULED_BATCH_QUEUE === "true" ? "true" : "false",
          configured: true,
        },
        {
          key: "SERVER_SCHEDULED_BATCH_GENRE",
          label: "Genre / theme steer",
          value: process.env.SERVER_SCHEDULED_BATCH_GENRE?.trim() || "not set",
          configured: flag(process.env.SERVER_SCHEDULED_BATCH_GENRE),
        },
      ],
    },
  ];

  return { groups };
}
