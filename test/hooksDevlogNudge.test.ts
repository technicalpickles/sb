import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readdirSync, chmodSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  isValidSessionId,
  resolveCap,
  readState,
  writeState,
} from '../src/core/devlogNudge.js';
import { runCliStdin } from './helpers/run-cli.js';

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

  it('falls back to the default when the value is partially numeric', () => {
    process.env.SB_DEVLOG_NUDGE_CAP = '5abc';
    expect(resolveCap()).toBe(3);
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

  it('returns the default state for malformed JSON without throwing', async () => {
    writeFileSync(join(stateDir, 'sess-malformed.json'), '{not valid json', 'utf-8');
    const state = await readState('sess-malformed');
    expect(state).toEqual({ nudgeCount: 0 });
  });

  describe('path-unsafe session ids', () => {
    it('readState never touches the filesystem and returns the fresh-session default', async () => {
      const state = await readState('../etc/passwd');
      expect(state).toEqual({ nudgeCount: 0 });
      expect(readdirSync(stateDir)).toEqual([]);
    });

    it('writeState is a silent no-op', async () => {
      await writeState('../etc/passwd', { nudgeCount: 99 });
      expect(readdirSync(stateDir)).toEqual([]);
    });
  });
});

describe('sb hooks devlog-nudge immediate', () => {
  let stateDir: string;

  beforeEach(() => {
    stateDir = mkdtempSync(join(tmpdir(), 'sb-devlog-nudge-cli-test-'));
    process.env.SB_DEVLOG_NUDGE_STATE_DIR = stateDir;
    process.env.SB_DEVLOG_NUDGE_CAP = '1';
  });

  afterEach(() => {
    rmSync(stateDir, { recursive: true, force: true });
    delete process.env.SB_DEVLOG_NUDGE_STATE_DIR;
    delete process.env.SB_DEVLOG_NUDGE_CAP;
  });

  it('emits an additionalContext nudge for a fresh session', () => {
    const result = runCliStdin(
      ['hooks', 'devlog-nudge', 'immediate'],
      JSON.stringify({ session_id: 'sess-imm-1' }),
    );
    expect(result.code).toBe(0);
    const payload = JSON.parse(result.stdout) as {
      hookSpecificOutput: { hookEventName: string; additionalContext: string };
    };
    expect(payload.hookSpecificOutput.hookEventName).toBe('PostToolUse');
    expect(payload.hookSpecificOutput.additionalContext).toMatch(/devlog/);
  });

  it('stays silent once the cap (1) is spent', () => {
    runCliStdin(['hooks', 'devlog-nudge', 'immediate'], JSON.stringify({ session_id: 'sess-imm-2' }));
    const second = runCliStdin(
      ['hooks', 'devlog-nudge', 'immediate'],
      JSON.stringify({ session_id: 'sess-imm-2' }),
    );
    expect(second.stdout.trim()).toBe('');
  });

  it('stays silent when session_id is missing', () => {
    const result = runCliStdin(['hooks', 'devlog-nudge', 'immediate'], JSON.stringify({}));
    expect(result.stdout.trim()).toBe('');
  });

  it('stays silent when session_id is path-unsafe', () => {
    const result = runCliStdin(
      ['hooks', 'devlog-nudge', 'immediate'],
      JSON.stringify({ session_id: '../etc/passwd' }),
    );
    expect(result.stdout.trim()).toBe('');
  });

  it('fails quiet, not crashing, when the state directory is unwritable', () => {
    chmodSync(stateDir, 0o444);
    try {
      const result = runCliStdin(
        ['hooks', 'devlog-nudge', 'immediate'],
        JSON.stringify({ session_id: 'sess-imm-unwritable' }),
      );
      expect(result.code).toBe(0);
      expect(result.stdout.trim()).toBe('');
      expect(result.stderr.trim()).toBe('');
    } finally {
      chmodSync(stateDir, 0o755);
    }
  });
});

describe('sb hooks devlog-nudge mark + check', () => {
  let stateDir: string;

  beforeEach(() => {
    stateDir = mkdtempSync(join(tmpdir(), 'sb-devlog-nudge-markcheck-test-'));
    process.env.SB_DEVLOG_NUDGE_STATE_DIR = stateDir;
    process.env.SB_DEVLOG_NUDGE_CAP = '1';
  });

  afterEach(() => {
    rmSync(stateDir, { recursive: true, force: true });
    delete process.env.SB_DEVLOG_NUDGE_STATE_DIR;
    delete process.env.SB_DEVLOG_NUDGE_CAP;
  });

  it('check is silent when no mark has been recorded', () => {
    const result = runCliStdin(['hooks', 'devlog-nudge', 'check'], JSON.stringify({ session_id: 'sess-mc-1' }));
    expect(result.stdout.trim()).toBe('');
  });

  it('mark then check emits a decision:block nudge naming the skill', () => {
    const markResult = runCliStdin(
      ['hooks', 'devlog-nudge', 'mark', '--skill', 'agent-meta:park'],
      JSON.stringify({ session_id: 'sess-mc-2' }),
    );
    expect(markResult.stdout.trim()).toBe('');
    const result = runCliStdin(['hooks', 'devlog-nudge', 'check'], JSON.stringify({ session_id: 'sess-mc-2' }));
    const payload = JSON.parse(result.stdout) as { decision: string; reason: string };
    expect(payload.decision).toBe('block');
    expect(payload.reason).toMatch(/agent-meta:park/);
    expect(payload.reason).toMatch(/devlog/);
  });

  it('mark with an empty --skill still leaves a marker that check clears (not permanently stranded)', async () => {
    runCliStdin(
      ['hooks', 'devlog-nudge', 'mark', '--skill', ''],
      JSON.stringify({ session_id: 'sess-mc-empty-skill' }),
    );
    const state = await readState('sess-mc-empty-skill');
    expect(state.pendingMarkerSkill).toBe('');

    // First check should clear it, even though the marker value is falsy.
    runCliStdin(['hooks', 'devlog-nudge', 'check'], JSON.stringify({ session_id: 'sess-mc-empty-skill' }));
    const cleared = await readState('sess-mc-empty-skill');
    expect(cleared.pendingMarkerSkill).toBeUndefined();

    // A second check on the same session must now be silent: the marker
    // was actually cleared, not left stranded because it was falsy.
    const second = runCliStdin(
      ['hooks', 'devlog-nudge', 'check'],
      JSON.stringify({ session_id: 'sess-mc-empty-skill' }),
    );
    expect(second.stdout.trim()).toBe('');
  });

  it('check clears the marker: a second check on the same session is silent', () => {
    runCliStdin(
      ['hooks', 'devlog-nudge', 'mark', '--skill', 'superpowers:executing-plans'],
      JSON.stringify({ session_id: 'sess-mc-3' }),
    );
    runCliStdin(['hooks', 'devlog-nudge', 'check'], JSON.stringify({ session_id: 'sess-mc-3' }));
    const second = runCliStdin(['hooks', 'devlog-nudge', 'check'], JSON.stringify({ session_id: 'sess-mc-3' }));
    expect(second.stdout.trim()).toBe('');
  });

  it('shares the cap with immediate: a spent cap suppresses check too, but still clears the marker', () => {
    runCliStdin(['hooks', 'devlog-nudge', 'immediate'], JSON.stringify({ session_id: 'sess-mc-4' })); // spends the cap of 1
    runCliStdin(
      ['hooks', 'devlog-nudge', 'mark', '--skill', 'agent-meta:park'],
      JSON.stringify({ session_id: 'sess-mc-4' }),
    );
    const result = runCliStdin(['hooks', 'devlog-nudge', 'check'], JSON.stringify({ session_id: 'sess-mc-4' }));
    expect(result.stdout.trim()).toBe('');

    // Marker cleared even though suppressed: raising the cap and marking again
    // should require a fresh mark, not resurrect the old one.
    process.env.SB_DEVLOG_NUDGE_CAP = '99';
    const afterRaisingCap = runCliStdin(
      ['hooks', 'devlog-nudge', 'check'],
      JSON.stringify({ session_id: 'sess-mc-4' }),
    );
    expect(afterRaisingCap.stdout.trim()).toBe('');
  });

  it('mark is silent when session_id is missing', () => {
    const result = runCliStdin(['hooks', 'devlog-nudge', 'mark', '--skill', 'agent-meta:park'], JSON.stringify({}));
    expect(result.stdout.trim()).toBe('');
  });

  it('check is silent when session_id is missing', () => {
    const result = runCliStdin(['hooks', 'devlog-nudge', 'check'], JSON.stringify({}));
    expect(result.stdout.trim()).toBe('');
  });
});
