import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { runCli } from './helpers/run-cli.js';

describe('CLI missing-config error handling', () => {
  let emptyHome: string;

  beforeEach(async () => {
    emptyHome = await mkdtemp(join(tmpdir(), 'sb-test-home-'));
  });

  afterEach(async () => {
    await rm(emptyHome, { recursive: true });
  });

  it('prints a friendly message and exits non-zero for note create, no stacktrace', () => {
    const result = runCli(['note', 'create', '--title', 'x'], { home: emptyHome });

    expect(result.code).toBe(1);
    expect(result.stderr).toContain('not configured');
    // No stacktrace leaked to the user.
    expect(result.stderr).not.toMatch(/\n\s+at\s/);
    expect(result.stderr).not.toContain('ConfigNotFoundError');
  });

  it('also handles config subcommands without a stacktrace', () => {
    const result = runCli(['config', 'vaults'], { home: emptyHome });

    expect(result.code).toBe(1);
    expect(result.stderr).toContain('not configured');
    expect(result.stderr).not.toMatch(/\n\s+at\s/);
  });
});

describe('CLI --version', () => {
  it('reports the version from package.json', async () => {
    const pkg = JSON.parse(
      await readFile(join(process.cwd(), 'package.json'), 'utf-8'),
    ) as { version: string };

    const result = runCli(['--version'], { home: tmpdir() });

    expect(result.code).toBe(0);
    expect(result.stdout.trim()).toBe(pkg.version);
  });

  it('resolves the package version regardless of cwd', () => {
    // Run from a dir with no package.json of its own: the version must come
    // from the package's own package.json (resolved via import.meta.url),
    // not from whatever happens to be in cwd.
    const result = runCli(['--version'], { cwd: tmpdir() });

    expect(result.stdout.trim()).toMatch(/^\d+\.\d+\.\d+/);
  });
});
