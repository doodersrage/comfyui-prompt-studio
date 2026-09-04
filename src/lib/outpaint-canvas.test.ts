import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import {
  buildOutpaintInstruction,
  normalizeOutpaintInsets,
  normalizeOutpaintPad,
  outpaintInsetsHavePad,
  renderOutpaintPadAndMask,
  type OutpaintPadInsets,
} from './outpaint-canvas';

describe('normalizeOutpaintPad', () => {
  it('returns 0 for undefined, NaN, or non-numbers', () => {
    assert.equal(normalizeOutpaintPad(undefined), 0);
    assert.equal(normalizeOutpaintPad(Number.NaN), 0);
  });

  it('clamps negative values to 0', () => {
    assert.equal(normalizeOutpaintPad(-50), 0);
  });

  it('clamps values above 1024 to 1024', () => {
    assert.equal(normalizeOutpaintPad(5000), 1024);
  });

  it('rounds fractional values', () => {
    assert.equal(normalizeOutpaintPad(12.6), 13);
  });

  it('passes through an in-range integer', () => {
    assert.equal(normalizeOutpaintPad(256), 256);
  });
});

describe('normalizeOutpaintInsets', () => {
  it('normalizes every side independently, defaulting missing sides to 0', () => {
    const result = normalizeOutpaintInsets({ top: 10.4, left: -5 });
    assert.deepEqual(result, { top: 10, right: 0, bottom: 0, left: 0 });
  });
});

describe('outpaintInsetsHavePad', () => {
  it('is false when every side is 0', () => {
    assert.equal(outpaintInsetsHavePad({ top: 0, right: 0, bottom: 0, left: 0 }), false);
  });

  it('is true when any side is positive', () => {
    assert.equal(outpaintInsetsHavePad({ top: 0, right: 0, bottom: 12, left: 0 }), true);
  });
});

describe('buildOutpaintInstruction', () => {
  const insets: OutpaintPadInsets = { top: 100, right: 0, bottom: 50, left: 0 };

  it('lists only the non-zero sides in order', () => {
    const instruction = buildOutpaintInstruction(insets, 'add mountains');
    assert.ok(instruction.includes('100px top, 50px bottom'));
    assert.ok(instruction.includes('add mountains'));
    assert.ok(instruction.includes('Keep all unmasked original pixels unchanged.'));
  });

  it('falls back to "the expanded border" when no sides are padded', () => {
    const instruction = buildOutpaintInstruction(
      { top: 0, right: 0, bottom: 0, left: 0 },
      'add mountains'
    );
    assert.ok(instruction.includes('the expanded border'));
  });

  it('falls back to a default intent when the given intent is blank', () => {
    const instruction = buildOutpaintInstruction(insets, '   ');
    assert.ok(instruction.includes('continue the scene naturally'));
  });
});

describe('renderOutpaintPadAndMask', () => {
  type FakeCanvas = {
    width: number;
    height: number;
    getContext: (kind: string) => FakeCtx | null;
    toDataURL: (type: string) => string;
  };
  type FakeCtx = {
    fillStyle: string;
    fillRect: (x: number, y: number, w: number, h: number) => void;
    drawImage: (source: unknown, x: number, y: number) => void;
  };

  const createdCanvases: FakeCanvas[] = [];

  function makeFakeCanvas(): FakeCanvas {
    const canvas: FakeCanvas = {
      width: 0,
      height: 0,
      getContext: (kind: string) => (kind === '2d' ? ctx : null),
      toDataURL: (type: string) => `data:${type};base64,fake-${createdCanvases.length}`,
    };
    const ctx: FakeCtx = {
      fillStyle: '',
      fillRect: () => {},
      drawImage: () => {},
    };
    createdCanvases.push(canvas);
    return canvas;
  }

  beforeEach(() => {
    createdCanvases.length = 0;
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: {
        createElement: (tag: string) => {
          if (tag !== 'canvas') {
            throw new Error(`unexpected element: ${tag}`);
          }
          return makeFakeCanvas();
        },
      },
    });
  });

  afterEach(() => {
    delete (globalThis as { document?: unknown }).document;
  });

  it('throws when every inset side normalizes to 0', async () => {
    const source = { naturalWidth: 100, naturalHeight: 80 } as unknown as HTMLImageElement;
    await assert.rejects(
      () => renderOutpaintPadAndMask(source, { top: 0, right: 0, bottom: 0, left: 0 }),
      /Set at least one pad side/
    );
  });

  it('sizes the padded canvas from naturalWidth/naturalHeight plus insets and returns data URLs', async () => {
    const source = { naturalWidth: 100, naturalHeight: 80 } as unknown as HTMLImageElement;
    const result = await renderOutpaintPadAndMask(source, { top: 10, right: 20, bottom: 0, left: 0 });
    assert.equal(result.width, 120);
    assert.equal(result.height, 90);
    assert.equal(createdCanvases.length, 2);
    assert.equal(createdCanvases[0]!.width, 120);
    assert.equal(createdCanvases[0]!.height, 90);
    assert.ok(result.imageDataUrl.startsWith('data:image/png'));
    assert.ok(result.maskDataUrl.startsWith('data:image/png'));
  });

  it('sizes from width/height for an ImageBitmap-like source', async () => {
    const source = { width: 50, height: 60 } as unknown as ImageBitmap;
    const result = await renderOutpaintPadAndMask(source, { top: 5, right: 5, bottom: 5, left: 5 });
    assert.equal(result.width, 60);
    assert.equal(result.height, 70);
  });

  it('throws when the canvas cannot produce a 2d context', async () => {
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: {
        createElement: () => ({
          width: 0,
          height: 0,
          getContext: () => null,
          toDataURL: () => '',
        }),
      },
    });
    const source = { naturalWidth: 10, naturalHeight: 10 } as unknown as HTMLImageElement;
    await assert.rejects(
      () => renderOutpaintPadAndMask(source, { top: 1, right: 0, bottom: 0, left: 0 }),
      /Could not create outpaint canvas/
    );
  });
});
