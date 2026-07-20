import {
  buildControlNetPrompt,
  normalizeControlNetMode,
} from "@/lib/controlnet-prompt";
import { apiError, apiJson, apiMethodNotAllowed } from "@/lib/api/response";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      mode?: string;
      subject?: string;
      scene?: string;
      detail?: string;
    };
    if (!body.subject?.trim()) {
      return apiError("subject is required.", 400);
    }
    const prompt = buildControlNetPrompt({
      mode: normalizeControlNetMode(body.mode),
      subject: body.subject,
      scene: body.scene,
      detail: body.detail,
    });
    return apiJson({ prompt, mode: normalizeControlNetMode(body.mode) });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : "ControlNet prompt failed.", 500);
  }
}

export async function GET() {
  return apiMethodNotAllowed(["POST"], "/api/controlnet");
}
