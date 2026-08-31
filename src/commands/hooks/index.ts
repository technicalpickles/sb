import { Command } from 'commander';
import { readStdinJson } from '../../utils/stdin.js';
import { isValidSessionId, readState, writeState, resolveCap } from '../../core/devlogNudge.js';

const IMMEDIATE_REASON =
  "You just recorded something that might be devlog-worthy. If it's a non-obvious discovery worth remembering, consider a second-brain:devlog entry. Skip if this doesn't rise to that bar.";

async function getSessionId(): Promise<string | undefined> {
  const input = await readStdinJson();
  const sessionId = typeof input.session_id === 'string' ? input.session_id : undefined;
  if (!sessionId || !isValidSessionId(sessionId)) return undefined;
  return sessionId;
}

export function registerHooksCommands(program: Command): void {
  const hooks = program.command('hooks').description('Hook integration helpers for external tooling');
  const devlogNudge = hooks
    .command('devlog-nudge')
    .description('Generic nudge mechanics for second-brain:devlog trigger hooks');

  devlogNudge
    .command('immediate')
    .description('Emit an additionalContext nudge if under the per-session cap')
    .action(async () => {
      // "Category A" (per the external hook design doc that names it): an event
      // whose full content already exists at the moment the caller's tool call
      // completes. Contrast a future "Category B" - predictive, settles later.
      const sessionId = await getSessionId();
      if (!sessionId) return;

      try {
        const cap = resolveCap();
        const state = await readState(sessionId);
        if (cap > 0 && state.nudgeCount >= cap) return;

        await writeState(sessionId, { ...state, nudgeCount: state.nudgeCount + 1 });
      } catch {
        // Fail quiet: this command is invoked from an external hook script
        // piping stdin into an unpredictable environment, so a filesystem
        // error here must not crash the caller's shell pipeline.
        return;
      }

      console.log(
        JSON.stringify({
          hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: IMMEDIATE_REASON },
        }),
      );
    });

  // "Category B" (per the same design doc "immediate" references above):
  // a predictive trigger skill fires now, but whether it was worth a devlog
  // entry only settles later, at session-end. `mark` records that the skill
  // fired; `check` (run from a later Stop hook) reads and clears the marker.
  function buildCheckReason(skill: string): string {
    return `You just finished a session-wrapping step (skill=${skill}). If anything non-obvious surfaced this session, consider a second-brain:devlog entry before moving on. Skip if there's nothing worth recording.`;
  }

  devlogNudge
    .command('mark')
    .description('Category B: record that a predictive trigger skill fired this session')
    .requiredOption('--skill <name>', 'Skill name that fired')
    .action(async (opts: { skill: string }) => {
      const sessionId = await getSessionId();
      if (!sessionId) return;

      try {
        const state = await readState(sessionId);
        await writeState(sessionId, { ...state, pendingMarkerSkill: opts.skill });
      } catch {
        // Fail quiet: same rationale as `immediate`'s try/catch above.
        return;
      }
    });

  devlogNudge
    .command('check')
    .description('Category B: check the pending marker + cap, emit a Stop nudge, clear the marker')
    .action(async () => {
      const sessionId = await getSessionId();
      if (!sessionId) return;

      let skill: string | undefined;
      try {
        const state = await readState(sessionId);
        skill = state.pendingMarkerSkill;
        if (!skill) return;

        const cap = resolveCap();
        if (cap > 0 && state.nudgeCount >= cap) {
          await writeState(sessionId, { nudgeCount: state.nudgeCount });
          return;
        }

        await writeState(sessionId, { nudgeCount: state.nudgeCount + 1 });
      } catch {
        // Fail quiet: same rationale as `immediate`'s try/catch above.
        return;
      }

      console.log(JSON.stringify({ decision: 'block', reason: buildCheckReason(skill) }));
    });
}
