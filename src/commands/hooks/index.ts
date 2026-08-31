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
    .description('Category A: emit an additionalContext nudge if under the per-session cap')
    .action(async () => {
      const sessionId = await getSessionId();
      if (!sessionId) return;

      const cap = resolveCap();
      const state = await readState(sessionId);
      if (cap > 0 && state.nudgeCount >= cap) return;

      await writeState(sessionId, { ...state, nudgeCount: state.nudgeCount + 1 });
      console.log(
        JSON.stringify({
          hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: IMMEDIATE_REASON },
        }),
      );
    });
}
