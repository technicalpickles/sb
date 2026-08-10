# sb

CLI for Obsidian vault management. Designed for both humans and AI agents.

`sb` handles the data (vault structure, note analysis, config) and executes actions (create, move, append). Agents make decisions (routing, organizing) using what `sb` gives them.

## Install

Requires Node.js 20+.

```bash
npm install -g sb
```

Or run directly:

```bash
npx sb --help
```

## Quick Start

```bash
# Point sb at your Obsidian vault
sb init --name primary --path ~/Vaults/my-vault --scaffold

# Create a note
sb note create --title "My insight" --content "Something worth remembering"

# List inbox
sb inbox list

# Check what a command would do before running it
sb note create --title "Test" --content "Preview" --dry-run
```

## Configuration

sb reads its config from `~/.claude/second-brain.md`:

```markdown
# Second Brain Configuration

## Vaults

- primary: ~/Vaults/my-vault
- work: ~/Vaults/work-notes

Default: primary
```

Each vault entry is `- name: path`, and `Default:` tells sb which vault to use when you don't specify one. Run `sb init` to set this up interactively.

## Commands

The `--vault <name>` flag is optional on most commands. If you skip it, sb uses your configured default.

### Config

```bash
sb config show              # Print raw config file
sb config vaults            # List vaults as JSON
sb config default           # Show default vault name
sb config qmd-collection    # Show semantic search collection name
```

### Vault

```bash
sb vault info               # Vault name and path
sb vault obsidian           # Parse .obsidian/ settings as JSON
sb vault structure          # Discover PARA folder structure
```

### Note

```bash
sb note create --title "My insight" --content "Worth remembering"
sb note create --title "From code" --content "..." --source auto    # Auto-detect git context
sb note read --note "Resources/Tools/202601150930 redis-guide.md"   # Structured JSON parse
sb note context --note "📫 Inbox/202602141147 my-insight.md"        # Full routing context
sb note move --from "📫 Inbox/202602141147 my-insight.md" --to "Resources/Tools/"
```

Notes use Zettelkasten naming (`YYYYMMDDHHmm slug.md`) and land in your vault's inbox folder.

`note context` is the key command for agent routing. It returns extracted keywords, PARA destinations, and related notes per destination.

### Daily

```bash
sb daily path                                         # Today's daily note path
sb daily append --section "## Links" --content "..."  # Append to a section
```

### Inbox

```bash
sb inbox list               # List notes in vault inbox
sb inbox list --detail      # Include frontmatter for each note
```

### Setup and Tooling

```bash
sb init --name primary --path ~/Vaults/my-vault   # Initialize vault config
sb init --scaffold                                 # Also create vault CLAUDE.md
sb permissions                                     # Show Claude Code permission entries
sb provenance                                      # Show current git context
sb describe                                        # Full command schema as JSON
sb describe --command note                         # Schema for a specific command
```

### Dry Run

All mutating commands support `--dry-run` to preview without writing:

```bash
sb note create --title "Test" --content "..." --dry-run
sb note move --from "Inbox/test.md" --to "Areas/" --dry-run
sb daily append --section "## Links" --content "..." --dry-run
sb init --name test --path ~/vault --dry-run
```

## Agent Integration

sb is designed to be called by AI agents. Key features:

- **JSON output** on all commands for easy parsing
- **`--dry-run`** on mutating commands for safe previews
- **`sb describe`** for runtime schema introspection
- **`sb permissions`** generates Claude Code permission entries
- **Input validation** rejects path traversal, control characters, and URL-encoded strings
- **`--source auto`** detects git provenance from the agent's working directory

If invoking via `npx @techpickles/sb`, parse defensively: `npm`'s own warnings (e.g. from an unrelated `.npmrc` in the caller's repo) can print to stdout ahead of sb's JSON. Extract the substring starting at the first `{` rather than parsing the whole stdout blob.

## Full Reference

See [docs/command-reference.md](docs/command-reference.md) for detailed output examples, error behavior, and edge cases.

## Development

```bash
npm install          # Install dependencies
npm test             # Run tests (vitest)
npm run test:watch   # Watch mode
npm run build        # Compile TypeScript
```

## License

MIT
