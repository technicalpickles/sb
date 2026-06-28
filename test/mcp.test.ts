import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import type { Server } from 'http';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { parseListen } from '../src/commands/mcp/index.js';
import { buildMcpServer } from '../src/mcp/server.js';
import { startHttpServer } from '../src/mcp/http.js';

describe('parseListen', () => {
  it('parses host:port, :port, and bare port', () => {
    expect(parseListen('0.0.0.0:8080')).toEqual({ host: '0.0.0.0', port: 8080 });
    expect(parseListen('127.0.0.1:9000')).toEqual({ host: '127.0.0.1', port: 9000 });
    expect(parseListen(':8080')).toEqual({ host: '0.0.0.0', port: 8080 });
    expect(parseListen('8080')).toEqual({ host: '0.0.0.0', port: 8080 });
  });

  it('rejects invalid ports', () => {
    expect(() => parseListen(':0')).toThrow();
    expect(() => parseListen('abc')).toThrow();
    expect(() => parseListen(':99999')).toThrow();
  });
});

describe('sb mcp server (integration over Streamable HTTP)', () => {
  let tempDir: string;
  let httpServer: Server;
  let baseUrl: string;
  let client: Client;
  let noteRel: string;

  const text = (r: CallToolResult): string => {
    const first = r.content[0];
    return first.type === 'text' ? first.text : '';
  };

  beforeAll(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'sb-mcp-'));
    await mkdir(join(tempDir, 'Inbox'), { recursive: true });
    await mkdir(join(tempDir, 'Resources', 'Tools'), { recursive: true });
    await mkdir(join(tempDir, 'Daily'), { recursive: true });
    noteRel = 'Inbox/202601011200 redis-caching.md';
    await writeFile(
      join(tempDir, noteRel),
      '---\nsource: manual\n---\n\n# Redis caching\n\nTTL-based invalidation.\n\n## Related\n\n- [[other]]\n',
    );

    httpServer = await startHttpServer({
      buildServer: () => buildMcpServer({ vault: { name: 'test', path: tempDir }, version: '0.0.0-test' }),
      host: '127.0.0.1',
      port: 0,
    });
    const addr = httpServer.address();
    const port = typeof addr === 'object' && addr ? addr.port : 0;
    baseUrl = `http://127.0.0.1:${port}`;

    client = new Client({ name: 'test-client', version: '0.0.0' });
    await client.connect(new StreamableHTTPClientTransport(new URL(`${baseUrl}/mcp`)));
  });

  afterAll(async () => {
    await client?.close();
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    await rm(tempDir, { recursive: true });
  });

  it('lists exactly the six read-only tools', async () => {
    const { tools } = await client.listTools();
    const names = tools.map(t => t.name).sort();
    expect(names).toEqual(
      ['daily_path', 'inbox_list', 'note_context', 'note_read', 'vault_obsidian', 'vault_structure'],
    );
    // All advertised read-only.
    expect(tools.every(t => t.annotations?.readOnlyHint === true)).toBe(true);
  });

  it('vault_structure returns destinations', async () => {
    const r = await client.callTool({ name: 'vault_structure', arguments: {} }) as CallToolResult;
    expect(r.isError).toBeFalsy();
    const parsed = JSON.parse(text(r));
    expect(parsed.destinations.some((d: { path: string }) => d.path.includes('Resources'))).toBe(true);
  });

  it('note_read parses a note', async () => {
    const r = await client.callTool({ name: 'note_read', arguments: { path: noteRel } }) as CallToolResult;
    expect(r.isError).toBeFalsy();
    const parsed = JSON.parse(text(r));
    expect(parsed.title).toBe('Redis caching');
    expect(parsed.sections).toContain('Related');
    expect(parsed.frontmatter.source).toBe('manual');
  });

  it('inbox_list lists inbox notes', async () => {
    const r = await client.callTool({ name: 'inbox_list', arguments: {} }) as CallToolResult;
    expect(r.isError).toBeFalsy();
    const parsed = JSON.parse(text(r));
    expect(parsed.some((e: { filename: string }) => e.filename.includes('redis-caching'))).toBe(true);
  });

  it('note_context returns routing context', async () => {
    const r = await client.callTool({ name: 'note_context', arguments: { path: noteRel } }) as CallToolResult;
    expect(r.isError).toBeFalsy();
    const parsed = JSON.parse(text(r));
    expect(parsed.note.title).toBe('Redis caching');
    expect(Array.isArray(parsed.destinations)).toBe(true);
  });

  it('daily_path and vault_obsidian return data', async () => {
    const dp = await client.callTool({ name: 'daily_path', arguments: {} }) as CallToolResult;
    expect(text(dp)).toMatch(/\d{4}-\d{2}-\d{2}\.md/);
    const obs = await client.callTool({ name: 'vault_obsidian', arguments: {} }) as CallToolResult;
    expect(obs.isError).toBeFalsy();
    expect(() => JSON.parse(text(obs))).not.toThrow();
  });

  it('returns a clean isError result for a missing note (no crash)', async () => {
    const r = await client.callTool({ name: 'note_read', arguments: { path: 'Inbox/missing.md' } }) as CallToolResult;
    expect(r.isError).toBe(true);
    expect(text(r)).toContain('Note not found');
    // Server is still alive afterwards.
    const ok = await client.callTool({ name: 'daily_path', arguments: {} }) as CallToolResult;
    expect(ok.isError).toBeFalsy();
  });

  it('rejects path traversal as an isError result', async () => {
    const r = await client.callTool({ name: 'note_read', arguments: { path: '../escape.md' } }) as CallToolResult;
    expect(r.isError).toBe(true);
    expect(text(r)).toContain('traversal');
  });

  it('serves GET /healthz as 200 and rejects GET /mcp with 405', async () => {
    const health = await fetch(`${baseUrl}/healthz`);
    expect(health.status).toBe(200);
    expect((await health.json()).status).toBe('ok');

    const getMcp = await fetch(`${baseUrl}/mcp`);
    expect(getMcp.status).toBe(405);
  });
});
