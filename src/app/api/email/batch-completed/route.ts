import { apiError, apiJson, apiMethodNotAllowed } from "@/lib/api/response";
import { readSessionFromRequest } from "@/lib/auth/session";
import { findUserById, isAuthEnabled } from "@/lib/auth/store";
import { notifyBatchCompleted } from "@/lib/email/notifications";
import type { BatchCompletionKind } from "@/lib/email/notifications";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!isAuthEnabled()) {
    return apiError("Authentication is disabled.", 400);
  }

  const session = readSessionFromRequest(request);
  const user = session ? findUserById(session.userId) : null;
  if (!user?.enabled) {
    return apiError("Sign in required.", 401);
  }

  let body: {
    kind?: BatchCompletionKind;
    promptCount?: number;
    queued?: number;
    ranked?: boolean;
    message?: string;
  };

  try {
    body = (await request.json()) as typeof body;
  } catch {
    return apiError("Invalid JSON body.", 400);
  }

  const promptCount = body.promptCount ?? 0;
  if (promptCount <= 0) {
    return apiError("promptCount is required.", 400);
  }

  await notifyBatchCompleted({
    userId: user.id,
    username: user.username,
    kind: body.kind ?? "client-scheduled",
    promptCount,
    queued: body.queued,
    ranked: body.ranked,
    message: body.message,
  });

  return apiJson({ ok: true });
}

export async function GET() {
  return apiMethodNotAllowed(["POST"], "/api/email/batch-completed");
}
