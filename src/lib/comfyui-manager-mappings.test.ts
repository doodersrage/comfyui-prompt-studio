import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { lookupKnownComfyNodePack } from './comfyui-custom-node-registry';
import {
  parseComfyManagerMappings,
  parseComfyManagerNodeList,
  resolvePacksForMissingNodeTypes,
} from './comfyui-manager-mappings';
import { collectMissingWorkflowNodeTypes } from './workflow-node-type-audit';

describe('parseComfyManagerMappings', () => {
  it('maps pack key → class types arrays', () => {
    const map = parseComfyManagerMappings({
      'https://github.com/ltdrdata/ComfyUI-Impact-Pack': [
        ['FaceDetailer', 'SAMLoader'],
        { title: 'Impact Pack' },
      ],
    });
    assert.equal(map.get('FaceDetailer'), 'https://github.com/ltdrdata/ComfyUI-Impact-Pack');
    assert.equal(map.get('SAMLoader'), 'https://github.com/ltdrdata/ComfyUI-Impact-Pack');
  });
});

describe('parseComfyManagerNodeList', () => {
  it('reads custom_nodes[]', () => {
    const packs = parseComfyManagerNodeList({
      custom_nodes: [
        {
          id: 'impact',
          name: 'comfyui-impact-pack',
          files: ['https://github.com/ltdrdata/ComfyUI-Impact-Pack'],
          install_type: 'git-clone',
        },
      ],
    });
    assert.equal(packs.length, 1);
    assert.equal(packs[0]?.name, 'comfyui-impact-pack');
  });
});

describe('resolvePacksForMissingNodeTypes', () => {
  it('falls back to the known class_type registry', () => {
    const resolved = resolvePacksForMissingNodeTypes({
      classTypes: ['FaceDetailer', 'MysteryNode'],
      mappings: new Map(),
      catalog: [],
    });
    assert.equal(resolved.packs.length, 1);
    assert.match(resolved.packs[0]?.files[0] ?? '', /Impact-Pack/);
    assert.deepEqual(resolved.unresolved, ['MysteryNode']);
  });

  it('prefers catalog matches from mappings', () => {
    const resolved = resolvePacksForMissingNodeTypes({
      classTypes: ['FaceDetailer'],
      mappings: new Map([['FaceDetailer', 'https://github.com/ltdrdata/ComfyUI-Impact-Pack']]),
      catalog: [
        {
          name: 'impact-from-catalog',
          files: ['https://github.com/ltdrdata/ComfyUI-Impact-Pack'],
          install_type: 'git-clone',
        },
      ],
    });
    assert.equal(resolved.packs[0]?.name, 'impact-from-catalog');
  });
});

describe('lookupKnownComfyNodePack', () => {
  it('maps IPAdapter nodes', () => {
    const pack = lookupKnownComfyNodePack('IPAdapterModelLoader');
    assert.ok(pack);
    assert.match(pack.files[0] ?? '', /IPAdapter_plus/i);
  });
});

describe('collectMissingWorkflowNodeTypes', () => {
  it('returns class types absent from object_info', () => {
    const missing = collectMissingWorkflowNodeTypes(
      [
        {
          workflow: {
            '1': { class_type: 'KSampler', inputs: {} },
            '2': { class_type: 'FaceDetailer', inputs: {} },
          },
        },
      ],
      new Set(['KSampler', 'CLIPTextEncode'])
    );
    assert.deepEqual(missing, ['FaceDetailer']);
  });

  it('returns [] when object_info is empty', () => {
    assert.deepEqual(
      collectMissingWorkflowNodeTypes([{ workflow: { '1': { class_type: 'X' } } }], []),
      []
    );
  });
});
