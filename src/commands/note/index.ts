import { Command } from 'commander';
import { ConfigManager } from '../../services/ConfigManager.js';
import { NoteBuilder } from '../../services/NoteBuilder.js';
import { ObsidianParser } from '../../services/ObsidianParser.js';
import { rename } from 'fs/promises';
import { join } from 'path';

export function registerNoteCommands(program: Command): void {
  const note = program
    .command('note')
    .description('Note operations');

  note
    .command('create')
    .description('Create a Zettelkasten note in vault inbox')
    .requiredOption('--vault <name>', 'Vault name')
    .requiredOption('--title <title>', 'Note title')
    .requiredOption('--content <content>', 'Note content')
    .option('--source <source>', 'Provenance source string')
    .action(async (opts: { vault: string; title: string; content: string; source?: string }) => {
      const mgr = new ConfigManager();
      const cfg = await mgr.load();
      const v = mgr.getVault(cfg, opts.vault);
      if (!v) {
        console.error(`Vault "${opts.vault}" not found`);
        process.exit(1);
      }

      const parser = new ObsidianParser(v.path);
      const obsConfig = await parser.load();
      const inboxFolder = obsConfig.inbox ?? 'Inbox';

      const builder = new NoteBuilder({
        title: opts.title,
        content: opts.content,
        source: opts.source,
      });
      const result = await builder.create(v.path, inboxFolder);
      console.log(JSON.stringify(result, null, 2));
    });

  note
    .command('move')
    .description('Move note to destination folder')
    .requiredOption('--vault <name>', 'Vault name')
    .requiredOption('--from <path>', 'Source path relative to vault')
    .requiredOption('--to <path>', 'Destination folder relative to vault')
    .action(async (opts: { vault: string; from: string; to: string }) => {
      const mgr = new ConfigManager();
      const cfg = await mgr.load();
      const v = mgr.getVault(cfg, opts.vault);
      if (!v) {
        console.error(`Vault "${opts.vault}" not found`);
        process.exit(1);
      }

      const fromPath = join(v.path, opts.from);
      const filename = opts.from.split('/').pop()!;
      const toPath = join(v.path, opts.to, filename);

      await rename(fromPath, toPath);
      console.log(JSON.stringify({ from: opts.from, to: `${opts.to}${filename}` }));
    });
}
