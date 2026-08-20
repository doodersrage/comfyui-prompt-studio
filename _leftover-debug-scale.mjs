import { resolveDiffusersOutputPost } from './src/lib/diffusers-output-post.ts';
import { upscaleScaleForProfile, profileSkipsOutputUpscaleForModel } from './src/lib/queue-quality-profile.ts';

const opts = { model: 'qwen-image-2512-lightning-8', hasInputImage: true };
console.log('skip?', profileSkipsOutputUpscaleForModel('max', opts));
console.log('scale?', upscaleScaleForProfile('max', opts));
console.log('full:', resolveDiffusersOutputPost({ qualityProfile: 'max', studioModel: 'qwen-image-2512-lightning-8', hasInputImage: true }));
