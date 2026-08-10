import { Command } from 'commander';
import { resolveVault, vaultInfo, vaultObsidian, vaultStructure } from '../../core/vault.js';

export function registerVaultCommands(program: Command): void {
  const vault = program
    .command('vault')
    .description('Vault operations');

  vault
    .command('info')
    .description('Show vault metadata')
    .option('--vault <name>', 'Vault name (uses default if omitted)')
    .action(async (opts: { vault?: string }) => {
      const v = await resolveVault(opts.vault);
      console.log(JSON.stringify(vaultInfo(v), null, 2));
    });

  vault
    .command('obsidian')
    .description('Parse .obsidian config as JSON')
    .option('--vault <name>', 'Vault name (uses default if omitted)')
    .action(async (opts: { vault?: string }) => {
      const v = await resolveVault(opts.vault);
      console.log(JSON.stringify(await vaultObsidian(v), null, 2));
    });

  vault
    .command('structure')
    .description('Discover PARA and Johnny Decimal folder structure. Returns { destinations: [{ path, type, ... }] }, not a bare array.')
    .option('--vault <name>', 'Vault name (uses default if omitted)')
    .action(async (opts: { vault?: string }) => {
      const v = await resolveVault(opts.vault);
      console.log(JSON.stringify(await vaultStructure(v), null, 2));
    });
}
