export async function register() {
  if (process.env.NEXT_RUNTIME === "edge") {
    return;
  }

  if (process.env.SERVER_SCHEDULED_BATCH === "true") {
    const intervalMinutes = Number(process.env.SERVER_SCHEDULED_BATCH_INTERVAL_MIN ?? "60");
    const intervalMs = Math.max(5, intervalMinutes) * 60_000;

    setInterval(() => {
      void (async () => {
        try {
          const { runServerScheduledBatch, notifyServerScheduledBatchComplete } = await import(
            "@/lib/server-scheduled-batch"
          );
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
          void notifyServerScheduledBatchComplete(result);
        } catch (error) {
          console.error("[server-scheduled-batch]", error);
        }
      })();
    }, intervalMs);
  }

  if (process.env.SERVER_USER_MAINTENANCE === "true") {
    const maintenanceIntervalMin = Number(
      process.env.SERVER_USER_MAINTENANCE_INTERVAL_MIN ?? "15",
    );
    const maintenanceMs = Math.max(5, maintenanceIntervalMin) * 60_000;

    setInterval(() => {
      void (async () => {
        try {
          const { runServerUserMaintenance } = await import("@/lib/server-user-maintenance");
          await runServerUserMaintenance();
        } catch (error) {
          console.error("[server-user-maintenance]", error);
        }
      })();
    }, maintenanceMs);
  }
}
