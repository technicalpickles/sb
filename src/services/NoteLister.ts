import { readdir, readFile } from 'fs/promises';
import { join, relative, sep } from 'path';
import { parseFrontmatter } from '../utils/markdown.js';

export interface NoteEntry {
  /** Path relative to the vault root, using forward slashes. */
  path: string;
  /** Basename of the note file. */
  filename: string;
  timestamp: string;
  title: string;
}

export interface DetailedNoteEntry extends NoteEntry {
  frontmatter: Record<string, string>;
}

export interface ListNotesOptions {
  /** Keep only notes whose frontmatter `type` equals this value. */
  type?: string;
  /** Include parsed frontmatter on each entry. */
  detail?: boolean;
}

function parseZettelkastenFilename(filename: string): { timestamp: string; title: string } | null {
  const match = filename.match(/^(\d{12})\s+(.+)\.md$/);
  if (!match) return null;
  return { timestamp: match[1], title: match[2] };
}

/**
 * Lists notes vault-wide. Recurses the vault directory, skipping hidden
 * directories (`.obsidian`, `.git`, ...) and non-`.md` files. Where `inbox list`
 * only covers the inbox, this covers the whole vault, which is what makes the
 * `--type` frontmatter filter useful.
 */
export class NoteLister {
  private vaultPath: string;

  constructor(vaultPath: string) {
    this.vaultPath = vaultPath;
  }

  async list(opts: ListNotesOptions & { detail: true }): Promise<DetailedNoteEntry[]>;
  async list(opts?: ListNotesOptions): Promise<NoteEntry[]>;
  async list(opts: ListNotesOptions = {}): Promise<NoteEntry[] | DetailedNoteEntry[]> {
    const absPaths = (await this.collectMarkdownFiles(this.vaultPath)).sort();

    // We only need to read a file when filtering by type or emitting detail.
    const needFrontmatter = opts.detail === true || opts.type !== undefined;

    const results: (NoteEntry | DetailedNoteEntry)[] = [];
    for (const absPath of absPaths) {
      const relPath = relative(this.vaultPath, absPath).split(sep).join('/');
      const filename = relPath.split('/').pop()!;
      const parsed = parseZettelkastenFilename(filename);

      let frontmatter: Record<string, string> | undefined;
      if (needFrontmatter) {
        const content = await readFile(absPath, 'utf-8');
        frontmatter = parseFrontmatter(content).frontmatter;
      }

      if (opts.type !== undefined && frontmatter!.type !== opts.type) continue;

      const entry: NoteEntry = {
        path: relPath,
        filename,
        timestamp: parsed?.timestamp ?? '',
        title: parsed?.title ?? filename.replace(/\.md$/, ''),
      };

      if (opts.detail === true) {
        results.push({ ...entry, frontmatter: frontmatter! });
      } else {
        results.push(entry);
      }
    }

    return results;
  }

  private async collectMarkdownFiles(dir: string): Promise<string[]> {
    const out: string[] = [];
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return out;
    }
    for (const e of entries) {
      // Skip hidden dirs/files: .obsidian, .git, .trash, and dotfiles.
      if (e.name.startsWith('.')) continue;
      const full = join(dir, e.name);
      if (e.isDirectory()) {
        out.push(...(await this.collectMarkdownFiles(full)));
      } else if (e.isFile() && e.name.endsWith('.md')) {
        out.push(full);
      }
    }
    return out;
  }
}
