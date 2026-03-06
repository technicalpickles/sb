import { Command } from 'commander';
import { ConfigManager, ConfigNotFoundError } from '../../services/ConfigManager.js';

export function registerPermissionsCommands(program: Command): void {
  program
    .command('permissions')
    .description('Show Claude Code permission entries for a vault')
    .option('--vault <name>', 'Vault name (uses default if omitted)')
    .action(async (opts: { vault?: string }) => {
      const mgr = new ConfigManager();
      let cfg;
      try {
        cfg = await mgr.load();
      } catch (err: unknown) {
        if (err instanceof ConfigNotFoundError) {
          console.error(err.message);
          process.exit(1);
        }
        throw err;
      }

      const v = mgr.getVault(cfg, opts.vault);
      if (!v) {
        if (!opts.vault) {
          console.error('No vault specified and no default configured');
        } else {
          console.error(`Vault "${opts.vault}" not found`);
        }
        process.exit(1);
      }

      // Use the raw path (with ~) for permissions since Claude Code expands ~ itself
      const permPath = `${v.path}/**/*.md`;

      console.log(JSON.stringify({
        vault: v.name,
        path: v.path,
        permissions: [
          `Read(${permPath})`,
          `Write(${permPath})`,
          `Edit(${permPath})`,
        ],
      }, null, 2));
    });
}
