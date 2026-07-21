function resolveInstrumentationBaseUrl(): string {
  const configured = process.env.PROMPT_API_URL?.trim();
  if (configured) {
    return configured.replace(/\/$/, "");
  }
  const port = process.env.PORT?.trim() || "47832";
  return `http://127.0.0.1:${port}`;
}

async function postInstrumentationRoute(path: string, body?: unknown): Promise<void> {
  const response = await fetch(`${resolveInstrumentationBaseUrl()}${path}`, {
    method: "POST",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) {
    const message = await response.text().catch(() => response.statusText);
    throw new Error(`${path} failed (${response.status}): ${message}`);
  }
}

export async function register() {
  if (process.env.NEXT_RUNTIME === "edge") {
    return;
  }

  if (process.env.SERVER_SCHEDULED_BATCH === "true") {
    const intervalMinutes = Number(process.env.SERVER_SCHEDULED_BATCH_INTERVAL_MIN ?? "60");
    const intervalMs = Math.max(5, intervalMinutes) * 60_000;

    setInterval(() => {
      void postInstrumentationRoute("/api/scheduled-batch/run", {
        enabled: true,
        intervalMinutes,
        target:
          process.env.SERVER_SCHEDULED_BATCH_TARGET === "topics"
            ? "topics"
            : "random-scene",
        count: Number(process.env.SERVER_SCHEDULED_BATCH_COUNT ?? "3"),
        autoQueueComfyUi: process.env.SERVER_SCHEDULED_BATCH_QUEUE === "true",
        genre: process.env.SERVER_SCHEDULED_BATCH_GENRE,
      }).catch((error) => {
        console.error("[server-scheduled-batch]", error);
      });
    }, intervalMs);
  }

  if (process.env.SERVER_USER_MAINTENANCE === "true") {
    const maintenanceIntervalMin = Number(
      process.env.SERVER_USER_MAINTENANCE_INTERVAL_MIN ?? "15",
    );
    const maintenanceMs = Math.max(5, maintenanceIntervalMin) * 60_000;

    setInterval(() => {
      void postInstrumentationRoute("/api/maintenance/run").catch((error) => {
        console.error("[server-user-maintenance]", error);
      });
    }, maintenanceMs);
  }
}
