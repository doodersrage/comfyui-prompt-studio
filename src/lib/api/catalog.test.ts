import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { API_VERSION, buildApiCatalog, buildModelsPayload, serializeModel } from './catalog';
import {
  COMFY_IMAGE_MODELS,
  COMFY_MODEL_CATEGORIES,
  DEFAULT_COMFY_MODEL,
} from '@/lib/comfy-models';

function findModel(id: string) {
  const model = COMFY_IMAGE_MODELS.find(entry => entry.id === id);
  if (!model) {
    throw new Error(`fixture model not found: ${id}`);
  }
  return model;
}

describe('api/catalog', () => {
  describe('API_VERSION', () => {
    it('is a semver-ish string', () => {
      assert.match(API_VERSION, /^\d+\.\d+\.\d+$/);
    });
  });

  describe('serializeModel', () => {
    it('maps every field from a non-flux model definition', () => {
      const model = findModel('sd15');
      const serialized = serializeModel(model);
      assert.equal(serialized.id, 'sd15');
      assert.equal(serialized.label, model.label);
      assert.equal(serialized.category, 'stable-diffusion');
      assert.equal(serialized.categoryLabel, 'Stable Diffusion');
      assert.equal(serialized.comfyNode, model.comfyNode);
      assert.equal(serialized.comfyClass, model.comfyClass);
      assert.equal(serialized.description, model.description);
      assert.equal(serialized.profile, model.profile);
      assert.equal(serialized.referenceTokenLimit, model.referenceTokenLimit);
      assert.deepEqual(serialized.limitsByDetail, model.limitsByDetail);
      assert.equal(serialized.fluxIgnoresNegative, false);
    });

    it('looks up categoryLabel from COMFY_MODEL_CATEGORIES for every real category', () => {
      const labelsById = new Map(COMFY_MODEL_CATEGORIES.map(entry => [entry.id, entry.label]));
      for (const model of COMFY_IMAGE_MODELS) {
        const serialized = serializeModel(model);
        assert.equal(serialized.categoryLabel, labelsById.get(model.category));
      }
    });

    it('sets fluxIgnoresNegative true for a profile starting with flux_', () => {
      const model = findModel('flux-dev');
      assert.equal(model.profile.startsWith('flux_'), true);
      assert.equal(serializeModel(model).fluxIgnoresNegative, true);
    });

    it('sets fluxIgnoresNegative true for the flux_klein profile family', () => {
      const model = findModel('flux-2-klein');
      assert.equal(model.profile, 'flux_klein');
      assert.equal(serializeModel(model).fluxIgnoresNegative, true);
    });

    it('sets fluxIgnoresNegative true for the flux_schnell profile', () => {
      const model = findModel('flux-schnell');
      assert.equal(model.profile, 'flux_schnell');
      assert.equal(serializeModel(model).fluxIgnoresNegative, true);
    });

    it('sets fluxIgnoresNegative false for a non-flux profile that happens to mention flux in its id', () => {
      // flux2 / flux-inpaint style ids still key off `profile`, not `id`.
      const model = findModel('sdxl');
      assert.equal(model.profile.startsWith('flux_'), false);
      assert.equal(serializeModel(model).fluxIgnoresNegative, false);
    });

    it('carries an undefined comfyClass through unchanged when a definition omits it', () => {
      const model = findModel('sd15');
      const withoutClass = { ...model, comfyClass: undefined };
      assert.equal(serializeModel(withoutClass).comfyClass, undefined);
    });
  });

  describe('buildModelsPayload', () => {
    it('with no options, returns every model plus the default model and full category list', () => {
      const payload = buildModelsPayload();
      assert.ok('models' in payload);
      if (!('models' in payload)) return;
      assert.equal(payload.defaultModel, DEFAULT_COMFY_MODEL);
      assert.equal(payload.count, COMFY_IMAGE_MODELS.length);
      assert.deepEqual(payload.categories, COMFY_MODEL_CATEGORIES);
      assert.equal(payload.models.length, COMFY_IMAGE_MODELS.length);
      assert.deepEqual(payload.models, COMFY_IMAGE_MODELS.map(serializeModel));
    });

    it('with an empty options object, behaves the same as no options', () => {
      const payload = buildModelsPayload({});
      assert.ok('models' in payload);
      if (!('models' in payload)) return;
      assert.equal(payload.count, COMFY_IMAGE_MODELS.length);
    });

    it('filters models by category when given one', () => {
      const payload = buildModelsPayload({ category: 'flux' });
      assert.ok('models' in payload);
      if (!('models' in payload)) return;
      const expected = COMFY_IMAGE_MODELS.filter(entry => entry.category === 'flux');
      assert.equal(payload.count, expected.length);
      assert.ok(payload.count > 0);
      for (const model of payload.models) {
        assert.equal(model.category, 'flux');
      }
    });

    it('still includes the full category list and default model when filtering by category', () => {
      const payload = buildModelsPayload({ category: 'sdxl' });
      assert.ok('models' in payload);
      if (!('models' in payload)) return;
      assert.deepEqual(payload.categories, COMFY_MODEL_CATEGORIES);
      assert.equal(payload.defaultModel, DEFAULT_COMFY_MODEL);
    });

    it('treats a null category the same as no category filter', () => {
      const payload = buildModelsPayload({ category: null });
      assert.ok('models' in payload);
      if (!('models' in payload)) return;
      assert.equal(payload.count, COMFY_IMAGE_MODELS.length);
    });

    it('returns a single serialized model when id matches', () => {
      const payload = buildModelsPayload({ id: 'sd15' });
      assert.ok('found' in payload && payload.found === true);
      if (!('found' in payload) || !payload.found) return;
      assert.deepEqual(payload.model, serializeModel(findModel('sd15')));
    });

    it('returns found: false with the requested id when the id does not match any model', () => {
      const payload = buildModelsPayload({ id: 'totally-unknown-model-id' });
      assert.deepEqual(payload, { found: false, id: 'totally-unknown-model-id' });
    });

    it('prioritizes id over category when both are given', () => {
      const payload = buildModelsPayload({ id: 'sd15', category: 'flux' });
      assert.ok('found' in payload && payload.found === true);
      if (!('found' in payload) || !payload.found) return;
      assert.equal(payload.model.id, 'sd15');
    });

    it('treats an empty-string id as falsy and falls back to the full/filtered listing', () => {
      const payload = buildModelsPayload({ id: '' });
      assert.ok('models' in payload);
    });
  });

  describe('buildApiCatalog', () => {
    const baseUrl = 'https://example.test';
    const catalog = buildApiCatalog(baseUrl);

    it('sets top-level name, version, baseUrl, and contentType', () => {
      assert.equal(catalog.name, 'ComfyUI Image Prompt API');
      assert.equal(catalog.version, API_VERSION);
      assert.equal(catalog.baseUrl, baseUrl);
      assert.equal(catalog.contentType, 'application/json');
    });

    it('lists every documented tool exactly once, in a stable order', () => {
      const ids = catalog.tools.map(tool => tool.id);
      assert.deepEqual(ids, [
        'generate',
        'format',
        'topics',
        'models',
        'character',
        'pet',
        'fantasy',
        'roleplay',
        'background',
        'random-scene',
        'topics-batch',
        'comfyui',
        'comfyui-history',
        'lint',
        'negative',
      ]);
      assert.equal(new Set(ids).size, ids.length);
    });

    function toolById(id: string): Record<string, unknown> {
      const tool = catalog.tools.find(entry => entry.id === id);
      assert.ok(tool, `expected a tool with id ${id}`);
      return tool as Record<string, unknown>;
    }

    function prop(value: unknown, key: string): unknown {
      return (value as Record<string, unknown>)[key];
    }

    function exampleCurl(tool: Record<string, unknown>): string {
      return String(prop(tool.example, 'curl'));
    }

    it('bakes the given baseUrl into example curl commands', () => {
      const generate = toolById('generate');
      const format = toolById('format');
      const topics = toolById('topics');
      const models = toolById('models');
      assert.ok(exampleCurl(generate).startsWith(`curl -sS -X POST ${baseUrl}/api/generate`));
      assert.ok(exampleCurl(format).startsWith(`curl -sS -X POST ${baseUrl}/api/format`));
      assert.ok(exampleCurl(topics).startsWith(`curl -sS -X POST ${baseUrl}/api/topics`));
      assert.equal(exampleCurl(models), `curl -sS ${baseUrl}/api/models?category=flux`);
    });

    it('rebuilds a fresh curl string per call, reflecting a different baseUrl', () => {
      const other = buildApiCatalog('https://other.example');
      const generate = other.tools.find(tool => tool.id === 'generate') as Record<string, unknown>;
      assert.ok(exampleCurl(generate).includes('https://other.example/api/generate'));
      assert.ok(!exampleCurl(generate).includes('https://example.test'));
    });

    it('embeds the real DEFAULT_COMFY_MODEL as the default model on generate/format', () => {
      const generate = toolById('generate');
      const format = toolById('format');
      assert.equal(prop(prop(generate.request, 'model'), 'default'), DEFAULT_COMFY_MODEL);
      assert.equal(prop(prop(format.request, 'model'), 'default'), DEFAULT_COMFY_MODEL);
    });

    it('exposes the real category ids as the models query enum', () => {
      const models = toolById('models');
      assert.deepEqual(
        prop(prop(models.query, 'category'), 'enum'),
        COMFY_MODEL_CATEGORIES.map(entry => entry.id)
      );
    });

    it('lists the three detail levels and both prompt modes in enums', () => {
      assert.deepEqual(catalog.enums.detail, ['concise', 'balanced', 'rich']);
      assert.deepEqual(catalog.enums.mode, ['positive', 'negative']);
      assert.deepEqual(catalog.enums.categories, COMFY_MODEL_CATEGORIES);
    });

    it('documents the error shape and status codes', () => {
      assert.deepEqual(catalog.errors.shape, { error: 'string' });
      assert.equal(catalog.errors.statuses[404], 'Unknown model id (GET /api/models?id=…).');
      assert.ok(Object.keys(catalog.errors.statuses).length >= 4);
    });

    it('tools that only document method+path omit request/response/example', () => {
      const character = toolById('character');
      assert.equal(character.method, 'POST');
      assert.equal(character.path, '/api/character');
      assert.equal(character.request, undefined);
      assert.equal(character.example, undefined);
    });
  });
});
