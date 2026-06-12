import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'child_process';
import { mkdtemp, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}

// Run the CLI from source via tsx with HOME pointed at an empty dir so config is missing.
function runCli(args: string[], home: string): RunResult {
  try {
    const stdout = execFileSync('npx', ['tsx', 'src/index.ts', ...args], {
      cwd: process.cwd(),
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
