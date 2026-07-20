import { apiError, apiJson, apiMethodNotAllowed } from "@/lib/api/response";
import { reviewGalleryImage } from "@/lib/gallery-vision-review";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = (await request.json()) as {
    imageDataUrl?: string;
    prompt?: string;
  };
  if (!body.imageDataUrl?.trim() || !body.prompt?.trim()) {
    return apiError("imageDataUrl and prompt are required.", 400);
  }
  try {
    const review = await reviewGalleryImage({
      imageDataUrl: body.imageDataUrl,
      prompt: body.prompt,
    });
    return apiJson(review);
  } catch (error) {
    return apiError(error instanceof Error ? error.message : "Vision review failed.", 500);
  }
}

export async function OPTIONS() {
  return apiMethodNotAllowed(["POST"], "/api/gallery/vision-review");
}
