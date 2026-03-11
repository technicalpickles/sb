import { Command } from 'commander';

interface OptionSchema {
  flags: string;
  description: string;
  required: boolean;
  defaultValue?: unknown;
}

interface CommandSchema {
  name: string;
  description: string;
  options: OptionSchema[];
  subcommands?: CommandSchema[];
}

function describeCommand(cmd: Command): CommandSchema {
  const options: OptionSchema[] = cmd.options.map((opt) => ({
    flags: opt.flags,
    description: opt.description ?? '',
    required: opt.mandatory ?? false,
    ...(opt.defaultValue !== undefined ? { defaultValue: opt.defaultValue } : {}),
  }));

  const subcommands = cmd.commands
    .filter((sub) => sub.name() !== 'describe')
    .map((sub) => describeCommand(sub));

  return {
    name: cmd.name(),
    description: cmd.description(),
    options,
    ...(subcommands.length > 0 ? { subcommands } : {}),
  };
}

export function registerDescribeCommands(program: Command): void {
  program
    .command('describe')
    .description('Output command schema as JSON for agent introspection')
    .option('--command <name>', 'Describe a specific command')
    .action((opts: { command?: string }) => {
      if (opts.command) {
        const target = program.commands.find((c) => c.name() === opts.command);
        if (!target) {
          console.error(`Unknown command: ${opts.command}`);
          process.exit(1);
        }
        console.log(JSON.stringify(describeCommand(target), null, 2));
      } else {
        console.log(JSON.stringify(describeCommand(program), null, 2));
      }
    });
}
