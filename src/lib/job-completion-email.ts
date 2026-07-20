"use client";

let pendingCount = 0;
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let lastPrompt = "";
let lastStatus: "completed" | "error" = "completed";

export function noteJobCompletionEmail(input: {
  promptId: string;
  status: "completed" | "error";
  prompt: string;
}): void {
  if (typeof window === "undefined") {
    return;
  }
  pendingCount += 1;
  lastPrompt = input.prompt;
  lastStatus = input.status;
  if (flushTimer) {
    clearTimeout(flushTimer);
  }
  flushTimer = setTimeout(() => {
    const count = pendingCount;
    pendingCount = 0;
    flushTimer = null;
    void fetch("/api/email/jobs-completed", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        completed: count,
        lastPrompt: lastPrompt.slice(0, 120),
        lastStatus: lastStatus,
      }),
    });
  }, 8000);
}
