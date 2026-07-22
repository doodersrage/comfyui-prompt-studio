"use client";

/**
 * Previously appended LoRA library trigger phrases into the prompt.
 * Session LoRA picks (sidebar) replaced keyword triggers — this is now a no-op
 * kept for call-site compatibility.
 */
export function injectLoraTriggers(prompt: string): string {
  return prompt.trim() ? prompt : prompt.trim();
}
