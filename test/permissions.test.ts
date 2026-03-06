import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ConfigManager } from '../src/services/ConfigManager.js';
import { mkdtemp, writeFile, mkdir, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

describe('permissions', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'sb-test-'));
    const claudeDir = join(tempDir, '.claude');
    await mkdir(claudeDir, { recursive: true });
    await writeFile(
      join(claudeDir, 'second-brain.md'),
      '# Second Brain Configuration\n\n## Vaults\n\n- primary: /Users/me/Vaults/notes\n- work: /Users/me/Vaults/work\n\nDefault: primary'
    );
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true });
  });

  it('generates permission entries for default vault', async () => {
    const mgr = new ConfigManager(tempDir);
    const cfg = await mgr.load();
    const v = mgr.getVault(cfg);

    expect(v).toBeDefined();
    const permPath = `${v!.path}/**/*.md`;
    const permissions = [
      `Read(${permPath})`,
      `Write(${permPath})`,
      `Edit(${permPath})`,
    ];

    expect(permissions).toHaveLength(3);
    expect(permissions[0]).toBe('Read(/Users/me/Vaults/notes/**/*.md)');
    expect(permissions[1]).toBe('Write(/Users/me/Vaults/notes/**/*.md)');
    expect(permissions[2]).toBe('Edit(/Users/me/Vaults/notes/**/*.md)');
  });

  it('generates permission entries for specific vault', async () => {
    const mgr = new ConfigManager(tempDir);
    const cfg = await mgr.load();
    const v = mgr.getVault(cfg, 'work');

    expect(v).toBeDefined();
    const permPath = `${v!.path}/**/*.md`;

    expect(`Read(${permPath})`).toBe('Read(/Users/me/Vaults/work/**/*.md)');
  });
});
