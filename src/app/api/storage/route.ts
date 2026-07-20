import {
  isServerStorageEnabled,
  listServerStorageNamespaces,
  readServerStorage,
  writeServerStorage,
  type StorageNamespace,
} from "@/lib/server-storage";
import { apiError, apiJson, apiMethodNotAllowed } from "@/lib/api/response";

export const runtime = "nodejs";

export async function GET() {
  if (!isServerStorageEnabled()) {
    return apiJson({
      enabled: false,
      namespaces: listServerStorageNamespaces(),
    });
  }

  return apiJson({
    enabled: true,
    namespaces: listServerStorageNamespaces(),
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
    writeServerStorage(body.namespace, body.data);
    return apiJson({ ok: true, namespace: body.namespace });
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

  const data = readServerStorage(namespace);
  if (data == null) {
    return apiError("Namespace not found.", 404);
  }
  return apiJson({ namespace, data });
}

export async function DELETE() {
  return apiMethodNotAllowed(["GET", "POST", "PUT"], "/api/storage");
}
