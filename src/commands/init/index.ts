import { Command } from 'commander';
import { ObsidianParser } from '../../services/ObsidianParser.js';
import { readFile, writeFile, mkdir, access } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';
import { createInterface } from 'readline';

async function pathExists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function promptUser(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

function expandTilde(filePath: string): string {
  if (filePath === '~') return homedir();
  if (filePath.startsWith('~/')) return join(homedir(), filePath.slice(2));
  return filePath;
}

interface InitOptions {
  name?: string;
  path?: string;
  scaffold?: boolean;
  dryRun?: boolean;
}

async function runInit(opts: InitOptions): Promise<void> {
  let vaultPath = opts.path;
  let vaultName = opts.name;

  // Interactive mode: prompt for missing values
  if (!vaultPath) {
    vaultPath = await promptUser('Vault path: ');
  }
  if (!vaultName) {
    vaultName = await promptUser('Vault name (e.g. primary): ');
  }

  if (!vaultPath || !vaultName) {
    console.error('Both vault path and name are required');
    process.exit(1);
  }

  const expandedPath = expandTilde(vaultPath);

  // Validate path exists
  if (!await pathExists(expandedPath)) {
    console.error(`Path not found: ${vaultPath}`);
    process.exit(1);
  }

  // Check for .obsidian/
  const hasObsidian = await pathExists(join(expandedPath, '.obsidian'));
  if (!hasObsidian) {
    console.error(`Warning: ${vaultPath} does not have .obsidian/ directory`);
    console.error('This may not be an Obsidian vault. Continuing anyway.');
  }

  // Parse .obsidian/ settings if present
  let obsidianConfig = null;
  if (hasObsidian) {
    const parser = new ObsidianParser(expandedPath);
    obsidianConfig = await parser.load();
  }

  // Dry run: show what would happen
  if (opts.dryRun) {
    const permPath = `${vaultPath}/**/*.md`;
    console.log(JSON.stringify({
      dryRun: true,
      vault: vaultName,
      path: vaultPath,
      obsidian: hasObsidian,
      scaffold: opts.scaffold ?? false,
      permissions: [
        `Read(${permPath})`,
        `Write(${permPath})`,
        `Edit(${permPath})`,
      ],
    }, null, 2));
    return;
  }

  // Write/update config
  const configDir = join(homedir(), '.claude');
  const configPath = join(configDir, 'second-brain.md');
  await mkdir(configDir, { recursive: true });

  let existingContent = '';
  try {
    existingContent = await readFile(configPath, 'utf-8');
  } catch {
    // File doesn't exist yet
  }

  if (existingContent) {
    // Check if vault already exists
    if (existingContent.includes(`- ${vaultName}:`)) {
      console.error(`Vault "${vaultName}" already exists in config. Use a different name.`);
      process.exit(1);
    }

    // Add vault to existing config: insert before Default line or at end of Vaults section
    const defaultLine = existingContent.match(/^Default: .+$/m);
    if (defaultLine) {
      existingContent = existingContent.replace(
        defaultLine[0],
        `- ${vaultName}: ${vaultPath}\n\n${defaultLine[0]}`
      );
    } else {
      // Append after ## Vaults entries
      existingContent = existingContent.replace(
        /^(## Vaults\n(?:.*\n)*?)\n/m,
        `$1- ${vaultName}: ${vaultPath}\n\n`
      );
    }
    await writeFile(configPath, existingContent);
  } else {
    // Create fresh config
    const config = [
      '# Second Brain Configuration',
      '',
      '## Vaults',
      '',
      `- ${vaultName}: ${vaultPath}`,
      '',
      `Default: ${vaultName}`,
      '',
    ].join('\n');
    await writeFile(configPath, config);
  }

  // Scaffold vault CLAUDE.md if requested
  if (opts.scaffold) {
    const claudeMdPath = join(expandedPath, 'CLAUDE.md');
    if (await pathExists(claudeMdPath)) {
      console.error('Vault CLAUDE.md already exists, skipping scaffold.');
    } else {
      const template = generateVaultClaudeMd(vaultName, obsidianConfig);
      await writeFile(claudeMdPath, template);
    }
  }

  // Output result
  const permPath = `${vaultPath}/**/*.md`;
  console.log(JSON.stringify({
    vault: vaultName,
    path: vaultPath,
    obsidian: hasObsidian,
    config: configPath,
    scaffolded: opts.scaffold && !await pathExists(join(expandedPath, 'CLAUDE.md')),
    permissions: [
      `Read(${permPath})`,
      `Write(${permPath})`,
      `Edit(${permPath})`,
    ],
  }, null, 2));
}

function generateVaultClaudeMd(name: string, obsidianConfig: any): string {
  const lines = [
    `# ${name} vault`,
    '',
    '## Structure',
    '',
  ];

  if (obsidianConfig) {
    if (obsidianConfig.inbox) lines.push(`- Inbox: ${obsidianConfig.inbox}/`);
    if (obsidianConfig.dailyNotes?.folder) lines.push(`- Daily notes: ${obsidianConfig.dailyNotes.folder}/`);
    if (obsidianConfig.templates?.folder) lines.push(`- Templates: ${obsidianConfig.templates.folder}/`);
  }

  lines.push('', '## Routing', '', 'Add disambiguation rules here as your vault grows.', '');
  return lines.join('\n');
}

export function registerInitCommands(program: Command): void {
  program
    .command('init')
    .description('Initialize vault configuration')
    .option('--name <name>', 'Vault name')
    .option('--path <path>', 'Path to Obsidian vault')
    .option('--scaffold', 'Create vault CLAUDE.md from template')
    .option('--dry-run', 'Show what would be done without writing')
    .action(async (opts: InitOptions) => {
      await runInit(opts);
    });
}
