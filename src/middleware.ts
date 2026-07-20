import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

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

export function middleware(request: NextRequest) {
  const expected = process.env.PROMPT_API_TOKEN?.trim();
  if (!expected || request.method === "OPTIONS") {
    return NextResponse.next();
  }

  const provided = extractToken(request);
  if (provided && timingSafeEqualString(provided, expected)) {
    return NextResponse.next();
  }

  if (isTrustedSameOrigin(request)) {
    return NextResponse.next();
  }

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
        "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Prompt-Api-Token",
      },
    },
  );
}

export const config = {
  matcher: "/api/:path*",
};
