import { Command } from 'commander';
import { ConfigManager } from '../../services/ConfigManager.js';
import { ObsidianParser } from '../../services/ObsidianParser.js';
import { DailyNoteManager } from '../../services/DailyNoteManager.js';

export function registerDailyCommands(program: Command): void {
  const daily = program
    .command('daily')
    .description('Daily note operations');

  daily
    .command('path')
    .description("Show today's daily note path")
    .requiredOption('--vault <name>', 'Vault name')
    .action(async (opts: { vault: string }) => {
      const mgr = new ConfigManager();
      const cfg = await mgr.load();
      const v = mgr.getVault(cfg, opts.vault);
      if (!v) {
        console.error(`Vault "${opts.vault}" not found`);
        process.exit(1);
      }

      const parser = new ObsidianParser(v.path);
      const obsConfig = await parser.load();
      const manager = new DailyNoteManager(v.path, obsConfig);
      console.log(manager.dailyPath());
    });

  daily
    .command('append')
    .description('Append content to a section of the daily note')
    .requiredOption('--vault <name>', 'Vault name')
    .requiredOption('--section <section>', 'Section header (e.g. "## Links")')
    .requiredOption('--content <content>', 'Content to append')
    .action(async (opts: { vault: string; section: string; content: string }) => {
      const mgr = new ConfigManager();
      const cfg = await mgr.load();
      const v = mgr.getVault(cfg, opts.vault);
      if (!v) {
        console.error(`Vault "${opts.vault}" not found`);
        process.exit(1);
      }

      const parser = new ObsidianParser(v.path);
      const obsConfig = await parser.load();
      const manager = new DailyNoteManager(v.path, obsConfig);
      const dailyPath = manager.dailyPath();

      await manager.appendToSection(dailyPath, opts.section, opts.content);
      console.log(JSON.stringify({ path: dailyPath, section: opts.section }));
    });
}
