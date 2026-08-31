# sb - Claude Development Guide

## What is sb?

A CLI for Obsidian vault management, designed to support the second-brain Claude plugin with deterministic, testable operations. The CLI provides data (vault structure, note analysis, config) and executes actions (create, move, append). The agent makes decisions (routing, selection) using CLI-provided context.

## Tech Stack

- **Language**: TypeScript (strict mode, ES modules)
- **Runtime**: Node.js 20+
- **CLI Framework**: Commander.js
- **MCP Server**: @modelcontextprotocol/sdk (stdio + HTTP via Express), zod schemas
- **Testing**: Vitest

## Project Structure

```
src/
├── index.ts              # CLI entry point
├── commands/             # Command implementations
│   ├── config/           # config show, vaults, default, qmd-collection
│   ├── vault/            # vault info, obsidian, structure
│   ├── note/             # note create, read, context, list, move
│   ├── daily/            # daily path, append
│   ├── inbox/            # inbox list
│   ├── init/             # init (vault setup)
│   ├── provenance/       # provenance (git context)
│   ├── permissions/      # permissions (Claude Code entries)
│   ├── describe/         # describe (schema introspection)
│   ├── mcp/              # mcp (run MCP server: stdio, or --listen for HTTP)
│   └── hooks/            # hooks devlog-nudge immediate|mark|check (generic hook-nudge mechanics)
├── core/                 # Shared business logic for CLI + MCP adapters
│   ├── vault.ts          # resolveVault, structure, obsidian config
│   ├── note.ts           # read, context, list, move, create
│   ├── daily.ts          # daily path + append
│   └── inbox.ts          # inbox listing
├── mcp/                  # MCP server
│   ├── server.ts         # McpServer + tool registration (vault/note/daily/inbox)
│   └── http.ts           # Streamable HTTP transport (Express)
├── services/             # Business logic
│   ├── ConfigManager.ts  # Parse ~/.claude/second-brain.md
│   ├── ObsidianParser.ts # Parse .obsidian/*.json
│   ├── VaultDiscovery.ts # PARA folder discovery
│   ├── NoteBuilder.ts    # Zettelkasten note creation + preview
│   ├── NoteAnalyzer.ts   # Keyword extraction, routing context
│   ├── NoteLister.ts     # Note listing + frontmatter summaries
│   ├── DailyNoteManager.ts
│   └── ProvenanceService.ts # Git context detection
├── types/
│   └── index.ts
└── utils/
    ├── zettelkasten.ts   # Filename generation
    ├── markdown.ts       # Frontmatter parsing, section/link extraction
    ├── errors.ts         # Typed error hierarchy (SbError + subclasses)
    └── validation.ts     # Path validation, traversal protection
test/
├── fixtures/             # Mock vault structures
└── *.test.ts             # Test files per command/feature
```

## Development Workflow

```bash
npm install          # Install dependencies
npm run build        # Compile TypeScript
npm test             # Run tests
npm run test:watch   # Watch mode
```

## Releases

Versioning and `CHANGELOG.md` are automated by [release-please](https://github.com/googleapis/release-please): it watches `main`, and when it finds commits it can parse it opens/updates a release PR that bumps `package.json` and generates changelog entries. Merging that PR cuts the release.

PRs are **squash-merged only** (repo setting), and **the PR title must be a [Conventional Commit](https://www.conventionalcommits.org/)** (`feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, etc., optionally scoped like `fix(cli):`) — a GitHub Action (`.github/workflows/pr-title-lint.yml`) enforces this on every PR. The squashed commit that lands on `main` is exactly the PR title, and that's the string release-please parses: `feat`/`fix` trigger a version bump and a changelog line, `BREAKING CHANGE` (or `!` after the type) triggers a major bump, other types are recorded but don't bump. A non-conventional title means release-please has nothing to act on — this is why the automation went quiet for a while before this convention was enforced.

`main` is a protected branch requiring the `test (20)`, `test (22)`, and `lint` status checks to pass before merge, so a PR can't land without a valid Conventional Commit title.

## Code Conventions

### TypeScript
- Strict mode enabled
- No `any` without explicit reasoning
- ES module imports (`import`), never `require`

### Output
- Commands output JSON for agent consumption
- Exit code 0 (success), 1 (failure)
- Mutating commands support `--dry-run` for safe previews
- `sb describe` provides runtime schema introspection

### Input Validation
- Path arguments validated against traversal (`../`), control characters, URL-encoding
- `validatePath()` and `validateWithinVault()` in `utils/validation.ts`

### Testing
- Vitest with temp directories for vault fixtures
- Each service has unit tests
- Integration tests verify full workflows
- Tests that spawn the CLI as a subprocess always run the built binary (`node dist/index.js`) via the shared `test/helpers/run-cli.ts` — never `npx tsx` or an ad hoc `execSync`/`execFileSync` wrapper. `npm test` therefore requires `npm run build` first (CI always builds before testing)

## Key Design Decisions

1. **Separation of concerns**: CLI gathers information and executes actions. Agent makes decisions.
2. **Agent-first design**: JSON output, `--dry-run`, schema introspection, input validation
3. **Config location**: `~/.claude/second-brain.md` (same as plugin)
4. **Zettelkasten naming**: `YYYYMMDDHHmm slug.md` format
5. **PARA + Johnny Decimal discovery**: Heuristic folder type detection for PARA (Areas/, Resources/, Projects/) and, alongside it, Johnny Decimal (numbered area `60-69 ...`, category `67 ...`, and ID `67.01 ...` folders, emitted with `type: 'jd'` plus `code` and `area`). Both are auto-detected, since a vault mid-migration runs them side by side.
6. **Native Claude tools**: Agents use Claude's Read/Write/Edit for vault files, sb handles config and structure
7. **Core/adapter split**: `src/core/` holds vault/note/daily/inbox logic; `commands/` (CLI) and `mcp/` (MCP server, `sb mcp`) are thin adapters over it, so both share one implementation and one error model (`utils/errors.ts`).
