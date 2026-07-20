import {
  isServerStorageEnabled,
  listServerStorageNamespaces,
  readServerStorage,
  writeServerStorage,
  type StorageNamespace,
} from "@/lib/server-storage";
import {
  readUserServerStorage,
  writeUserServerStorage,
  USER_STORAGE_NAMESPACES,
  type UserStorageNamespace,
} from "@/lib/user-server-storage";
import { apiError, apiJson, apiMethodNotAllowed } from "@/lib/api/response";
import { readSessionFromRequest } from "@/lib/auth/session";
import { findUserById, isAuthEnabled } from "@/lib/auth/store";

export const runtime = "nodejs";

function resolveStorageUser(request: Request): string | null {
  if (!isAuthEnabled()) {
    return null;
  }
  const session = readSessionFromRequest(request);
  if (!session) {
    return null;
  }
  const user = findUserById(session.userId);
  if (!user?.enabled) {
    return null;
  }
  return user.id;
}

function isUserNamespace(namespace: StorageNamespace): namespace is UserStorageNamespace {
  return USER_STORAGE_NAMESPACES.includes(namespace as UserStorageNamespace);
}

export async function GET() {
  if (!isServerStorageEnabled()) {
    return apiJson({
      enabled: false,
      namespaces: listServerStorageNamespaces(),
      userScoped: true,
    });
  }

  return apiJson({
    enabled: true,
    namespaces: listServerStorageNamespaces(),
    userScoped: true,
  });
}

export async function POST(request: Request) {
  if (!isServerStorageEnabled()) {
    return apiError("Server storage disabled. Set PROMPT_DATA_DIR.", 503);
  }

  try {
    const body = (await request.json()) as {
      namespace?: StorageNamespace;
      data?: unknown;
    };
    if (!body.namespace || body.data === undefined) {
      return apiError("namespace and data are required.", 400);
    }

    const userId = resolveStorageUser(request);
    if (isUserNamespace(body.namespace)) {
      if (!userId) {
        return apiError("Sign in required for user storage sync.", 401);
      }
      writeUserServerStorage(userId, body.namespace, body.data);
    } else {
      writeServerStorage(body.namespace, body.data);
    }

    return apiJson({ ok: true, namespace: body.namespace, userScoped: isUserNamespace(body.namespace) });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : "Storage write failed.", 500);
  }
}

export async function PUT(request: Request) {
  if (!isServerStorageEnabled()) {
    return apiError("Server storage disabled. Set PROMPT_DATA_DIR.", 503);
  }

  const { searchParams } = new URL(request.url);
  const namespace = searchParams.get("namespace") as StorageNamespace | null;
  if (!namespace) {
    return apiError("namespace query parameter is required.", 400);
  }

  const userId = resolveStorageUser(request);
  let data: unknown = null;

  if (isUserNamespace(namespace)) {
    if (!userId) {
      return apiError("Sign in required for user storage sync.", 401);
    }
    data = readUserServerStorage(userId, namespace);
  } else {
    data = readServerStorage(namespace);
  }

  if (data == null) {
    return apiError("Namespace not found.", 404);
  }
  return apiJson({ namespace, data, userScoped: isUserNamespace(namespace) });
}

export async function DELETE() {
  return apiMethodNotAllowed(["GET", "POST", "PUT"], "/api/storage");
}
