import { apiError, apiJson } from "@/lib/api/response";
import { readSessionFromRequest } from "@/lib/auth/session";
import { appendAuditLog, listAuditLog } from "@/lib/auth/audit-log";
import { findUserById, isAuthEnabled } from "@/lib/auth/store";

export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!isAuthEnabled()) {
    return apiJson({ entries: [] });
  }

  const session = readSessionFromRequest(request);
  const user = session ? findUserById(session.userId) : null;
  if (!user || user.role !== "admin" || !user.enabled) {
    return apiError("Admin access required.", 403);
  }

  const limit = Number(new URL(request.url).searchParams.get("limit") ?? "100");
  return apiJson({ entries: listAuditLog(limit) });
}

export async function POST(request: Request) {
  if (!isAuthEnabled()) {
    return apiError("Authentication is disabled.", 400);
  }

  const session = readSessionFromRequest(request);
  const user = session ? findUserById(session.userId) : null;
  if (!user || user.role !== "admin" || !user.enabled) {
    return apiError("Admin access required.", 403);
  }

  let body: { action?: string; target?: string; details?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return apiError("Invalid JSON body.", 400);
  }

  if (!body.action?.trim()) {
    return apiError("action is required.", 400);
  }

  appendAuditLog({
    actorUserId: user.id,
    actorUsername: user.username,
    action: body.action.trim(),
    target: body.target,
    details: body.details,
  });

  return apiJson({ ok: true });
}
