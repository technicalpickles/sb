import { execFileSync } from 'child_process';
import { join } from 'path';

// Every test runs the built binary (node dist/index.js), matching CI's
// build-then-test order, rather than bootstrapping tsx at test runtime.
const sbPath = join(process.cwd(), 'dist', 'index.js');

export interface RunCliOptions {
  cwd?: string;
  home?: string;
}

export interface RunCliResult {
  code: number;
  stdout: string;
  stderr: string;
}

export function runCli(args: string[], options: RunCliOptions = {}): RunCliResult {
  try {
    const stdout = execFileSync('node', [sbPath, ...args], {
      encoding: 'utf-8',
      cwd: options.cwd,
      env: options.home ? { ...process.env, HOME: options.home } : process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { code: 0, stdout, stderr: '' };
  } catch (err: unknown) {
    const e = err as { status?: number; stdout?: string; stderr?: string };
    return { code: e.status ?? 1, stdout: e.stdout ?? '', stderr: e.stderr ?? '' };
  }
}

// Throwing variant for tests that expect success and want to assert on
// stdout directly, or that expect failure via `.toThrow()`.
// Like runCli, but pipes `stdin` to the child process. Needed for commands
// that read a JSON payload from stdin (e.g. `sb hooks devlog-nudge ...`)
// rather than taking everything as args.
export function runCliStdin(args: string[], stdin: string, options: RunCliOptions = {}): RunCliResult {
  try {
    const stdout = execFileSync('node', [sbPath, ...args], {
      encoding: 'utf-8',
      cwd: options.cwd,
      env: options.home ? { ...process.env, HOME: options.home } : process.env,
      input: stdin,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { code: 0, stdout, stderr: '' };
  } catch (err: unknown) {
    const e = err as { status?: number; stdout?: string; stderr?: string };
    return { code: e.status ?? 1, stdout: e.stdout ?? '', stderr: e.stderr ?? '' };
  }
}

export function runCliText(args: string[], options: RunCliOptions = {}): string {
  const result = runCli(args, options);
  if (result.code !== 0) {
    throw new Error(result.stderr || `sb ${args.join(' ')} exited with code ${result.code}`);
  }
  return result.stdout;
}

export function runCliJson(args: string[], options: RunCliOptions = {}): unknown {
  return JSON.parse(runCliText(args, options).trim());
}
