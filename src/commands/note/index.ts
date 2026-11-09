import { Command } from 'commander';
import { readFile } from 'fs/promises';
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
import { FAILED_STATUSES, noteMoveToVault, parseManifest } from '../../core/vaultMove.js';
import { InvalidInputError } from '../../utils/errors.js';

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
    .description('Move a note to a folder in the vault, or notes and their attachments to another vault (--to-vault)')
    .argument('[paths...]', 'With --to-vault: note paths relative to the source vault')
    .option('--vault <name>', 'Vault name (uses default if omitted)')
    .option('--from <path>', 'Source path relative to vault (in-vault move)')
    .option('--to <path>', 'Destination folder: relative to the vault, or to the --to-vault root')
    .option('--to-vault <name>', 'Move to this vault: copy, byte-verify, then delete the source')
    .option('--manifest <file>', 'With --to-vault: file listing paths, one per line (first TSV column, # comments)')
    .option('--rewrite-links', 'With --to-vault: turn links left dangling in the source vault into plain text')
    .option('--dry-run', 'Show what would be moved without moving')
    .action(async (paths: string[], opts: {
      vault?: string; from?: string; to?: string; toVault?: string; manifest?: string; rewriteLinks?: boolean; dryRun?: boolean;
    }) => {
      const v = await resolveVault(opts.vault);
      if (opts.toVault) {
        const listed = opts.manifest ? parseManifest(await readFile(opts.manifest, 'utf-8')) : [];
        const report = await noteMoveToVault(v, await resolveVault(opts.toVault), {
          paths: [...paths, ...listed],
          to: opts.to,
          dryRun: opts.dryRun,
          rewriteLinks: opts.rewriteLinks,
        });
        console.log(JSON.stringify(report, null, 2));
        if (report.results.some((r) => FAILED_STATUSES.has(r.status))) process.exitCode = 1;
        return;
      }
      if (!opts.from || !opts.to || paths.length > 0) {
        throw new InvalidInputError('In-vault move needs --from and --to (or pass --to-vault to move between vaults)');
      }
      const args = { from: opts.from, to: opts.to };
      if (opts.dryRun) {
        console.log(JSON.stringify({ dryRun: true, ...noteMovePreview(v, args) }, null, 2));
        return;
      }
      console.log(JSON.stringify(await noteMove(v, args)));
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
