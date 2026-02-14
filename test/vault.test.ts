import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ObsidianParser } from '../src/services/ObsidianParser.js';
import { VaultDiscovery } from '../src/services/VaultDiscovery.js';
import { mkdtemp, writeFile, mkdir, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

describe('ObsidianParser', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'sb-test-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true });
  });

  it('parses daily notes config', async () => {
    const obsidianDir = join(tempDir, '.obsidian');
    await mkdir(obsidianDir, { recursive: true });
    await writeFile(
      join(obsidianDir, 'daily-notes.json'),
      JSON.stringify({ folder: 'Fleeting', template: 'Templates/daily' })
    );

    const parser = new ObsidianParser(tempDir);
    const config = await parser.load();

    expect(config.dailyNotes).toBeDefined();
    expect(config.dailyNotes?.folder).toBe('Fleeting');
    expect(config.dailyNotes?.template).toBe('Templates/daily');
  });

  it('returns defaults when .obsidian missing', async () => {
    const parser = new ObsidianParser(tempDir);
    const config = await parser.load();

    expect(config.dailyNotes).toBeUndefined();
    expect(config.templates).toBeUndefined();
  });

  it('parses zk-prefixer config', async () => {
    const obsidianDir = join(tempDir, '.obsidian');
    await mkdir(obsidianDir, { recursive: true });
    await writeFile(
      join(obsidianDir, 'zk-prefixer.json'),
      JSON.stringify({ folder: 'Inbox' })
    );

    const parser = new ObsidianParser(tempDir);
    const config = await parser.load();

    expect(config.zkPrefixer).toBeDefined();
    expect(config.zkPrefixer?.folder).toBe('Inbox');
    expect(config.inbox).toBe('Inbox');
  });

  it('derives inbox from app config when zk-prefixer absent', async () => {
    const obsidianDir = join(tempDir, '.obsidian');
    await mkdir(obsidianDir, { recursive: true });
    await writeFile(
      join(obsidianDir, 'app.json'),
      JSON.stringify({ newFileFolderPath: 'Incoming' })
    );

    const parser = new ObsidianParser(tempDir);
    const config = await parser.load();

    expect(config.inbox).toBe('Incoming');
  });
});

describe('VaultDiscovery', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'sb-test-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true });
  });

  it('discovers PARA folders', async () => {
    await mkdir(join(tempDir, 'Areas', 'Health'), { recursive: true });
    await mkdir(join(tempDir, 'Resources', 'Tools'), { recursive: true });
    await mkdir(join(tempDir, 'Projects', 'MyProject'), { recursive: true });

    const discovery = new VaultDiscovery(tempDir);
    const structure = await discovery.discover();

    expect(structure.destinations.length).toBeGreaterThanOrEqual(3);
    expect(structure.destinations.some(d => d.type === 'area')).toBe(true);
    expect(structure.destinations.some(d => d.type === 'resource')).toBe(true);
    expect(structure.destinations.some(d => d.type === 'project')).toBe(true);
  });

  it('ignores hidden directories', async () => {
    await mkdir(join(tempDir, '.obsidian'), { recursive: true });
    await mkdir(join(tempDir, 'Areas', 'Health'), { recursive: true });

    const discovery = new VaultDiscovery(tempDir);
    const structure = await discovery.discover();

    expect(structure.destinations.every(d => !d.path.includes('.obsidian'))).toBe(true);
  });

  it('returns empty for vault with no PARA folders', async () => {
    await mkdir(join(tempDir, 'Random'), { recursive: true });

    const discovery = new VaultDiscovery(tempDir);
    const structure = await discovery.discover();

    expect(structure.destinations).toHaveLength(0);
  });
});
