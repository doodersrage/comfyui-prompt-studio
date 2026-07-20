import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseComfyObjectInfoModelLists } from "./comfyui-object-info.ts";

describe("comfyui-object-info", () => {
  it("parses checkpoint and upscale lists from object_info shape", () => {
    const lists = parseComfyObjectInfoModelLists({
      CheckpointLoaderSimple: {
        input: {
          ckpt_name: [["a.safetensors", "b.safetensors"], {}],
        },
      },
      UpscaleModelLoader: {
        input: {
          model_name: [["4x-UltraSharp.pth"], {}],
        },
      },
    });
    assert.deepEqual(lists.checkpoints, ["a.safetensors", "b.safetensors"]);
    assert.deepEqual(lists.upscaleModels, ["4x-UltraSharp.pth"]);
  });
});
