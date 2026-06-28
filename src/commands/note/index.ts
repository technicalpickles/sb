import { Command } from 'commander';
import { resolveVault } from '../../core/vault.js';
import {
  noteCreate,
  noteCreatePreview,
  noteList,
  noteMove,
  noteMovePreview,
  noteRead,
  noteContext,
} from '../../core/note.js';

export function registerNoteCommands(program: Command): void {
  const note = program
    .command('note')
    .description('Note operations');

  note
    .command('create')
    .description('Create a Zettelkasten note in vault inbox')
    .option('--vault <name>', 'Vault name (uses default if omitted)')
    .requiredOption('--title <title>', 'Note title')
    .option('--content <content>', 'Note content (omit for frontmatter-only)')
    .option('--source <source>', 'Provenance source string')
    .option('--dry-run', 'Show what would be created without writing')
    .action(async (opts: { vault?: string; title: string; content?: string; source?: string; dryRun?: boolean }) => {
      const v = await resolveVault(opts.vault);
      if (opts.dryRun) {
        const preview = await noteCreatePreview(v, opts);
        console.log(JSON.stringify({ dryRun: true, ...preview }, null, 2));
        return;
      }
      const result = await noteCreate(v, opts);
      console.log(JSON.stringify(result, null, 2));
    });

  note
    .command('list')
    .description('List notes across the vault, optionally filtered by frontmatter type')
    .option('--vault <name>', 'Vault name (uses default if omitted)')
    .option('--type <type>', 'Filter to notes whose frontmatter type equals this value')
    .option('--detail', 'Include parsed frontmatter for each note')
    .action(async (opts: { vault?: string; type?: string; detail?: boolean }) => {
      const v = await resolveVault(opts.vault);
      const results = await noteList(v, opts);
      console.log(JSON.stringify(results, null, 2));
    });

  note
    .command('move')
    .description('Move note to destination folder')
    .option('--vault <name>', 'Vault name (uses default if omitted)')
    .requiredOption('--from <path>', 'Source path relative to vault')
    .requiredOption('--to <path>', 'Destination folder relative to vault')
    .option('--dry-run', 'Show what would be moved without moving')
    .action(async (opts: { vault?: string; from: string; to: string; dryRun?: boolean }) => {
      const v = await resolveVault(opts.vault);
      if (opts.dryRun) {
        console.log(JSON.stringify({ dryRun: true, ...noteMovePreview(v, opts) }, null, 2));
        return;
      }
      console.log(JSON.stringify(await noteMove(v, opts)));
    });

  note
    .command('read')
    .description('Read and parse a vault note as structured JSON')
    .option('--vault <name>', 'Vault name (uses default if omitted)')
    .requiredOption('--note <path>', 'Note path relative to vault')
    .action(async (opts: { vault?: string; note: string }) => {
      const v = await resolveVault(opts.vault);
      console.log(JSON.stringify(await noteRead(v, opts), null, 2));
    });

  note
    .command('context')
    .description('Get full routing context for a note')
    .option('--vault <name>', 'Vault name (uses default if omitted)')
    .requiredOption('--note <path>', 'Note path relative to vault')
    .action(async (opts: { vault?: string; note: string }) => {
      const v = await resolveVault(opts.vault);
      console.log(JSON.stringify(await noteContext(v, opts), null, 2));
    });
}
