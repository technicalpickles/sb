import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, readdir, readFile, writeFile, stat, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { ConfigManager, type Vault } from '../src/services/ConfigManager.js';
import { resolveVault, vaultInfo, vaultObsidian, vaultStructure } from '../src/core/vault.js';
import {
  noteCreate,
  noteCreatePreview,
  noteList,
  noteMove,
  noteMovePreview,
  noteRead,
  noteContext,
} from '../src/core/note.js';
import { dailyPath, dailyAppend, dailyAppendPreview } from '../src/core/daily.js';
import { inboxList } from '../src/core/inbox.js';
import { VaultNotFoundError, NotFoundError } from '../src/core/errors.js';
import { PathValidationError } from '../src/utils/validation.js';

// Phase 0 acceptance: the command logic is callable from a test without spawning
// a process or writing to stdout. These exercise the extracted core functions.
describe('core functions (no process, no stdout)', () => {
  let tempDir: string;
  let vault: Vault;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'sb-core-'));
    await mkdir(join(tempDir, 'Inbox'), { recursive: true });
    await mkdir(join(tempDir, 'Resources', 'Tools'), { recursive: true });
    await mkdir(join(tempDir, 'Daily'), { recursive: true });
    vault = { name: 'test', path: tempDir };
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true });
  });

  describe('note', () => {
    it('noteCreate writes a Zettelkasten note to the inbox', async () => {
      const result = await noteCreate(vault, { title: 'Redis caching', content: 'TTL is great' });
      expect(result.filename).toMatch(/^\d{12} redis-caching\.md$/);
      const files = await readdir(join(tempDir, 'Inbox'));
      expect(files).toContain(result.filename);
    });

    it('noteCreatePreview returns content without writing', async () => {
      const preview = await noteCreatePreview(vault, { title: 'Dry note', content: 'nope' });
      expect(preview.content).toContain('# Dry note');
      const files = await readdir(join(tempDir, 'Inbox'));
      expect(files).toHaveLength(0);
    });

    it('noteRead parses a created note', async () => {
      const created = await noteCreate(vault, { title: 'Parse me', content: 'Body text' });
      const read = await noteRead(vault, { note: `Inbox/${created.filename}` });
      expect(read.title).toBe('Parse me');
      expect(read.content).toContain('Body text');
      expect(read.frontmatter?.source).toBe('manual');
    });

    it('noteRead throws NotFoundError for a missing note', async () => {
      await expect(noteRead(vault, { note: 'Inbox/missing.md' })).rejects.toBeInstanceOf(NotFoundError);
    });

    it('noteRead rejects traversal paths', async () => {
      await expect(noteRead(vault, { note: '../escape.md' })).rejects.toBeInstanceOf(PathValidationError);
    });

    it('noteList returns vault-wide entries', async () => {
      await noteCreate(vault, { title: 'Listed note', content: 'x' });
      const list = await noteList(vault, {});
      expect(list.some(n => n.title === 'listed-note' || n.title.includes('listed-note'))).toBe(true);
    });

    it('noteMovePreview computes paths without moving; noteMove performs it', async () => {
      const created = await noteCreate(vault, { title: 'Move me', content: 'x' });
      const from = `Inbox/${created.filename}`;
      const to = 'Resources/Tools/';

      const preview = noteMovePreview(vault, { from, to });
      expect(preview.to).toBe(`Resources/Tools/${created.filename}`);
      // still in inbox after preview
      expect(await readdir(join(tempDir, 'Inbox'))).toContain(created.filename);

      await noteMove(vault, { from, to });
      await expect(stat(join(tempDir, 'Inbox', created.filename))).rejects.toThrow();
      await expect(stat(join(tempDir, 'Resources', 'Tools', created.filename))).resolves.toBeDefined();
    });

    it('noteMove rejects traversal on either path', async () => {
      expect(() => noteMovePreview(vault, { from: '../x.md', to: 'Inbox/' })).toThrow(PathValidationError);
      expect(() => noteMovePreview(vault, { from: 'Inbox/x.md', to: '../out/' })).toThrow(PathValidationError);
    });

    it('noteContext returns routing context for a note', async () => {
      const created = await noteCreate(vault, { title: 'Redis TTL patterns', content: 'cache expiration' });
      const ctx = await noteContext(vault, { note: `Inbox/${created.filename}` });
      expect(ctx.note.title).toBe('Redis TTL patterns');
      expect(Array.isArray(ctx.destinations)).toBe(true);
    });
  });

  describe('daily', () => {
    it('dailyPath points at today under the Daily folder', async () => {
      const p = await dailyPath(vault);
      expect(p).toContain(join(tempDir, 'Daily'));
      expect(p).toMatch(/\d{4}-\d{2}-\d{2}\.md$/);
    });

    it('dailyAppendPreview does not write; dailyAppend does', async () => {
      const p = await dailyPath(vault);
      await writeFile(p, '# Today\n\n## Links\n\n');

      const preview = await dailyAppendPreview(vault, { section: '## Links', content: '- [[note]]' });
      expect(preview.content).toBe('- [[note]]');
      expect(await readFile(p, 'utf-8')).not.toContain('[[note]]');

      const result = await dailyAppend(vault, { section: '## Links', content: '- [[note]]' });
      expect(result.section).toBe('## Links');
      expect(await readFile(p, 'utf-8')).toContain('[[note]]');
    });
  });

  describe('inbox', () => {
    it('inboxList lists inbox notes', async () => {
      const created = await noteCreate(vault, { title: 'Inbox note', content: 'x' });
      const list = await inboxList(vault, {});
      expect(list.some(e => e.filename === created.filename)).toBe(true);
    });

    it('inboxList throws NotFoundError when the inbox folder is missing', async () => {
      await rm(join(tempDir, 'Inbox'), { recursive: true });
      await expect(inboxList(vault, {})).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  describe('vault', () => {
    it('vaultInfo returns the resolved vault', () => {
      expect(vaultInfo(vault)).toEqual(vault);
    });

    it('vaultObsidian defaults gracefully without an .obsidian dir', async () => {
      const cfg = await vaultObsidian(vault);
      expect(cfg).toBeDefined();
    });

    it('vaultStructure discovers PARA destinations', async () => {
      const structure = await vaultStructure(vault);
      expect(structure.destinations.some(d => d.path.includes('Resources'))).toBe(true);
    });
  });

  describe('resolveVault', () => {
    it('resolves the default vault and rejects unknown names', async () => {
      const home = await mkdtemp(join(tmpdir(), 'sb-home-'));
      try {
        await mkdir(join(home, '.claude'), { recursive: true });
        await writeFile(
          join(home, '.claude', 'second-brain.md'),
          `## Vaults\n\n- primary: ${tempDir}\n\nDefault: primary\n`,
        );
        const mgr = new ConfigManager(home);

        const resolved = await resolveVault(undefined, mgr);
        expect(resolved.name).toBe('primary');
        expect(resolved.path).toBe(tempDir);

        await expect(resolveVault('nope', mgr)).rejects.toBeInstanceOf(VaultNotFoundError);
      } finally {
        await rm(home, { recursive: true });
      }
    });
  });
});
