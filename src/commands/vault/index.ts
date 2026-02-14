import { Command } from 'commander';
import { ConfigManager } from '../../services/ConfigManager.js';
import { ObsidianParser } from '../../services/ObsidianParser.js';
import { VaultDiscovery } from '../../services/VaultDiscovery.js';

function resolveVault(name: string) {
  const mgr = new ConfigManager();
  return async () => {
    const cfg = await mgr.load();
    const v = mgr.getVault(cfg, name);
    if (!v) {
      console.error(`Vault "${name}" not found`);
      process.exit(1);
    }
    return v;
  };
}

export function registerVaultCommands(program: Command): void {
  const vault = program
    .command('vault <name>')
    .description('Vault operations');

  vault
    .command('info')
    .description('Show vault metadata')
    .action(async (_opts: unknown, cmd: Command) => {
      const name = cmd.parent!.args[0];
      const getVault = resolveVault(name);
      const v = await getVault();
      console.log(JSON.stringify(v, null, 2));
    });

  vault
    .command('obsidian')
    .description('Parse .obsidian config as JSON')
    .action(async (_opts: unknown, cmd: Command) => {
      const name = cmd.parent!.args[0];
      const getVault = resolveVault(name);
      const v = await getVault();
      const parser = new ObsidianParser(v.path);
      const config = await parser.load();
      console.log(JSON.stringify(config, null, 2));
    });

  vault
    .command('structure')
    .description('Discover PARA folder structure')
    .action(async (_opts: unknown, cmd: Command) => {
      const name = cmd.parent!.args[0];
      const getVault = resolveVault(name);
      const v = await getVault();
      const discovery = new VaultDiscovery(v.path);
      const structure = await discovery.discover();
      console.log(JSON.stringify(structure, null, 2));
    });
}
