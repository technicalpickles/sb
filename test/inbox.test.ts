import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir, homedir } from 'os';
import { ConfigManager } from '../src/services/ConfigManager.js';
import { ObsidianParser } from '../src/services/ObsidianParser.js';
import { readdir, readFile } from 'fs/promises';
import { parseFrontmatter } from '../src/utils/markdown.js';

// Test the inbox listing logic directly (same as command handler)
async function listInbox(vaultPath: string, detail: boolean = false) {
  const parser = new ObsidianParser(vaultPath);
  const obsConfig = await parser.load();
  const inboxFolder = obsConfig.inbox ?? 'Inbox';
  const inboxPath = join(vaultPath, inboxFolder);

  const entries = await readdir(inboxPath);
  const mdFiles = entries.filter(e => e.endsWith('.md')).sort();

  if (detail) {
    return Promise.all(mdFiles.map(async (filename) => {
      const match = filename.match(/^(\d{12})\s+(.+)\.md$/);
      const content = await readFile(join(inboxPath, filename), 'utf-8');
      const { frontmatter } = parseFrontmatter(content);
      return {
        filename,
        timestamp: match?.[1] ?? '',
        title: match?.[2] ?? filename.replace(/\.md$/, ''),
        frontmatter,
      };
    }));
  }

  return mdFiles.map(filename => {
    const match = filename.match(/^(\d{12})\s+(.+)\.md$/);
    return {
      filename,
      timestamp: match?.[1] ?? '',
      title: match?.[2] ?? filename.replace(/\.md$/, ''),
    };
  });
}

describe('inbox list', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'sb-test-'));
    await mkdir(join(tempDir, '.obsidian'), { recursive: true });
    await writeFile(join(tempDir, '.obsidian', 'app.json'), JSON.stringify({
      newFileFolderPath: '📫 Inbox',
    }));
    await mkdir(join(tempDir, '📫 Inbox'), { recursive: true });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true });
  });

  it('returns empty array for empty inbox', async () => {
    const result = await listInbox(tempDir);
    expect(result).toEqual([]);
  });

  it('lists Zettelkasten notes with parsed timestamps', async () => {
    await writeFile(
      join(tempDir, '📫 Inbox', '202602141147 redis-caching.md'),
      '---\ncaptured: 2026-02-14\n---\n\n# Redis Caching\n\nContent here'
    );
    await writeFile(
      join(tempDir, '📫 Inbox', '202602141200 kafka-topics.md'),
      '---\ncaptured: 2026-02-14\n---\n\n# Kafka Topics\n\nMore content'
    );

    const result = await listInbox(tempDir);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      filename: '202602141147 redis-caching.md',
      timestamp: '202602141147',
      title: 'redis-caching',
    });
    expect(result[1]).toEqual({
      filename: '202602141200 kafka-topics.md',
      timestamp: '202602141200',
      title: 'kafka-topics',
    });
  });

  it('handles non-Zettelkasten filenames gracefully', async () => {
    await writeFile(
      join(tempDir, '📫 Inbox', 'random-note.md'),
      '# Random\n\nNo frontmatter'
    );

    const result = await listInbox(tempDir);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      filename: 'random-note.md',
      timestamp: '',
      title: 'random-note',
    });
  });

  it('includes frontmatter with --detail', async () => {
    await writeFile(
      join(tempDir, '📫 Inbox', '202602141147 test-note.md'),
      '---\ncaptured: 2026-02-14T11:47:00Z\nsource: claude-conversation\nrepo: my-service\n---\n\n# Test Note\n\nContent'
    );

    const result = await listInbox(tempDir, true);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      filename: '202602141147 test-note.md',
      timestamp: '202602141147',
      title: 'test-note',
      frontmatter: {
        captured: '2026-02-14T11:47:00Z',
        source: 'claude-conversation',
        repo: 'my-service',
      },
    });
  });

  it('returns empty frontmatter for notes without it', async () => {
    await writeFile(
      join(tempDir, '📫 Inbox', '202602141147 no-fm.md'),
      '# No Frontmatter\n\nJust content'
    );

    const result = await listInbox(tempDir, true);
    expect(result).toHaveLength(1);
    expect(result[0].frontmatter).toEqual({});
  });

  it('ignores non-md files', async () => {
    await writeFile(join(tempDir, '📫 Inbox', 'notes.txt'), 'not a note');
    await writeFile(
      join(tempDir, '📫 Inbox', '202602141147 real-note.md'),
      '# Real Note\n\nContent'
    );

    const result = await listInbox(tempDir);
    expect(result).toHaveLength(1);
    expect(result[0].filename).toBe('202602141147 real-note.md');
  });
});
