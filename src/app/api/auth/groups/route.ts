import { apiError, apiJson } from "@/lib/api/response";
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

  return null;
}

export async function GET(request: Request) {
  const denied = requireAdmin(request);
  if (denied) {
    return denied;
  }

  return apiJson({ groups: listGroups() });
}

export async function POST(request: Request) {
  const denied = requireAdmin(request);
  if (denied) {
    return denied;
  }

  let body: {
    id?: string;
    name?: string;
    description?: string;
    blockedFeatures?: AppFeatureId[];
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
    });
    return apiJson({ group });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : "Failed to save group.", 400);
  }
}

export async function DELETE(request: Request) {
  const denied = requireAdmin(request);
  if (denied) {
    return denied;
  }

  const groupId = new URL(request.url).searchParams.get("id")?.trim();
  if (!groupId) {
    return apiError("Group id is required.", 400);
  }

  try {
    deleteGroup(groupId);
    return apiJson({ ok: true });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : "Failed to delete group.", 400);
  }
}
