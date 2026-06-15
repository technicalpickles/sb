import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { NoteLister } from '../src/services/NoteLister.js';

describe('note list (NoteLister)', () => {
  let vault: string;

  beforeEach(async () => {
    vault = await mkdtemp(join(tmpdir(), 'sb-test-'));
    // .obsidian must be skipped, even though it contains .md-like junk
    await mkdir(join(vault, '.obsidian'), { recursive: true });
    await writeFile(join(vault, '.obsidian', 'app.json'), '{}');
    await writeFile(join(vault, '.obsidian', 'should-not-appear.md'), '# nope');

    await mkdir(join(vault, '📫 Inbox'), { recursive: true });
    await mkdir(join(vault, 'Areas', 'Productivity'), { recursive: true });
    await mkdir(join(vault, 'Resources', 'Tools'), { recursive: true });

    await writeFile(
      join(vault, '📫 Inbox', '202602141147 redis-caching.md'),
      '---\ncaptured: 2026-02-14\ntype: session-notes\n---\n\n# Redis Caching\n\nBody',
    );
    await writeFile(
      join(vault, 'Areas', 'Productivity', '202601200800 morning-routine.md'),
      '---\ncaptured: 2026-01-20\ntype: evergreen\n---\n\n# Morning Routine\n\nBody',
    );
    await writeFile(
      join(vault, 'Resources', 'Tools', '202601150930 redis-setup-guide.md'),
      '---\ncaptured: 2026-01-15\n---\n\n# Redis Setup Guide\n\nNo type frontmatter',
    );
    // a session-notes note in another folder, to prove --type is vault-wide
    await writeFile(
      join(vault, 'Areas', 'Productivity', '202603010900 standup-notes.md'),
      '---\ntype: session-notes\n---\n\n# Standup',
    );
  });

  afterEach(async () => {
    await rm(vault, { recursive: true });
  });

  it('lists notes vault-wide, skipping .obsidian and non-md files', async () => {
    const result = await new NoteLister(vault).list();
    const paths = result.map(r => r.path).sort();
    expect(paths).toEqual([
      'Areas/Productivity/202601200800 morning-routine.md',
      'Areas/Productivity/202603010900 standup-notes.md',
      'Resources/Tools/202601150930 redis-setup-guide.md',
      '📫 Inbox/202602141147 redis-caching.md',
    ].sort());
    // none from .obsidian
    expect(paths.some(p => p.includes('.obsidian'))).toBe(false);
  });

  it('parses Zettelkasten timestamp and title, includes basename filename', async () => {
    const result = await new NoteLister(vault).list();
    const redis = result.find(r => r.filename === '202602141147 redis-caching.md');
    expect(redis).toEqual({
      path: '📫 Inbox/202602141147 redis-caching.md',
      filename: '202602141147 redis-caching.md',
      timestamp: '202602141147',
      title: 'redis-caching',
    });
  });

  it('filters by frontmatter type, vault-wide', async () => {
    const result = await new NoteLister(vault).list({ type: 'session-notes' });
    const filenames = result.map(r => r.filename).sort();
    expect(filenames).toEqual([
      '202602141147 redis-caching.md',
      '202603010900 standup-notes.md',
    ]);
  });

  it('--type matching no notes returns empty array', async () => {
    const result = await new NoteLister(vault).list({ type: 'nonexistent' });
    expect(result).toEqual([]);
  });

  it('includes parsed frontmatter with detail', async () => {
    const result = await new NoteLister(vault).list({ detail: true, type: 'evergreen' });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      filename: '202601200800 morning-routine.md',
      frontmatter: { captured: '2026-01-20', type: 'evergreen' },
    });
  });

  it('returns empty array for a vault with no notes', async () => {
    const empty = await mkdtemp(join(tmpdir(), 'sb-test-empty-'));
    try {
      const result = await new NoteLister(empty).list();
      expect(result).toEqual([]);
    } finally {
      await rm(empty, { recursive: true });
    }
  });
});
