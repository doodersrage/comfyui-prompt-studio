import { readViewCache, writeViewCache, getCacheStats } from './src/lib/comfyui-view-cache.ts';

const key = 'smoke-test-key-' + Date.now();
const before = readViewCache(key, 'jpeg');
console.log('before write (expect null):', before);

writeViewCache(key, 'jpeg', { buffer: Buffer.from('hello world'), contentType: 'image/jpeg' });

const after = readViewCache(key, 'jpeg');
console.log('after write (expect buffer):', after ? after.buffer.toString() : null, after?.contentType);

console.log('stats:', getCacheStats());
