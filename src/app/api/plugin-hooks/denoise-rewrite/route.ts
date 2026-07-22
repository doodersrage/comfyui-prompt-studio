import { apiJson, apiMethodNotAllowed } from "@/lib/api/response";
import type { PluginQueueHookPayload } from "@/lib/plugin-queue-hooks";

export const runtime = "nodejs";

/**
 * Example queue-preflight hook used by `examples/queue-rewrite-plugin.json`.
 * Rewrites denoise to a soft img2img strength unless the payload already set one.
 */
export async function POST(request: Request) {
  let body: Partial<PluginQueueHookPayload> = {};
  try {
    body = (await request.json()) as Partial<PluginQueueHookPayload>;
  } catch {
    body = {};
  }

  const existing =
    body.denoise != null && String(body.denoise).trim() !== ""
      ? Number(body.denoise)
      : null;

  return apiJson({
    ok: true,
    denoise: existing != null && Number.isFinite(existing) ? existing : 0.45,
    message: "queue-rewrite-plugin: denoise set to soft img2img",
  });
}

export function GET() {
  return apiMethodNotAllowed(["POST"], "/api/plugin-hooks/denoise-rewrite");
}
