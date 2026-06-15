import { readdir } from 'fs/promises';
import { join } from 'path';

export interface Destination {
  path: string;
  type: string;
  code?: string;   // JD only: '67' for a category, '67.01' for an ID
  area?: string;   // JD only: the raw area folder name, e.g. '60-69 Software & Engineering'
}

// Johnny Decimal folder patterns, matched on the RAW folder name (not lowercased).
// Naturally disjoint: an area has a hyphen ('60-69'), a category has a space after
// two digits ('67 '), an ID has a dot ('67.01 '). No extra guards needed.
const JD_AREA = /^\d{2}-\d{2}\s/;
const JD_CATEGORY = /^\d{2}\s/;
const JD_ID = /^\d{2}\.\d{2}\s/;

// The JD number is the folder-name prefix before the first space: '67' or '67.01'.
function jdCode(name: string): string {
  return name.slice(0, name.indexOf(' '));
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
        continue;
      }

      // Johnny Decimal: a numbered area folder ('60-69 Software & Engineering').
      if (JD_AREA.test(dir)) {
        const categories = await this.listDirs(join(this.vaultPath, dir));
        for (const category of categories) {
          if (!JD_CATEGORY.test(category)) continue;

          destinations.push({
            path: `${dir}/${category}/`,
            type: 'jd',
            code: jdCode(category),
            area: dir,
          });

          const ids = await this.listDirs(join(this.vaultPath, dir, category));
          for (const id of ids) {
            if (!JD_ID.test(id)) continue;
            destinations.push({
              path: `${dir}/${category}/${id}/`,
              type: 'jd',
              code: jdCode(id),
              area: dir,
            });
          }
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
