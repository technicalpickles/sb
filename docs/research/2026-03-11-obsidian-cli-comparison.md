# Obsidian CLI vs sb: Feature Comparison

Date: 2026-03-11
Source: https://help.obsidian.md/cli (Obsidian 1.12+)

## Architecture

| | **Obsidian CLI** | **sb** |
|---|---|---|
| **Requires Obsidian running** | Yes (launches it if not) | No |
| **Communication** | IPC to Electron app | Direct filesystem operations |
| **Primary consumer** | Humans + scripts | AI agents (JSON-first) |
| **Framework** | Built into Obsidian 1.12+ | Standalone Node.js (Commander.js) |
| **Config** | Obsidian's own settings | `~/.claude/second-brain.md` |
| **Output format** | Text/TSV/CSV/JSON | JSON always |

## Overlapping Features

| Feature | **Obsidian CLI** | **sb** |
|---|---|---|
| Create note | `create name= content=` | `note create --title --content` |
| Read note | `read file=` | `note read --note` |
| Append to file | `append file= content=` | `daily append --section --content` |
| Move/rename | `move file= to=` / `rename` | `note move --from --to` |
| Daily note path | `daily:path` | `daily path` |
| Daily note append | `daily:append content=` | `daily append --section --content` |
| Vault info | `vault` | `vault info` |
| List files | `files` | `inbox list` (inbox only) |
| Multi-vault | `vault=<name>` parameter | `--vault <name>` flag |
| Template support | `create template=<name>` | No |

## Obsidian CLI Only

Features sb doesn't have:

- **UI control**: open files in tabs/splits/windows, manage workspaces, tabs
- **Search**: full vault text search (`search query=`), with context (`search:context`)
- **Graph/link analysis**: backlinks, outgoing links, unresolved links, orphans, dead-ends
- **Tags**: vault-wide tag listing with counts
- **Properties/frontmatter**: read/set/remove properties on files
- **Tasks**: list/toggle/filter tasks across the vault
- **Bookmarks**: manage bookmarks
- **Bases**: query Obsidian's database feature
- **Outline**: heading structure for files
- **Templates**: list, read, insert with variable resolution
- **Publish**: manage Obsidian Publish
- **Sync**: manage Obsidian Sync (pause, resume, history, restore)
- **File history/diff**: compare file versions across local and Sync history
- **Developer tools**: devtools, screenshot, eval JS, DOM queries, CSS inspection, console, CDP, mobile emulation, plugin reload
- **Plugin management**: install/uninstall/enable/disable/reload plugins
- **Theme/snippet management**: install/set themes, toggle CSS snippets
- **Word count**: per-file word/character counts
- **TUI**: interactive terminal with autocomplete, history, keyboard shortcuts
- **Command palette**: execute any registered Obsidian command by ID
- **Prepend**: content before body (after frontmatter)
- **Delete**: files (trash or permanent)
- **Random note**: open/read random notes
- **Clipboard**: `--copy` flag on any command
- **Wikilink resolution**: `file=Recipe` resolves like `[[Recipe]]`

## sb Only

Features Obsidian CLI doesn't have:

- **Agent-specific design**: `--dry-run` on all mutations, `sb describe` for runtime schema introspection, `sb permissions` for generating Claude Code permission entries
- **PARA discovery**: heuristic folder structure detection (`vault structure`)
- **Routing context**: `note context` returns keywords, PARA destinations, and related notes per destination (the key agent decision-making command)
- **Obsidian config parsing**: `vault obsidian` parses `.obsidian/*.json` as structured data
- **Git provenance**: `--source auto` detects git context, `sb provenance` shows current repo info
- **Input validation**: path traversal protection, control character rejection
- **Works headlessly**: no Obsidian app needed
- **Zettelkasten naming**: auto-generates `YYYYMMDDHHmm slug.md` filenames

## Verdict

The Obsidian CLI is vastly broader. It's basically "everything the Obsidian GUI can do, from a terminal." Search, graph analysis, task management, plugin control, developer tools, sync/publish, etc.

sb is narrower but more opinionated for agents. The `note context` command (routing intelligence), `--dry-run` everywhere, JSON-only output, schema introspection, and the fact that it doesn't need Obsidian running make it a better fit for the specific use case it was built for: Claude Code managing a vault.

## Possible Directions

1. **sb wraps obsidian CLI** for overlapping features, focuses on agent-specific value-adds (routing context, PARA discovery, dry-run, provenance) that Obsidian CLI doesn't cover. Gets search, backlinks, tags, tasks, and properties for free.

2. **sb stays standalone** but adds high-value features inspired by Obsidian CLI (search, backlinks, tags, properties).

3. **sb becomes purely the agent layer**, delegates all vault I/O to Obsidian CLI when available, falls back to direct filesystem when not.

Option 3 is interesting: use Obsidian CLI as a rich backend when Obsidian is running (getting search, link graph, tasks, etc.), fall back to direct fs access when it's not. sb's unique value stays in the agent-decision layer (routing, context, provenance, dry-run, schema introspection).
