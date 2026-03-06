import { execSync } from 'child_process';
import { basename } from 'path';

export interface ProvenanceInfo {
  repo: string;
  branch: string;
  commit: string;
}

export class ProvenanceService {
  private cwd: string;

  constructor(cwd?: string) {
    this.cwd = cwd ?? process.cwd();
  }

  detect(): ProvenanceInfo {
    const toplevel = this.git('rev-parse', '--show-toplevel');
    if (!toplevel) {
      return { repo: 'none', branch: 'none', commit: 'none' };
    }

    const repo = this.detectRepoName(toplevel);
    const branch = this.git('branch', '--show-current') || 'none';
    const commit = this.git('rev-parse', '--short', 'HEAD') || 'none';

    return { repo, branch, commit };
  }

  toSourceString(info: ProvenanceInfo): string {
    if (info.repo === 'none') return 'manual';
    return `conversation:repo=${info.repo},branch=${info.branch},commit=${info.commit}`;
  }

  private detectRepoName(toplevel: string): string {
    // Prefer remote URL (works correctly in worktrees)
    const remoteUrl = this.git('remote', 'get-url', 'origin');
    if (remoteUrl) {
      const name = remoteUrl.split('/').pop()?.replace(/\.git$/, '');
      if (name) return name;
    }
    // Fall back to directory name
    return basename(toplevel);
  }

  private git(...args: string[]): string | null {
    try {
      const result = execSync(`git ${args.join(' ')}`, {
        cwd: this.cwd,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      return result.trim();
    } catch {
      return null;
    }
  }
}
