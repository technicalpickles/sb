import { constants, copyFile as fsCopyFile } from 'fs';
import { mkdir, readdir, readFile, stat, unlink, utimes, writeFile } from 'fs/promises';
import { promisify } from 'util';
import { dirname, join, posix, resolve } from 'path';
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
  | 'unresolved';

/** Statuses where a file did not end up where it was asked to go. */
export const FAILED_STATUSES: ReadonlySet<MoveStatus> = new Set(['conflict', 'mismatch', 'missing', 'ambiguous']);

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
const MD_EMBED = /!\[[^\]]*\]\(\s*(<[^>]+>|[^)\s]+)/g;

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

/** Attachment targets embedded by a note: `![[file.ext]]` and `![alt](path)`, excluding notes and URLs. */
function embedTargets(content: string): { target: string; relative: boolean }[] {
  const out: { target: string; relative: boolean }[] = [];
  for (const m of content.matchAll(WIKILINK)) {
    if (m[1]) out.push({ target: m[2].trim(), relative: false });
  }
  for (const m of content.matchAll(MD_EMBED)) {
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

type Resolution = { found: string } | { ambiguous: string[] } | null;

/** Resolve an embed the way Obsidian does: path from the vault root or the note's folder, else unique basename. */
function resolveEmbed(
  embed: { target: string; relative: boolean },
  note: string,
  files: ReadonlySet<string>,
  byName: ReadonlyMap<string, string[]>,
): Resolution {
  const candidates = embed.relative
    ? [posix.normalize(posix.join(posix.dirname(note), embed.target)), posix.normalize(embed.target)]
    : [posix.normalize(embed.target)];
  for (const c of candidates) {
    if (files.has(c)) return { found: c };
  }
  const named = byName.get(posix.basename(embed.target)) ?? [];
  if (named.length === 1) return { found: named[0] };
  const sameFolder = named.filter((p) => posix.dirname(p) === posix.dirname(note));
  if (sameFolder.length === 1) return { found: sameFolder[0] };
  return named.length > 1 ? { ambiguous: named } : null;
}

function indexByName(files: string[]): Map<string, string[]> {
  const byName = new Map<string, string[]>();
  for (const f of files) {
    const name = posix.basename(f);
    byName.set(name, [...(byName.get(name) ?? []), f]);
  }
  return byName;
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
 * Attachments that a note staying behind still embeds are copied, not moved.
 */
export async function noteMoveToVault(
  from: Vault,
  to: Vault,
  args: VaultMoveArgs,
  io: VaultMoveIo = defaultIo,
): Promise<VaultMoveReport> {
  if (resolve(from.path) === resolve(to.path)) {
    throw new InvalidInputError(`Source and destination are the same vault: ${from.path}`);
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
    const [srcBytes, destBytes] = await Promise.all([readOrNull(srcPath), readOrNull(destPath)]);

    if (!srcBytes) return result(destBytes ? 'already-moved' : 'missing');
    if (destBytes && !srcBytes.equals(destBytes)) return result('conflict', 'destination exists with different content');
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
    await unlink(srcPath);
    changed.from.push(rel);
    return result('moved');
  }

  const sourceFiles = await listFiles(from.path);
  const sourceSet = new Set(sourceFiles);
  const sourceByName = indexByName(sourceFiles);
  const destFiles = await listFiles(join(to.path, prefix));
  const destSet = new Set(destFiles);
  const destByName = indexByName(destFiles);

  const results: MoveResult[] = [];
  for (const p of paths) results.push(await transfer(p, isNote(p) ? 'note' : 'attachment', true));

  const departed = new Set(results.filter((r) => DEPARTED.has(r.status)).map((r) => r.path));
  const remaining = sourceFiles.filter((f) => isNote(f) && !departed.has(f));

  const stillEmbedded = new Set<string>();
  for (const note of remaining) {
    const content = await readFile(join(from.path, note), 'utf-8');
    for (const e of embedTargets(content)) {
      const r = resolveEmbed(e, note, sourceSet, sourceByName);
      if (r && 'found' in r) stillEmbedded.add(r.found);
      if (r && 'ambiguous' in r) r.ambiguous.forEach((a) => stillEmbedded.add(a));
    }
  }

  const handled = new Set(paths);
  for (const note of [...departed].filter(isNote)) {
    const content = (await readOrNull(join(from.path, note))) ?? (await readFile(join(to.path, destRel(note))));
    for (const e of embedTargets(content.toString('utf-8'))) {
      const r = resolveEmbed(e, note, sourceSet, sourceByName) ?? resolveEmbed(e, note, destSet, destByName);
      if (!r) {
        results.push({ path: e.target, kind: 'attachment', status: 'unresolved', dest: '', detail: `embedded by ${note}` });
      } else if ('ambiguous' in r) {
        results.push({ path: e.target, kind: 'attachment', status: 'ambiguous', dest: '', detail: `embedded by ${note}; candidates: ${r.ambiguous.join(', ')}` });
      } else if (!handled.has(r.found)) {
        handled.add(r.found);
        results.push(await transfer(r.found, 'attachment', !stillEmbedded.has(r.found)));
      }
    }
  }

  const leftBehind = new Set(remaining.map((n) => noteTitle(n).toLowerCase()));
  const titles = new Map<string, string>();
  for (const n of departed) {
    const t = noteTitle(n);
    if (isNote(n) && !leftBehind.has(t.toLowerCase())) titles.set(t.toLowerCase(), t);
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
