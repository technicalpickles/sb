import { describe, it, expect } from 'vitest';
import { validatePath, validateWithinVault, PathValidationError } from '../src/utils/validation.js';

describe('validatePath', () => {
  it('accepts valid paths', () => {
    expect(() => validatePath('Areas/AI/note.md')).not.toThrow();
    expect(() => validatePath('📫 Inbox/202602141147 test.md')).not.toThrow();
    expect(() => validatePath('Resources/Tools/')).not.toThrow();
  });

  it('rejects path traversal', () => {
    expect(() => validatePath('../../../etc/passwd')).toThrow(PathValidationError);
    expect(() => validatePath('Areas/../../secret.md')).toThrow(PathValidationError);
    expect(() => validatePath('..')).toThrow(PathValidationError);
  });

  it('rejects control characters', () => {
    expect(() => validatePath('note\x00.md')).toThrow(PathValidationError);
    expect(() => validatePath('note\x1f.md')).toThrow(PathValidationError);
  });

  it('rejects URL-encoded strings', () => {
    expect(() => validatePath('%2e%2e/etc/passwd')).toThrow(PathValidationError);
    expect(() => validatePath('note%20name.md')).toThrow(PathValidationError);
  });
});

describe('validateWithinVault', () => {
  it('accepts paths within vault', () => {
    expect(() => validateWithinVault('/vault/Areas/note.md', '/vault')).not.toThrow();
    expect(() => validateWithinVault('/vault/📫 Inbox/test.md', '/vault')).not.toThrow();
  });

  it('rejects paths outside vault', () => {
    expect(() => validateWithinVault('/other/path/file.md', '/vault')).toThrow(PathValidationError);
  });
});
