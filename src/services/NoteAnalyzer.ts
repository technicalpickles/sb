import { readFile, readdir } from 'fs/promises';
import { join } from 'path';
import { VaultDiscovery } from './VaultDiscovery.js';
import { parseFrontmatter, extractTitle as extractTitleFromBody } from '../utils/markdown.js';

export interface NoteMetadata {
  path: string;
  title: string;
  content: string;
  keywords: string[];
  frontmatter: Record<string, string>;
}

export interface RelatedNote {
  name: string;
  similarity: string;
}

export interface DestinationContext {
  path: string;
  type: string;
  relatedNotes: RelatedNote[];
}

export interface NoteContext {
  note: NoteMetadata;
  destinations: DestinationContext[];
}

export class NoteAnalyzer {
  private vaultPath: string;

  constructor(vaultPath: string) {
    this.vaultPath = vaultPath;
  }

  async buildContext(notePath: string): Promise<NoteContext> {
    const fullPath = join(this.vaultPath, notePath);
    const content = await readFile(fullPath, 'utf-8');

    const { frontmatter, body } = parseFrontmatter(content);
    const title = extractTitleFromBody(body);
    const keywords = this.extractKeywords(title, body);

    const discovery = new VaultDiscovery(this.vaultPath);
    const structure = await discovery.discover();

    const destinations: DestinationContext[] = [];
    for (const dest of structure.destinations) {
      const related = await this.findRelatedNotes(
        join(this.vaultPath, dest.path),
        keywords
      );
      destinations.push({
        path: dest.path,
        type: dest.type,
        relatedNotes: related,
      });
    }

    return {
      note: { path: notePath, title, content: body, keywords, frontmatter },
      destinations,
    };
  }

  private extractKeywords(title: string, body: string): string[] {
    const stopwords = new Set([
      'the', 'a', 'an', 'is', 'are', 'was', 'were',
      'to', 'for', 'of', 'in', 'on', 'at', 'and',
      'that', 'this', 'with', 'from', 'how',
    ]);

    const text = `${title} ${body}`.toLowerCase();
    const words = text
      .split(/\W+/)
      .filter(w => w.length > 3)
      .filter(w => !stopwords.has(w));

    return [...new Set(words)].slice(0, 10);
  }

  private async findRelatedNotes(
    destPath: string,
    keywords: string[]
  ): Promise<RelatedNote[]> {
    const related: RelatedNote[] = [];

    try {
      const entries = await readdir(destPath);
      for (const entry of entries) {
        if (!entry.endsWith('.md')) continue;
        const nameLower = entry.toLowerCase();
        for (const keyword of keywords) {
          if (nameLower.includes(keyword)) {
            related.push({ name: entry, similarity: `keyword:${keyword}` });
            break;
          }
        }
      }
    } catch {
      // Directory may not exist
    }

    return related.slice(0, 5);
  }
}
