import { writeFile } from 'fs/promises';
import { join } from 'path';

export interface NoteOptions {
  title: string;
  content?: string;
  source?: string;
}

export interface CreatedNote {
  path: string;
  filename: string;
}

interface Provenance {
  source: string;
  repo?: string;
  branch?: string;
  commit?: string;
}

export class NoteBuilder {
  private title: string;
  private content: string;
  private provenance: Provenance;

  constructor(opts: NoteOptions) {
    // Distinguish "no content" (frontmatter-only note, gt-904u) from
    // "content explicitly provided but empty/whitespace" (gt-eak9). The latter
    // means the caller intended a body but supplied nothing (e.g. a failed
    // `--content "$(cat ...)"` command substitution), so refuse rather than
    // silently write an empty note.
    if (opts.content !== undefined && opts.content.trim().length === 0) {
      throw new Error(
        '--content was provided but is empty. Omit --content for a frontmatter-only note, or pass real content.',
      );
    }
    this.title = opts.title;
    this.content = opts.content ?? '';
    this.provenance = this.parseSource(opts.source);
  }

  preview(vaultPath: string, inboxFolder: string): { path: string; filename: string; content: string } {
    const now = new Date();
    const timestamp = this.formatTimestamp(now);
    const isoTimestamp = now.toISOString().replace(/\.\d+Z$/, 'Z');

    const slug = this.title
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '');

    const filename = `${timestamp} ${slug}.md`;
    const path = join(vaultPath, inboxFolder, filename);

    const lines = [
      '---',
      `captured: ${isoTimestamp}`,
      `source: ${this.provenance.source}`,
      `repo: ${this.provenance.repo ?? 'none'}`,
      `branch: ${this.provenance.branch ?? 'none'}`,
      `commit: ${this.provenance.commit ?? 'none'}`,
      '---',
      '',
      `# ${this.title}`,
      '',
    ];

    if (this.content) {
      lines.push(this.content, '');
    }

    return { path, filename, content: lines.join('\n') };
  }

  async create(vaultPath: string, inboxFolder: string): Promise<CreatedNote> {
    const now = new Date();
    const timestamp = this.formatTimestamp(now);
    const isoTimestamp = now.toISOString().replace(/\.\d+Z$/, 'Z');

    const slug = this.title
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '');

    const filename = `${timestamp} ${slug}.md`;
    const path = join(vaultPath, inboxFolder, filename);

    const lines = [
      '---',
      `captured: ${isoTimestamp}`,
      `source: ${this.provenance.source}`,
      `repo: ${this.provenance.repo ?? 'none'}`,
      `branch: ${this.provenance.branch ?? 'none'}`,
      `commit: ${this.provenance.commit ?? 'none'}`,
      '---',
      '',
      `# ${this.title}`,
      '',
    ];

    if (this.content) {
      lines.push(this.content, '');
    }

    await writeFile(path, lines.join('\n'));

    return { path, filename };
  }

  private formatTimestamp(date: Date): string {
    const y = date.getFullYear();
    const mo = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    const h = String(date.getHours()).padStart(2, '0');
    const mi = String(date.getMinutes()).padStart(2, '0');
    return `${y}${mo}${d}${h}${mi}`;
  }

  private parseSource(source?: string): Provenance {
    if (!source) return { source: 'manual' };

    if (source.startsWith('conversation:')) {
      const rest = source.slice('conversation:'.length);
      const params: Record<string, string> = {};
      for (const part of rest.split(',')) {
        const [key, value] = part.split('=', 2);
        if (key && value) params[key] = value;
      }
      return {
        source: 'claude-conversation',
        repo: params.repo,
        branch: params.branch,
        commit: params.commit,
      };
    }

    return { source };
  }
}
