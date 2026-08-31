import { readFile, writeFile, mkdir } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

/** Per-session devlog-nudge state: how many nudges have fired, and any marker skill still pending. */
export interface NudgeState {
  nudgeCount: number;
  pendingMarkerSkill?: string;
}

const DEFAULT_CAP = 3;
const SESSION_ID_PATTERN = /^[A-Za-z0-9_-]+$/;

/**
 * Guard against path traversal: a session id is used verbatim to build the state
 * file path (`statePath`), so anything outside `[A-Za-z0-9_-]` (e.g. `../etc/passwd`,
 * `sess/1`) could otherwise escape the state directory. `readState`/`writeState`
 * call this internally before touching the filesystem, so callers don't have to
 * remember to gate on it themselves.
 */
export function isValidSessionId(sessionId: string): boolean {
  return SESSION_ID_PATTERN.test(sessionId);
}

/**
 * Resolve the nudge frequency cap from `SB_DEVLOG_NUDGE_CAP`. Unset or empty
 * falls back to the default (3). `0` is a valid value meaning "unlimited nudges,"
 * not garbage. Any non-numeric or negative value also falls back to the default.
 */
export function resolveCap(): number {
  const raw = process.env.SB_DEVLOG_NUDGE_CAP;
  if (raw === undefined || raw === '') return DEFAULT_CAP;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 ? n : DEFAULT_CAP;
}

/** Directory nudge state files live in, overridable via `SB_DEVLOG_NUDGE_STATE_DIR` (defaults under the OS tmpdir). */
function stateDir(): string {
  return process.env.SB_DEVLOG_NUDGE_STATE_DIR ?? join(tmpdir(), 'sb-devlog-nudge');
}

function statePath(sessionId: string): string {
  return join(stateDir(), `${sessionId}.json`);
}

/**
 * Read nudge state for a session, defaulting to `{ nudgeCount: 0 }` when no state
 * file exists yet or it can't be read/parsed (fail-quiet: filesystem and JSON
 * errors are swallowed rather than thrown).
 *
 * Validates `sessionId` internally via `isValidSessionId` before touching the
 * filesystem: a path-unsafe id returns the same default as a fresh session,
 * without attempting a read. This makes the function safe by construction even
 * if a caller forgets to validate first.
 */
export async function readState(sessionId: string): Promise<NudgeState> {
  if (!isValidSessionId(sessionId)) return { nudgeCount: 0 };
  try {
    const content = await readFile(statePath(sessionId), 'utf-8');
    const parsed = JSON.parse(content) as Partial<NudgeState>;
    return {
      nudgeCount: parsed.nudgeCount ?? 0,
      pendingMarkerSkill: parsed.pendingMarkerSkill,
    };
  } catch {
    return { nudgeCount: 0 };
  }
}

/**
 * Persist nudge state for a session, creating the state directory if needed.
 *
 * Validates `sessionId` internally via `isValidSessionId` before writing: a
 * path-unsafe id is a silent no-op, consistent with this module's fail-quiet
 * style. Callers don't need to validate separately.
 */
export async function writeState(sessionId: string, state: NudgeState): Promise<void> {
  if (!isValidSessionId(sessionId)) return;
  await mkdir(stateDir(), { recursive: true });
  await writeFile(statePath(sessionId), JSON.stringify(state), 'utf-8');
}
