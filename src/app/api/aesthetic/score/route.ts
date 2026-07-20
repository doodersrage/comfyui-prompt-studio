import { scoreGalleryEntryHeuristic } from "@/lib/aesthetic-score";
import type { ComfyGalleryEntry } from "@/lib/comfyui-gallery";
import { apiError, apiJson, apiMethodNotAllowed } from "@/lib/api/response";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Partial<ComfyGalleryEntry>;
    if (!body.prompt?.trim()) {
      return apiError("prompt is required.", 400);
    }

    const entry: ComfyGalleryEntry = {
      id: body.id ?? "score-request",
      promptId: body.promptId ?? "score-request",
      prompt: body.prompt,
      negativePrompt: body.negativePrompt,
      model: body.model,
      tool: body.tool,
      status: body.status ?? "completed",
      queuedAt: body.queuedAt ?? Date.now(),
      comfyUrl: body.comfyUrl ?? "",
      images: body.images ?? [],
      reviewRating: body.reviewRating,
      favorite: body.favorite,
      projectId: body.projectId,
      historyId: body.historyId,
      queueParams: body.queueParams,
    };

    return apiJson(scoreGalleryEntryHeuristic(entry));
  } catch (error) {
    return apiError(error instanceof Error ? error.message : "Aesthetic score failed.", 500);
  }
}

export async function GET() {
  return apiMethodNotAllowed(["POST"], "/api/aesthetic/score");
}
