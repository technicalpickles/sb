import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { chmod, mkdtemp, mkdir, readFile, writeFile, rm, stat, symlink, utimes } from 'fs/promises';
import { dirname, join } from 'path';
import { tmpdir } from 'os';
import { runCli } from './helpers/run-cli.js';
import { noteMoveToVault } from '../src/core/vaultMove.js';

interface Report {
  dryRun: boolean;
  results: { path: string; kind: string; status: string; dest: string }[];
  links: { note: string; target: string; count: number }[];
  changed: { from: string[]; to: string[] };
}

let root: string;
let home: string;
let src: string;
let dst: string;

async function put(vault: string, rel: string, content: string | Buffer): Promise<void> {
  await mkdir(dirname(join(vault, rel)), { recursive: true });
  await writeFile(join(vault, rel), content);
}

async function exists(path: string): Promise<boolean> {
  return stat(path).then(() => true, () => false);
}

function move(args: string[]): { code: number; report: Report; stderr: string } {
  const r = runCli(['note', 'move', '--vault', 'primary', '--to-vault', 'work', ...args], { home });
  return { code: r.code, report: r.stdout ? JSON.parse(r.stdout) as Report : (undefined as unknown as Report), stderr: r.stderr };
}

function statusOf(report: Report, path: string): string | undefined {
  return report.results.find((r) => r.path === path)?.status;
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'sb-vault-move-'));
  home = join(root, 'home');
  src = join(root, 'primary');
  dst = join(root, 'work');
  await mkdir(join(home, '.claude'), { recursive: true });
  await mkdir(src);
  await mkdir(dst);
  await writeFile(
    join(home, '.claude', 'second-brain.md'),
    `## Vaults\n\n- primary: ${src}\n- work: ${dst}\n\nDefault: primary\n`,
  );
});

afterEach(async () => {
  await rm(root, { recursive: true });
});

describe('sb note move --to-vault', () => {
  it('copies, verifies, then removes the source, keeping the relative path and mtime', async () => {
    await put(src, 'Projects/Launch plan.md', '# Launch plan\n\nShip it.\n');
    const when = new Date('2025-01-02T03:04:05Z');
    await utimes(join(src, 'Projects/Launch plan.md'), when, when);

    const { code, report } = move(['Projects/Launch plan.md']);

    expect(code).toBe(0);
    expect(statusOf(report, 'Projects/Launch plan.md')).toBe('moved');
    expect(await exists(join(src, 'Projects/Launch plan.md'))).toBe(false);
    expect(await readFile(join(dst, 'Projects/Launch plan.md'), 'utf-8')).toBe('# Launch plan\n\nShip it.\n');
    expect((await stat(join(dst, 'Projects/Launch plan.md'))).mtime.toISOString()).toBe(when.toISOString());
    expect(report.changed).toEqual({ from: ['Projects/Launch plan.md'], to: ['Projects/Launch plan.md'] });
  });

  it('places notes under --to in the destination vault', async () => {
    await put(src, 'Inbox/idea.md', 'idea');

    const { report } = move(['Inbox/idea.md', '--to', 'Imported/']);

    expect(report.results[0].dest).toBe('Imported/Inbox/idea.md');
    expect(await readFile(join(dst, 'Imported/Inbox/idea.md'), 'utf-8')).toBe('idea');
  });

  it('--dry-run reports the plan without touching either vault', async () => {
    await put(src, 'a.md', 'a');
    await put(src, 'b.md', 'see [[a]]');

    const { code, report } = move(['a.md', '--dry-run']);

    expect(code).toBe(0);
    expect(report.dryRun).toBe(true);
    expect(statusOf(report, 'a.md')).toBe('would-move');
    expect(report.links).toEqual([{ note: 'b.md', target: 'a', count: 1 }]);
    expect(report.changed).toEqual({ from: [], to: [] });
    expect(await exists(join(src, 'a.md'))).toBe(true);
    expect(await exists(join(dst, 'a.md'))).toBe(false);
  });

  it('never deletes the source or overwrites the destination when the destination differs', async () => {
    await put(src, 'note.md', 'source bytes');
    await put(dst, 'note.md', 'different bytes');

    const { code, report } = move(['note.md']);

    expect(code).toBe(1);
    expect(statusOf(report, 'note.md')).toBe('conflict');
    expect(await readFile(join(src, 'note.md'), 'utf-8')).toBe('source bytes');
    expect(await readFile(join(dst, 'note.md'), 'utf-8')).toBe('different bytes');
    expect(report.changed).toEqual({ from: [], to: [] });
  });

  it('adopts an identical copy already at the destination', async () => {
    await put(src, 'note.md', 'same');
    await put(dst, 'note.md', 'same');

    const { code, report } = move(['note.md']);

    expect(code).toBe(0);
    expect(statusOf(report, 'note.md')).toBe('moved');
    expect(await exists(join(src, 'note.md'))).toBe(false);
    expect(report.changed).toEqual({ from: ['note.md'], to: [] });
  });

  it('is safe to rerun: a second run reports already-moved and changes nothing', async () => {
    await put(src, 'note.md', 'once');
    expect(move(['note.md']).code).toBe(0);

    const { code, report } = move(['note.md']);

    expect(code).toBe(0);
    expect(statusOf(report, 'note.md')).toBe('already-moved');
    expect(report.changed).toEqual({ from: [], to: [] });
    expect(await readFile(join(dst, 'note.md'), 'utf-8')).toBe('once');
  });

  it('fails a path missing from both vaults without stopping the rest', async () => {
    await put(src, 'real.md', 'real');

    const { code, report } = move(['ghost.md', 'real.md']);

    expect(code).toBe(1);
    expect(statusOf(report, 'ghost.md')).toBe('missing');
    expect(statusOf(report, 'real.md')).toBe('moved');
  });

  it('moves embedded attachments, and copies ones a remaining note still embeds', async () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0xff]);
    await put(src, 'Notes/trip.md', '# Trip\n![[map.png]]\n![photo](<../Attachments/photo one.jpg>)\n![[shared.pdf|300]]\n');
    await put(src, 'Attachments/map.png', png);
    await put(src, 'Attachments/photo one.jpg', 'jpg');
    await put(src, 'Attachments/shared.pdf', 'pdf');
    await put(src, 'Notes/stays.md', 'also uses ![[shared.pdf]]');

    const { code, report } = move(['Notes/trip.md']);

    expect(code).toBe(0);
    expect(statusOf(report, 'Attachments/map.png')).toBe('moved');
    expect(statusOf(report, 'Attachments/photo one.jpg')).toBe('moved');
    expect(statusOf(report, 'Attachments/shared.pdf')).toBe('copied');
    expect(Buffer.compare(await readFile(join(dst, 'Attachments/map.png')), png)).toBe(0);
    expect(await exists(join(src, 'Attachments/map.png'))).toBe(false);
    expect(await readFile(join(src, 'Attachments/shared.pdf'), 'utf-8')).toBe('pdf');
    expect(await readFile(join(dst, 'Attachments/shared.pdf'), 'utf-8')).toBe('pdf');
    expect(report.changed.from.sort()).toEqual(['Attachments/map.png', 'Attachments/photo one.jpg', 'Notes/trip.md']);
    expect(report.changed.to.sort()).toEqual(['Attachments/map.png', 'Attachments/photo one.jpg', 'Attachments/shared.pdf', 'Notes/trip.md']);

    const rerun = move(['Notes/trip.md']);
    expect(rerun.code).toBe(0);
    expect(rerun.report.results.map((r) => r.status).sort()).toEqual(['already-moved', 'already-moved', 'already-moved', 'copied']);
    expect(rerun.report.changed).toEqual({ from: [], to: [] });
  });

  it('flags an embed that matches several files instead of guessing', async () => {
    await put(src, 'trip.md', '![[logo.png]]');
    await put(src, 'A/logo.png', 'a');
    await put(src, 'B/logo.png', 'b');

    const { code, report } = move(['trip.md']);

    expect(code).toBe(1);
    expect(statusOf(report, 'logo.png')).toBe('ambiguous');
    expect(await exists(join(src, 'A/logo.png'))).toBe(true);
  });

  it('keeps attachments a remaining note links to or embeds with different casing', async () => {
    await put(src, 'trip.md', '![[doc.pdf]] ![[img.png]] ![[listed.png]]');
    await put(src, 'doc.pdf', 'pdf');
    await put(src, 'img.png', 'png');
    await put(src, 'listed.png', 'png');
    await put(src, 'k.md', 'see [[doc.pdf]] and ![[IMG.png]] and ![[listed.png]]');

    const { report } = move(['trip.md', 'listed.png']);

    expect(statusOf(report, 'doc.pdf')).toBe('copied');
    expect(statusOf(report, 'img.png')).toBe('copied');
    expect(statusOf(report, 'listed.png')).toBe('copied');
    expect(await exists(join(src, 'doc.pdf'))).toBe(true);
    expect(await exists(join(src, 'img.png'))).toBe(true);
    expect(await exists(join(src, 'listed.png'))).toBe(true);
  });

  it('carries attachments a moved note links to without embedding', async () => {
    await put(src, 'trip.md', '[[doc.pdf]] and [the sheet](sheet.csv)');
    await put(src, 'doc.pdf', 'pdf');
    await put(src, 'sheet.csv', 'a,b');

    const { report } = move(['trip.md']);

    expect(statusOf(report, 'doc.pdf')).toBe('moved');
    expect(statusOf(report, 'sheet.csv')).toBe('moved');
  });

  it('records a failed delete as an error and still reports the rest', async () => {
    await put(src, 'Locked/a.md', 'a');
    await put(src, 'b.md', 'b');
    await chmod(join(src, 'Locked'), 0o555);
    try {
      const { code, report } = move(['Locked/a.md', 'b.md']);

      expect(code).toBe(1);
      expect(statusOf(report, 'Locked/a.md')).toBe('error');
      expect(statusOf(report, 'b.md')).toBe('moved');
      expect(report.changed.to.sort()).toEqual(['Locked/a.md', 'b.md']);
      expect(report.changed.from).toEqual(['b.md']);
    } finally {
      await chmod(join(src, 'Locked'), 0o755);
    }
  });

  it('refuses a destination that is the source file through a symlinked folder', async () => {
    await put(src, 'n.md', 'only copy');
    await symlink(src, join(dst, 'Imported'));

    const { code, report } = move(['n.md', '--to', 'Imported']);

    expect(code).toBe(1);
    expect(statusOf(report, 'n.md')).toBe('conflict');
    expect(await readFile(join(src, 'n.md'), 'utf-8')).toBe('only copy');
  });

  it('reports wikilinks that would dangle in the source vault', async () => {
    await put(src, 'Moved Note.md', 'bye');
    await put(src, 'hub.md', '[[Moved Note]] and [[Moved Note|the alias]] and [[Other]]');
    await put(src, 'Other.md', 'stays');

    const { report } = move(['Moved Note.md']);

    expect(report.links).toEqual([{ note: 'hub.md', target: 'Moved Note', count: 2 }]);
    expect(await readFile(join(src, 'hub.md'), 'utf-8')).toBe('[[Moved Note]] and [[Moved Note|the alias]] and [[Other]]');
  });

  it('--rewrite-links turns dangling links into plain text and lists the rewritten notes', async () => {
    await put(src, 'Moved Note.md', 'bye');
    await put(src, 'hub.md', '[[Moved Note]], [[Moved Note#Part|the alias]], ![[Moved Note]], [[Other]]');
    await put(src, 'Other.md', 'stays');

    const { report } = move(['Moved Note.md', '--rewrite-links']);

    expect(await readFile(join(src, 'hub.md'), 'utf-8')).toBe('Moved Note, the alias, Moved Note, [[Other]]');
    expect(report.changed.from.sort()).toEqual(['Moved Note.md', 'hub.md']);
  });

  it('does not report links that still resolve to a same-named note left behind', async () => {
    await put(src, 'A/Readme.md', 'moving');
    await put(src, 'B/Readme.md', 'staying');
    await put(src, 'hub.md', '[[Readme]]');

    const { report } = move(['A/Readme.md']);

    expect(report.links).toEqual([]);
  });

  it('reads paths from a manifest file, ignoring blanks, comments, and extra TSV columns', async () => {
    await put(src, 'one.md', '1');
    await put(src, 'two.md', '2');
    await writeFile(join(root, 'list.tsv'), '# notes to move\none.md\tkeep me\n\ntwo.md\n');

    const { code, report } = move(['--manifest', join(root, 'list.tsv')]);

    expect(code).toBe(0);
    expect(report.results.map((r) => [r.path, r.status])).toEqual([['one.md', 'moved'], ['two.md', 'moved']]);
  });

  it('rejects path traversal before touching anything', async () => {
    const { code, stderr } = move(['../escape.md']);

    expect(code).toBe(1);
    expect(stderr).toMatch(/traversal/);
  });

  it('rejects vaults that are the same directory or nested', async () => {
    const alias = join(root, 'alias');
    await symlink(src, alias);
    await mkdir(join(src, 'inner'));
    await writeFile(
      join(home, '.claude', 'second-brain.md'),
      `## Vaults\n\n- primary: ${src}\n- alias: ${alias}\n- inner: ${join(src, 'inner')}\n`,
    );
    await put(src, 'n.md', 'only copy');

    for (const target of ['alias', 'inner']) {
      const r = runCli(['note', 'move', '--vault', 'primary', '--to-vault', target, 'n.md'], { home });
      expect(r.code).toBe(1);
      expect(r.stderr).toMatch(/same vault/);
    }
    expect(await readFile(join(src, 'n.md'), 'utf-8')).toBe('only copy');
  });

  it('rejects moving a vault into itself', () => {
    const r = runCli(['note', 'move', '--vault', 'work', '--to-vault', 'work', 'x.md'], { home });

    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/same vault/);
  });
});

describe('noteMoveToVault verification', () => {
  it('keeps the source when the copy does not byte-match it', async () => {
    await put(src, 'note.md', 'original');
    const corruptCopy = async (_from: string, to: string) => {
      await writeFile(to, 'corrupted', { flag: 'wx' });
    };

    const report = await noteMoveToVault(
      { name: 'primary', path: src },
      { name: 'work', path: dst },
      { paths: ['note.md'] },
      { copyFile: corruptCopy },
    );

    expect(report.results[0].status).toBe('mismatch');
    expect(await readFile(join(src, 'note.md'), 'utf-8')).toBe('original');
    expect(report.changed.from).toEqual([]);
  });
});
