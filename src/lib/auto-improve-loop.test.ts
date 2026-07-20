import assert from "node:assert/strict";
import { describe, it } from "node:test";

describe("auto improve loop", () => {
  it("exports rating and favorite handlers", async () => {
    const mod = await import("./auto-improve-loop.ts");
    assert.equal(typeof mod.runAutoImproveOnRating, "function");
    assert.equal(typeof mod.runAutoImproveOnFavorite, "function");
  });

  it("returns null for missing rating", async () => {
    const { runAutoImproveOnRating } = await import("./auto-improve-loop.ts");
    assert.equal(await runAutoImproveOnRating({} as import("./comfyui-gallery.ts").ComfyGalleryEntry, undefined), null);
  });
});
