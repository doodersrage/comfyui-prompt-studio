import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatComfyUiQueueValidationError } from "./comfyui-queue-validation-error.ts";

describe("formatComfyUiQueueValidationError", () => {
  it("summarizes unsupported qwen_image DualCLIP validation errors", () => {
    const formatted = formatComfyUiQueueValidationError(
      JSON.stringify({
        error: { type: "prompt_outputs_failed_validation", message: "Prompt outputs failed validation" },
        node_errors: {
          "2": {
            class_type: "DualCLIPLoader",
            errors: [
              {
                type: "value_not_in_list",
                details:
                  "type: 'qwen_image' not in ['sdxl', 'sd3', 'flux', 'hunyuan_video']",
              },
            ],
          },
        },
      }),
    );

    assert.match(formatted, /CLIPLoader \(type qwen_image\)/);
    assert.match(formatted, /node 2/);
  });

  it("returns plain text when payload is not JSON", () => {
    assert.equal(formatComfyUiQueueValidationError("ComfyUI offline"), "ComfyUI offline");
  });
});
