import type { Vault } from '../services/ConfigManager.js';
import { ObsidianParser } from '../services/ObsidianParser.js';
import { DailyNoteManager } from '../services/DailyNoteManager.js';

export interface DailyAppendArgs {
  section: string;
  content: string;
}

export interface DailyAppendResult {
  path: string;
  section: string;
  /** Whether today's daily note had to be created (from the vault's daily-note
   * template, if configured) because it didn't exist yet. */
  created: boolean;
}

async function manager(vault: Vault): Promise<DailyNoteManager> {
  const obsConfig = await new ObsidianParser(vault.path).load();
  return new DailyNoteManager(vault.path, obsConfig);
}

/** Path to today's daily note. */
export async function dailyPath(vault: Vault): Promise<string> {
  return (await manager(vault)).dailyPath();
}

/** Preview a daily append: the target path, section, and content (no write). */
export async function dailyAppendPreview(
  vault: Vault,
  args: DailyAppendArgs,
): Promise<Omit<DailyAppendResult, 'created'> & { content: string }> {
  const path = (await manager(vault)).dailyPath();
  return { path, section: args.section, content: args.content };
}

/** Append content to a section of today's daily note, creating the note first if needed. */
export async function dailyAppend(vault: Vault, args: DailyAppendArgs): Promise<DailyAppendResult> {
  const mgr = await manager(vault);
  const path = mgr.dailyPath();
  const { created } = await mgr.appendToSection(path, args.section, args.content);
  return { path, section: args.section, created };
}
