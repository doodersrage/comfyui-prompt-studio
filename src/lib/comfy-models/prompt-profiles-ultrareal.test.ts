import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getComfyModelDefinition } from "./client";
import {
  buildProfileClarityAddendum,
  buildProfileSystemPrompt,
  buildProfileUserDirective,
  getProfileFewShots,
} from "./prompt-profiles";

describe("ultrareal prompt profiles", () => {
  const ultraReal = getComfyModelDefinition("flux-ultrareal-v4");
  const fluxDev = getComfyModelDefinition("flux-dev");

  it("adds anti-plastic realism rules for UltraReal system prompts", () => {
    const prompt = buildProfileSystemPrompt(ultraReal, "positive");
    assert.match(prompt, /UltraReal Fine-Tune realism/i);
    assert.match(prompt, /plastic, waxy, airbrushed/i);
    assert.match(prompt, /neon oversaturation/i);

    const devPrompt = buildProfileSystemPrompt(fluxDev, "positive");
    assert.doesNotMatch(devPrompt, /UltraReal Fine-Tune realism/i);
  });

  it("adds photographic clarity and user hints for UltraReal only", () => {
    const clarity = buildProfileClarityAddendum("balanced", ultraReal);
    assert.match(clarity, /UltraReal: real-camera photograph/i);

    const devClarity = buildProfileClarityAddendum("balanced", fluxDev);
    assert.doesNotMatch(devClarity, /UltraReal:/i);

    const directive = buildProfileUserDirective("rich", ultraReal);
    assert.match(directive, /Real-camera photograph with natural skin/i);
  });

  it("uses UltraReal few-shot examples", () => {
    const shots = getProfileFewShots(ultraReal, "balanced", []);
    assert.ok(shots.length > 0);
    assert.match(shots[0]?.output ?? "", /natural skin|balanced neutral color/i);
  });
});
