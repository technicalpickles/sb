import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { NoteBuilder } from '../src/services/NoteBuilder.js';
import { NoteAnalyzer } from '../src/services/NoteAnalyzer.js';
import { DailyNoteManager } from '../src/services/DailyNoteManager.js';
import { mkdtemp, mkdir, rename, readFile, readdir, stat, writeFile, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

describe('Full insight workflow', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'sb-test-'));
    await mkdir(join(tempDir, 'Inbox'), { recursive: true });
    await mkdir(join(tempDir, 'Resources', 'Tools'), { recursive: true });
    await mkdir(join(tempDir, 'Areas', 'Health'), { recursive: true });
    await mkdir(join(tempDir, 'Fleeting'), { recursive: true });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true });
  });

  it('create -> context -> move -> link daily', async () => {
    // 1. Create note
    const builder = new NoteBuilder({
      title: 'Redis caching insight',
      content: 'Redis is great for session caching',
    });
    const created = await builder.create(tempDir, 'Inbox');

    // Verify note exists in Inbox
    const inboxFiles = await readdir(join(tempDir, 'Inbox'));
    expect(inboxFiles).toContain(created.filename);

    // 2. Get context (agent would use this to decide)
    const analyzer = new NoteAnalyzer(tempDir);
    const context = await analyzer.buildContext(`Inbox/${created.filename}`);
    expect(context.note.title).toBe('Redis caching insight');
    expect(context.destinations.length).toBeGreaterThan(0);

    // 3. Move note (simulating agent decision)
    const from = join(tempDir, 'Inbox', created.filename);
    const to = join(tempDir, 'Resources', 'Tools', created.filename);
    await rename(from, to);

    // Verify file moved
    await expect(stat(from)).rejects.toThrow();
    await expect(stat(to)).resolves.toBeDefined();

    // 4. Link to daily
    const dailyPath = join(tempDir, 'Fleeting', '2026-02-14.md');
    await writeFile(dailyPath, '# 2026-02-14\n\n## Links\n\n');

    const manager = new DailyNoteManager(tempDir, { dailyNotes: { folder: 'Fleeting' } });
    const noteName = created.filename.replace(/\.md$/, '');
    await manager.appendToSection(
      dailyPath,
      '## Links',
      `- [[${noteName}]] - Redis caching insight`
    );

    const dailyContent = await readFile(dailyPath, 'utf-8');
    expect(dailyContent).toContain('[[');
    expect(dailyContent).toContain('Redis caching insight');
  });

  it('create with provenance -> context shows source', async () => {
    const builder = new NoteBuilder({
      title: 'API design pattern',
      content: 'REST vs GraphQL considerations',
      source: 'conversation:repo=my-app,branch=main,commit=abc123',
    });
    const created = await builder.create(tempDir, 'Inbox');

    const analyzer = new NoteAnalyzer(tempDir);
    const context = await analyzer.buildContext(`Inbox/${created.filename}`);

    expect(context.note.frontmatter.source).toBe('claude-conversation');
    expect(context.note.frontmatter.repo).toBe('my-app');
    expect(context.note.frontmatter.commit).toBe('abc123');
  });

  it('context finds related notes across destinations', async () => {
    // Seed existing notes
    await writeFile(
      join(tempDir, 'Resources', 'Tools', '202601010000 redis-guide.md'),
      '# Redis Guide\n\nComprehensive Redis guide.'
    );
    await writeFile(
      join(tempDir, 'Areas', 'Health', '202601010000 sleep-tracking.md'),
      '# Sleep Tracking\n\nTracking sleep patterns.'
    );

    // Create a new note about Redis
    const builder = new NoteBuilder({
      title: 'Redis TTL patterns',
      content: 'Using TTL for cache expiration in Redis',
    });
    const created = await builder.create(tempDir, 'Inbox');

    const analyzer = new NoteAnalyzer(tempDir);
    const context = await analyzer.buildContext(`Inbox/${created.filename}`);

    // Should find redis-guide in Resources/Tools
    const toolsDest = context.destinations.find(d => d.path.includes('Tools'));
    expect(toolsDest).toBeDefined();
    expect(toolsDest!.relatedNotes.some(n => n.name.includes('redis'))).toBe(true);

    // Should NOT find sleep-tracking as related
    const healthDest = context.destinations.find(d => d.path.includes('Health'));
    expect(healthDest).toBeDefined();
    expect(healthDest!.relatedNotes.some(n => n.name.includes('redis'))).toBe(false);
  });
});
