import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildBuiltInVideoI2vWorkflow,
  resolveInstalledVideoWeight,
  resolveVideoSplitCompanions,
  rewriteCheckpointLoadersToVideoSplit,
  videoWeightIsUnetOnly,
} from './video-i2v-scaffold';

describe('video I2V built-in scaffold', () => {
  it('uses EmptyLTXVLatentVideo for LTX and EmptyHunyuanLatentVideo for WAN', () => {
    const wan = buildBuiltInVideoI2vWorkflow('wan-video');
    const ltx = buildBuiltInVideoI2vWorkflow('ltx-video');
    assert.equal((wan['4'] as { class_type?: string }).class_type, 'EmptyHunyuanLatentVideo');
    assert.equal((ltx['4'] as { class_type?: string }).class_type, 'EmptyLTXVLatentVideo');
    assert.equal((wan['5'] as { inputs?: { denoise?: number } }).inputs?.denoise, 1);
  });

  it('keeps an installed mapped weight and otherwise picks a WAN file from inventory', () => {
    const inventory = [
      'qwen_image_2512_fp8_e4m3fn.safetensors',
      'wan2.2-i2v-rapid-aio-v10.safetensors',
    ];
    assert.equal(
      resolveInstalledVideoWeight(
        'wan-video',
        'wan2.2-i2v-rapid-aio-v10-nsfw.safetensors',
        inventory
      ),
      'wan2.2-i2v-rapid-aio-v10.safetensors'
    );
    assert.equal(
      resolveInstalledVideoWeight('wan-video', 'missing-wan.safetensors', inventory),
      'wan2.2-i2v-rapid-aio-v10.safetensors'
    );
  });

  it('treats Hunyuan I2V as UNET-only when it is missing from checkpoints', () => {
    assert.equal(
      videoWeightIsUnetOnly(
        'hunyuan_video_image_to_video_720p_bf16.safetensors',
        ['DreamShaper_8_pruned.safetensors'],
        ['hunyuan_video_image_to_video_720p_bf16.safetensors']
      ),
      true
    );
    assert.equal(
      videoWeightIsUnetOnly(
        'wan2.2-i2v-rapid-aio-v10.safetensors',
        [],
        ['wan2.2-i2v-rapid-aio-v10.safetensors']
      ),
      false
    );
  });

  it('rewrites CheckpointLoaderSimple to Hunyuan DualCLIP + VAE + UNET', () => {
    const split = resolveVideoSplitCompanions({
      model: 'hunyuan-video',
      unet: 'hunyuan_video_image_to_video_720p_bf16.safetensors',
      availableClips: ['clip_l.safetensors', 'llava_llama3_fp8_scaled.safetensors'],
      availableVaes: ['hunyuan_video_vae_bf16.safetensors'],
    });
    assert.equal(split.error, undefined);
    const rewritten = rewriteCheckpointLoadersToVideoSplit(
      buildBuiltInVideoI2vWorkflow('hunyuan-video'),
      split.companions!
    );
    const loader = rewritten.workflow['1'] as {
      class_type?: string;
      inputs?: { unet_name?: string };
    };
    const positive = rewritten.workflow['2'] as { inputs?: { clip?: [string, number] } };
    const decode = rewritten.workflow['6'] as { inputs?: { vae?: [string, number] } };
    assert.equal(loader.class_type, 'UNETLoader');
    assert.equal(loader.inputs?.unet_name, 'hunyuan_video_image_to_video_720p_bf16.safetensors');
    assert.equal(positive.inputs?.clip?.[1], 0);
    assert.equal(decode.inputs?.vae?.[1], 0);
    const clipNode = rewritten.workflow[positive.inputs!.clip![0]] as {
      class_type?: string;
      inputs?: { type?: string };
    };
    assert.equal(clipNode.class_type, 'DualCLIPLoader');
    assert.equal(clipNode.inputs?.type, 'hunyuan_video');
  });
});
