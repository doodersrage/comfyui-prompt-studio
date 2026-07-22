import { captionGalleryImage } from "@/lib/gallery-vision-review";
import { apiError, apiJson, apiMethodNotAllowed } from "@/lib/api/response";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      imageDataUrl?: string;
      prompt?: string;
      model?: string;
    };
    if (!body.imageDataUrl?.trim()) {
      return apiError("imageDataUrl is required.", 400);
    }
    const caption = await captionGalleryImage({
      imageDataUrl: body.imageDataUrl.trim(),
      prompt: body.prompt,
      model: body.model,
    });
    return apiJson({ caption });
  } catch (error) {
    return apiError(
      error instanceof Error ? error.message : "Caption failed.",
      500,
    );
  }
}

export async function GET() {
  return apiMethodNotAllowed(["POST"], "/api/gallery/caption");
}
