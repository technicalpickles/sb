import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ConfigManager } from '../src/services/ConfigManager.js';
import { mkdtemp, writeFile, mkdir, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

describe('ConfigManager', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'sb-test-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true });
  });

  it('throws when not configured', async () => {
    const mgr = new ConfigManager(tempDir);
    await expect(mgr.load()).rejects.toThrow('not configured');
  });

  it('parses vault list', async () => {
    const claudeDir = join(tempDir, '.claude');
    await mkdir(claudeDir, { recursive: true });
    await writeFile(
      join(claudeDir, 'second-brain.md'),
      '# Second Brain Configuration\n\n## Vaults\n\n- primary: /path/to/vault\n\nDefault: primary'
    );

    const mgr = new ConfigManager(tempDir);
    const config = await mgr.load();

    expect(config.vaults).toHaveLength(1);
    expect(config.vaults[0].name).toBe('primary');
    expect(config.vaults[0].path).toBe('/path/to/vault');
    expect(config.default).toBe('primary');
  });

  it('parses multiple vaults', async () => {
    const claudeDir = join(tempDir, '.claude');
    await mkdir(claudeDir, { recursive: true });
    await writeFile(
      join(claudeDir, 'second-brain.md'),
      '# Second Brain Configuration\n\n## Vaults\n\n- primary: /path/to/vault\n- work: /path/to/work-vault\n\nDefault: primary'
    );

    const mgr = new ConfigManager(tempDir);
    const config = await mgr.load();

    expect(config.vaults).toHaveLength(2);
    expect(config.vaults[1].name).toBe('work');
    expect(config.vaults[1].path).toBe('/path/to/work-vault');
  });

  it('resolves vault by name', async () => {
    const claudeDir = join(tempDir, '.claude');
    await mkdir(claudeDir, { recursive: true });
    await writeFile(
      join(claudeDir, 'second-brain.md'),
      '# Second Brain Configuration\n\n## Vaults\n\n- primary: /path/to/vault\n\nDefault: primary'
    );

    const mgr = new ConfigManager(tempDir);
    const config = await mgr.load();

    const vault = mgr.getVault(config, 'primary');
    expect(vault).toBeDefined();
    expect(vault!.path).toBe('/path/to/vault');
  });

  it('resolves "default" to the default vault', async () => {
    const claudeDir = join(tempDir, '.claude');
    await mkdir(claudeDir, { recursive: true });
    await writeFile(
      join(claudeDir, 'second-brain.md'),
      '# Second Brain Configuration\n\n## Vaults\n\n- primary: /path/to/vault\n\nDefault: primary'
    );

    const mgr = new ConfigManager(tempDir);
    const config = await mgr.load();

    const vault = mgr.getVault(config, 'default');
    expect(vault).toBeDefined();
    expect(vault!.name).toBe('primary');
  });

  it('expands tilde in vault paths', async () => {
    const claudeDir = join(tempDir, '.claude');
    await mkdir(claudeDir, { recursive: true });
    await writeFile(
      join(claudeDir, 'second-brain.md'),
      '# Second Brain Configuration\n\n## Vaults\n\n- primary: ~/Vaults/my-vault\n- work: /absolute/path\n\nDefault: primary'
    );

    const mgr = new ConfigManager(tempDir);
    const config = await mgr.load();

    expect(config.vaults[0].path).toBe(join(tempDir, 'Vaults/my-vault'));
    expect(config.vaults[1].path).toBe('/absolute/path');
  });

  it('only parses vault entries under ## Vaults, not other sections', async () => {
    const claudeDir = join(tempDir, '.claude');
    await mkdir(claudeDir, { recursive: true });
    await writeFile(
      join(claudeDir, 'second-brain.md'),
      [
        '# Second Brain Configuration',
        '',
        '## Vaults',
        '',
        '- primary: ~/Vaults/pickled-knowledge/pickled-knowledge/',
        '',
        'Default: primary',
        '',
        '## Settings',
        '',
        '- Daily notes: Fleeting/',
        '- Templates: Templates/',
        '- Inbox: 📫 Inbox/',
      ].join('\n')
    );

    const mgr = new ConfigManager(tempDir);
    const config = await mgr.load();

    expect(config.vaults).toHaveLength(1);
    expect(config.vaults[0].name).toBe('primary');
    expect(config.vaults[0].path).toBe(join(tempDir, 'Vaults/pickled-knowledge/pickled-knowledge/'));
    expect(config.default).toBe('primary');
  });

  it('falls back to default vault when no name given', async () => {
    const claudeDir = join(tempDir, '.claude');
    await mkdir(claudeDir, { recursive: true });
    await writeFile(
      join(claudeDir, 'second-brain.md'),
      '# Second Brain Configuration\n\n## Vaults\n\n- primary: /path/to/vault\n- work: /path/to/work\n\nDefault: primary'
    );

    const mgr = new ConfigManager(tempDir);
    const config = await mgr.load();

    const vault = mgr.getVault(config);
    expect(vault).toBeDefined();
    expect(vault!.name).toBe('primary');
  });

  it('returns undefined when no name given and no default configured', async () => {
    const claudeDir = join(tempDir, '.claude');
    await mkdir(claudeDir, { recursive: true });
    await writeFile(
      join(claudeDir, 'second-brain.md'),
      '# Second Brain Configuration\n\n## Vaults\n\n- primary: /path/to/vault'
    );

    const mgr = new ConfigManager(tempDir);
    const config = await mgr.load();

    const vault = mgr.getVault(config);
    expect(vault).toBeUndefined();
  });

  it('returns undefined for unknown vault', async () => {
    const claudeDir = join(tempDir, '.claude');
    await mkdir(claudeDir, { recursive: true });
    await writeFile(
      join(claudeDir, 'second-brain.md'),
      '# Second Brain Configuration\n\n## Vaults\n\n- primary: /path/to/vault\n\nDefault: primary'
    );

    const mgr = new ConfigManager(tempDir);
    const config = await mgr.load();

    const vault = mgr.getVault(config, 'nonexistent');
    expect(vault).toBeUndefined();
  });
});
