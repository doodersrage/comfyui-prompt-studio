export async function register() {
  if (process.env.NEXT_RUNTIME === "edge") {
    return;
  }

  if (process.env.SERVER_SCHEDULED_BATCH !== "true") {
    return;
  }

  const intervalMinutes = Number(process.env.SERVER_SCHEDULED_BATCH_INTERVAL_MIN ?? "60");
  const intervalMs = Math.max(5, intervalMinutes) * 60_000;

  setInterval(() => {
    void (async () => {
      try {
        const { runServerScheduledBatch } = await import("@/lib/server-scheduled-batch");
        const result = await runServerScheduledBatch({
          enabled: true,
          intervalMinutes,
          target:
            process.env.SERVER_SCHEDULED_BATCH_TARGET === "topics"
              ? "topics"
              : "random-scene",
          count: Number(process.env.SERVER_SCHEDULED_BATCH_COUNT ?? "3"),
          autoQueueComfyUi: process.env.SERVER_SCHEDULED_BATCH_QUEUE === "true",
          genre: process.env.SERVER_SCHEDULED_BATCH_GENRE,
        });
        const { notifyServerScheduledBatchComplete } = await import(
          "@/lib/server-scheduled-batch"
        );
        void notifyServerScheduledBatchComplete(result);
      } catch (error) {
        console.error("[server-scheduled-batch]", error);
      }
    })();
  }, intervalMs);
}
