import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, readFile, rm, access } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { execSync } from 'child_process';

describe('sb init', () => {
  let tempDir: string;
  let vaultDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'sb-test-'));
    vaultDir = join(tempDir, 'vault');
    await mkdir(vaultDir, { recursive: true });
    await mkdir(join(vaultDir, '.obsidian'), { recursive: true });
    await writeFile(join(vaultDir, '.obsidian', 'app.json'), JSON.stringify({
      newFileFolderPath: '📫 Inbox',
    }));
    await writeFile(join(vaultDir, '.obsidian', 'daily-notes.json'), JSON.stringify({
      folder: 'Fleeting',
      template: 'Templates/daily',
    }));
    await writeFile(join(vaultDir, '.obsidian', 'templates.json'), JSON.stringify({
      folder: 'Templates',
    }));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true });
  });

  // We test the init logic by running the CLI with HOME overridden
  function runInit(args: string): string {
    const sbPath = join(process.cwd(), 'dist', 'index.js');
    return execSync(`node ${sbPath} init ${args}`, {
      cwd: tempDir,
      encoding: 'utf-8',
      env: { ...process.env, HOME: tempDir },
    });
  }

  it('creates fresh config with vault', () => {
    const output = JSON.parse(runInit(`--name test --path ${vaultDir}`));

    expect(output.vault).toBe('test');
    expect(output.path).toBe(vaultDir);
    expect(output.obsidian).toBe(true);
    expect(output.permissions).toHaveLength(3);
  });

  it('writes valid config file', async () => {
    runInit(`--name test --path ${vaultDir}`);

    const configPath = join(tempDir, '.claude', 'second-brain.md');
    const content = await readFile(configPath, 'utf-8');

    expect(content).toContain('## Vaults');
    expect(content).toContain(`- test: ${vaultDir}`);
    expect(content).toContain('Default: test');
  });

  it('adds vault to existing config', async () => {
    // Create initial config
    runInit(`--name primary --path ${vaultDir}`);

    // Create second vault
    const vault2 = join(tempDir, 'vault2');
    await mkdir(vault2, { recursive: true });

    const output = JSON.parse(runInit(`--name work --path ${vault2}`));
    expect(output.vault).toBe('work');
    expect(output.obsidian).toBe(false); // no .obsidian

    const configPath = join(tempDir, '.claude', 'second-brain.md');
    const content = await readFile(configPath, 'utf-8');
    expect(content).toContain('- primary:');
    expect(content).toContain('- work:');
  });

  it('fails for non-existent path', () => {
    expect(() => runInit('--name test --path /nonexistent/path')).toThrow();
  });

  it('scaffolds CLAUDE.md when requested', async () => {
    runInit(`--name test --path ${vaultDir} --scaffold`);

    const claudeMd = await readFile(join(vaultDir, 'CLAUDE.md'), 'utf-8');
    expect(claudeMd).toContain('# test vault');
    expect(claudeMd).toContain('Inbox: 📫 Inbox/');
    expect(claudeMd).toContain('Daily notes: Fleeting/');
  });

  it('skips scaffold when CLAUDE.md already exists', async () => {
    await writeFile(join(vaultDir, 'CLAUDE.md'), '# Existing content');

    runInit(`--name test --path ${vaultDir} --scaffold`);

    const claudeMd = await readFile(join(vaultDir, 'CLAUDE.md'), 'utf-8');
    expect(claudeMd).toBe('# Existing content');
  });

  it('rejects duplicate vault name', () => {
    runInit(`--name test --path ${vaultDir}`);
    expect(() => runInit(`--name test --path ${vaultDir}`)).toThrow();
  });
});
