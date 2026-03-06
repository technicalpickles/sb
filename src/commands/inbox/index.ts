import { Command } from 'commander';
import { ConfigManager } from '../../services/ConfigManager.js';
import { ObsidianParser } from '../../services/ObsidianParser.js';
import { readdir, readFile } from 'fs/promises';
import { join } from 'path';
import { parseFrontmatter } from '../../utils/markdown.js';

interface InboxEntry {
  filename: string;
  timestamp: string;
  title: string;
}

interface DetailedInboxEntry extends InboxEntry {
  frontmatter: Record<string, string>;
}

function parseZettelkastenFilename(filename: string): { timestamp: string; title: string } | null {
  const match = filename.match(/^(\d{12})\s+(.+)\.md$/);
  if (!match) return null;
  return { timestamp: match[1], title: match[2] };
}

export function registerInboxCommands(program: Command): void {
  const inbox = program
    .command('inbox')
    .description('Inbox operations');

  inbox
    .command('list')
    .description('List notes in vault inbox')
    .option('--vault <name>', 'Vault name (uses default if omitted)')
    .option('--detail', 'Include parsed frontmatter for each note')
    .action(async (opts: { vault?: string; detail?: boolean }) => {
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
      const inboxPath = join(v.path, inboxFolder);

      let entries: string[];
      try {
        entries = await readdir(inboxPath);
      } catch (err: unknown) {
        if (err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === 'ENOENT') {
          console.error(`Inbox directory not found: ${inboxFolder}/`);
          process.exit(1);
        }
        throw err;
      }

      const mdFiles = entries.filter(e => e.endsWith('.md')).sort();

      if (opts.detail) {
        const results: DetailedInboxEntry[] = [];
        for (const filename of mdFiles) {
          const parsed = parseZettelkastenFilename(filename);
          const content = await readFile(join(inboxPath, filename), 'utf-8');
          const { frontmatter } = parseFrontmatter(content);
          results.push({
            filename,
            timestamp: parsed?.timestamp ?? '',
            title: parsed?.title ?? filename.replace(/\.md$/, ''),
            frontmatter,
          });
        }
        console.log(JSON.stringify(results, null, 2));
      } else {
        const results: InboxEntry[] = mdFiles.map(filename => {
          const parsed = parseZettelkastenFilename(filename);
          return {
            filename,
            timestamp: parsed?.timestamp ?? '',
            title: parsed?.title ?? filename.replace(/\.md$/, ''),
          };
        });
        console.log(JSON.stringify(results, null, 2));
      }
    });
}
