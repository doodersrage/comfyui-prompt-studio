import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_CONTROLNET_MODEL_TOKEN,
  formatModelControlNetMap,
  parseModelControlNetMap,
  resolveControlNetModelFilename,
} from "./model-controlnet-map.ts";

describe("model-controlnet-map", () => {
  it("parses and formats controlnet map lines", () => {
    const map = parseModelControlNetMap(
      "default=openpose.pth\nflux-dev=flux-control.safetensors",
    );
    assert.equal(map.default, "openpose.pth");
    assert.equal(map["flux-dev"], "flux-control.safetensors");
    assert.match(formatModelControlNetMap(map), /default=openpose\.pth/);
  });

  it("resolves from map or custom token", () => {
    const fromMap = resolveControlNetModelFilename("flux-dev", {
      controlNetMap: { "flux-dev": "flux-control.safetensors" },
    });
    assert.equal(fromMap, "flux-control.safetensors");

    const fromToken = resolveControlNetModelFilename("qwen-image-2512", {
      customTokens: [
        { token: DEFAULT_CONTROLNET_MODEL_TOKEN, value: "cnet.safetensors" },
      ],
    });
    assert.equal(fromToken, "cnet.safetensors");
  });
});
