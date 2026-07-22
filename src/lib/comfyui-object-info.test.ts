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
    assert.deepEqual(lists.clips, []);
    assert.deepEqual(lists.dualClipTypes, []);
    assert.deepEqual(lists.clipLoaderTypes, []);
    assert.deepEqual(lists.loras, []);
    assert.deepEqual(lists.controlNets, []);
  });

  it("reads combo lists nested under input.required (live ComfyUI shape)", () => {
    const lists = parseComfyObjectInfoModelLists({
      CheckpointLoaderSimple: {
        input: {
          required: {
            ckpt_name: [["dream.safetensors"], {}],
          },
        },
      },
      LoraLoader: {
        input: {
          required: {
            lora_name: [["style.safetensors", "lightning.safetensors"], {}],
          },
        },
      },
      LoraLoaderModelOnly: {
        input: {
          required: {
            lora_name: [["lightning.safetensors", "extra.safetensors"], {}],
          },
        },
      },
    });
    assert.deepEqual(lists.checkpoints, ["dream.safetensors"]);
    assert.deepEqual(lists.loras, [
      "style.safetensors",
      "lightning.safetensors",
      "extra.safetensors",
    ]);
  });

  it("merges UnetLoaderGGUF filenames into the UNET inventory", () => {
    const lists = parseComfyObjectInfoModelLists({
      UNETLoader: {
        input: {
          unet_name: [["flux1-dev.safetensors"], {}],
        },
      },
      UnetLoaderGGUF: {
        input: {
          unet_name: [["flux1-dev-Q4_K_S.gguf"], {}],
        },
      },
    });
    assert.deepEqual(lists.unets, [
      "flux1-dev.safetensors",
      "flux1-dev-Q4_K_S.gguf",
    ]);
  });
});
