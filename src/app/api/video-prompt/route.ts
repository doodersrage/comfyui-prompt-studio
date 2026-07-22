import { generateVideoPrompt } from "@/lib/video-prompt";
import { apiError, apiJson, apiMethodNotAllowed } from "@/lib/api/response";
import { normalizeComfyModel } from "@/lib/comfy-models";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      subject?: string;
      motion?: string;
      camera?: string;
      durationSec?: number;
      style?: string;
      model?: string;
      preferTemplate?: boolean;
    };

    if (!body.subject?.trim()) {
      return apiError("subject is required.", 400);
    }

    const result = await generateVideoPrompt({
      subject: body.subject,
      motion: body.motion,
      camera: body.camera,
      durationSec: body.durationSec,
      style: body.style,
      model: body.model ? normalizeComfyModel(body.model) : undefined,
      preferTemplate: body.preferTemplate === true,
    });

    return apiJson({ prompt: result.prompt, method: result.method });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : "Video prompt failed.", 500);
  }
}

export async function GET() {
  return apiMethodNotAllowed(["POST"], "/api/video-prompt");
}
