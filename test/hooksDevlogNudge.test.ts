import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  isValidSessionId,
  resolveCap,
  readState,
  writeState,
} from '../src/core/devlogNudge.js';

describe('devlogNudge core', () => {
  let stateDir: string;

  beforeEach(() => {
    stateDir = mkdtempSync(join(tmpdir(), 'sb-devlog-nudge-core-test-'));
    process.env.SB_DEVLOG_NUDGE_STATE_DIR = stateDir;
    delete process.env.SB_DEVLOG_NUDGE_CAP;
  });

  afterEach(() => {
    rmSync(stateDir, { recursive: true, force: true });
    delete process.env.SB_DEVLOG_NUDGE_STATE_DIR;
    delete process.env.SB_DEVLOG_NUDGE_CAP;
  });

  it('accepts alphanumeric/dash/underscore session ids', () => {
    expect(isValidSessionId('sess-1_ABC')).toBe(true);
  });

  it('rejects session ids with path-unsafe characters', () => {
    expect(isValidSessionId('../etc/passwd')).toBe(false);
    expect(isValidSessionId('sess/1')).toBe(false);
    expect(isValidSessionId('')).toBe(false);
  });

  it('defaults the cap to 3 when unset', () => {
    expect(resolveCap()).toBe(3);
  });

  it('reads SB_DEVLOG_NUDGE_CAP when set to a valid number', () => {
    process.env.SB_DEVLOG_NUDGE_CAP = '5';
    expect(resolveCap()).toBe(5);
  });

  it('falls back to the default on a garbage cap value', () => {
    process.env.SB_DEVLOG_NUDGE_CAP = 'not-a-number';
    expect(resolveCap()).toBe(3);
  });

  it('treats 0 as a valid unlimited cap, not garbage', () => {
    process.env.SB_DEVLOG_NUDGE_CAP = '0';
    expect(resolveCap()).toBe(0);
  });

  it('returns a fresh state for a session with no state file yet', async () => {
    const state = await readState('sess-fresh');
    expect(state).toEqual({ nudgeCount: 0 });
  });

  it('round-trips a written state', async () => {
    await writeState('sess-rt', { nudgeCount: 2, pendingMarkerSkill: 'agent-meta:park' });
    const state = await readState('sess-rt');
    expect(state).toEqual({ nudgeCount: 2, pendingMarkerSkill: 'agent-meta:park' });
  });

  it('omits pendingMarkerSkill from the round-trip when never set', async () => {
    await writeState('sess-no-marker', { nudgeCount: 1 });
    const state = await readState('sess-no-marker');
    expect(state.pendingMarkerSkill).toBeUndefined();
  });
});
