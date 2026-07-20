import { listApiUsage, summarizeApiUsage } from "@/lib/api-usage-log";
import { apiJson } from "@/lib/api/response";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limit = Number(searchParams.get("limit") ?? "50");
  return apiJson({
    summary: summarizeApiUsage(),
    entries: listApiUsage(Number.isFinite(limit) ? Math.min(200, Math.max(1, limit)) : 50),
  });
}
