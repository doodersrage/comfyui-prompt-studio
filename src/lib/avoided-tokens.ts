import {
  buildAvoidedTokensInstructionFromList,
  filterAvoidedCandidatesFromList,
  promptContainsAvoidedTokensFromList,
  tokenizeForAvoidance,
} from "./avoidance-options";
import { readBrowserValue, removeBrowserKey, writeBrowserValue } from "./browser-storage";

export const AVOIDED_TOKENS_KEY = "comfy-prompt-avoided-tokens-v1";
export const AVOIDED_TOKENS_UPDATED_EVENT = "avoided-tokens-updated";

const MAX_AVOIDED_TOKENS = 80;

function persistAvoidedTokens(tokens: Iterable<string>): void {
  if (typeof window === "undefined") {
    return;
  }
  const list = [...new Set([...tokens].map((token) => token.trim().toLowerCase()).filter(Boolean))].slice(
    -MAX_AVOIDED_TOKENS,
  );
  writeBrowserValue(AVOIDED_TOKENS_KEY, list);
  window.dispatchEvent(new CustomEvent(AVOIDED_TOKENS_UPDATED_EVENT));
}

export function saveAvoidedTokens(tokens: string[]): void {
  persistAvoidedTokens(tokens);
}

export function addAvoidedToken(token: string): void {
  const trimmed = token.trim().toLowerCase();
  if (!trimmed) {
    return;
  }
  const existing = loadAvoidedTokens();
  existing.add(trimmed);
  persistAvoidedTokens(existing);
}

export function addAvoidedTokens(tokens: readonly string[]): number {
  const existing = loadAvoidedTokens();
  let added = 0;
  for (const token of tokens) {
    const trimmed = token.trim().toLowerCase();
    if (!trimmed || existing.has(trimmed)) {
      continue;
    }
    existing.add(trimmed);
    added += 1;
  }
  persistAvoidedTokens(existing);
  return added;
}

export function removeAvoidedToken(token: string): void {
  const existing = loadAvoidedTokens();
  existing.delete(token.trim().toLowerCase());
  persistAvoidedTokens(existing);
}

export function clearAvoidedTokens(): void {
  if (typeof window === "undefined") {
    return;
  }
  removeBrowserKey(AVOIDED_TOKENS_KEY);
  window.dispatchEvent(new CustomEvent(AVOIDED_TOKENS_UPDATED_EVENT));
}

export function loadAvoidedTokens(): Set<string> {
  if (typeof window === "undefined") {
    return new Set();
  }
  try {
    const list = readBrowserValue<string[]>(AVOIDED_TOKENS_KEY);
    if (!list) {
      return new Set();
    }
    return new Set(list);
  } catch {
    return new Set();
  }
}

export function downloadAvoidedTokensExport(filename = "avoided-tokens.json"): void {
  const payload = exportAvoidedTokensJson();
  const blob = new Blob([payload], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function exportAvoidedTokensJson(): string {
  return JSON.stringify(
    {
      version: 1,
      exportedAt: new Date().toISOString(),
      tokens: exportAvoidedTokenList(),
    },
    null,
    2,
  );
}

export function importAvoidedTokensJson(raw: string, mode: "merge" | "replace" = "merge"): number {
  const parsed = JSON.parse(raw) as { tokens?: unknown };
  if (!Array.isArray(parsed.tokens)) {
    throw new Error("Invalid avoided tokens file.");
  }
  const tokens = parsed.tokens
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  if (mode === "replace") {
    saveAvoidedTokens(tokens);
    return tokens.length;
  }
  return addAvoidedTokens(tokens);
}

export function recordAvoidedTokensFromPrompt(prompt: string): void {
  if (typeof window === "undefined" || !prompt.trim()) {
    return;
  }
  const tokens = tokenizeForAvoidance(prompt).slice(0, 12);
  const existing = loadAvoidedTokens();
  for (const token of tokens) {
    existing.add(token);
  }
  persistAvoidedTokens(existing);
}

export function exportAvoidedTokenList(): string[] {
  return [...loadAvoidedTokens()].slice(-80);
}

export function avoidedTokensRequestBody(): {
  avoidedTokens?: string[];
  avoidedTokensInstruction?: string;
} {
  const avoidedTokens = exportAvoidedTokenList();
  if (avoidedTokens.length === 0) {
    return {};
  }
  return {
    avoidedTokens,
    avoidedTokensInstruction: buildAvoidedTokensInstructionFromList(avoidedTokens),
  };
}

export function promptContainsAvoidedTokens(text: string, avoided = loadAvoidedTokens()): boolean {
  return promptContainsAvoidedTokensFromList(text, [...avoided]);
}

export function filterAvoidedCandidates(candidates: string[]): string[] {
  return filterAvoidedCandidatesFromList(candidates, [...loadAvoidedTokens()]);
}

export function buildAvoidedTokensInstruction(): string | undefined {
  return buildAvoidedTokensInstructionFromList([...loadAvoidedTokens()]);
}
