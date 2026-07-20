import { buildVideoPrompt } from "@/lib/video-prompt";
import { apiError, apiJson, apiMethodNotAllowed } from "@/lib/api/response";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      subject?: string;
      motion?: string;
      camera?: string;
      durationSec?: number;
      style?: string;
    };

    if (!body.subject?.trim()) {
      return apiError("subject is required.", 400);
    }

    const prompt = buildVideoPrompt({
      subject: body.subject,
      motion: body.motion,
      camera: body.camera,
      durationSec: body.durationSec,
      style: body.style,
    });

    return apiJson({ prompt });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : "Video prompt failed.", 500);
  }
}

export async function GET() {
  return apiMethodNotAllowed(["POST"], "/api/video-prompt");
}
