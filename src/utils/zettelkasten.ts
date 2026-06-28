/**
 * Parse a Zettelkasten filename (`YYYYMMDDHHmm slug.md`) into its timestamp and
 * title. Returns `null` when the filename doesn't match the convention. Shared by
 * the inbox listing and the vault-wide note lister so the format lives in one place.
 */
export function parseZettelkastenFilename(filename: string): { timestamp: string; title: string } | null {
  const match = filename.match(/^(\d{12})\s+(.+)\.md$/);
  if (!match) return null;
  return { timestamp: match[1], title: match[2] };
}
