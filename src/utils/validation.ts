import { resolve } from 'path';

export class PathValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PathValidationError';
  }
}

/**
 * Validate a vault-relative path. Rejects traversal attempts,
 * control characters, and pre-encoded strings.
 */
export function validatePath(input: string): string {
  // Reject control characters (below ASCII 0x20, except newline/tab which shouldn't appear in paths anyway)
  if (/[\x00-\x1f]/.test(input)) {
    throw new PathValidationError(`Path contains control characters: ${JSON.stringify(input)}`);
  }

  // Reject pre-encoded strings (URL encoding)
  if (/%[0-9a-fA-F]{2}/.test(input)) {
    throw new PathValidationError(`Path contains URL-encoded characters: ${input}`);
  }

  // Reject path traversal sequences
  // Check both before and after normalization
  if (input.includes('..')) {
    throw new PathValidationError(`Path contains traversal sequence: ${input}`);
  }

  return input;
}

/**
 * Validate that a resolved path stays within the vault boundary.
 * Call after joining vault root + relative path.
 */
export function validateWithinVault(fullPath: string, vaultRoot: string): void {
  const resolved = resolve(fullPath);
  const resolvedRoot = resolve(vaultRoot);

  if (!resolved.startsWith(resolvedRoot)) {
    throw new PathValidationError(
      `Path escapes vault boundary: resolved to ${resolved}, vault is ${resolvedRoot}`
    );
  }
}
