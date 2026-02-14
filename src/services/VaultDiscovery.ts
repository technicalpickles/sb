import { readdir } from 'fs/promises';
import { join } from 'path';

export interface Destination {
  path: string;
  type: string;
}

export interface VaultStructure {
  destinations: Destination[];
}

export class VaultDiscovery {
  private vaultPath: string;

  constructor(vaultPath: string) {
    this.vaultPath = vaultPath;
  }

  async discover(): Promise<VaultStructure> {
    const destinations: Destination[] = [];

    const topLevel = await this.listDirs(this.vaultPath);

    for (const dir of topLevel) {
      const name = dir.toLowerCase();
      const destType = name.includes('area') ? 'area'
        : name.includes('resource') ? 'resource'
        : name.includes('project') ? 'project'
        : null;

      if (destType) {
        const subDirs = await this.listDirs(join(this.vaultPath, dir));
        for (const sub of subDirs) {
          destinations.push({
            path: `${dir}/${sub}/`,
            type: destType,
          });
        }
      }
    }

    return { destinations };
  }

  private async listDirs(dirPath: string): Promise<string[]> {
    try {
      const entries = await readdir(dirPath, { withFileTypes: true });
      return entries
        .filter(e => e.isDirectory() && !e.name.startsWith('.'))
        .map(e => e.name);
    } catch {
      return [];
    }
  }
}
