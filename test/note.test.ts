import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { NoteBuilder } from '../src/services/NoteBuilder.js';
import { mkdtemp, mkdir, readdir, readFile, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

describe('NoteBuilder', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'sb-test-'));
    await mkdir(join(tempDir, 'Inbox'), { recursive: true });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true });
  });

  it('creates note with Zettelkasten filename', async () => {
    const builder = new NoteBuilder({
      title: 'Redis over memcached',
      content: 'Redis is better for TTL',
    });

    const result = await builder.create(tempDir, 'Inbox');

    const files = await readdir(join(tempDir, 'Inbox'));
    expect(files).toHaveLength(1);
    expect(files[0]).toMatch(/^\d{12} redis-over-memcached\.md$/);
    expect(result.filename).toBe(files[0]);
  });

  it('includes frontmatter with provenance', async () => {
    const builder = new NoteBuilder({
      title: 'Test note',
      content: 'Content here',
      source: 'conversation:repo=myrepo,branch=main',
    });

    const result = await builder.create(tempDir, 'Inbox');
    const content = await readFile(result.path, 'utf-8');

    expect(content).toContain('---\n');
    expect(content).toContain('captured:');
    expect(content).toContain('source: claude-conversation');
    expect(content).toContain('repo: myrepo');
  });

  it('uses manual source when no source provided', async () => {
    const builder = new NoteBuilder({
      title: 'Manual note',
      content: 'Some content',
    });

    const result = await builder.create(tempDir, 'Inbox');
    const content = await readFile(result.path, 'utf-8');

    expect(content).toContain('source: manual');
  });

  it('strips non-alphanumeric characters from slug', async () => {
    const builder = new NoteBuilder({
      title: "What's the deal with Redis?",
      content: 'Content',
    });

    const result = await builder.create(tempDir, 'Inbox');

    expect(result.filename).toMatch(/whats-the-deal-with-redis\.md$/);
  });

  it('includes title as heading in note body', async () => {
    const builder = new NoteBuilder({
      title: 'My Great Insight',
      content: 'The insight content',
    });

    const result = await builder.create(tempDir, 'Inbox');
    const content = await readFile(result.path, 'utf-8');

    expect(content).toContain('# My Great Insight');
    expect(content).toContain('The insight content');
  });
});
