import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { shouldRunServerScheduledBatch } from "./server-scheduled-batch.ts";
import type { ScheduledBatchConfig } from "./scheduled-batch.ts";

function baseConfig(overrides: Partial<ScheduledBatchConfig> = {}): ScheduledBatchConfig {
  return {
    enabled: true,
    intervalMinutes: 60,
    target: "random-scene",
    count: 3,
    autoQueueComfyUi: false,
    ...overrides,
  };
}

describe("shouldRunServerScheduledBatch", () => {
  const originalDataDir = process.env.PROMPT_DATA_DIR;

  beforeEach(() => {
    // Storage disabled ⇒ lastRunAt always reads as unset, isolating the gate's
    // enabled/interval math from any persisted state on disk.
    delete process.env.PROMPT_DATA_DIR;
  });

  afterEach(() => {
    if (originalDataDir === undefined) {
      delete process.env.PROMPT_DATA_DIR;
    } else {
      process.env.PROMPT_DATA_DIR = originalDataDir;
    }
  });

  it("returns false when the config is disabled", async () => {
    const result = await shouldRunServerScheduledBatch(baseConfig({ enabled: false }), Date.now());
    assert.equal(result, false);
  });

  it("returns true once the interval has elapsed since the last (unset) run", async () => {
    const config = baseConfig({ intervalMinutes: 60 });
    const now = 90 * 60_000; // 90 minutes past epoch
    assert.equal(await shouldRunServerScheduledBatch(config, now), true);
  });

  it("returns false before the interval has elapsed since the last (unset) run", async () => {
    const config = baseConfig({ intervalMinutes: 60 });
    const now = 30 * 60_000; // 30 minutes past epoch — under the 60 min interval
    assert.equal(await shouldRunServerScheduledBatch(config, now), false);
  });

  it("treats the elapsed threshold as inclusive", async () => {
    const config = baseConfig({ intervalMinutes: 60 });
    const now = 60 * 60_000; // exactly one interval past epoch
    assert.equal(await shouldRunServerScheduledBatch(config, now), true);
  });

  it("clamps a below-minimum interval before gating", async () => {
    // clampScheduledBatchConfig floors intervalMinutes at 5.
    const config = baseConfig({ intervalMinutes: 1 });
    const now = 4 * 60_000; // under the clamped 5 min floor
    assert.equal(await shouldRunServerScheduledBatch(config, now), false);
    assert.equal(await shouldRunServerScheduledBatch(config, 5 * 60_000), true);
  });
});
