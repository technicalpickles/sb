import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'child_process';
import { mkdtemp, rm, readFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}

// Run the built CLI with HOME pointed at an empty dir so config is missing.
// Mirrors test/init.test.ts: exercise the compiled binary, not the source.
function runCli(args: string[], home: string): RunResult {
  const sbPath = join(process.cwd(), 'dist', 'index.js');
  try {
    const stdout = execFileSync('node', [sbPath, ...args], {
      encoding: 'utf-8',
      env: { ...process.env, HOME: home },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { code: 0, stdout, stderr: '' };
  } catch (err: unknown) {
    const e = err as { status?: number; stdout?: string; stderr?: string };
    return { code: e.status ?? 1, stdout: e.stdout ?? '', stderr: e.stderr ?? '' };
  }
}

describe('CLI missing-config error handling', () => {
  let emptyHome: string;

  beforeEach(async () => {
    emptyHome = await mkdtemp(join(tmpdir(), 'sb-test-home-'));
  });

  afterEach(async () => {
    await rm(emptyHome, { recursive: true });
  });

  it('prints a friendly message and exits non-zero for note create, no stacktrace', () => {
    const result = runCli(['note', 'create', '--title', 'x'], emptyHome);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain('not configured');
    // No stacktrace leaked to the user.
    expect(result.stderr).not.toMatch(/\n\s+at\s/);
    expect(result.stderr).not.toContain('ConfigNotFoundError');
  });

  it('also handles config subcommands without a stacktrace', () => {
    const result = runCli(['config', 'vaults'], emptyHome);

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

    const result = runCli(['--version'], tmpdir());

    expect(result.code).toBe(0);
    expect(result.stdout.trim()).toBe(pkg.version);
  });

  it('resolves the package version regardless of cwd', () => {
    // Run from a dir with no package.json of its own: the version must come
    // from the package's own package.json (resolved via import.meta.url),
    // not from whatever happens to be in cwd.
    const sbPath = join(process.cwd(), 'dist', 'index.js');
    const stdout = execFileSync('node', [sbPath, '--version'], {
      encoding: 'utf-8',
      cwd: tmpdir(),
    });

    expect(stdout.trim()).toMatch(/^\d+\.\d+\.\d+/);
  });
});
