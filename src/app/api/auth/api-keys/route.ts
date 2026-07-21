import { apiError, apiJson, apiMethodNotAllowed } from "@/lib/api/response";
import { resolveRequestUser } from "@/lib/auth/access";
import {
  createUserApiKey,
  listUserApiKeys,
  revokeUserApiKey,
} from "@/lib/auth/api-keys";

export const runtime = "nodejs";

function requireUser(request: Request) {
  const user = resolveRequestUser(request);
  if (!user?.enabled) {
    return null;
  }
  return user;
}

export async function GET(request: Request) {
  const user = requireUser(request);
  if (!user) {
    return apiError("Sign in required.", 401);
  }
  const keys = listUserApiKeys(user.id).map((key) => ({
    id: key.id,
    label: key.label,
    prefix: key.prefix,
    createdAt: key.createdAt,
    lastUsedAt: key.lastUsedAt,
    enabled: key.enabled,
  }));
  return apiJson({ keys });
}

export async function POST(request: Request) {
  const user = requireUser(request);
  if (!user) {
    return apiError("Sign in required.", 401);
  }
  const body = (await request.json()) as { label?: string };
  const created = createUserApiKey({ userId: user.id, label: body.label ?? "API key" });
  return apiJson({
    key: {
      id: created.key.id,
      label: created.key.label,
      prefix: created.key.prefix,
      createdAt: created.key.createdAt,
    },
    token: created.token,
  });
}

export async function DELETE(request: Request) {
  const user = requireUser(request);
  if (!user) {
    return apiError("Sign in required.", 401);
  }
  const body = (await request.json()) as { keyId?: string };
  if (!body.keyId) {
    return apiError("keyId is required.", 400);
  }
  if (!revokeUserApiKey(user.id, body.keyId)) {
    return apiError("API key not found.", 404);
  }
  return apiJson({ ok: true });
}

export async function OPTIONS() {
  return apiMethodNotAllowed(["GET", "POST", "DELETE"], "/api/auth/api-keys");
}
