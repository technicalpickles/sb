#!/usr/bin/env node
import { Command } from 'commander';

const program = new Command();

program
  .name('sb')
  .description('Second Brain CLI for Obsidian vault management')
  .version('0.1.0');

program
  .command('config')
  .description('Global configuration operations')
  .command('show')
  .description('Show config file')
  .action(() => {
    console.log('Config show - not implemented');
  });

program.parse();
