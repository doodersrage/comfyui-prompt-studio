import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  checkRateLimit,
  rateLimitClientKey,
} from "@/lib/api-rate-limit";
import { logApiUsage } from "@/lib/api-usage-log";

function timingSafeEqualString(left: string, right: string): boolean {
  if (left.length !== right.length) {
    return false;
  }
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return mismatch === 0;
}

function extractToken(request: NextRequest): string | undefined {
  const authorization = request.headers.get("authorization");
  if (authorization?.toLowerCase().startsWith("bearer ")) {
    const token = authorization.slice(7).trim();
    if (token) {
      return token;
    }
  }
  return request.headers.get("x-prompt-api-token")?.trim() || undefined;
}

function isTrustedSameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  if (origin) {
    try {
      return new URL(origin).origin === request.nextUrl.origin;
    } catch {
      return false;
    }
  }
  const site = request.headers.get("sec-fetch-site");
  return site === "same-origin" || site === "none";
}

export function proxy(request: NextRequest) {
  const started = Date.now();
  const path = request.nextUrl.pathname;
  const clientKey = rateLimitClientKey(request);

  const limit = checkRateLimit(clientKey, path);
  if (!limit.allowed) {
    logApiUsage({
      at: started,
      method: request.method,
      path,
      status: 429,
      durationMs: Date.now() - started,
      clientKey,
      rateLimited: true,
    });
    return NextResponse.json(
      { error: "Rate limit exceeded. Try again later." },
      {
        status: 429,
        headers: {
          "Retry-After": String(limit.retryAfterSec),
          "Access-Control-Allow-Origin": "*",
        },
      },
    );
  }

  const expected = process.env.PROMPT_API_TOKEN?.trim();
  if (expected && request.method !== "OPTIONS") {
    const provided = extractToken(request);
    if (!provided || !timingSafeEqualString(provided, expected)) {
      if (!isTrustedSameOrigin(request)) {
        logApiUsage({
          at: started,
          method: request.method,
          path,
          status: 401,
          durationMs: Date.now() - started,
          clientKey,
        });
        return NextResponse.json(
          {
            error:
              "Unauthorized. Set Authorization: Bearer <PROMPT_API_TOKEN> (or X-Prompt-Api-Token).",
          },
          {
            status: 401,
            headers: {
              "Access-Control-Allow-Origin": "*",
              "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
              "Access-Control-Allow-Headers":
                "Content-Type, Authorization, X-Prompt-Api-Token",
            },
          },
        );
      }
    }
  }

  const response = NextResponse.next();
  logApiUsage({
    at: started,
    method: request.method,
    path,
    status: 200,
    durationMs: Date.now() - started,
    clientKey,
  });
  return response;
}

export const config = {
  matcher: "/api/:path*",
};
