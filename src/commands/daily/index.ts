import { Command } from 'commander';
import { resolveVault } from '../../core/vault.js';
import { dailyPath, dailyAppend, dailyAppendPreview } from '../../core/daily.js';

export function registerDailyCommands(program: Command): void {
  const daily = program
    .command('daily')
    .description('Daily note operations');

  daily
    .command('path')
    .description("Show today's daily note path")
    .option('--vault <name>', 'Vault name (uses default if omitted)')
    .action(async (opts: { vault?: string }) => {
      const v = await resolveVault(opts.vault);
      console.log(await dailyPath(v));
    });

  daily
    .command('append')
    .description('Append content to a section of the daily note')
    .option('--vault <name>', 'Vault name (uses default if omitted)')
    .requiredOption('--section <section>', 'Section header (e.g. "## Links")')
    .requiredOption('--content <content>', 'Content to append')
    .option('--dry-run', 'Show what would be appended without writing')
    .action(async (opts: { vault?: string; section: string; content: string; dryRun?: boolean }) => {
      const v = await resolveVault(opts.vault);
      if (opts.dryRun) {
        console.log(JSON.stringify({ dryRun: true, ...(await dailyAppendPreview(v, opts)) }, null, 2));
        return;
      }
      console.log(JSON.stringify(await dailyAppend(v, opts)));
    });
}
