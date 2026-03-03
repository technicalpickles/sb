import { readFile } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';

export interface Vault {
  name: string;
  path: string;
}

export interface Config {
  vaults: Vault[];
  default?: string;
}

export class ConfigNotFoundError extends Error {
  constructor() {
    super('Second brain not configured. Run /second-brain:setup first.');
    this.name = 'ConfigNotFoundError';
  }
}

export class ConfigManager {
  private homeDir: string;

  constructor(homeDir?: string) {
    this.homeDir = homeDir ?? homedir();
  }

  get configPath(): string {
    return join(this.homeDir, '.claude', 'second-brain.md');
  }

  async load(): Promise<Config> {
    let content: string;
    try {
      content = await readFile(this.configPath, 'utf-8');
    } catch (err: unknown) {
      if (err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new ConfigNotFoundError();
      }
      throw err;
    }

    return this.parse(content);
  }

  private parse(content: string): Config {
    const vaults: Vault[] = [];
    let defaultVault: string | undefined;
    let currentSection: string | undefined;

    for (const line of content.split('\n')) {
      // Track which ## section we're in
      const sectionMatch = line.match(/^## (.+)$/);
      if (sectionMatch) {
        currentSection = sectionMatch[1].trim();
        continue;
      }

      // Parse "- name: /path/to/vault" only inside ## Vaults
      if (currentSection === 'Vaults') {
        const vaultMatch = line.match(/^- ([^:]+): (.+)$/);
        if (vaultMatch) {
          vaults.push({ name: vaultMatch[1], path: this.expandTilde(vaultMatch[2].trim()) });
        }
      }

      // Parse "Default: name" (in any section, typically under Vaults)
      if (line.startsWith('Default: ')) {
        defaultVault = line.slice(9).trim();
      }
    }

    return { vaults, default: defaultVault };
  }

  private expandTilde(filePath: string): string {
    if (filePath === '~') {
      return this.homeDir;
    }
    if (filePath.startsWith('~/')) {
      return join(this.homeDir, filePath.slice(2));
    }
    return filePath;
  }

  getVault(config: Config, name: string): Vault | undefined {
    const lookup = name === 'default' ? config.default : name;
    if (!lookup) return undefined;
    return config.vaults.find(v => v.name === lookup);
  }
}
