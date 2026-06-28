#!/usr/bin/env node
import { Command } from 'commander';
import { readFileSync } from 'fs';
import { SbError } from './utils/errors.js';
import { registerConfigCommands } from './commands/config/index.js';
import { registerVaultCommands } from './commands/vault/index.js';
import { registerNoteCommands } from './commands/note/index.js';
import { registerDailyCommands } from './commands/daily/index.js';
import { registerProvenanceCommands } from './commands/provenance/index.js';
import { registerInboxCommands } from './commands/inbox/index.js';
import { registerPermissionsCommands } from './commands/permissions/index.js';
import { registerInitCommands } from './commands/init/index.js';
import { registerDescribeCommands } from './commands/describe/index.js';
import { registerMcpCommands } from './commands/mcp/index.js';

// Read the version from package.json at runtime so it always tracks the
// published version (release-please bumps package.json, not source literals).
// Resolved relative to this module, so it works from both src/ and dist/ —
// each is one level below the package root — regardless of cwd.
const pkg = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf-8'),
) as { version: string };

const program = new Command();

program
  .name('sb')
  .description('Second Brain CLI for Obsidian vault management')
  .version(pkg.version);

registerConfigCommands(program);
registerVaultCommands(program);
registerNoteCommands(program);
registerDailyCommands(program);
registerProvenanceCommands(program);
registerInboxCommands(program);
registerPermissionsCommands(program);
registerInitCommands(program);
registerDescribeCommands(program);
registerMcpCommands(program, pkg.version);

program.parseAsync().catch((err: unknown) => {
  // Expected, user-facing errors get a friendly one-liner, no stacktrace.
  if (err instanceof SbError) {
    console.error(err.message);
    process.exit(1);
  }

  // Genuinely unexpected errors: surface the stack so we can debug them.
  console.error(err instanceof Error ? (err.stack ?? err.message) : String(err));
  process.exit(1);
});
