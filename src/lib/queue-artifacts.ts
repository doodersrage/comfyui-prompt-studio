import fs from "node:fs";
import path from "node:path";

export type QueueArtifactPayload = {
  prompt: string;
  negativePrompt?: string;
  promptId?: string;
  comfyUrl?: string;
  workflow?: Record<string, unknown>;
  sidecar?: Record<string, unknown>;
};

export function isQueueArtifactExportEnabled(): boolean {
  return Boolean(process.env.COMFYUI_QUEUE_EXPORT_DIR?.trim());
}

function exportDir(): string {
  const dir = process.env.COMFYUI_QUEUE_EXPORT_DIR?.trim();
  if (!dir) {
    throw new Error("COMFYUI_QUEUE_EXPORT_DIR is not configured.");
  }
  const resolved = path.resolve(dir);
  fs.mkdirSync(resolved, { recursive: true });
  return resolved;
}

export function writeQueueArtifact(payload: QueueArtifactPayload): string | null {
  if (!isQueueArtifactExportEnabled()) {
    return null;
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const id = payload.promptId?.trim() || stamp;
  const base = path.join(exportDir(), `queue-${id}`);
  fs.mkdirSync(base, { recursive: true });

  fs.writeFileSync(
    path.join(base, "sidecar.json"),
    JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        prompt: payload.prompt,
        negativePrompt: payload.negativePrompt,
        promptId: payload.promptId,
        comfyUrl: payload.comfyUrl,
        ...(payload.sidecar ?? {}),
      },
      null,
      2,
    ),
    "utf8",
  );

  if (payload.workflow) {
    fs.writeFileSync(
      path.join(base, "workflow.json"),
      JSON.stringify(payload.workflow, null, 2),
      "utf8",
    );
  }

  return base;
}
