import { rankByEmbedding } from "@/lib/embedding-search";
import { apiError, apiJson, apiMethodNotAllowed } from "@/lib/api/response";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      query?: string;
      items?: Array<{ id: string; text: string }>;
    };
    if (!body.query?.trim()) {
      return apiError("query is required.", 400);
    }
    const items = body.items ?? [];
    const ranked = await rankByEmbedding(items, body.query, (item) => item.text);
    return apiJson({
      query: body.query,
      results: ranked.map((entry) => ({
        id: (entry.item as { id: string }).id,
        score: entry.score,
        method: entry.method,
      })),
    });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : "Embedding search failed.", 500);
  }
}

export async function GET() {
  return apiMethodNotAllowed(["POST"], "/api/search/embeddings");
}
