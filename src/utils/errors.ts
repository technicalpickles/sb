/**
 * Expected, user-facing errors shared by the CLI and the MCP server.
 *
 * The CLI top-level handler prints `err.message` and exits 1 for any `SbError`
 * (no stack trace), while genuinely unexpected errors still surface their stack.
 * The MCP server maps `SbError` to a structured tool error (`isError`) instead of
 * crashing the process. Each subclass carries a stable `code` so callers can
 * branch without string matching.
 */
export class SbError extends Error {
  readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = 'SbError';
    this.code = code;
  }
}

/** No vault was resolvable: none named and no default, or the named one is unknown. */
export class VaultNotFoundError extends SbError {
  constructor(name?: string) {
    super(
      name ? `Vault "${name}" not found` : 'No vault specified and no default configured',
      'VAULT_NOT_FOUND',
    );
    this.name = 'VaultNotFoundError';
  }
}

/** A referenced file (note, inbox directory, ...) does not exist. */
export class NotFoundError extends SbError {
  constructor(message: string) {
    super(message, 'NOT_FOUND');
    this.name = 'NotFoundError';
  }
}

/** Caller-supplied input was structurally invalid (e.g. empty `--content`). */
export class InvalidInputError extends SbError {
  constructor(message: string) {
    super(message, 'INVALID_INPUT');
    this.name = 'InvalidInputError';
  }
}
