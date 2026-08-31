/** Reads and JSON-parses a Claude Code hook payload from stdin. Returns an
 * empty object on empty/malformed input rather than throwing — hook scripts
 * should fail quiet, not crash the caller's shell pipeline. */
export async function readStdinJson(): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk as Buffer);
  }
  const raw = Buffer.concat(chunks).toString('utf-8').trim();
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}
