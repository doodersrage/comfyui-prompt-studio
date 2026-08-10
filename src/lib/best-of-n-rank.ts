/** Client-safe best-of-N ranking via server API (no llm-client / sharp in browser bundle). */
export async function rankPromptsWithLlm(prompts: string[], keep: number): Promise<string[]> {
  if (prompts.length <= keep) {
    return prompts.slice(0, keep);
  }

  try {
    const response = await fetch('/api/best-of-n/rank', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompts, keep }),
    });
    const data = (await response.json()) as { prompts?: string[]; error?: string };
    if (response.ok && Array.isArray(data.prompts) && data.prompts.length > 0) {
      return data.prompts.slice(0, keep);
    }
  } catch {
    // fall through
  }

  return prompts.slice(0, keep);
}
