import { apiError, apiJson, apiMethodNotAllowed } from "@/lib/api/response";
import { readSessionFromRequest } from "@/lib/auth/session";
import { resolveRequestUser } from "@/lib/auth/access";
import {
  listUserSessions,
  revokeAllUserSessions,
  revokeSession,
} from "@/lib/auth/session-registry";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const user = resolveRequestUser(request);
  if (!user?.enabled) {
    return apiError("Sign in required.", 401);
  }
  const session = readSessionFromRequest(request);
  return apiJson({
    sessions: listUserSessions(user.id),
    currentSessionId: session?.sessionId ?? null,
  });
}

export async function DELETE(request: Request) {
  const user = resolveRequestUser(request);
  if (!user?.enabled) {
    return apiError("Sign in required.", 401);
  }
  const body = (await request.json()) as { sessionId?: string; all?: boolean };
  const session = readSessionFromRequest(request);
  if (body.all) {
    const count = revokeAllUserSessions(user.id, session?.sessionId);
    return apiJson({ revoked: count });
  }
  if (!body.sessionId) {
    return apiError("sessionId or all=true required.", 400);
  }
  if (!revokeSession(user.id, body.sessionId)) {
    return apiError("Session not found.", 404);
  }
  return apiJson({ ok: true });
}

export async function OPTIONS() {
  return apiMethodNotAllowed(["GET", "DELETE"], "/api/auth/sessions");
}
