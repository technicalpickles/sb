import { readFile, writeFile, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import type { ObsidianConfig } from './ObsidianParser.js';

export class DailyNoteManager {
  private vaultPath: string;
  private config: ObsidianConfig;

  constructor(vaultPath: string, config: ObsidianConfig) {
    this.vaultPath = vaultPath;
    this.config = config;
  }

  dailyPath(date?: Date): string {
    const folder = this.config.dailyNotes?.folder ?? 'Daily';
    const d = date ?? new Date();
    const y = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const filename = `${y}-${mo}-${day}.md`;

    return join(this.vaultPath, folder, filename);
  }

  /** Appends content under a section, creating the daily note first (from the Obsidian
   * daily-note template, if configured) when it doesn't exist yet. Returns whether the
   * note had to be created. */
  async appendToSection(filePath: string, section: string, content: string): Promise<{ created: boolean }> {
    let fileContent: string;
    let created = false;

    try {
      fileContent = await readFile(filePath, 'utf-8');
    } catch (err) {
      if (!(err instanceof Error) || !('code' in err) || (err as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw err;
      }
      fileContent = await this.createFromTemplate(filePath);
      created = true;
    }

    const lines = fileContent.split('\n');

    // Callers pass either a bare heading ("Notes") or a full heading ("## Notes");
    // normalize to the heading text so both forms match the same line.
    const target = section.replace(/^#{1,6}\s*/, '').trim();
    const headingMatch = (line: string): RegExpMatchArray | null => line.match(/^(#{1,6})\s+(.*)$/);

    const sectionIdx = lines.findIndex(l => headingMatch(l)?.[2].trim() === target);

    if (sectionIdx !== -1) {
      const matchLevel = headingMatch(lines[sectionIdx])![1].length;

      // Find next heading at the same level or shallower, or end of file
      let nextSection = lines.length;
      for (let i = sectionIdx + 1; i < lines.length; i++) {
        const m = headingMatch(lines[i]);
        if (m && m[1].length <= matchLevel) {
          nextSection = i;
          break;
        }
      }

      // Insert before next section
      lines.splice(nextSection, 0, content);
      await writeFile(filePath, lines.join('\n'));
    } else {
      // Section doesn't exist, create it as a new H2 heading at end of file
      const newContent = fileContent + `\n## ${target}\n\n${content}\n`;
      await writeFile(filePath, newContent);
    }

    return { created };
  }

  /** Creates filePath's parent folder and seeds it from the configured daily-note
   * template (raw content, no variable substitution), or empty if none is configured
   * or the template file itself is missing. Returns the seeded content. */
  private async createFromTemplate(filePath: string): Promise<string> {
    await mkdir(dirname(filePath), { recursive: true });

    const templateRel = this.config.dailyNotes?.template;
    let content = '';

    if (templateRel) {
      const templatePath = join(this.vaultPath, templateRel.endsWith('.md') ? templateRel : `${templateRel}.md`);
      try {
        content = await readFile(templatePath, 'utf-8');
      } catch {
        content = '';
      }
    }

    await writeFile(filePath, content);
    return content;
  }
}
