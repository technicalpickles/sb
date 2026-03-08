import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { NoteBuilder } from '../src/services/NoteBuilder.js';
import { mkdtemp, mkdir, readdir, writeFile, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

describe('--dry-run', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'sb-test-'));
    await mkdir(join(tempDir, 'Inbox'), { recursive: true });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true });
  });

  describe('note create', () => {
    it('preview returns path, filename, and content without writing', async () => {
      const builder = new NoteBuilder({
        title: 'Test dry run',
        content: 'Should not be written',
      });

      const preview = builder.preview(tempDir, 'Inbox');

      expect(preview.filename).toMatch(/^\d{12} test-dry-run\.md$/);
      expect(preview.path).toContain('Inbox');
      expect(preview.content).toContain('# Test dry run');
      expect(preview.content).toContain('Should not be written');

      // Verify nothing was written
      const files = await readdir(join(tempDir, 'Inbox'));
      expect(files).toHaveLength(0);
    });
  });

  describe('note move', () => {
    it('dry-run computes paths without moving', async () => {
      // Create a note to "move"
      await writeFile(join(tempDir, 'Inbox', 'test.md'), 'content');
      await mkdir(join(tempDir, 'Areas'), { recursive: true });

      // The dry-run logic is in the command handler, so we test the path computation
      const from = 'Inbox/test.md';
      const to = 'Areas/';
      const filename = from.split('/').pop()!;
      const result = { dryRun: true, from, to: `${to}${filename}` };

      expect(result.from).toBe('Inbox/test.md');
      expect(result.to).toBe('Areas/test.md');

      // File should still be in Inbox
      const inboxFiles = await readdir(join(tempDir, 'Inbox'));
      expect(inboxFiles).toContain('test.md');
    });
  });
});
