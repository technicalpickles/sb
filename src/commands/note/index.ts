import { Command } from 'commander';
import { ConfigManager } from '../../services/ConfigManager.js';
import { NoteBuilder } from '../../services/NoteBuilder.js';
import { NoteAnalyzer } from '../../services/NoteAnalyzer.js';
import { ObsidianParser } from '../../services/ObsidianParser.js';
import { ProvenanceService } from '../../services/ProvenanceService.js';
import { parseFrontmatter, extractTitle, extractSections, extractWikiLinks } from '../../utils/markdown.js';
import { validatePath, validateWithinVault } from '../../utils/validation.js';
import { readFile, rename } from 'fs/promises';
import { join } from 'path';

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
      const inboxFolder = obsConfig.inbox ?? 'Inbox';

      let source = opts.source;
      if (source === 'auto') {
        const provenance = new ProvenanceService();
        const info = provenance.detect();
        source = provenance.toSourceString(info);
      }

      const builder = new NoteBuilder({
        title: opts.title,
        content: opts.content,
        source,
      });

      if (opts.dryRun) {
        const preview = builder.preview(v.path, inboxFolder);
        console.log(JSON.stringify({ dryRun: true, ...preview }, null, 2));
        return;
      }

      const result = await builder.create(v.path, inboxFolder);
      console.log(JSON.stringify(result, null, 2));
    });

  note
    .command('move')
    .description('Move note to destination folder')
    .option('--vault <name>', 'Vault name (uses default if omitted)')
    .requiredOption('--from <path>', 'Source path relative to vault')
    .requiredOption('--to <path>', 'Destination folder relative to vault')
    .option('--dry-run', 'Show what would be moved without moving')
    .action(async (opts: { vault?: string; from: string; to: string; dryRun?: boolean }) => {
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

      try {
        validatePath(opts.from);
        validatePath(opts.to);
      } catch (err: unknown) {
        console.error(err instanceof Error ? err.message : String(err));
        process.exit(1);
      }

      const fromPath = join(v.path, opts.from);
      const filename = opts.from.split('/').pop()!;
      const toPath = join(v.path, opts.to, filename);

      validateWithinVault(fromPath, v.path);
      validateWithinVault(toPath, v.path);

      if (opts.dryRun) {
        console.log(JSON.stringify({ dryRun: true, from: opts.from, to: `${opts.to}${filename}` }, null, 2));
        return;
      }

      await rename(fromPath, toPath);
      console.log(JSON.stringify({ from: opts.from, to: `${opts.to}${filename}` }));
    });

  note
    .command('read')
    .description('Read and parse a vault note as structured JSON')
    .option('--vault <name>', 'Vault name (uses default if omitted)')
    .requiredOption('--note <path>', 'Note path relative to vault')
    .action(async (opts: { vault?: string; note: string }) => {
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

      try {
        validatePath(opts.note);
      } catch (err: unknown) {
        console.error(err instanceof Error ? err.message : String(err));
        process.exit(1);
      }

      const fullPath = join(v.path, opts.note);
      validateWithinVault(fullPath, v.path);

      let content: string;
      try {
        content = await readFile(fullPath, 'utf-8');
      } catch (err: unknown) {
        if (err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === 'ENOENT') {
          console.error(`Note not found: ${opts.note}`);
          process.exit(1);
        }
        throw err;
      }

      const { frontmatter, body } = parseFrontmatter(content);
      const title = extractTitle(body);
      const sections = extractSections(body);
      const links = extractWikiLinks(content);

      // Fall back to filename for title if no heading found
      const finalTitle = title !== 'Untitled' ? title : opts.note.split('/').pop()?.replace(/\.md$/, '') ?? 'Untitled';

      console.log(JSON.stringify({
        path: opts.note,
        title: finalTitle,
        frontmatter: Object.keys(frontmatter).length > 0 ? frontmatter : null,
        sections,
        links,
        content: body.trim(),
      }, null, 2));
    });

  note
    .command('context')
    .description('Get full routing context for a note')
    .option('--vault <name>', 'Vault name (uses default if omitted)')
    .requiredOption('--note <path>', 'Note path relative to vault')
    .action(async (opts: { vault?: string; note: string }) => {
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

      try {
        validatePath(opts.note);
      } catch (err: unknown) {
        console.error(err instanceof Error ? err.message : String(err));
        process.exit(1);
      }

      const analyzer = new NoteAnalyzer(v.path);
      const context = await analyzer.buildContext(opts.note);
      console.log(JSON.stringify(context, null, 2));
    });
}
