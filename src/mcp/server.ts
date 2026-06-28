import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import type { Vault } from '../core/vault.js';
import { vaultStructure, vaultObsidian } from '../core/vault.js';
import { inboxList } from '../core/inbox.js';
import { noteRead, noteContext } from '../core/note.js';
import { dailyPath } from '../core/daily.js';
import { SbError } from '../utils/errors.js';

export interface BuildMcpServerOptions {
  /** The vault all tools operate on, resolved once at startup (warm state). */
  vault: Vault;
  /** Server version reported in the MCP handshake. */
  version: string;
}

/**
 * Run a core call and shape it into an MCP tool result. This is the
 * "never crash" boundary: a long-lived server must turn every failure into a
 * structured `isError` result rather than throwing out of the handler. Expected
 * `SbError`s surface their friendly message; anything else is reported generically.
 */
async function runTool(fn: () => Promise<unknown>): Promise<CallToolResult> {
  try {
    const result = await fn();
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  } catch (err: unknown) {
    const message = err instanceof SbError
      ? err.message
      : `Internal error: ${err instanceof Error ? err.message : String(err)}`;
    return { content: [{ type: 'text', text: message }], isError: true };
  }
}

/**
 * Build the read-only MCP server exposing curated vault tools over a resolved
 * vault. Tools are registered from a single list so future additions (e.g. the
 * deferred `search_vault`) slot in without restructuring.
 */
export function buildMcpServer({ vault, version }: BuildMcpServerOptions): McpServer {
  const server = new McpServer({ name: 'sb', version });

  server.registerTool(
    'vault_structure',
    {
      description:
        'List the vault\'s organizational destinations (PARA folders and Johnny Decimal areas/categories/IDs) as candidate locations for filing a note.',
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    async () => runTool(() => vaultStructure(vault)),
  );

  server.registerTool(
    'inbox_list',
    {
      description:
        'List unfiled notes in the vault inbox. Use detail=true to include each note\'s frontmatter (captured date, source, provenance).',
      inputSchema: {
        detail: z.boolean().optional().describe('Include parsed frontmatter for each note'),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ detail }) => runTool(() => inboxList(vault, { detail })),
  );

  server.registerTool(
    'note_read',
    {
      description:
        'Read and parse a single vault note, returning its title, frontmatter, section headings, wiki-links, and body content.',
      inputSchema: {
        path: z.string().describe('Vault-relative path to the note, e.g. "Inbox/202601011200 my-note.md"'),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ path }) => runTool(() => noteRead(vault, { note: path })),
  );

  server.registerTool(
    'note_context',
    {
      description:
        'Get routing context for a note: extracted keywords plus, for each vault destination, related notes that share those keywords. Use this to decide where a note belongs.',
      inputSchema: {
        path: z.string().describe('Vault-relative path to the note to analyze'),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ path }) => runTool(() => noteContext(vault, { note: path })),
  );

  server.registerTool(
    'daily_path',
    {
      description: "Return the vault-relative path of today's daily note.",
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    async () => runTool(() => dailyPath(vault)),
  );

  server.registerTool(
    'vault_obsidian',
    {
      description:
        'Return the vault\'s parsed .obsidian settings (daily-notes folder, templates, inbox/zk-prefixer config).',
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    async () => runTool(() => vaultObsidian(vault)),
  );

  return server;
}
