import { createHmac, timingSafeEqual } from "node:crypto";
import { getSessionSecret } from "./config";

type PendingLoginPayload = {
  userId: string;
  exp: number;
};

function sign(payload: string): string {
  return createHmac("sha256", getSessionSecret()).update(payload).digest("base64url");
}

export function createPendingLoginToken(userId: string): string {
  const payload: PendingLoginPayload = {
    userId,
    exp: Date.now() + 5 * 60 * 1000,
  };
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${encoded}.${sign(encoded)}`;
}

export function parsePendingLoginToken(token: string): PendingLoginPayload | null {
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) {
    return null;
  }
  const expected = sign(encoded);
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) {
    return null;
  }
  try {
    const parsed = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf8"),
    ) as PendingLoginPayload;
    if (!parsed?.userId || parsed.exp <= Date.now()) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}
