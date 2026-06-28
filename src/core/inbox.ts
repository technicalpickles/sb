import { readdir, readFile } from 'fs/promises';
import { join } from 'path';
import type { Vault } from '../services/ConfigManager.js';
import { ObsidianParser } from '../services/ObsidianParser.js';
import { parseFrontmatter } from '../utils/markdown.js';
import { NotFoundError } from './errors.js';

export interface InboxEntry {
  filename: string;
  timestamp: string;
  title: string;
}

export interface DetailedInboxEntry extends InboxEntry {
  frontmatter: Record<string, string>;
}

function parseZettelkastenFilename(filename: string): { timestamp: string; title: string } | null {
  const match = filename.match(/^(\d{12})\s+(.+)\.md$/);
  if (!match) return null;
  return { timestamp: match[1], title: match[2] };
}

/** List notes in the vault inbox. With `detail`, includes parsed frontmatter. */
export async function inboxList(
  vault: Vault,
  args: { detail?: boolean } = {},
): Promise<InboxEntry[] | DetailedInboxEntry[]> {
  const obsConfig = await new ObsidianParser(vault.path).load();
  const inboxFolder = obsConfig.inbox ?? 'Inbox';
  const inboxPath = join(vault.path, inboxFolder);

  let entries: string[];
  try {
    entries = await readdir(inboxPath);
  } catch (err: unknown) {
    if (err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new NotFoundError(`Inbox directory not found: ${inboxFolder}/`);
    }
    throw err;
  }

  const mdFiles = entries.filter(e => e.endsWith('.md')).sort();

  if (args.detail) {
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
    return results;
  }

  return mdFiles.map(filename => {
    const parsed = parseZettelkastenFilename(filename);
    return {
      filename,
      timestamp: parsed?.timestamp ?? '',
      title: parsed?.title ?? filename.replace(/\.md$/, ''),
    };
  });
}
