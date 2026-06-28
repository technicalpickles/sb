import { readFile, rename } from 'fs/promises';
import { join } from 'path';
import type { Vault } from '../services/ConfigManager.js';
import { NoteBuilder } from '../services/NoteBuilder.js';
import { NoteLister, type NoteEntry, type DetailedNoteEntry } from '../services/NoteLister.js';
import { NoteAnalyzer, type NoteContext } from '../services/NoteAnalyzer.js';
import { ObsidianParser } from '../services/ObsidianParser.js';
import { ProvenanceService } from '../services/ProvenanceService.js';
import { parseFrontmatter, extractTitle, extractSections, extractWikiLinks } from '../utils/markdown.js';
import { validatePath, validateWithinVault } from '../utils/validation.js';
import { InvalidInputError, NotFoundError } from '../utils/errors.js';

export interface NoteCreateArgs {
  title: string;
  /** Body content; omit for a frontmatter-only note. */
  content?: string;
  /** Provenance string, or `'auto'` to derive git context from the cwd. */
  source?: string;
}

export interface CreatedNote {
  path: string;
  filename: string;
}

export interface NotePreview {
  path: string;
  filename: string;
  content: string;
}

export interface NoteReadResult {
  path: string;
  title: string;
  frontmatter: Record<string, string> | null;
  sections: string[];
  links: string[];
  content: string;
}

export interface NoteMoveArgs {
  from: string;
  to: string;
}

export interface NoteMoveResult {
  from: string;
  to: string;
}

/** Resolve the inbox folder and a validated NoteBuilder for a create/preview. */
async function buildForCreate(vault: Vault, args: NoteCreateArgs): Promise<{ builder: NoteBuilder; inboxFolder: string }> {
  const obsConfig = await new ObsidianParser(vault.path).load();
  const inboxFolder = obsConfig.inbox ?? 'Inbox';

  let source = args.source;
  if (source === 'auto') {
    const provenance = new ProvenanceService();
    source = provenance.toSourceString(provenance.detect());
  }

  let builder: NoteBuilder;
  try {
    builder = new NoteBuilder({ title: args.title, content: args.content, source });
  } catch (err: unknown) {
    // NoteBuilder rejects explicitly-empty content; surface it as a typed input error.
    throw new InvalidInputError(err instanceof Error ? err.message : String(err));
  }
  return { builder, inboxFolder };
}

/** Create a Zettelkasten note in the vault inbox. */
export async function noteCreate(vault: Vault, args: NoteCreateArgs): Promise<CreatedNote> {
  const { builder, inboxFolder } = await buildForCreate(vault, args);
  return builder.create(vault.path, inboxFolder);
}

/** Preview the note that `noteCreate` would write, without touching the filesystem. */
export async function noteCreatePreview(vault: Vault, args: NoteCreateArgs): Promise<NotePreview> {
  const { builder, inboxFolder } = await buildForCreate(vault, args);
  return builder.preview(vault.path, inboxFolder);
}

/** List notes across the vault, optionally filtered by frontmatter `type`. */
export async function noteList(
  vault: Vault,
  args: { type?: string; detail?: boolean } = {},
): Promise<NoteEntry[] | DetailedNoteEntry[]> {
  return new NoteLister(vault.path).list({ type: args.type, detail: args.detail });
}

/** Read and parse a vault note as structured JSON. */
export async function noteRead(vault: Vault, args: { note: string }): Promise<NoteReadResult> {
  validatePath(args.note);
  const fullPath = join(vault.path, args.note);
  validateWithinVault(fullPath, vault.path);

  let content: string;
  try {
    content = await readFile(fullPath, 'utf-8');
  } catch (err: unknown) {
    if (err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new NotFoundError(`Note not found: ${args.note}`);
    }
    throw err;
  }

  const { frontmatter, body } = parseFrontmatter(content);
  const title = extractTitle(body);
  const sections = extractSections(body);
  const links = extractWikiLinks(content);

  const finalTitle = title !== 'Untitled'
    ? title
    : args.note.split('/').pop()?.replace(/\.md$/, '') ?? 'Untitled';

  return {
    path: args.note,
    title: finalTitle,
    frontmatter: Object.keys(frontmatter).length > 0 ? frontmatter : null,
    sections,
    links,
    content: body.trim(),
  };
}

/** Validate a move and compute the source/destination paths (no filesystem change). */
function resolveMove(vault: Vault, args: NoteMoveArgs): { fromPath: string; toPath: string; result: NoteMoveResult } {
  validatePath(args.from);
  validatePath(args.to);

  const filename = args.from.split('/').pop()!;
  const fromPath = join(vault.path, args.from);
  const toPath = join(vault.path, args.to, filename);

  validateWithinVault(fromPath, vault.path);
  validateWithinVault(toPath, vault.path);

  return { fromPath, toPath, result: { from: args.from, to: `${args.to}${filename}` } };
}

/** Preview a move: the from/to paths that `noteMove` would use. */
export function noteMovePreview(vault: Vault, args: NoteMoveArgs): NoteMoveResult {
  return resolveMove(vault, args).result;
}

/** Move a note to a destination folder. */
export async function noteMove(vault: Vault, args: NoteMoveArgs): Promise<NoteMoveResult> {
  const { fromPath, toPath, result } = resolveMove(vault, args);
  await rename(fromPath, toPath);
  return result;
}

/** Build full routing context (keywords + destinations + related notes) for a note. */
export async function noteContext(vault: Vault, args: { note: string }): Promise<NoteContext> {
  validatePath(args.note);
  const fullPath = join(vault.path, args.note);
  validateWithinVault(fullPath, vault.path);

  try {
    return await new NoteAnalyzer(vault.path).buildContext(args.note);
  } catch (err: unknown) {
    if (err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new NotFoundError(`Note not found: ${args.note}`);
    }
    throw err;
  }
}
