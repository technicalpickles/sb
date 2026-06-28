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
): Promise<DailyAppendResult & { content: string }> {
  const path = (await manager(vault)).dailyPath();
  return { path, section: args.section, content: args.content };
}

/** Append content to a section of today's daily note. */
export async function dailyAppend(vault: Vault, args: DailyAppendArgs): Promise<DailyAppendResult> {
  const mgr = await manager(vault);
  const path = mgr.dailyPath();
  await mgr.appendToSection(path, args.section, args.content);
  return { path, section: args.section };
}
