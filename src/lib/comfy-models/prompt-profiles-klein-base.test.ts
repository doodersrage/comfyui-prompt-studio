import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getComfyModelDefinition } from "./client.ts";
import {
  buildProfileClarityAddendum,
  buildProfileSystemPrompt,
  buildProfileUserDirective,
  getProfileFewShots,
} from "./prompt-profiles.ts";

describe("klein base prompt profiles", () => {
  const klein9bBase = getComfyModelDefinition("flux-2-klein-9b");
  const klein9bDistilled = getComfyModelDefinition("flux-2-klein-9b-distilled");

  it("adds anti-plastic realism rules for Klein Base system prompts", () => {
    const basePrompt = buildProfileSystemPrompt(klein9bBase, "positive");
    assert.match(basePrompt, /Klein Base realism/i);
    assert.match(basePrompt, /plastic, waxy, airbrushed/i);
    assert.match(basePrompt, /real camera capture/i);
    assert.match(basePrompt, /identical clone rows/i);
    assert.match(basePrompt, /monochromatic pink/i);

    const distilledPrompt = buildProfileSystemPrompt(klein9bDistilled, "positive");
    assert.doesNotMatch(distilledPrompt, /Klein Base realism/i);
    assert.doesNotMatch(distilledPrompt, /plastic, waxy, airbrushed/i);
  });

  it("adds photographic clarity and user hints for Klein Base only", () => {
    const baseClarity = buildProfileClarityAddendum("balanced", klein9bBase);
    assert.match(baseClarity, /Klein Base: keep the scene photographic/i);
    assert.match(baseClarity, /clone rows/i);

    const distilledClarity = buildProfileClarityAddendum("balanced", klein9bDistilled);
    assert.doesNotMatch(distilledClarity, /Klein Base:/i);

    const baseDirective = buildProfileUserDirective("rich", klein9bBase);
    assert.match(baseDirective, /Natural photograph with lifelike skin/i);

    const distilledDirective = buildProfileUserDirective("rich", klein9bDistilled);
    assert.doesNotMatch(distilledDirective, /Natural photograph with lifelike skin/i);
  });

  it("uses Klein Base few-shot examples for undistilled models", () => {
    const baseShots = getProfileFewShots(klein9bBase, "balanced", []);
    assert.ok(baseShots.length > 0);
    assert.match(baseShots[0]?.output ?? "", /natural skin|real materials|natural photograph/i);

    const distilledShots = getProfileFewShots(klein9bDistilled, "balanced", []);
    assert.ok(distilledShots.length > 0);
    assert.doesNotMatch(distilledShots[0]?.output ?? "", /not glossy CGI surfaces/i);
  });
});
