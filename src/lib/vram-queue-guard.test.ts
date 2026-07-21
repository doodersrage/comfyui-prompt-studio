import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isVramTightForMax,
  maybeDowngradeMaxForVram,
  MAX_VRAM_FREE_BYTES_THRESHOLD,
} from "./vram-queue-guard.ts";

describe("vram-queue-guard", () => {
  it("treats free VRAM under threshold as tight", () => {
    assert.equal(isVramTightForMax({ free: MAX_VRAM_FREE_BYTES_THRESHOLD - 1 }), true);
    assert.equal(isVramTightForMax({ free: MAX_VRAM_FREE_BYTES_THRESHOLD }), false);
    assert.equal(isVramTightForMax(null), false);
  });

  it("downgrades Max to Final when VRAM is tight", () => {
    const tight = maybeDowngradeMaxForVram("max", { free: 2e9 });
    assert.equal(tight.downgraded, true);
    assert.equal(tight.profile, "final");

    const ok = maybeDowngradeMaxForVram("max", { free: 12e9 });
    assert.equal(ok.downgraded, false);
    assert.equal(ok.profile, "max");

    const final = maybeDowngradeMaxForVram("final", { free: 1e9 });
    assert.equal(final.downgraded, false);
    assert.equal(final.profile, "final");
  });

  it("applies guard to runtime queueQualityProfile", async () => {
    const { guardQueueQualityForVram } = await import("./vram-queue-guard.ts");
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({ comfyui: { vram: { free: 1e9, total: 24e9 } } }),
        { status: 200 },
      )) as typeof fetch;
    try {
      const guarded = await guardQueueQualityForVram({
        runtime: { queueQualityProfile: "max" },
      });
      assert.equal(guarded.downgraded, true);
      assert.equal(guarded.profile, "final");
      assert.equal(guarded.runtime?.queueQualityProfile, "final");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
