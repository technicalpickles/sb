import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { parseFrontmatter, extractTitle, extractSections, extractWikiLinks } from '../src/utils/markdown.js';

// Test the parsing logic directly (same as command handler)
function parseNote(content: string, notePath: string) {
  const { frontmatter, body } = parseFrontmatter(content);
  const title = extractTitle(body);
  const sections = extractSections(body);
  const links = extractWikiLinks(content);

  const finalTitle = title !== 'Untitled'
    ? title
    : notePath.split('/').pop()?.replace(/\.md$/, '') ?? 'Untitled';

  return {
    path: notePath,
    title: finalTitle,
    frontmatter: Object.keys(frontmatter).length > 0 ? frontmatter : null,
    sections,
    links,
    content: body.trim(),
  };
}

describe('note read', () => {
  it('parses full note with frontmatter, heading, sections, and links', () => {
    const content = `---
captured: 2026-02-14T11:47:00Z
source: claude-conversation
repo: my-service
---

# Redis Caching Patterns

Redis excels at TTL-based cache invalidation.

## Context

Captured while working on session management.

## Related

- [[202601150930 redis-setup-guide]]
- [[202601200800 morning-routine]]
`;

    const result = parseNote(content, 'Areas/AI/202602141147 redis-caching-patterns.md');

    expect(result.path).toBe('Areas/AI/202602141147 redis-caching-patterns.md');
    expect(result.title).toBe('Redis Caching Patterns');
    expect(result.frontmatter).toEqual({
      captured: '2026-02-14T11:47:00Z',
      source: 'claude-conversation',
      repo: 'my-service',
    });
    expect(result.sections).toEqual(['Context', 'Related']);
    expect(result.links).toEqual([
      '[[202601150930 redis-setup-guide]]',
      '[[202601200800 morning-routine]]',
    ]);
    expect(result.content).toContain('Redis excels at TTL-based cache invalidation');
  });

  it('handles note without frontmatter', () => {
    const content = `# Just a Note

Some content here.

## Section One

More content.
`;

    const result = parseNote(content, 'Inbox/just-a-note.md');

    expect(result.title).toBe('Just a Note');
    expect(result.frontmatter).toBeNull();
    expect(result.sections).toEqual(['Section One']);
    expect(result.links).toEqual([]);
  });

  it('falls back to filename when no heading', () => {
    const content = 'Just some text, no heading at all.\n';

    const result = parseNote(content, 'Inbox/202602141147 orphan-thought.md');

    expect(result.title).toBe('202602141147 orphan-thought');
    expect(result.frontmatter).toBeNull();
  });

  it('extracts deduplicated wiki-links', () => {
    const content = `# Test

See [[some-note]] and also [[other-note]].
Later, [[some-note]] again.
`;

    const result = parseNote(content, 'test.md');

    expect(result.links).toEqual(['[[some-note]]', '[[other-note]]']);
  });

  it('returns empty arrays when no sections or links', () => {
    const content = `---
captured: 2026-01-01
---

# Simple Note

Just content, no subsections, no links.
`;

    const result = parseNote(content, 'simple.md');

    expect(result.sections).toEqual([]);
    expect(result.links).toEqual([]);
  });
});
