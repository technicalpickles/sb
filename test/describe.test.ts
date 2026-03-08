import { describe, it, expect } from 'vitest';
import { execSync } from 'child_process';

function run(args: string): unknown {
  const output = execSync(`npx tsx src/index.ts ${args}`, {
    cwd: process.cwd(),
    encoding: 'utf-8',
  });
  return JSON.parse(output.trim());
}

describe('sb describe', () => {
  it('outputs full command schema', () => {
    const schema = run('describe') as { name: string; subcommands: unknown[] };

    expect(schema.name).toBe('sb');
    expect(schema.subcommands).toBeDefined();
    expect(schema.subcommands!.length).toBeGreaterThan(0);

    const names = (schema.subcommands as Array<{ name: string }>).map((s) => s.name);
    expect(names).toContain('note');
    expect(names).toContain('config');
    expect(names).toContain('daily');
    expect(names).toContain('vault');
    expect(names).toContain('provenance');
    expect(names).toContain('inbox');
    expect(names).toContain('permissions');
    expect(names).toContain('init');
    // describe itself should be excluded
    expect(names).not.toContain('describe');
  });

  it('outputs schema for a specific command', () => {
    const schema = run('describe --command note') as {
      name: string;
      subcommands: Array<{ name: string; options: Array<{ flags: string }> }>;
    };

    expect(schema.name).toBe('note');
    expect(schema.subcommands).toBeDefined();

    const names = schema.subcommands.map((s) => s.name);
    expect(names).toContain('create');
    expect(names).toContain('move');
    expect(names).toContain('read');
    expect(names).toContain('context');

    // Verify create has expected options
    const create = schema.subcommands.find((s) => s.name === 'create')!;
    const flags = create.options.map((o) => o.flags);
    expect(flags.some((f) => f.includes('--title'))).toBe(true);
    expect(flags.some((f) => f.includes('--dry-run'))).toBe(true);
  });

  it('errors on unknown command', () => {
    expect(() => run('describe --command nonexistent')).toThrow();
  });
});
