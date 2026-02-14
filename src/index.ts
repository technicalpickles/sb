#!/usr/bin/env node
import { Command } from 'commander';
import { registerConfigCommands } from './commands/config/index.js';

const program = new Command();

program
  .name('sb')
  .description('Second Brain CLI for Obsidian vault management')
  .version('0.1.0');

registerConfigCommands(program);

program.parse();
