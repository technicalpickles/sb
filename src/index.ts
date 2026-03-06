#!/usr/bin/env node
import { Command } from 'commander';
import { registerConfigCommands } from './commands/config/index.js';
import { registerVaultCommands } from './commands/vault/index.js';
import { registerNoteCommands } from './commands/note/index.js';
import { registerDailyCommands } from './commands/daily/index.js';
import { registerProvenanceCommands } from './commands/provenance/index.js';
import { registerInboxCommands } from './commands/inbox/index.js';
import { registerPermissionsCommands } from './commands/permissions/index.js';
import { registerInitCommands } from './commands/init/index.js';
import { registerDescribeCommands } from './commands/describe/index.js';

const program = new Command();

program
  .name('sb')
  .description('Second Brain CLI for Obsidian vault management')
  .version('0.1.0');

registerConfigCommands(program);
registerVaultCommands(program);
registerNoteCommands(program);
registerDailyCommands(program);
registerProvenanceCommands(program);
registerInboxCommands(program);
registerPermissionsCommands(program);
registerInitCommands(program);
registerDescribeCommands(program);

program.parse();
