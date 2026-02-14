import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { NoteAnalyzer } from '../src/services/NoteAnalyzer.js';
import { mkdtemp, writeFile, mkdir, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

describe('NoteAnalyzer', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'sb-test-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true });
  });

  it('returns full routing context', async () => {
    await mkdir(join(tempDir, 'Inbox'), { recursive: true });
    await mkdir(join(tempDir, 'Resources', 'Tools'), { recursive: true });
    await mkdir(join(tempDir, 'Areas', 'Health'), { recursive: true });

    const notePath = join(tempDir, 'Inbox', '202602130000 test-note.md');
    await writeFile(notePath, [
      '---',
      'captured: 2026-02-13T00:00:00Z',
      'source: manual',
      '---',
      '',
      '# Redis Caching Patterns',
      '',
      'Redis is great for session caching and TTL management.',
    ].join('\n'));

    await writeFile(
      join(tempDir, 'Resources', 'Tools', '202601010000 redis-setup.md'),
      '# Redis Setup Guide\n\nHow to set up Redis.'
    );

    const analyzer = new NoteAnalyzer(tempDir);
    const context = await analyzer.buildContext('Inbox/202602130000 test-note.md');

    expect(context.note.title).toBe('Redis Caching Patterns');
    expect(context.note.keywords.length).toBeGreaterThan(0);
    expect(context.destinations.length).toBeGreaterThan(0);
    expect(context.destinations.some(d => d.type === 'resource')).toBe(true);
  });

  it('extracts keywords from title and content', async () => {
    await mkdir(join(tempDir, 'Inbox'), { recursive: true });
    const notePath = join(tempDir, 'Inbox', '202602130000 test.md');
    await writeFile(notePath, '# TypeScript Testing Patterns\n\nUsing Vitest for unit tests.');

    const analyzer = new NoteAnalyzer(tempDir);
    const context = await analyzer.buildContext('Inbox/202602130000 test.md');

    expect(context.note.keywords).toContain('typescript');
    expect(context.note.keywords).toContain('testing');
  });

  it('finds related notes by keyword match', async () => {
    await mkdir(join(tempDir, 'Inbox'), { recursive: true });
    await mkdir(join(tempDir, 'Resources', 'Tools'), { recursive: true });

    await writeFile(
      join(tempDir, 'Inbox', '202602140000 redis-caching.md'),
      '# Redis Caching\n\nContent about Redis.'
    );
    await writeFile(
      join(tempDir, 'Resources', 'Tools', '202601010000 redis-setup.md'),
      '# Redis Setup\n\nSetup guide.'
    );

    const analyzer = new NoteAnalyzer(tempDir);
    const context = await analyzer.buildContext('Inbox/202602140000 redis-caching.md');

    const toolsDest = context.destinations.find(d => d.path.includes('Tools'));
    expect(toolsDest?.relatedNotes.length).toBeGreaterThan(0);
    expect(toolsDest?.relatedNotes[0].name).toContain('redis');
  });

  it('parses frontmatter correctly', async () => {
    await mkdir(join(tempDir, 'Inbox'), { recursive: true });
    const notePath = join(tempDir, 'Inbox', '202602130000 test.md');
    await writeFile(notePath, [
      '---',
      'captured: 2026-02-13T00:00:00Z',
      'source: claude-conversation',
      'repo: myrepo',
      '---',
      '',
      '# Test Note',
      '',
      'Content.',
    ].join('\n'));

    const analyzer = new NoteAnalyzer(tempDir);
    const context = await analyzer.buildContext('Inbox/202602130000 test.md');

    expect(context.note.frontmatter.source).toBe('claude-conversation');
    expect(context.note.frontmatter.repo).toBe('myrepo');
  });

  it('handles notes without frontmatter', async () => {
    await mkdir(join(tempDir, 'Inbox'), { recursive: true });
    const notePath = join(tempDir, 'Inbox', '202602130000 test.md');
    await writeFile(notePath, '# Simple Note\n\nJust content.');

    const analyzer = new NoteAnalyzer(tempDir);
    const context = await analyzer.buildContext('Inbox/202602130000 test.md');

    expect(context.note.title).toBe('Simple Note');
    expect(context.note.frontmatter).toEqual({});
  });
});
