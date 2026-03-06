import { describe, it, expect } from 'vitest';
import { ProvenanceService } from '../src/services/ProvenanceService.js';
import { mkdtemp, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { execSync } from 'child_process';

describe('ProvenanceService', () => {
  it('detects git context in a repo', () => {
    // This test runs from the sb repo itself
    const service = new ProvenanceService();
    const info = service.detect();

    expect(info.repo).toBe('sb'); // from remote origin URL
    expect(info.branch).toBeTruthy();
    expect(info.commit).toMatch(/^[a-f0-9]+$/);
  });

  it('returns none values outside a git repo', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'sb-test-'));
    try {
      const service = new ProvenanceService(tempDir);
      const info = service.detect();

      expect(info.repo).toBe('none');
      expect(info.branch).toBe('none');
      expect(info.commit).toBe('none');
    } finally {
      await rm(tempDir, { recursive: true });
    }
  });

  it('handles detached HEAD (no branch)', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'sb-test-'));
    try {
      // Create a repo with a commit, then detach HEAD
      execSync('git init && git commit --allow-empty -m "init"', {
        cwd: tempDir,
        stdio: 'pipe',
      });
      execSync('git checkout --detach HEAD', {
        cwd: tempDir,
        stdio: 'pipe',
      });

      const service = new ProvenanceService(tempDir);
      const info = service.detect();

      expect(info.repo).toBeTruthy();
      expect(info.branch).toBe('none'); // detached HEAD has no branch
      expect(info.commit).toMatch(/^[a-f0-9]+$/);
    } finally {
      await rm(tempDir, { recursive: true });
    }
  });

  it('generates source string from provenance', () => {
    const service = new ProvenanceService();

    const withRepo = { repo: 'my-service', branch: 'main', commit: 'abc1234' };
    expect(service.toSourceString(withRepo)).toBe(
      'conversation:repo=my-service,branch=main,commit=abc1234'
    );

    const noRepo = { repo: 'none', branch: 'none', commit: 'none' };
    expect(service.toSourceString(noRepo)).toBe('manual');
  });
});
