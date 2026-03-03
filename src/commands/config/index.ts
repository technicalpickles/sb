import { Command } from 'commander';
import { ConfigManager, ConfigNotFoundError } from '../../services/ConfigManager.js';
import { readFile } from 'fs/promises';

export function registerConfigCommands(program: Command): void {
  const config = program
    .command('config')
    .description('Global configuration operations');

  config
    .command('show')
    .description('Show raw config file')
    .action(async () => {
      const mgr = new ConfigManager();
      try {
        const content = await readFile(mgr.configPath, 'utf-8');
        console.log(content);
      } catch (err: unknown) {
        if (err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === 'ENOENT') {
          console.error('Second brain not configured. Run /second-brain:setup first.');
          process.exit(1);
        }
        throw err;
      }
    });

  config
    .command('vaults')
    .description('List vaults as JSON')
    .action(async () => {
      const mgr = new ConfigManager();
      try {
        const cfg = await mgr.load();
        console.log(JSON.stringify(cfg.vaults, null, 2));
      } catch (err: unknown) {
        if (err instanceof ConfigNotFoundError) {
          console.error(err.message);
          process.exit(1);
        }
        throw err;
      }
    });

  config
    .command('default')
    .description('Show default vault name')
    .action(async () => {
      const mgr = new ConfigManager();
      try {
        const cfg = await mgr.load();
        if (cfg.default) {
          console.log(cfg.default);
        } else {
          console.error('No default vault configured');
          process.exit(1);
        }
      } catch (err: unknown) {
        if (err instanceof ConfigNotFoundError) {
          console.error(err.message);
          process.exit(1);
        }
        throw err;
      }
    });
}
