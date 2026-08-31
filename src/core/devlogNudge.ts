import { readFile, writeFile, mkdir } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

export interface NudgeState {
  nudgeCount: number;
  pendingMarkerSkill?: string;
}

const DEFAULT_CAP = 3;
const SESSION_ID_PATTERN = /^[A-Za-z0-9_-]+$/;

export function isValidSessionId(sessionId: string): boolean {
  return SESSION_ID_PATTERN.test(sessionId);
}

export function resolveCap(): number {
  const raw = process.env.SB_DEVLOG_NUDGE_CAP;
  if (raw === undefined || raw === '') return DEFAULT_CAP;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_CAP;
}

function stateDir(): string {
  return process.env.SB_DEVLOG_NUDGE_STATE_DIR ?? join(tmpdir(), 'sb-devlog-nudge');
}

function statePath(sessionId: string): string {
  return join(stateDir(), `${sessionId}.json`);
}

export async function readState(sessionId: string): Promise<NudgeState> {
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

export async function writeState(sessionId: string, state: NudgeState): Promise<void> {
  await mkdir(stateDir(), { recursive: true });
  await writeFile(statePath(sessionId), JSON.stringify(state), 'utf-8');
}
