import { Command } from 'commander';
import { ProvenanceService } from '../../services/ProvenanceService.js';

export function registerProvenanceCommands(program: Command): void {
  program
    .command('provenance')
    .description('Show git context for the current directory')
    .action(() => {
      const service = new ProvenanceService();
      const info = service.detect();
      console.log(JSON.stringify(info, null, 2));
    });
}
