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

  it('discovers a Johnny Decimal category with no ID subfolders', async () => {
    const area = '60-69 Software & Engineering';
    const category = '67 Tools & developer experience';
    await mkdir(join(tempDir, area, category), { recursive: true });
    // A loose note sitting directly in the category, no ID subfolders.
    await writeFile(join(tempDir, area, category, 'some-tool.md'), '# note');

    const discovery = new VaultDiscovery(tempDir);
    const structure = await discovery.discover();

    const cat = structure.destinations.find(d => d.path === `${area}/${category}/`);
    expect(cat).toBeDefined();
    expect(cat?.type).toBe('jd');
    expect(cat?.code).toBe('67');
    expect(cat?.area).toBe(area);
  });

  it('discovers PARA and Johnny Decimal side by side', async () => {
    const area = '60-69 Software & Engineering';
    const category = '67 Tools & developer experience';
    const id = '67.01 git';
    await mkdir(join(tempDir, 'Areas', 'Health'), { recursive: true });
    await mkdir(join(tempDir, area, category, id), { recursive: true });

    const discovery = new VaultDiscovery(tempDir);
    const structure = await discovery.discover();

    // PARA dest is present and unchanged (no JD metadata).
    const para = structure.destinations.find(d => d.path === 'Areas/Health/');
    expect(para).toBeDefined();
    expect(para?.type).toBe('area');
    expect(para?.code).toBeUndefined();
    expect(para?.area).toBeUndefined();

    // Category dest.
    const cat = structure.destinations.find(d => d.path === `${area}/${category}/`);
    expect(cat).toBeDefined();
    expect(cat?.type).toBe('jd');
    expect(cat?.code).toBe('67');
    expect(cat?.area).toBe(area);

    // ID dest, full three-level path.
    const idDest = structure.destinations.find(d => d.code === '67.01');
    expect(idDest).toBeDefined();
    expect(idDest?.type).toBe('jd');
    expect(idDest?.path).toBe(`${area}/${category}/${id}/`);
    expect(idDest?.area).toBe(area);
  });

  it('does not mis-emit an ID folder as a category', async () => {
    const area = '60-69 Software & Engineering';
    const category = '67 Tools & developer experience';
    const id = '67.01 git';
    await mkdir(join(tempDir, area, category, id), { recursive: true });

    const discovery = new VaultDiscovery(tempDir);
    const structure = await discovery.discover();

    // The ID folder must never produce a bare category-style dest at the
    // category level (i.e. no dest pointing directly at '<area>/67.01 git/').
    const miscategorized = structure.destinations.find(
      d => d.path === `${area}/${id}/`
    );
    expect(miscategorized).toBeUndefined();

    // Only one dest carries code '67', and it is the real category.
    const codeSeven = structure.destinations.filter(d => d.code === '67');
    expect(codeSeven).toHaveLength(1);
    expect(codeSeven[0].path).toBe(`${area}/${category}/`);
  });
});
