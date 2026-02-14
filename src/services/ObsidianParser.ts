import { readFile } from 'fs/promises';
import { join } from 'path';

export interface DailyNotesConfig {
  folder?: string;
  template?: string;
}

export interface TemplatesConfig {
  folder?: string;
}

export interface ZkPrefixerConfig {
  folder?: string;
  template?: string;
}

export interface AppConfig {
  newFileFolderPath?: string;
  attachmentFolderPath?: string;
}

export interface ObsidianConfig {
  dailyNotes?: DailyNotesConfig;
  templates?: TemplatesConfig;
  zkPrefixer?: ZkPrefixerConfig;
  app?: AppConfig;
  inbox?: string;
}

export class ObsidianParser {
  private vaultPath: string;

  constructor(vaultPath: string) {
    this.vaultPath = vaultPath;
  }

  async load(): Promise<ObsidianConfig> {
    const obsidianDir = join(this.vaultPath, '.obsidian');

    const dailyNotes = await this.readJson<DailyNotesConfig>(join(obsidianDir, 'daily-notes.json'));
    const templates = await this.readJson<TemplatesConfig>(join(obsidianDir, 'templates.json'));
    const zkPrefixer = await this.readJson<ZkPrefixerConfig>(join(obsidianDir, 'zk-prefixer.json'));
    const app = await this.readJson<AppConfig>(join(obsidianDir, 'app.json'));

    const inbox = zkPrefixer?.folder ?? app?.newFileFolderPath;

    return { dailyNotes, templates, zkPrefixer, app, inbox };
  }

  private async readJson<T>(path: string): Promise<T | undefined> {
    try {
      const content = await readFile(path, 'utf-8');
      return JSON.parse(content) as T;
    } catch {
      return undefined;
    }
  }
}
