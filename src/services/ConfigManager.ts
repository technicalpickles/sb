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

    for (const line of content.split('\n')) {
      // Parse "- name: /path/to/vault"
      const vaultMatch = line.match(/^- ([^:]+): (.+)$/);
      if (vaultMatch) {
        vaults.push({ name: vaultMatch[1], path: vaultMatch[2].trim() });
      }
      // Parse "Default: name"
      if (line.startsWith('Default: ')) {
        defaultVault = line.slice(9).trim();
      }
    }

    return { vaults, default: defaultVault };
  }

  getVault(config: Config, name: string): Vault | undefined {
    const lookup = name === 'default' ? config.default : name;
    if (!lookup) return undefined;
    return config.vaults.find(v => v.name === lookup);
  }
}
