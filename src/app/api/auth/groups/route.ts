import { apiError, apiJson } from "@/lib/api/response";
import { appendAuditLog } from "@/lib/auth/audit-log";
import { readSessionFromRequest } from "@/lib/auth/session";
import type { AppFeatureId } from "@/lib/auth/features";
import {
  deleteGroup,
  findUserById,
  isAuthEnabled,
  listGroups,
  upsertGroup,
} from "@/lib/auth/store";

export const runtime = "nodejs";

function requireAdmin(request: Request) {
  if (!isAuthEnabled()) {
    return apiError("Authentication is disabled.", 400);
  }

  const session = readSessionFromRequest(request);
  const user = session ? findUserById(session.userId) : null;
  if (!user || user.role !== "admin" || !user.enabled) {
    return apiError("Admin access required.", 403);
  }

  return { user };
}

export async function GET(request: Request) {
  const admin = requireAdmin(request);
  if (admin instanceof Response) {
    return admin;
  }

  return apiJson({ groups: listGroups() });
}

export async function POST(request: Request) {
  const admin = requireAdmin(request);
  if (admin instanceof Response) {
    return admin;
  }

  let body: {
    id?: string;
    name?: string;
    description?: string;
    blockedFeatures?: AppFeatureId[];
    quotaMaxPerMinute?: number;
  };

  try {
    body = (await request.json()) as typeof body;
  } catch {
    return apiError("Invalid JSON body.", 400);
  }

  if (!body.name?.trim()) {
    return apiError("Group name is required.", 400);
  }

  try {
    const group = upsertGroup({
      id: body.id,
      name: body.name,
      description: body.description,
      blockedFeatures: body.blockedFeatures ?? [],
      quotaMaxPerMinute: body.quotaMaxPerMinute,
    });
    appendAuditLog({
      actorUserId: admin.user.id,
      actorUsername: admin.user.username,
      action: body.id ? "group.updated" : "group.created",
      target: group.id,
      details: group.name,
    });
    return apiJson({ group });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : "Failed to save group.", 400);
  }
}

export async function DELETE(request: Request) {
  const admin = requireAdmin(request);
  if (admin instanceof Response) {
    return admin;
  }

  const groupId = new URL(request.url).searchParams.get("id")?.trim();
  if (!groupId) {
    return apiError("Group id is required.", 400);
  }

  try {
    deleteGroup(groupId);
    appendAuditLog({
      actorUserId: admin.user.id,
      actorUsername: admin.user.username,
      action: "group.deleted",
      target: groupId,
    });
    return apiJson({ ok: true });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : "Failed to delete group.", 400);
  }
}
