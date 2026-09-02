import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { savePromptHistoryStore } from "./prompt-history";
import {
  computeRatingDrivenWildnessBias,
  applyRatingDrivenWildness,
  ratingDrivenWildnessLabel,
} from "./rating-driven-random";

describe("rating-driven-random (Node-safe, no window)", () => {
  it("computeRatingDrivenWildnessBias defaults to -3 with no history/gallery data", () => {
    // With no window, both loadHistoryEntries() and loadComfyGallery() return [].
    // avgRating defaults to 3 (ratingBias 0) but favoriteRatio is 0, so
    // favoriteBias = round((0 - 0.15) * 20) = -3, and every other term is 0.
    assert.equal(computeRatingDrivenWildnessBias(), -3);
  });

  it("applyRatingDrivenWildness applies the -3 default bias and clamps to [0, 100]", () => {
    assert.equal(applyRatingDrivenWildness(50), 47);
    assert.equal(applyRatingDrivenWildness(0), 0);
    assert.equal(applyRatingDrivenWildness(100), 97);
  });

  it("ratingDrivenWildnessLabel reports the adjusted value and signed bias", () => {
    assert.equal(ratingDrivenWildnessLabel(50), "Adjusted 47 (-3 from ratings)");
  });
});

describe("rating-driven-random with seeded prompt history", () => {
  let originalWindow: unknown;
  let storage: Map<string, string>;

  beforeEach(() => {
    originalWindow = (globalThis as { window?: unknown }).window;
    storage = new Map();
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        localStorage: {
          getItem: (key: string) => storage.get(key) ?? null,
          setItem: (key: string, value: string) => {
            storage.set(key, value);
          },
          removeItem: (key: string) => storage.delete(key),
        },
        dispatchEvent: () => undefined,
      },
    });
  });

  afterEach(() => {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: originalWindow,
    });
  });

  it("a high favorite ratio with no ratings produces a positive bias and '+' sign", () => {
    savePromptHistoryStore([
      { id: "1", tool: "t", prompt: "p", model: "m", timestamp: 1, favorite: true },
      { id: "2", tool: "t", prompt: "p", model: "m", timestamp: 2 },
    ]);
    assert.equal(computeRatingDrivenWildnessBias(), 7);
    assert.equal(applyRatingDrivenWildness(50), 57);
    assert.equal(ratingDrivenWildnessLabel(50), "Adjusted 57 (+7 from ratings)");
  });

  it("clamps a strongly positive bias (high ratings + all favorites) to +12", () => {
    savePromptHistoryStore(
      Array.from({ length: 10 }, (_, i) => ({
        id: String(i),
        tool: "t",
        prompt: "p",
        model: "m",
        timestamp: i,
        favorite: true,
        rating: 5 as const,
      }))
    );
    assert.equal(computeRatingDrivenWildnessBias(), 12);
  });

  it("clamps a strongly negative bias (all low ratings, no favorites) to -12", () => {
    savePromptHistoryStore(
      Array.from({ length: 5 }, (_, i) => ({
        id: String(i),
        tool: "t",
        prompt: "p",
        model: "m",
        timestamp: i,
        rating: 1 as const,
      }))
    );
    assert.equal(computeRatingDrivenWildnessBias(), -12);
  });

  it("reports the unadjusted base wildness when the computed bias is exactly 0", () => {
    // 3 favorites out of 20 entries => favoriteRatio 0.15 exactly => favoriteBias 0;
    // no ratings at all => every other bias term is 0 too.
    const entries = Array.from({ length: 20 }, (_, i) => ({
      id: String(i),
      tool: "t",
      prompt: "p",
      model: "m",
      timestamp: i,
      favorite: i < 3,
    }));
    savePromptHistoryStore(entries);
    assert.equal(computeRatingDrivenWildnessBias(), 0);
    assert.equal(ratingDrivenWildnessLabel(50), "Base wildness 50");
  });
});
