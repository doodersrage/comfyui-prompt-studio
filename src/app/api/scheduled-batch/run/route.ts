import { runServerScheduledBatch } from "@/lib/server-scheduled-batch";
import { apiError, apiJson, apiMethodNotAllowed } from "@/lib/api/response";
import type { ScheduledBatchConfig } from "@/lib/scheduled-batch";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as Partial<ScheduledBatchConfig>;
    const result = await runServerScheduledBatch(body);
    return apiJson({ ok: true, ...result });
  } catch (error) {
    return apiError(
      error instanceof Error ? error.message : "Server scheduled batch failed.",
      500,
    );
  }
}

export async function GET() {
  return apiMethodNotAllowed(["POST"], "/api/scheduled-batch/run");
}
