import { Command } from 'commander';
import { resolveVault } from '../../core/vault.js';
import { InvalidInputError } from '../../utils/errors.js';
import { buildMcpServer } from '../../mcp/server.js';
import { startHttpServer } from '../../mcp/http.js';

/**
 * Parse a `--listen` value into host + port. Accepts `:8080`, `8080`,
 * `0.0.0.0:8080`, or `127.0.0.1:8080`. A missing/empty host defaults to
 * `0.0.0.0` (bind all interfaces, as expected inside a container).
 */
export function parseListen(listen: string): { host: string; port: number } {
  const trimmed = listen.trim();
  const idx = trimmed.lastIndexOf(':');
  const host = idx === -1 ? '0.0.0.0' : trimmed.slice(0, idx) || '0.0.0.0';
  const portStr = idx === -1 ? trimmed : trimmed.slice(idx + 1);
  const port = Number(portStr);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new InvalidInputError(`Invalid --listen value: "${listen}" (expected host:port or :port)`);
  }
  return { host, port };
}

export function registerMcpCommands(program: Command, version: string): void {
  program
    .command('mcp')
    .description('Run sb as a Streamable HTTP MCP server (read-only vault tools)')
    .option('--listen <addr>', 'Address to bind (host:port, or :port)', ':8080')
    .option('--vault <name>', 'Vault name (uses default if omitted)')
    .action(async (opts: { listen: string; vault?: string }) => {
      const { host, port } = parseListen(opts.listen);
      // Warm state: resolve config + vault once; reuse for every request.
      const vault = await resolveVault(opts.vault);

      let httpServer;
      try {
        httpServer = await startHttpServer({
          buildServer: () => buildMcpServer({ vault, version }),
          host,
          port,
        });
      } catch (err: unknown) {
        // A bind failure (port in use, privileged port) is a user-facing
        // condition: report it as a friendly one-liner, not a raw stack.
        if (err instanceof Error && 'code' in err) {
          throw new InvalidInputError(
            `Cannot bind ${host}:${port}: ${(err as NodeJS.ErrnoException).code}`,
          );
        }
        throw err;
      }

      // Logs go to stderr: stdout is reserved, and over HTTP it isn't the wire anyway.
      console.error(`sb mcp listening on http://${host}:${port}/mcp (vault: ${vault.name})`);

      const shutdown = (): void => {
        httpServer.close(() => process.exit(0));
      };
      process.on('SIGTERM', shutdown);
      process.on('SIGINT', shutdown);
    });
}
