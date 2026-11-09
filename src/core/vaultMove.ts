import { constants, copyFile as fsCopyFile } from 'fs';
import { mkdir, readdir, readFile, realpath, stat, unlink, utimes, writeFile } from 'fs/promises';
import { promisify } from 'util';
import { dirname, join, posix, resolve, sep } from 'path';
import type { Vault } from '../services/ConfigManager.js';
import { validatePath, validateWithinVault } from '../utils/validation.js';
import { InvalidInputError } from '../utils/errors.js';

export type MoveStatus =
  | 'moved'
  | 'copied'
  | 'already-moved'
  | 'would-move'
  | 'would-copy'
  | 'conflict'
  | 'mismatch'
  | 'missing'
  | 'ambiguous'
  | 'unresolved'
  | 'error';

/** Statuses where a file did not end up where it was asked to go. */
export const FAILED_STATUSES: ReadonlySet<MoveStatus> = new Set(['conflict', 'mismatch', 'missing', 'ambiguous', 'error']);

/** Statuses where the file leaves (or has left) the source vault. */
const DEPARTED: ReadonlySet<MoveStatus> = new Set(['moved', 'already-moved', 'would-move']);

export interface MoveResult {
  /** Source-vault-relative path (for `ambiguous`/`unresolved`, the embed target as written). */
  path: string;
  kind: 'note' | 'attachment';
  status: MoveStatus;
  /** Destination-vault-relative path. */
  dest: string;
  detail?: string;
}

export interface DanglingLink {
  /** Source-vault note that still links to a moved note. */
  note: string;
  /** Title of the moved note it links to. */
  target: string;
  count: number;
}

export interface VaultMoveReport {
  dryRun: boolean;
  from: Vault;
  to: Vault;
  results: MoveResult[];
  links: DanglingLink[];
  linksRewritten: boolean;
  /** Paths actually written or deleted this run, relative to each vault root. */
  changed: { from: string[]; to: string[] };
}

export interface VaultMoveArgs {
  paths: string[];
  /** Folder in the destination vault to place moved files under. */
  to?: string;
  dryRun?: boolean;
  rewriteLinks?: boolean;
}

export interface VaultMoveIo {
  /** Must refuse to overwrite an existing destination. */
  copyFile: (from: string, to: string) => Promise<void>;
}

const copyFileExclusive = promisify(fsCopyFile);
const defaultIo: VaultMoveIo = {
  copyFile: (from, to) => copyFileExclusive(from, to, constants.COPYFILE_EXCL),
};

const WIKILINK = /(!?)\[\[([^\]|#]*)(#[^\]|]*)?(?:\|([^\]]*))?\]\]/g;
const MD_LINK = /!?\[[^\]]*\]\(\s*(<[^>]+>|[^)\s]+)/g;

/** Parse a manifest: one vault-relative path per line, first TSV column, `#` comments. */
export function parseManifest(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.split('\t')[0].trim())
    .filter((line) => line !== '' && !line.startsWith('#'));
}

async function readOrNull(path: string): Promise<Buffer | null> {
  try {
    return await readFile(path);
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
}

/** Every file under `dir`, as forward-slash paths relative to it, skipping hidden entries. */
async function listFiles(dir: string, rel = ''): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(join(dir, rel), { withFileTypes: true });
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  }
  const out: string[] = [];
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const child = rel ? `${rel}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...(await listFiles(dir, child)));
    else if (entry.isFile()) out.push(child);
  }
  return out;
}

const noteTitle = (rel: string) => posix.basename(rel).replace(/\.md$/i, '');
const isNote = (rel: string) => rel.toLowerCase().endsWith('.md');

interface FileRef {
  target: string;
  /** Markdown links resolve against the note's folder first; wikilinks don't. */
  relative: boolean;
}

/** Non-note files a note references, embedded or linked: `[[file.ext]]` and `[alt](path)`, URLs excluded. */
function fileRefs(content: string): FileRef[] {
  const out: FileRef[] = [];
  for (const m of content.matchAll(WIKILINK)) out.push({ target: m[2].trim(), relative: false });
  for (const m of content.matchAll(MD_LINK)) {
    let target = m[1].replace(/^<|>$/g, '');
    try {
      target = decodeURIComponent(target);
    } catch {
      // Not percent-encoded; use it as written.
    }
    out.push({ target, relative: true });
  }
  return out.filter(({ target }) => target && !/^[a-z][a-z0-9+.-]*:/i.test(target) && /\.[^/.]+$/.test(target) && !isNote(target));
}

interface FileIndex {
  /** Lowercased path to actual path. Obsidian matches links case-insensitively. */
  byPath: Map<string, string>;
  /** Lowercased basename to actual paths. */
  byName: Map<string, string[]>;
}

function indexFiles(files: string[]): FileIndex {
  const byPath = new Map<string, string>();
  const byName = new Map<string, string[]>();
  for (const f of files) {
    byPath.set(f.toLowerCase(), f);
    const name = posix.basename(f).toLowerCase();
    byName.set(name, [...(byName.get(name) ?? []), f]);
  }
  return { byPath, byName };
}

type Resolution = { found: string } | { ambiguous: string[] } | null;

/** Resolve a reference the way Obsidian does: path from the vault root or the note's folder, else unique basename. */
function resolveRef(ref: FileRef, note: string, index: FileIndex): Resolution {
  const candidates = ref.relative
    ? [posix.normalize(posix.join(posix.dirname(note), ref.target)), posix.normalize(ref.target)]
    : [posix.normalize(ref.target)];
  for (const c of candidates) {
    const found = index.byPath.get(c.toLowerCase());
    if (found) return { found };
  }
  const named = index.byName.get(posix.basename(ref.target).toLowerCase()) ?? [];
  if (named.length === 1) return { found: named[0] };
  const sameFolder = named.filter((p) => posix.dirname(p) === posix.dirname(note));
  if (sameFolder.length === 1) return { found: sameFolder[0] };
  return named.length > 1 ? { ambiguous: named } : null;
}

async function canonical(path: string): Promise<string> {
  try {
    return await realpath(path);
  } catch {
    return resolve(path);
  }
}

const contains = (outer: string, inner: string) => inner === outer || inner.startsWith(outer + sep);

async function sameFile(a: string, b: string): Promise<boolean> {
  const [sa, sb] = await Promise.all([stat(a), stat(b)]);
  return sa.dev === sb.dev && sa.ino === sb.ino;
}

function checkPath(rel: string, vaultRoot: string): string {
  validatePath(rel);
  const clean = posix.normalize(rel).replace(/^\/+/, '');
  validateWithinVault(join(vaultRoot, clean), vaultRoot);
  return clean;
}

/**
 * Move notes (and the attachments they embed) from one vault to another.
 *
 * Each file is copied without overwriting, byte-compared, and only then removed
 * from the source. A destination that already holds different bytes is a
 * conflict and is left alone, so rerunning converges instead of clobbering.
 * Attachments that a note staying behind still references are copied, not moved.
 */
export async function noteMoveToVault(
  from: Vault,
  to: Vault,
  args: VaultMoveArgs,
  io: VaultMoveIo = defaultIo,
): Promise<VaultMoveReport> {
  const [fromRoot, toRoot] = await Promise.all([canonical(from.path), canonical(to.path)]);
  if (contains(fromRoot, toRoot) || contains(toRoot, fromRoot)) {
    throw new InvalidInputError(`Source and destination are the same vault, or one contains the other: ${fromRoot}, ${toRoot}`);
  }
  const prefix = args.to ? checkPath(args.to, to.path).replace(/\/+$/, '').replace(/^\.$/, '') : '';
  const paths = [...new Set(args.paths.map((p) => checkPath(p, from.path)))];
  for (const p of paths) validateWithinVault(join(to.path, prefix, p), to.path);
  if (paths.length === 0) throw new InvalidInputError('No paths to move');

  const dryRun = args.dryRun ?? false;
  const changed = { from: [] as string[], to: [] as string[] };
  const destRel = (rel: string) => (prefix ? posix.join(prefix, rel) : rel);

  async function transfer(rel: string, kind: MoveResult['kind'], removeSource: boolean): Promise<MoveResult> {
    const dest = destRel(rel);
    const result = (status: MoveStatus, detail?: string): MoveResult =>
      ({ path: rel, kind, status, dest, ...(detail ? { detail } : {}) });
    const srcPath = join(from.path, rel);
    const destPath = join(to.path, dest);
    try {
      const [srcBytes, destBytes] = await Promise.all([readOrNull(srcPath), readOrNull(destPath)]);

      if (!srcBytes) return result(destBytes ? 'already-moved' : 'missing');
      if (destBytes && !srcBytes.equals(destBytes)) return result('conflict', 'destination exists with different content');
      if (destBytes && (await sameFile(srcPath, destPath))) return result('conflict', 'destination is the source file');
      if (dryRun) return result(removeSource ? 'would-move' : 'would-copy');

      if (!destBytes) {
        await mkdir(dirname(destPath), { recursive: true });
        await io.copyFile(srcPath, destPath);
        const { atime, mtime } = await stat(srcPath);
        await utimes(destPath, atime, mtime);
      }
      const written = await readFile(destPath);
      if (!written.equals(srcBytes)) return result('mismatch', 'copy does not match source; source kept');
      if (!destBytes) changed.to.push(dest);
      if (!removeSource) return result('copied');
      const current = await readFile(srcPath);
      if (!current.equals(written)) return result('mismatch', 'source changed during the move; source kept');
      if (await sameFile(srcPath, destPath)) return result('conflict', 'destination is the source file');
      await unlink(srcPath);
      changed.from.push(rel);
      return result('moved');
    } catch (err: unknown) {
      return result('error', err instanceof Error ? err.message : String(err));
    }
  }

  const sourceFiles = await listFiles(from.path);
  const sourceIndex = indexFiles(sourceFiles);
  const destIndex = indexFiles(await listFiles(join(to.path, prefix)));

  const results: MoveResult[] = [];
  for (const p of paths.filter(isNote)) results.push(await transfer(p, 'note', true));

  const departed = new Set(results.filter((r) => DEPARTED.has(r.status)).map((r) => r.path));
  const remaining = sourceFiles.filter((f) => isNote(f) && !departed.has(f));

  const stillReferenced = new Set<string>();
  for (const note of remaining) {
    const content = await readFile(join(from.path, note), 'utf-8');
    for (const ref of fileRefs(content)) {
      const r = resolveRef(ref, note, sourceIndex);
      if (r && 'found' in r) stillReferenced.add(r.found);
      if (r && 'ambiguous' in r) r.ambiguous.forEach((a) => stillReferenced.add(a));
    }
  }

  for (const p of paths.filter((p) => !isNote(p))) results.push(await transfer(p, 'attachment', !stillReferenced.has(p)));

  const handled = new Set(paths);
  for (const note of departed) {
    const content = (await readOrNull(join(from.path, note))) ?? (await readFile(join(to.path, destRel(note))));
    for (const ref of fileRefs(content.toString('utf-8'))) {
      const r = resolveRef(ref, note, sourceIndex) ?? resolveRef(ref, note, destIndex);
      if (!r) {
        results.push({ path: ref.target, kind: 'attachment', status: 'unresolved', dest: '', detail: `referenced by ${note}` });
      } else if ('ambiguous' in r) {
        results.push({ path: ref.target, kind: 'attachment', status: 'ambiguous', dest: '', detail: `referenced by ${note}; candidates: ${r.ambiguous.join(', ')}` });
      } else if (!handled.has(r.found)) {
        handled.add(r.found);
        results.push(await transfer(r.found, 'attachment', !stillReferenced.has(r.found)));
      }
    }
  }

  const leftBehind = new Set(remaining.map((n) => noteTitle(n).toLowerCase()));
  const titles = new Map<string, string>();
  for (const n of departed) {
    const t = noteTitle(n);
    if (!leftBehind.has(t.toLowerCase())) titles.set(t.toLowerCase(), t);
  }

  const rewriteLinks = (args.rewriteLinks ?? false) && !dryRun;
  const links: DanglingLink[] = [];
  if (titles.size > 0) {
    for (const note of remaining) {
      const notePath = join(from.path, note);
      const content = await readFile(notePath, 'utf-8');
      const counts = new Map<string, number>();
      const rewritten = content.replace(WIKILINK, (whole, _bang: string, target: string, _heading: string, alias?: string) => {
        const title = titles.get(noteTitle(target.trim()).toLowerCase());
        if (!title) return whole;
        counts.set(title, (counts.get(title) ?? 0) + 1);
        return alias?.trim() || noteTitle(target.trim());
      });
      for (const [target, count] of counts) links.push({ note, target, count });
      if (rewriteLinks && rewritten !== content) {
        await writeFile(notePath, rewritten);
        changed.from.push(note);
      }
    }
  }

  return { dryRun, from, to, results, links, linksRewritten: rewriteLinks && links.length > 0, changed };
}
