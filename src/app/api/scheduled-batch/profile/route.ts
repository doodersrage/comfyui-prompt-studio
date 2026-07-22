import { apiError, apiJson, apiMethodNotAllowed } from "@/lib/api/response";
import {
  loadServerScheduledBatchStatus,
  saveServerScheduledBatchProfile,
} from "@/lib/server-scheduled-batch";
import type { ScheduledBatchProfile } from "@/lib/scheduled-batch-profile";

export const runtime = "nodejs";

export async function GET() {
  try {
    const status = await loadServerScheduledBatchStatus();
    return apiJson(status);
  } catch (error) {
    return apiError(
      error instanceof Error ? error.message : "Failed to load scheduled batch profile.",
      500,
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as Partial<ScheduledBatchProfile>;
    const result = await saveServerScheduledBatchProfile(body);
    return apiJson(result);
  } catch (error) {
    return apiError(
      error instanceof Error ? error.message : "Failed to save scheduled batch profile.",
      500,
    );
  }
}

export async function DELETE() {
  return apiMethodNotAllowed(["GET", "POST"], "/api/scheduled-batch/profile");
}
