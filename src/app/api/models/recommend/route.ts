import { apiError, apiJson, apiMethodNotAllowed } from "@/lib/api/response";
import { recommendModels } from "@/lib/model-recommender";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = (await request.json()) as { input?: string; limit?: number };
  if (!body.input?.trim()) {
    return apiError("input is required.", 400);
  }
  return apiJson({
    recommendations: recommendModels(body.input, body.limit ?? 3),
  });
}

export async function OPTIONS() {
  return apiMethodNotAllowed(["POST"], "/api/models/recommend");
}
