import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DailyNoteManager } from '../src/services/DailyNoteManager.js';
import { ObsidianParser } from '../src/services/ObsidianParser.js';
import { mkdtemp, writeFile, mkdir, readFile, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

describe('DailyNoteManager', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'sb-test-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true });
  });

  it('computes daily path from obsidian config', async () => {
    const obsidianDir = join(tempDir, '.obsidian');
    await mkdir(obsidianDir, { recursive: true });
    await writeFile(
      join(obsidianDir, 'daily-notes.json'),
      JSON.stringify({ folder: 'Fleeting' })
    );

    const parser = new ObsidianParser(tempDir);
    const config = await parser.load();
    const manager = new DailyNoteManager(tempDir, config);
    const path = manager.dailyPath();

    expect(path).toContain('Fleeting');
    expect(path).toMatch(/\d{4}-\d{2}-\d{2}\.md$/);
  });

  it('uses Daily as default folder', () => {
    const manager = new DailyNoteManager(tempDir, {});
    const path = manager.dailyPath();

    expect(path).toContain('Daily');
    expect(path).toMatch(/\d{4}-\d{2}-\d{2}\.md$/);
  });

  it('accepts a custom date', () => {
    const manager = new DailyNoteManager(tempDir, {});
    const path = manager.dailyPath(new Date(2026, 1, 14)); // Feb 14, 2026

    expect(path).toContain('2026-02-14.md');
  });

  it('appends content to existing section', async () => {
    const notePath = join(tempDir, '2026-02-14.md');
    await writeFile(notePath, [
      '# 2026-02-14',
      '',
      '## Notes',
      '',
      'Some notes here.',
      '',
      '## Links',
      '',
      '- [[existing-link]]',
      '',
      '## Tasks',
      '',
      '- [ ] Do something',
    ].join('\n'));

    const manager = new DailyNoteManager(tempDir, {});
    await manager.appendToSection(notePath, '## Links', '- [[new-note]] - Test description');

    const content = await readFile(notePath, 'utf-8');
    expect(content).toContain('[[new-note]]');
    expect(content).toContain('[[existing-link]]');
  });

  it('creates section if missing', async () => {
    const notePath = join(tempDir, '2026-02-14.md');
    await writeFile(notePath, '# 2026-02-14\n\n## Notes\n\nSome notes.');

    const manager = new DailyNoteManager(tempDir, {});
    await manager.appendToSection(notePath, '## Links', '- [[new-note]]');

    const content = await readFile(notePath, 'utf-8');
    expect(content).toContain('## Links');
    expect(content).toContain('[[new-note]]');
  });

  it('matches an existing heading when section is passed without the leading ##', async () => {
    const notePath = join(tempDir, '2026-02-14.md');
    await writeFile(notePath, [
      '# 2026-02-14',
      '',
      '## Notes',
      '',
      'Some notes here.',
      '',
      '## Links',
      '',
      '- [[existing-link]]',
      '',
      '## Tasks',
      '',
      '- [ ] Do something',
    ].join('\n'));

    const manager = new DailyNoteManager(tempDir, {});
    await manager.appendToSection(notePath, 'Notes', '- [[new-note]] - Test description');

    const content = await readFile(notePath, 'utf-8');
    const lines = content.split('\n');

    // Must land under the real "## Notes" heading, not as a stray "Notes" block at EOF.
    expect(lines.filter(l => l.trim() === 'Notes')).toHaveLength(0);
    const notesIdx = content.indexOf('## Notes');
    const linksIdx = content.indexOf('## Links');
    const newNoteIdx = content.indexOf('[[new-note]]');
    expect(notesIdx).toBeLessThan(newNoteIdx);
    expect(newNoteIdx).toBeLessThan(linksIdx);
  });

  it('creates a bare section name as a proper ## heading, not a stray text block', async () => {
    const notePath = join(tempDir, '2026-02-14.md');
    await writeFile(notePath, '# 2026-02-14\n\n## Notes\n\nSome notes.');

    const manager = new DailyNoteManager(tempDir, {});
    await manager.appendToSection(notePath, 'Links', '- [[new-note]]');

    const content = await readFile(notePath, 'utf-8');
    expect(content).toContain('## Links');
    expect(content).not.toMatch(/^Links$/m);
    expect(content).toContain('[[new-note]]');
  });

  it('preserves content order when appending to middle section', async () => {
    const notePath = join(tempDir, '2026-02-14.md');
    await writeFile(notePath, [
      '# 2026-02-14',
      '',
      '## Links',
      '',
      '- [[first-link]]',
      '',
      '## Tasks',
      '',
      '- [ ] Do something',
    ].join('\n'));

    const manager = new DailyNoteManager(tempDir, {});
    await manager.appendToSection(notePath, '## Links', '- [[second-link]]');

    const content = await readFile(notePath, 'utf-8');
    const linksIdx = content.indexOf('## Links');
    const tasksIdx = content.indexOf('## Tasks');
    const secondLinkIdx = content.indexOf('[[second-link]]');

    expect(linksIdx).toBeLessThan(secondLinkIdx);
    expect(secondLinkIdx).toBeLessThan(tasksIdx);
  });
});
