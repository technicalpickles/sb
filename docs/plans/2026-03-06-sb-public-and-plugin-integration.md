# sb: Going Public and Plugin Integration

Design doc for making sb a proper public tool and wiring it into the second-brain Claude Code plugin.

## Background

sb started as a CLI to support the [second-brain](https://github.com/technicalpickles/claude-code-second-brain) Claude Code plugin. The idea: sb handles deterministic data operations (vault structure, note creation, config), the agent handles decisions (routing, organizing, writing).

Today the plugin does most vault operations itself through Claude's native tools (Read, Write, Edit, Bash). sb exists in parallel but hasn't been wired in yet. This plan bridges that gap.

## Goals

1. **Make sb public** (GitHub repo + npm package)
2. **Fill gaps** so the plugin can delegate data operations to sb
3. **Simplify plugin permissions** by deriving vault access from sb's config
4. **Design for agents as first-class users** (JSON output, schema introspection, dry-run support)

## Architecture Decision: Symlinks Go Away

The plugin currently uses symlinks at `~/.claude/vaults/{name}` as a stable path anchor for `allowed-tools` permissions. With sb in the picture, these become unnecessary.

Instead:
- sb knows vault paths from its config (`~/.claude/second-brain.md`)
- Claude uses native Read/Write/Edit on the actual vault paths
- `sb init` helps configure the correct permission entries in `~/.claude/settings.json`
- The plugin's setup command calls sb for the data, then helps the user wire permissions

## Architecture Decision: Claude's Native Tools for File Access

sb handles structured data operations (create, move, context, inbox list). Claude handles direct file reads and edits using its native Read/Write/Edit tools. This plays to both strengths: sb is deterministic and testable, Claude is good at surgical text editing and reading markdown.

The tradeoff: the agent may need to `Read` a file before `Edit`ing it, even if sb already parsed it. That's acceptable. Future work could explore write operations through sb if the pattern proves clunky.

## New Commands

### `sb provenance`

Returns git context for the current directory as JSON.

```bash
sb provenance
```

```json
{
  "repo": "my-service",
  "branch": "main",
  "commit": "abc1234"
}
```

Returns `"none"` values when not in a git repo. Useful for debugging, scripting, and as the data source for `note create --source auto`.

Also adds `--source auto` to `note create`, which calls provenance internally so the common case (capture with git context) is a single command.

### `sb inbox list`

Lists notes in the vault's inbox folder.

```bash
sb inbox list                  # Lightweight: filenames + timestamps
sb inbox list --detail         # Rich: includes frontmatter for each note
```

Lightweight output:
```json
[
  {
    "filename": "202602141147 redis-caching-patterns.md",
    "timestamp": "202602141147",
    "title": "redis-caching-patterns"
  }
]
```

`--detail` adds parsed frontmatter (captured date, source, repo, branch, commit) per note. Kept separate to respect context window discipline: don't blast 50 notes of frontmatter when the agent just needs a list.

### `sb init`

One-command vault setup. Two modes:

**With args (agent-friendly):**
```bash
sb init --name primary --path ~/Vaults/my-vault
sb init --name primary --path ~/Vaults/my-vault --scaffold
```

**No args (human-friendly):**
```bash
sb init
# Prompts for vault path, vault name, validates .obsidian/, writes config
```

Operations:
1. Validate the path exists and has `.obsidian/` (warn if missing, offer to continue)
2. Parse .obsidian/ settings
3. Write/update `~/.claude/second-brain.md`
4. Output the `allowed-tools` permission entries the plugin needs (for `~/.claude/settings.json`)
5. If `--scaffold`: create vault CLAUDE.md from template (skip if one exists)

### `sb note read`

Structured parsing of any vault note.

```bash
sb note read --note "Areas/AI/202601121430 kafka-consumer-groups.md"
```

```json
{
  "path": "Areas/AI/202601121430 kafka-consumer-groups.md",
  "title": "Kafka Consumer Groups",
  "frontmatter": {
    "captured": "2026-01-12T14:30:00Z",
    "source": "claude-conversation",
    "repo": "my-service"
  },
  "sections": ["Context", "Related"],
  "links": ["[[some-other-note]]"],
  "content": "full markdown content..."
}
```

Provides structured access for agents that need parsed metadata without doing their own markdown parsing. Accepts vault-relative paths. The agent still uses Claude's native Read before Edit/Write for mutations.

### `sb config qmd-collection`

Returns the qmd collection name for a vault.

```bash
sb config qmd-collection
sb config qmd-collection --vault work
```

```
second-brain
```

Reads from `qmd_collection` setting in config. Defaults to `second-brain`. Saves the agent from parsing config to find the collection name when shelling out to qmd directly.

### `sb permissions`

Outputs the `allowed-tools` entries needed for a vault.

```bash
sb permissions
sb permissions --vault primary
```

```json
{
  "vault": "primary",
  "path": "~/Vaults/pickled-knowledge/pickled-knowledge/",
  "permissions": [
    "Read(~/Vaults/pickled-knowledge/pickled-knowledge/**/*.md)",
    "Write(~/Vaults/pickled-knowledge/pickled-knowledge/**/*.md)",
    "Edit(~/Vaults/pickled-knowledge/pickled-knowledge/**/*.md)"
  ]
}
```

Used by the plugin's setup command to help users configure `~/.claude/settings.json`. Could also output a ready-to-merge JSON fragment for settings.json.

## Cross-Cutting Concerns

### `--dry-run` on mutating commands

Applies to: `note create`, `note move`, `daily append`, `init`.

Returns what would happen without doing it. For `note create --dry-run`, returns the path, filename, and content that would be written. For `note move --dry-run`, returns the from/to paths.

Valuable for agent confidence (validate before commit) and human scripting.

### `sb describe <command>`

Runtime schema introspection. Returns input flags and output shape as JSON.

```bash
sb describe note.create
```

```json
{
  "command": "note create",
  "flags": {
    "--vault": { "type": "string", "required": false, "description": "Vault name (defaults to configured default)" },
    "--title": { "type": "string", "required": true, "description": "Note title" },
    "--content": { "type": "string", "required": true, "description": "Note body content" },
    "--source": { "type": "string", "required": false, "description": "Provenance string or 'auto'" },
    "--dry-run": { "type": "boolean", "required": false, "description": "Show what would be created without writing" }
  },
  "output": {
    "path": "string - absolute path to created note",
    "filename": "string - note filename"
  }
}
```

Agents self-serve docs without needing them stuffed into system prompts. Eliminates stale documentation problems.

### Input validation

Path traversal rejection on `--from`, `--to`, `--note`, `--path` args:
- Reject `../` sequences
- Reject control characters below ASCII 0x20
- Reject pre-encoded strings (`%2e%2e`)
- Canonicalize paths and verify they stay within vault boundaries

Agents hallucinate paths. Treat all input as potentially adversarial, same principles as a public web API.

### `--fields` filtering

Lower priority. Outputs are already small for most commands. Worth adding to `inbox list --detail` and `note context` if output size becomes a problem. Park for now.

## Deferred Work

### Link project (`sb link`)

Rarely used (once per repo). Revisit after integration shows whether it's needed. The permissions story may make it less important.

### qmd wrapping (`sb search`)

qmd is JavaScript, so there's a future path where sb uses it as a library instead of shelling out. For now the plugin calls qmd directly, and sb just surfaces the collection name via `sb config qmd-collection`.

### Human-friendly output

All commands are JSON-only for now. A future iteration adds `--output text` for human-readable output. Not blocking for agent-first usage.

### Write operations through sb

If the Read-then-Edit pattern proves clunky for the plugin, consider adding `sb note edit-section` or `sb note append-section` for section-level mutations. For now, Claude's native Edit tool handles this fine.

## Going Public Checklist

Housekeeping for the npm publish:

- [ ] Add LICENSE file (MIT, matching package.json)
- [ ] Check npm name availability (`sb` or `@technicalpickles/sb`)
- [ ] Rename package if needed
- [ ] Flip GitHub repo to public
- [ ] `npm publish`
- [ ] Optional: GitHub Actions for CI (test on push) and automated publish on tags

## Plugin Integration Plan

After sb has the new commands, the plugin refactoring looks like:

1. Replace config loading with `sb config vaults` / `sb config default`
2. Replace .obsidian/ parsing with `sb vault obsidian`
3. Replace PARA discovery with `sb vault structure`
4. Replace note creation (date, slug, git, Write) with `sb note create --source auto`
5. Replace routing data gathering with `sb note context`
6. Replace `mv` with `sb note move`
7. Replace daily note path lookup with `sb daily path`
8. Replace daily note section append with `sb daily append`
9. Replace inbox `ls` with `sb inbox list`
10. Update `/second-brain:setup` to use `sb init` + `sb permissions`
11. Simplify `allowed-tools` to `Bash(sb:*)` plus vault Read/Write/Edit paths
12. Remove symlink creation and `~/.claude/vaults/` references

The capture flow (insight command) goes from ~8 tool calls to ~3:
1. `sb note create --source auto` (config + naming + provenance + writing)
2. `sb note context` (routing data)
3. `sb note move` (routing execution)

Agent still handles: routing decisions, connection discovery via qmd, prose editing, conversation distillation.
