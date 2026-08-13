import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  interpretComfyJobDetail,
  mapComfyJobStatusString,
  parseComfyJobList,
} from './comfyui-jobs';

describe('mapComfyJobStatusString', () => {
  it('maps Comfy job status aliases', () => {
    assert.equal(mapComfyJobStatusString('pending'), 'pending');
    assert.equal(mapComfyJobStatusString('queued'), 'pending');
    assert.equal(mapComfyJobStatusString('in_progress'), 'running');
    assert.equal(mapComfyJobStatusString('running'), 'running');
    assert.equal(mapComfyJobStatusString('completed'), 'completed');
    assert.equal(mapComfyJobStatusString('success'), 'completed');
    assert.equal(mapComfyJobStatusString('failed'), 'error');
    assert.equal(mapComfyJobStatusString('cancelled'), 'error');
    assert.equal(mapComfyJobStatusString('nope'), null);
  });
});

describe('parseComfyJobList', () => {
  it('reads jobs[] payloads', () => {
    const jobs = parseComfyJobList({
      jobs: [
        { id: 'abc', status: 'pending' },
        { prompt_id: 'def', status: 'in_progress', create_time: 12, outputs_count: 1 },
        { id: '', status: 'completed' },
        { id: 'skip', status: 'mystery' },
      ],
    });
    assert.deepEqual(jobs, [
      { id: 'abc', status: 'pending' },
      { id: 'def', status: 'running', createTime: 12, outputsCount: 1 },
    ]);
  });

  it('accepts a bare array', () => {
    assert.equal(parseComfyJobList([{ id: 'x', status: 'completed' }]).length, 1);
  });
});

describe('interpretComfyJobDetail', () => {
  it('maps a completed job with an execution error', () => {
    const mapped = interpretComfyJobDetail('p1', 'http://127.0.0.1:8188', {
      status: 'failed',
      execution_error: { exception_message: 'OOM' },
      execution_start_time: 100,
      execution_end_time: 250,
    });
    assert.equal(mapped?.status, 'error');
    assert.equal(mapped?.statusMessage, 'OOM');
    assert.equal(mapped?.renderDurationMs, 150);
  });

  it('returns null when status is missing', () => {
    assert.equal(interpretComfyJobDetail('p1', 'http://127.0.0.1:8188', { id: 'p1' }), null);
  });
});
