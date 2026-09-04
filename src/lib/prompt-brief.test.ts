import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';

type SharedShape = Record<string, unknown>;
let sharedSettings: SharedShape = { model: 'sdxl', detail: 'balanced' };
const loadSettingsCache = mock.fn(() => ({ shared: sharedSettings }));
const saveSharedSettings = mock.fn((_next: SharedShape) => {});
mock.module('./settings-cache', { namedExports: { loadSettingsCache, saveSharedSettings } });

type ComfySettingsShape = { apiUrl?: string };
let comfySettings: ComfySettingsShape = { apiUrl: 'http://127.0.0.1:8188' };
const loadComfyUiSettings = mock.fn(() => comfySettings);
const saveComfyUiSettings = mock.fn((next: ComfySettingsShape) => {
  comfySettings = next;
});
mock.module('./comfyui-settings', { namedExports: { loadComfyUiSettings, saveComfyUiSettings } });

const setActiveProjectId = mock.fn((_id: string | undefined) => {});
const loadActiveProjectId = mock.fn(() => 'proj-42');
mock.module('./prompt-projects', { namedExports: { setActiveProjectId, loadActiveProjectId } });

const downloadTextFile = mock.fn((_content: string, _filename: string, _mime: string) => {});
mock.module('./history-export-formats', { namedExports: { downloadTextFile } });

function resetMocks() {
  sharedSettings = { model: 'sdxl', detail: 'balanced' };
  comfySettings = { apiUrl: 'http://127.0.0.1:8188' };
  for (const m of [
    loadSettingsCache,
    saveSharedSettings,
    loadComfyUiSettings,
    saveComfyUiSettings,
    setActiveProjectId,
    loadActiveProjectId,
    downloadTextFile,
  ]) {
    m.mock.resetCalls();
  }
}

afterEach(resetMocks);

describe('prompt-brief', async () => {
  const { buildPromptBriefFromCurrent, applyPromptBrief, downloadPromptBrief, parsePromptBriefFile } =
    await import('./prompt-brief');

  describe('buildPromptBriefFromCurrent', () => {
    it('fills model/detail from shared settings and projectId from loadActiveProjectId when not given', () => {
      const brief = buildPromptBriefFromCurrent({ label: '  My Brief  ', hints: '  a scene  ' });
      assert.equal(brief.version, 1);
      assert.equal(brief.label, 'My Brief');
      assert.equal(brief.hints, 'a scene');
      assert.equal(brief.model, 'sdxl');
      assert.equal(brief.detailLevel, 'balanced');
      assert.equal(brief.projectId, 'proj-42');
      assert.equal(brief.comfyUiUrl, 'http://127.0.0.1:8188');
      assert.ok(typeof brief.createdAt === 'number');
    });

    it('prefers explicit model/detailLevel over shared settings', () => {
      const brief = buildPromptBriefFromCurrent({
        label: 'x',
        hints: 'x',
        model: 'flux-2-klein',
        detailLevel: 'detailed',
      });
      assert.equal(brief.model, 'flux-2-klein');
      assert.equal(brief.detailLevel, 'detailed');
    });

    it('falls back to sdxl/balanced when shared settings has neither', () => {
      sharedSettings = {};
      const brief = buildPromptBriefFromCurrent({ label: 'x', hints: 'x' });
      assert.equal(brief.model, 'sdxl');
      assert.equal(brief.detailLevel, 'balanced');
    });

    it('drops a blank negativePrompt/notes to undefined, and trims a non-blank one', () => {
      const blank = buildPromptBriefFromCurrent({ label: 'x', hints: 'x', negativePrompt: '   ' });
      assert.equal(blank.negativePrompt, undefined);
      const filled = buildPromptBriefFromCurrent({ label: 'x', hints: 'x', negativePrompt: ' blurry ' });
      assert.equal(filled.negativePrompt, 'blurry');
    });

    it('carries characterDescriptor and workflowFileId/workflowPresetId fallback from shared settings', () => {
      sharedSettings = {
        model: 'sdxl',
        activeCharacterDescriptor: '  a hero  ',
        selectedWorkflowPresetId: 'preset-1',
      };
      const brief = buildPromptBriefFromCurrent({ label: 'x', hints: 'x' });
      assert.equal(brief.characterDescriptor, 'a hero');
      assert.equal(brief.workflowFileId, 'preset-1');
    });

    it('prefers selectedWorkflowFileId over selectedWorkflowPresetId when both are set', () => {
      sharedSettings = {
        selectedWorkflowFileId: 'file-1',
        selectedWorkflowPresetId: 'preset-1',
      };
      const brief = buildPromptBriefFromCurrent({ label: 'x', hints: 'x' });
      assert.equal(brief.workflowFileId, 'file-1');
    });

    it('omits comfyUiUrl when comfy settings has no apiUrl', () => {
      comfySettings = {};
      const brief = buildPromptBriefFromCurrent({ label: 'x', hints: 'x' });
      assert.equal(brief.comfyUiUrl, undefined);
    });
  });

  describe('applyPromptBrief', () => {
    function brief(overrides: Partial<ReturnType<typeof buildPromptBriefFromCurrent>> = {}) {
      return {
        version: 1 as const,
        label: 'x',
        createdAt: Date.now(),
        hints: 'x',
        model: 'flux-2-klein',
        detailLevel: 'detailed',
        ...overrides,
      };
    }

    it('is a no-op without window', () => {
      applyPromptBrief(brief());
      assert.equal(saveSharedSettings.mock.calls.length, 0);
    });

    it('saves model/detail/characterDescriptor/workflowFileId into shared settings and clears the preset id', () => {
      Object.defineProperty(globalThis, 'window', { configurable: true, value: {} });
      try {
        applyPromptBrief(brief({ characterDescriptor: 'a hero', workflowFileId: 'file-9' }));
        assert.equal(saveSharedSettings.mock.calls.length, 1);
        const saved = saveSharedSettings.mock.calls[0]!.arguments[0] as Record<string, unknown>;
        assert.equal(saved.model, 'flux-2-klein');
        assert.equal(saved.detail, 'detailed');
        assert.equal(saved.activeCharacterDescriptor, 'a hero');
        assert.equal(saved.selectedWorkflowFileId, 'file-9');
        assert.equal(saved.selectedWorkflowPresetId, undefined);
      } finally {
        delete (globalThis as { window?: unknown }).window;
      }
    });

    it('saves comfyUiUrl into comfy settings only when given', () => {
      Object.defineProperty(globalThis, 'window', { configurable: true, value: {} });
      try {
        applyPromptBrief(brief());
        assert.equal(saveComfyUiSettings.mock.calls.length, 0);
        applyPromptBrief(brief({ comfyUiUrl: 'http://example.com:8188' }));
        assert.equal(saveComfyUiSettings.mock.calls.length, 1);
        assert.equal(
          (saveComfyUiSettings.mock.calls[0]!.arguments[0] as { apiUrl: string }).apiUrl,
          'http://example.com:8188'
        );
      } finally {
        delete (globalThis as { window?: unknown }).window;
      }
    });

    it('sets the active project only when projectId is given', () => {
      Object.defineProperty(globalThis, 'window', { configurable: true, value: {} });
      try {
        applyPromptBrief(brief());
        assert.equal(setActiveProjectId.mock.calls.length, 0);
        applyPromptBrief(brief({ projectId: 'proj-7' }));
        assert.deepEqual(setActiveProjectId.mock.calls[0]!.arguments, ['proj-7']);
      } finally {
        delete (globalThis as { window?: unknown }).window;
      }
    });
  });

  describe('downloadPromptBrief', () => {
    it('slugifies the label into a safe filename and serializes the brief as JSON', () => {
      downloadPromptBrief({
        version: 1,
        label: 'My "Cool" Brief!!',
        createdAt: 0,
        hints: 'x',
        model: 'sdxl',
        detailLevel: 'balanced',
      });
      const [content, filename, mime] = downloadTextFile.mock.calls[0]!.arguments as [
        string,
        string,
        string,
      ];
      assert.equal(filename, 'My-Cool-Brief-.json');
      assert.equal(mime, 'application/json');
      assert.equal(JSON.parse(content).label, 'My "Cool" Brief!!');
    });

    it('falls back to "prompt-brief.json" when the label is empty', () => {
      downloadPromptBrief({
        version: 1,
        label: '',
        createdAt: 0,
        hints: 'x',
        model: 'sdxl',
        detailLevel: 'balanced',
      });
      const [, filename] = downloadTextFile.mock.calls[0]!.arguments as [string, string, string];
      assert.equal(filename, 'prompt-brief.json');
    });
  });

  describe('parsePromptBriefFile', () => {
    it('parses a valid brief JSON string', () => {
      const raw = JSON.stringify({ version: 1, hints: 'a scene', label: 'x' });
      const parsed = parsePromptBriefFile(raw);
      assert.equal(parsed.hints, 'a scene');
    });

    it('throws for a wrong version', () => {
      assert.throws(
        () => parsePromptBriefFile(JSON.stringify({ version: 2, hints: 'x' })),
        /Invalid prompt brief file/
      );
    });

    it('throws for missing/blank hints', () => {
      assert.throws(
        () => parsePromptBriefFile(JSON.stringify({ version: 1, hints: '   ' })),
        /Invalid prompt brief file/
      );
    });

    it('throws for malformed JSON', () => {
      assert.throws(() => parsePromptBriefFile('{not json'));
    });
  });
});
