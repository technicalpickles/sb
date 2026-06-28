import { Command } from 'commander';
import { resolveVault } from '../../core/vault.js';
import { inboxList } from '../../core/inbox.js';

export function registerInboxCommands(program: Command): void {
  const inbox = program
    .command('inbox')
    .description('Inbox operations');

  inbox
    .command('list')
    .description('List notes in vault inbox')
    .option('--vault <name>', 'Vault name (uses default if omitted)')
    .option('--detail', 'Include parsed frontmatter for each note')
    .action(async (opts: { vault?: string; detail?: boolean }) => {
      const v = await resolveVault(opts.vault);
      console.log(JSON.stringify(await inboxList(v, opts), null, 2));
    });
}
