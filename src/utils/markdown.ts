export interface ParsedFrontmatter {
  frontmatter: Record<string, string>;
  body: string;
}

export function parseFrontmatter(content: string): ParsedFrontmatter {
  if (!content.startsWith('---\n')) {
    return { frontmatter: {}, body: content };
  }

  const endIdx = content.indexOf('\n---\n', 4);
  if (endIdx === -1) return { frontmatter: {}, body: content };

  const fmBlock = content.slice(4, endIdx);
  const frontmatter: Record<string, string> = {};
  for (const line of fmBlock.split('\n')) {
    const colonIdx = line.indexOf(': ');
    if (colonIdx > 0) {
      frontmatter[line.slice(0, colonIdx)] = line.slice(colonIdx + 2);
    }
  }

  return { frontmatter, body: content.slice(endIdx + 5) };
}

export function extractTitle(body: string): string {
  const match = body.match(/^#\s+(.+)$/m);
  return match ? match[1] : 'Untitled';
}

export function extractSections(body: string): string[] {
  const sections: string[] = [];
  for (const line of body.split('\n')) {
    const match = line.match(/^##\s+(.+)$/);
    if (match) sections.push(match[1]);
  }
  return sections;
}

export function extractWikiLinks(content: string): string[] {
  const links: string[] = [];
  const regex = /\[\[([^\]]+)\]\]/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    links.push(`[[${match[1]}]]`);
  }
  return [...new Set(links)];
}
