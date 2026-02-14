# sb - Claude Development Guide

## What is sb?

A CLI for Obsidian vault management, designed to support the second-brain Claude plugin with deterministic, testable operations. The CLI provides data (vault structure, note analysis, config) and executes actions (create, move, append). The agent makes decisions (routing, selection) using CLI-provided context.

## Tech Stack

- **Language**: TypeScript (strict mode, ES modules)
- **Runtime**: Node.js 20+
- **CLI Framework**: Commander.js
- **Testing**: Vitest

## Project Structure

```
src/
├── index.ts              # CLI entry point
├── commands/             # Command implementations
│   ├── config/           # config show, vaults, default
│   ├── vault/            # vault info, obsidian, structure
│   ├── note/             # note create, context, move
│   └── daily/            # daily path, append
├── services/             # Business logic
│   ├── ConfigManager.ts  # Parse ~/.claude/second-brain.md
│   ├── ObsidianParser.ts # Parse .obsidian/*.json
│   ├── VaultDiscovery.ts # PARA folder discovery
│   ├── NoteBuilder.ts    # Zettelkasten note creation
│   ├── NoteAnalyzer.ts   # Keyword extraction, routing context
│   └── DailyNoteManager.ts
├── types/
│   └── index.ts
└── utils/
    ├── zettelkasten.ts   # Filename generation
    └── markdown.ts       # Frontmatter parsing
test/
├── fixtures/             # Mock vault structures
└── commands/             # Command tests
```

## Development Workflow

```bash
npm install          # Install dependencies
npm run build        # Compile TypeScript
npm test             # Run tests
npm run test:watch   # Watch mode
```

## Code Conventions

### TypeScript
- Strict mode enabled
- No `any` without explicit reasoning
- ES module imports (`import`), never `require`

### Output
- Commands output JSON for agent consumption
- Human-readable output for interactive use
- Exit code 0 (success), 1 (failure)

### Testing
- Vitest with temp directories for vault fixtures
- Each service has unit tests
- Integration tests verify full workflows

## Key Design Decisions

1. **Separation of concerns**: CLI gathers information and executes actions. Agent makes decisions.
2. **Config location**: `~/.claude/second-brain.md` (same as plugin)
3. **Zettelkasten naming**: `YYYYMMDDHHmm slug.md` format
4. **PARA discovery**: Heuristic-based folder type detection (Areas/, Resources/, Projects/)
