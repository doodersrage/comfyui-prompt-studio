import { NextResponse } from "next/server";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Prompt-Api-Token",
} as const;

export function apiJson<T>(
  data: T,
  init?: ResponseInit & { status?: number },
): NextResponse<T> {
  return NextResponse.json(data, {
    ...init,
    headers: {
      ...CORS_HEADERS,
      ...init?.headers,
    },
  });
}

export function apiError(
  message: string,
  status: number,
  extra?: Record<string, unknown>,
) {
  return apiJson({ error: message, ...extra }, { status });
}

export function apiMethodNotAllowed(allowed: string[], path: string) {
  return apiError(`Method not allowed. Use ${allowed.join(" or ")} on ${path}.`, 405, {
    allowedMethods: allowed,
    path,
  });
}

export function requestBaseUrl(request: Request): string {
  const url = new URL(request.url);
  return url.origin;
}
