#!/usr/bin/env node
import { Command } from 'commander';
import { registerConfigCommands } from './commands/config/index.js';
import { registerVaultCommands } from './commands/vault/index.js';

const program = new Command();

program
  .name('sb')
  .description('Second Brain CLI for Obsidian vault management')
  .version('0.1.0');

registerConfigCommands(program);
registerVaultCommands(program);

program.parse();
