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

    const sectionIdx = lines.findIndex(l => l.trim() === section);

    if (sectionIdx !== -1) {
      // Find next section or end of file
      let nextSection = lines.length;
      for (let i = sectionIdx + 1; i < lines.length; i++) {
        if (lines[i].startsWith('## ')) {
          nextSection = i;
          break;
        }
      }

      // Insert before next section
      lines.splice(nextSection, 0, content);
      await writeFile(filePath, lines.join('\n'));
    } else {
      // Section doesn't exist, append at end
      const newContent = fileContent + `\n${section}\n\n${content}\n`;
      await writeFile(filePath, newContent);
    }
  }
}
