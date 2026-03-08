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
    .option('--vault <name>', 'Vault name (uses default if omitted)')
    .action(async (opts: { vault?: string }) => {
      const mgr = new ConfigManager();
      const cfg = await mgr.load();
      const v = mgr.getVault(cfg, opts.vault);
      if (!v) {
        if (!opts.vault) {
          console.error('No vault specified and no default configured');
        } else {
          console.error(`Vault "${opts.vault}" not found`);
        }
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
    .option('--vault <name>', 'Vault name (uses default if omitted)')
    .requiredOption('--section <section>', 'Section header (e.g. "## Links")')
    .requiredOption('--content <content>', 'Content to append')
    .option('--dry-run', 'Show what would be appended without writing')
    .action(async (opts: { vault?: string; section: string; content: string; dryRun?: boolean }) => {
      const mgr = new ConfigManager();
      const cfg = await mgr.load();
      const v = mgr.getVault(cfg, opts.vault);
      if (!v) {
        if (!opts.vault) {
          console.error('No vault specified and no default configured');
        } else {
          console.error(`Vault "${opts.vault}" not found`);
        }
        process.exit(1);
      }

      const parser = new ObsidianParser(v.path);
      const obsConfig = await parser.load();
      const manager = new DailyNoteManager(v.path, obsConfig);
      const dailyPath = manager.dailyPath();

      if (opts.dryRun) {
        console.log(JSON.stringify({ dryRun: true, path: dailyPath, section: opts.section, content: opts.content }, null, 2));
        return;
      }

      await manager.appendToSection(dailyPath, opts.section, opts.content);
      console.log(JSON.stringify({ path: dailyPath, section: opts.section }));
    });
}
