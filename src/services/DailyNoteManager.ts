import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';
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

  async appendToSection(filePath: string, section: string, content: string): Promise<void> {
    const fileContent = await readFile(filePath, 'utf-8');
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
  }
}
