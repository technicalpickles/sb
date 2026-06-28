import express, { type Request, type Response } from 'express';
import { createServer, type Server } from 'http';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

export interface StartHttpServerOptions {
  /** Construct a fresh McpServer per request (stateless transport). */
  buildServer: () => McpServer;
  host: string;
  port: number;
}

function methodNotAllowed(_req: Request, res: Response): void {
  res.status(405).json({
    jsonrpc: '2.0',
    error: { code: -32000, message: 'Method not allowed.' },
    id: null,
  });
}

/**
 * Start the Streamable HTTP MCP listener and resolve with the underlying
 * `http.Server` (so callers — and tests — own its lifecycle).
 *
 * Stateless: each `POST /mcp` gets a fresh server + transport, torn down when the
 * response closes. Safe for a single trusted client and avoids session GC. There
 * is no auth/TLS here by design — that lives at the proxy.
 */
export async function startHttpServer({ buildServer, host, port }: StartHttpServerOptions): Promise<Server> {
  const app = express();
  app.use(express.json());

  app.get('/healthz', (_req: Request, res: Response) => {
    res.status(200).json({ status: 'ok' });
  });

  app.post('/mcp', async (req: Request, res: Response) => {
    const server = buildServer();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on('close', () => {
      void transport.close();
      void server.close();
    });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch {
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: { code: -32603, message: 'Internal server error' },
          id: null,
        });
      }
    }
  });

  // Streamable HTTP clients only POST; the GET/DELETE SSE paths are unused here.
  app.get('/mcp', methodNotAllowed);
  app.delete('/mcp', methodNotAllowed);

  const httpServer = createServer(app);
  // Wire the 'error' event before listening so a bind failure (EADDRINUSE,
  // EACCES) rejects this promise instead of surfacing as an unhandled
  // exception with a raw stack trace.
  await new Promise<void>((resolve, reject) => {
    httpServer.once('error', reject);
    httpServer.listen(port, host, () => {
      httpServer.removeListener('error', reject);
      resolve();
    });
  });
  return httpServer;
}
