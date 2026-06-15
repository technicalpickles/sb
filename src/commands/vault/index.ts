import { Command } from 'commander';
import { ConfigManager } from '../../services/ConfigManager.js';
import { ObsidianParser } from '../../services/ObsidianParser.js';
import { VaultDiscovery } from '../../services/VaultDiscovery.js';

async function resolveVault(name?: string) {
  const mgr = new ConfigManager();
  const cfg = await mgr.load();
  const v = mgr.getVault(cfg, name);
  if (!v) {
    if (!name) {
      console.error('No vault specified and no default configured');
    } else {
      console.error(`Vault "${name}" not found`);
    }
    process.exit(1);
  }
  return v;
}

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
      console.log(JSON.stringify(v, null, 2));
    });

  vault
    .command('obsidian')
    .description('Parse .obsidian config as JSON')
    .option('--vault <name>', 'Vault name (uses default if omitted)')
    .action(async (opts: { vault?: string }) => {
      const v = await resolveVault(opts.vault);
      const parser = new ObsidianParser(v.path);
      const config = await parser.load();
      console.log(JSON.stringify(config, null, 2));
    });

  vault
    .command('structure')
    .description('Discover PARA and Johnny Decimal folder structure')
    .option('--vault <name>', 'Vault name (uses default if omitted)')
    .action(async (opts: { vault?: string }) => {
      const v = await resolveVault(opts.vault);
      const discovery = new VaultDiscovery(v.path);
      const structure = await discovery.discover();
      console.log(JSON.stringify(structure, null, 2));
    });
}
