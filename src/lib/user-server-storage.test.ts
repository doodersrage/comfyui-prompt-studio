import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

let serverStorageEnabled = true;
const isServerStorageEnabled = mock.fn(() => serverStorageEnabled);
mock.module('./server-storage', { namedExports: { isServerStorageEnabled } });

const countNamespaceGallery = mock.fn((_userId?: string) => 9);
const readNamespaceStorage = mock.fn((_namespace: string, _userId?: string) => ({ read: true }));
const writeNamespaceStorage = mock.fn(
  (_namespace: string, _data: unknown, _userId?: string) => undefined
);
mock.module('./sqlite/namespace-storage', {
  namedExports: { countNamespaceGallery, readNamespaceStorage, writeNamespaceStorage },
});

function withEnv(key: string, value: string | undefined, fn: () => void): void {
  const original = process.env[key];
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
  try {
    fn();
  } finally {
    if (original === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = original;
    }
  }
}

afterEach(() => {
  serverStorageEnabled = true;
  isServerStorageEnabled.mock.resetCalls();
  countNamespaceGallery.mock.resetCalls();
  readNamespaceStorage.mock.resetCalls();
  writeNamespaceStorage.mock.resetCalls();
});

describe('user-server-storage', async () => {
  const {
    readUserServerStorage,
    writeUserServerStorage,
    countUserGalleryEntries,
    listUserExportFiles,
    writeUserExportSnapshot,
    isUserStorageNamespace,
    USER_STORAGE_NAMESPACES,
  } = await import('./user-server-storage');

  describe('readUserServerStorage', () => {
    it('returns null without reading when storage is disabled', () => {
      serverStorageEnabled = false;
      const result = readUserServerStorage('u1', 'prompt-history');
      assert.equal(result, null);
      assert.equal(readNamespaceStorage.mock.calls.length, 0);
    });

    it('delegates to readNamespaceStorage(namespace, userId) when enabled', () => {
      const result = readUserServerStorage('u1', 'prompt-history');
      assert.deepEqual(result, { read: true });
      assert.deepEqual(readNamespaceStorage.mock.calls[0]!.arguments, ['prompt-history', 'u1']);
    });
  });

  describe('writeUserServerStorage', () => {
    it('throws when storage is disabled', () => {
      serverStorageEnabled = false;
      assert.throws(
        () => writeUserServerStorage('u1', 'prompt-history', { a: 1 }),
        /Server storage is disabled/
      );
      assert.equal(writeNamespaceStorage.mock.calls.length, 0);
    });

    it('delegates to writeNamespaceStorage(namespace, data, userId) when enabled', () => {
      writeUserServerStorage('u1', 'prompt-history', { a: 1 });
      assert.deepEqual(writeNamespaceStorage.mock.calls[0]!.arguments, [
        'prompt-history',
        { a: 1 },
        'u1',
      ]);
    });
  });

  describe('countUserGalleryEntries', () => {
    it('returns 0 without counting when storage is disabled', () => {
      serverStorageEnabled = false;
      assert.equal(countUserGalleryEntries('u1'), 0);
      assert.equal(countNamespaceGallery.mock.calls.length, 0);
    });

    it('delegates to countNamespaceGallery(userId) when enabled', () => {
      assert.equal(countUserGalleryEntries('u1'), 9);
      assert.deepEqual(countNamespaceGallery.mock.calls[0]!.arguments, ['u1']);
    });
  });

  describe('listUserExportFiles', () => {
    it('returns [] without touching disk when storage is disabled', () => {
      serverStorageEnabled = false;
      assert.deepEqual(listUserExportFiles('u1'), []);
    });

    it('returns [] when the export directory does not exist yet', () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompt-studio-user-export-'));
      try {
        withEnv('PROMPT_DATA_DIR', dir, () => {
          assert.deepEqual(listUserExportFiles('brand-new-user'), []);
        });
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    });

    it('lists only .json files in the user export directory', () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompt-studio-user-export-'));
      try {
        withEnv('PROMPT_DATA_DIR', dir, () => {
          const exportsDir = path.join(dir, 'users', 'u1', 'exports');
          fs.mkdirSync(exportsDir, { recursive: true });
          fs.writeFileSync(path.join(exportsDir, 'a.json'), '{}');
          fs.writeFileSync(path.join(exportsDir, 'b.json'), '{}');
          fs.writeFileSync(path.join(exportsDir, 'readme.txt'), 'not json');
          const files = listUserExportFiles('u1');
          assert.deepEqual([...files].sort(), ['a.json', 'b.json']);
        });
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    });

    it('sanitizes the user id into a safe directory name', () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompt-studio-user-export-'));
      try {
        withEnv('PROMPT_DATA_DIR', dir, () => {
          const exportsDir = path.join(dir, 'users', 'weird_user_id_', 'exports');
          fs.mkdirSync(exportsDir, { recursive: true });
          fs.writeFileSync(path.join(exportsDir, 'x.json'), '{}');
          const files = listUserExportFiles('weird/user:id!');
          assert.deepEqual(files, ['x.json']);
        });
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    });
  });

  describe('writeUserExportSnapshot', () => {
    it('throws when PROMPT_DATA_DIR is not configured', () => {
      withEnv('PROMPT_DATA_DIR', undefined, () => {
        assert.throws(
          () => writeUserExportSnapshot('u1', 'alice', { a: 1 }),
          /PROMPT_DATA_DIR is not configured/
        );
      });
    });

    it('writes a timestamped JSON snapshot file and returns its filename, regardless of isServerStorageEnabled', () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompt-studio-user-export-'));
      try {
        withEnv('PROMPT_DATA_DIR', dir, () => {
          serverStorageEnabled = false; // writeUserExportSnapshot does not gate on this at all.
          const filename = writeUserExportSnapshot('u1', 'alice', { exportedAt: 1, a: 1 });
          assert.match(filename, /^[\d-TZ]+-alice\.json$/);

          const filePath = path.join(dir, 'users', 'u1', 'exports', filename);
          const written = JSON.parse(fs.readFileSync(filePath, 'utf8')) as Record<string, unknown>;
          assert.equal(written.exportedAt, 1);
          assert.equal(written.a, 1);
        });
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    });

    it('sanitizes userId and username into a safe path/filename', () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompt-studio-user-export-'));
      try {
        withEnv('PROMPT_DATA_DIR', dir, () => {
          const filename = writeUserExportSnapshot('weird/id', 'weird name!', { a: 1 });
          const filePath = path.join(dir, 'users', 'weird_id', 'exports', filename);
          assert.ok(fs.existsSync(filePath));
          assert.ok(filename.includes('weird_name_'));
        });
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    });
  });

  describe('isUserStorageNamespace', () => {
    it('is true for every namespace in USER_STORAGE_NAMESPACES', () => {
      for (const namespace of USER_STORAGE_NAMESPACES) {
        assert.equal(isUserStorageNamespace(namespace), true);
      }
    });

    it('is false for a server-only namespace outside the sync set', () => {
      assert.equal(isUserStorageNamespace('scheduled-batch' as never), false);
    });
  });
});
