import { Command } from 'commander';
import { ConfigManager } from '../../services/ConfigManager.js';
import { ObsidianParser } from '../../services/ObsidianParser.js';
import { DailyNoteManager } from '../../services/DailyNoteManager.js';

export function registerDailyCommands(program: Command): void {
  const daily = program
    .command('daily <vault>')
    .description('Daily note operations');

  daily
    .command('path')
    .description("Show today's daily note path")
    .action(async (_opts: unknown, cmd: Command) => {
      const vaultName = cmd.parent!.args[0];
      const mgr = new ConfigManager();
      const cfg = await mgr.load();
      const v = mgr.getVault(cfg, vaultName);
      if (!v) {
        console.error(`Vault "${vaultName}" not found`);
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
    .requiredOption('--section <section>', 'Section header (e.g. "## Links")')
    .requiredOption('--content <content>', 'Content to append')
    .action(async (opts: { section: string; content: string }, cmd: Command) => {
      const vaultName = cmd.parent!.args[0];
      const mgr = new ConfigManager();
      const cfg = await mgr.load();
      const v = mgr.getVault(cfg, vaultName);
      if (!v) {
        console.error(`Vault "${vaultName}" not found`);
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
