# sb Command Reference

Output and behavior of every command, tested against a fixture vault at `test/fixtures/test-vault/`.

## Test Setup

The fixture vault has this structure:

```
test/fixtures/test-vault/
├── .obsidian/
│   ├── app.json            # {"newFileFolderPath":"📫 Inbox","attachmentFolderPath":"🖇 Attachments"}
│   ├── daily-notes.json    # {"folder":"Fleeting","template":"Templates/daily"}
│   ├── templates.json      # {"folder":"Templates"}
│   └── zk-prefixer.json    # {"folder":"📫 Inbox"}
├── 📫 Inbox/
├── Areas/
│   ├── Health/
│   └── Productivity/
│       └── 202601200800 morning-routine.md
├── Resources/
│   ├── Languages/
│   └── Tools/
│       └── 202601150930 redis-setup-guide.md
├── Projects/
│   └── MyProject/
├── Fleeting/
│   └── 2026-02-14.md
└── Templates/
```

A test config at `~/.claude/second-brain.md` points to this vault:

```markdown
# Second Brain Configuration

## Vaults

- test: /absolute/path/to/test/fixtures/test-vault

Default: test
```

---

## Top-Level

### `sb --help`

```
Usage: sb [options] [command]

Second Brain CLI for Obsidian vault management

Options:
  -V, --version   output the version number
  -h, --help      display help for command

Commands:
  config          Global configuration operations
  vault           Vault operations
  note            Note operations
  daily           Daily note operations
  provenance      Show git context for the current directory
  inbox           Inbox operations
  permissions     Show Claude Code permission entries for a vault
  init            Initialize vault configuration
  describe        Output command schema as JSON for agent introspection
  help [command]  display help for command
```

### `sb --version`

```
0.1.0
```

---

## Config Commands

### `sb config show`

Prints the raw `~/.claude/second-brain.md` file to stdout.

```
# Second Brain Configuration

## Vaults

- test: /absolute/path/to/test/fixtures/test-vault

Default: test
```

**Exit code:** 0 on success, 1 if config file missing.

**Error (no config):** Throws `ConfigNotFoundError` with unformatted stack trace. **BUG:** Should print a user-friendly message and exit 1.

### `sb config vaults`

Outputs configured vaults as JSON array.

```json
[
  {
    "name": "test",
    "path": "/absolute/path/to/test/fixtures/test-vault"
  }
]
```

**BUG:** The parser matches any `- key: value` line in the config file, not just lines under `## Vaults`. A config with a `## Settings` section containing lines like `- Daily notes: Fleeting/` will produce spurious vault entries. See [Bugs](#bugs).

### `sb config qmd-collection`

Shows the qmd (semantic search) collection name for a vault.

```
sb config qmd-collection --vault test
```

**Output:**

```
second-brain
```

**Behavior:**
- Reads from `## Settings` > `### Vault Name` > `qmd_collection` in the config
- Defaults to `second-brain` if not configured

### `sb config default`

Prints the default vault name.

```
test
```

**Exit code:** 0 on success, 1 if no default configured.

---

## Vault Commands

### `sb vault --help`

```
Usage: sb vault [options] [command]

Vault operations

Options:
  -h, --help         display help for command

Commands:
  info [options]      Show vault metadata
  obsidian [options]  Parse .obsidian config as JSON
  structure [options] Discover PARA folder structure
  help [command]      display help for command
```

### `sb vault info --vault <name>`

Shows vault metadata (name and path) as JSON.

```
sb vault info --vault test
```

**Output:**

```json
{
  "name": "test",
  "path": "/absolute/path/to/test/fixtures/test-vault"
}
```

**Exit code:** 0 on success, 1 if vault not found.

#### Unknown vault

```
sb vault info --vault nonexistent
```

```
Vault "nonexistent" not found
```

Exit code: 1.

#### Missing required option

```
sb vault info
```

```
error: required option '--vault <name>' not specified
```

Exit code: 1.

### `sb vault obsidian --vault <name>`

Parses the `.obsidian/` config directory and returns all discovered settings as JSON.

```
sb vault obsidian --vault test
```

**Output:**

```json
{
  "dailyNotes": {
    "folder": "Fleeting",
    "template": "Templates/daily"
  },
  "templates": {
    "folder": "Templates"
  },
  "zkPrefixer": {
    "folder": "📫 Inbox"
  },
  "inbox": "📫 Inbox"
}
```

### `sb vault structure --vault <name>`

Discovers PARA folder structure in the vault.

```
sb vault structure --vault test
```

**Output:**

```json
{
  "destinations": [
    { "path": "Areas/Health/", "type": "area" },
    { "path": "Areas/Productivity/", "type": "area" },
    { "path": "Projects/MyProject/", "type": "project" },
    { "path": "Resources/Languages/", "type": "resource" },
    { "path": "Resources/Tools/", "type": "resource" }
  ]
}
```

---

## Note Commands

### `sb note --help`

```
Usage: sb note [options] [command]

Note operations

Options:
  -h, --help         display help for command

Commands:
  create [options]   Create a Zettelkasten note in vault inbox
  move [options]     Move note to destination folder
  read [options]     Read and parse a vault note as structured JSON
  context [options]  Get full routing context for a note
  help [command]     display help for command
```

### `sb note create`

Creates a Zettelkasten note in the vault's inbox folder. Content is optional: omit `--content` to create a frontmatter-only stub, then use Claude's native Edit/Write tools to fill in the body. This two-step flow is useful when content is long or needs formatting that's awkward to pass as a CLI flag.

```
sb note create --vault test --title "Redis caching patterns" \
  --content "Redis excels at TTL-based cache invalidation for session data"
```

**Output:**

```json
{
  "path": "/absolute/path/to/test-vault/📫 Inbox/202602141147 redis-caching-patterns.md",
  "filename": "202602141147 redis-caching-patterns.md"
}
```

**Behavior:**
- Filename: `YYYYMMDDHHmm slug.md` (Zettelkasten timestamp + slugified title)
- Slug: lowercase, spaces to hyphens, non-alphanumeric stripped
- Inbox folder: read from `.obsidian/zk-prefixer.json` `folder` field, falls back to `app.json` `newFileFolderPath`, then `Inbox`
- Frontmatter: includes `captured`, `source`, `repo`, `branch`, `commit`

**Created file contents:**

```markdown
---
captured: 2026-02-14T16:47:50Z
source: manual
repo: none
branch: none
commit: none
---

# Redis caching patterns

Redis excels at TTL-based cache invalidation for session data
```

#### Without content (two-step flow)

```
sb note create --vault test --title "Redis caching patterns"
```

**Created file contents:**

```markdown
---
captured: 2026-02-14T16:47:50Z
source: manual
repo: none
branch: none
commit: none
---

# Redis caching patterns
```

The returned `path` can then be used with Claude's Edit/Write tools to add content.

#### With provenance

```
sb note create --vault test --title "API versioning insight" \
  --content "Use path-based versioning for external APIs" \
  --source "conversation:repo=my-service,branch=main,commit=abc123"
```

**Created file contents:**

```markdown
---
captured: 2026-02-14T16:49:58Z
source: claude-conversation
repo: my-service
branch: main
commit: abc123
---

# API versioning insight

Use path-based versioning for external APIs
```

**Source string format:** `conversation:repo=NAME,branch=NAME,commit=HASH`

#### With `--source auto`

Detects git context from the current directory automatically.

```
sb note create --vault test --title "API insight" \
  --content "Something useful" --source auto
```

**Created file contents:**

```markdown
---
captured: 2026-03-06T16:49:58Z
source: claude-conversation
repo: sb
branch: main
commit: abc1234
---

# API insight

Something useful
```

#### With `--dry-run`

Shows what would be created without writing to disk.

```
sb note create --vault test --title "Test" --content "Content" --dry-run
```

**Output:**

```json
{
  "dryRun": true,
  "path": "/absolute/path/to/vault/📫 Inbox/202603061200 test.md",
  "filename": "202603061200 test.md",
  "content": "---\ncaptured: ...\n---\n\n# Test\n\nContent\n"
}
```

#### Missing required options

```
sb note create
```

```
error: required option '--vault <name>' not specified
```

Exit code: 1.

#### Unknown vault

```
sb note create --vault nonexistent --title "test" --content "test"
```

```
Vault "nonexistent" not found
```

Exit code: 1.

### `sb note read`

Read and parse a vault note as structured JSON. Returns frontmatter, sections, wiki links, and content.

```
sb note read --vault test --note "Resources/Tools/202601150930 redis-setup-guide.md"
```

**Output:**

```json
{
  "path": "Resources/Tools/202601150930 redis-setup-guide.md",
  "title": "redis-setup-guide",
  "frontmatter": null,
  "sections": ["# redis-setup-guide"],
  "links": [],
  "content": "# redis-setup-guide\n\n..."
}
```

**Behavior:**
- Parses YAML frontmatter between `---` fences
- Extracts title from first `# Heading`, falls back to filename
- Lists all section headers (any `#` line)
- Extracts `[[wiki links]]` from the full content
- Input paths are validated against traversal attacks

### `sb note move --dry-run`

```
sb note move --vault test --from "Inbox/test.md" --to "Areas/" --dry-run
```

**Output:**

```json
{
  "dryRun": true,
  "from": "Inbox/test.md",
  "to": "Areas/test.md"
}
```

### `sb note context`

Returns full routing context for a note — the key command for agent decision-making.

```
sb note context --vault test --note "📫 Inbox/202602141147 redis-caching-patterns.md"
```

**Output:**

```json
{
  "note": {
    "path": "📫 Inbox/202602141147 redis-caching-patterns.md",
    "title": "Redis caching patterns",
    "content": "\n# Redis caching patterns\n\nRedis excels at TTL-based cache invalidation...\n",
    "keywords": [
      "redis", "caching", "patterns", "excels", "based",
      "cache", "invalidation", "session", "data", "captured"
    ],
    "frontmatter": {
      "captured": "2026-02-14T16:47:50Z",
      "source": "manual",
      "repo": "none",
      "branch": "none",
      "commit": "none"
    }
  },
  "destinations": [
    {
      "path": "Areas/Health/",
      "type": "area",
      "relatedNotes": []
    },
    {
      "path": "Areas/Productivity/",
      "type": "area",
      "relatedNotes": []
    },
    {
      "path": "Projects/MyProject/",
      "type": "project",
      "relatedNotes": []
    },
    {
      "path": "Resources/Languages/",
      "type": "resource",
      "relatedNotes": []
    },
    {
      "path": "Resources/Tools/",
      "type": "resource",
      "relatedNotes": [
        {
          "name": "202601150930 redis-setup-guide.md",
          "similarity": "keyword:redis"
        }
      ]
    }
  ]
}
```

**Behavior:**
- Parses frontmatter (YAML-like key: value pairs between `---` fences)
- Extracts title from first `# Heading`
- Extracts keywords: words >3 chars, stopwords removed, deduplicated, max 10
- Discovers PARA destinations via top-level folder name heuristics (`area`, `resource`, `project`)
- For each destination, scans filenames for keyword matches to find related notes
- Related notes capped at 5 per destination

### `sb note move`

Moves a note from one location to another within the vault.

```
sb note move --vault test \
  --from "📫 Inbox/202602141147 redis-caching-patterns.md" \
  --to "Resources/Tools/"
```

**Output:**

```json
{
  "from": "📫 Inbox/202602141147 redis-caching-patterns.md",
  "to": "Resources/Tools/202602141147 redis-caching-patterns.md"
}
```

**Behavior:**
- Uses `fs.rename` (atomic on same filesystem)
- Preserves filename
- Paths are relative to vault root

---

## Daily Commands

### `sb daily --help`

```
Usage: sb daily [options] [command]

Daily note operations

Options:
  -h, --help         display help for command

Commands:
  path [options]     Show today's daily note path
  append [options]   Append content to a section of the daily note
  help [command]     display help for command
```

### `sb daily path --vault <name>`

Returns the full filesystem path to today's daily note.

```
sb daily path --vault test
```

**Output:**

```
/absolute/path/to/test-vault/Fleeting/2026-02-14.md
```

**Behavior:**
- Daily note folder is read from `.obsidian/daily-notes.json` `folder` field, falls back to `Daily`
- Filename format: `YYYY-MM-DD.md` using today's date

### `sb daily append --vault <name> --section <header> --content <text>`

Appends content to a named section of today's daily note. Creates the section if it doesn't exist.

```
sb daily append --vault test --section "## Links" \
  --content "- [[202602141147 redis-caching-patterns]] - Redis insight"
```

**Output:**

```json
{
  "path": "/absolute/path/to/test-vault/Fleeting/2026-02-14.md",
  "section": "## Links"
}
```

**Behavior:**
- Finds the section by matching the header string exactly
- Appends content after existing section content, before the next section
- Creates the section at the end of the file if not found
- Preserves existing content order

### `sb daily append --dry-run`

```
sb daily append --vault test --section "## Links" --content "test" --dry-run
```

**Output:**

```json
{
  "dryRun": true,
  "path": "/absolute/path/to/vault/Fleeting/2026-03-06.md",
  "section": "## Links",
  "content": "test"
}
```

---

## Inbox Commands

### `sb inbox list`

Lists notes in the vault's inbox folder.

```
sb inbox list --vault test
```

**Output:**

```json
[
  {
    "filename": "202603061200 my-insight.md",
    "timestamp": "202603061200",
    "title": "my-insight"
  }
]
```

**Behavior:**
- Reads inbox folder from `.obsidian/` config
- Parses Zettelkasten filenames (`YYYYMMDDHHmm slug.md`)
- Non-ZK files still appear (timestamp empty, title from filename)
- Sorted alphabetically

### `sb inbox list --detail`

Includes parsed frontmatter for each note.

```
sb inbox list --vault test --detail
```

**Output:**

```json
[
  {
    "filename": "202603061200 my-insight.md",
    "timestamp": "202603061200",
    "title": "my-insight",
    "frontmatter": {
      "captured": "2026-03-06T12:00:00Z",
      "source": "manual"
    }
  }
]
```

---

## Provenance

### `sb provenance`

Shows git context for the current directory. Useful for debugging `--source auto` and scripting.

```
sb provenance
```

**Output:**

```json
{
  "repo": "sb",
  "branch": "main",
  "commit": "abc1234"
}
```

**Behavior:**
- Detects repo name from `git remote get-url origin` (handles worktrees correctly)
- Falls back to basename of working directory if no remote
- Returns empty strings for non-git directories

---

## Permissions

### `sb permissions`

Generates Claude Code permission entries for vault access.

```
sb permissions --vault test
```

**Output:**

```json
{
  "vault": "test",
  "path": "/absolute/path/to/vault",
  "permissions": [
    "Read(/absolute/path/to/vault/**/*.md)",
    "Write(/absolute/path/to/vault/**/*.md)",
    "Edit(/absolute/path/to/vault/**/*.md)"
  ]
}
```

---

## Init

### `sb init`

Initializes vault configuration. Supports both interactive and non-interactive modes.

**Non-interactive:**

```
sb init --name primary --path ~/Vaults/my-vault --scaffold
```

**Output:**

```json
{
  "vault": "primary",
  "path": "~/Vaults/my-vault",
  "obsidian": true,
  "config": "/Users/you/.claude/second-brain.md",
  "scaffolded": true,
  "permissions": [
    "Read(~/Vaults/my-vault/**/*.md)",
    "Write(~/Vaults/my-vault/**/*.md)",
    "Edit(~/Vaults/my-vault/**/*.md)"
  ]
}
```

**Options:**
- `--name <name>` - Vault name (prompts if omitted)
- `--path <path>` - Path to Obsidian vault (prompts if omitted)
- `--scaffold` - Create CLAUDE.md in vault from template
- `--dry-run` - Show what would be done without writing

**Behavior:**
- Validates path exists and has `.obsidian/` directory
- Parses `.obsidian/` settings to discover inbox, daily notes, templates
- Writes vault entry to `~/.claude/second-brain.md` (creates if needed)
- Scaffolds vault CLAUDE.md with discovered structure
- Reports permissions needed for Claude Code

### `sb init --dry-run`

```
sb init --name test --path ~/Vaults/my-vault --dry-run
```

**Output:**

```json
{
  "dryRun": true,
  "vault": "test",
  "path": "~/Vaults/my-vault",
  "obsidian": true,
  "scaffold": false,
  "permissions": [
    "Read(~/Vaults/my-vault/**/*.md)",
    "Write(~/Vaults/my-vault/**/*.md)",
    "Edit(~/Vaults/my-vault/**/*.md)"
  ]
}
```

---

## Describe

### `sb describe`

Outputs the full command schema as JSON for agent introspection.

```
sb describe
```

**Output (abbreviated):**

```json
{
  "name": "sb",
  "description": "Second Brain CLI for Obsidian vault management",
  "options": [...],
  "subcommands": [
    {
      "name": "config",
      "description": "Global configuration operations",
      "subcommands": [
        { "name": "show", "description": "Show raw config file", "options": [] },
        { "name": "vaults", "description": "List vaults as JSON", "options": [] },
        ...
      ]
    },
    ...
  ]
}
```

### `sb describe --command <name>`

Describe a specific command and its subcommands.

```
sb describe --command note
```

---

## Bugs Found

### 1. Config parser matches lines outside `## Vaults` section

**Severity:** Medium
**Affected:** `sb config vaults`, and any command that resolves vault names

The `ConfigManager.parse()` method scans every line of the config file for `- name: path` patterns. Lines under `## Settings` like `- Daily notes: Fleeting/` are incorrectly parsed as vault entries.

**Reproduction:** Use the real `~/.claude/second-brain.md` which has a `## Settings` section:

```json
[
  {"name": "primary", "path": "~/Vaults/pickled-knowledge/pickled-knowledge/"},
  {"name": "Daily notes", "path": "Fleeting/"},
  {"name": "Templates", "path": "Templates/"},
  {"name": "Inbox", "path": "📫 Inbox/"}
]
```

**Fix:** Track which markdown section we're in and only parse vault entries under `## Vaults`.

### 2. Tilde (`~`) not expanded in vault paths

**Severity:** High
**Affected:** All commands that use vault paths from config

Vault paths containing `~` (e.g. `~/Vaults/...`) are passed to Node.js `fs` functions as-is. Node's `fs` module does not expand `~` — it treats it as a literal directory name.

**Reproduction:** Use a config with `- primary: ~/Vaults/...` and try `sb note create --vault primary`.

```
Error: ENOENT: no such file or directory, open '~/Vaults/.../Inbox/...'
```

**Fix:** Expand `~` to `os.homedir()` in `ConfigManager.parse()` or `getVault()`.

### 3. ~~`vault` and `daily` commands: Commander.js argument-before-subcommand pattern broken~~

**FIXED.** Switched to `--vault <name>` flag on each subcommand, matching the pattern used by `note` commands.

- `sb vault info --vault test` (was: `sb vault test info`)
- `sb vault obsidian --vault test` (was: `sb vault test obsidian`)
- `sb vault structure --vault test` (was: `sb vault test structure`)
- `sb daily path --vault test` (was: `sb daily test path`)
- `sb daily append --vault test ...` (was: `sb daily test append ...`)

### 4. `config vaults` error is an unformatted stack trace

**Severity:** Low
**Affected:** `sb config vaults` when no config exists

```
ConfigNotFoundError: Second brain not configured. Run /second-brain:setup first.
    at ConfigManager.load (...)
```

`config show` handles this gracefully with a message and `process.exit(1)`, but `config vaults` and `config default` let the error propagate as an uncaught exception.

**Fix:** Add try/catch in the `vaults` and `default` actions, or add a global error handler.

---

## Test Results

```
 ✓ test/config.test.ts       (9 tests)
 ✓ test/vault.test.ts        (7 tests)
 ✓ test/note.test.ts         (7 tests)
 ✓ test/note-read.test.ts    (5 tests)
 ✓ test/daily.test.ts        (6 tests)
 ✓ test/context.test.ts      (5 tests)
 ✓ test/integration.test.ts  (3 tests)
 ✓ test/provenance.test.ts   (4 tests)
 ✓ test/inbox.test.ts        (6 tests)
 ✓ test/permissions.test.ts  (2 tests)
 ✓ test/init.test.ts         (7 tests)
 ✓ test/validation.test.ts   (6 tests)
 ✓ test/dry-run.test.ts      (2 tests)
 ✓ test/describe.test.ts     (3 tests)

 Test Files  14 passed (14)
      Tests  75 passed (75)
```

All 75 tests pass.
