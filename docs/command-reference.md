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
  context [options]  Get full routing context for a note
  help [command]     display help for command
```

### `sb note create`

Creates a Zettelkasten note in the vault's inbox folder.

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

---
*Captured via sb note create*
```

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

---
*Captured via sb note create*
```

**Source string format:** `conversation:repo=NAME,branch=NAME,commit=HASH`

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
 ✓ test/config.test.ts    (7 tests)
 ✓ test/vault.test.ts     (7 tests)
 ✓ test/note.test.ts      (5 tests)
 ✓ test/daily.test.ts     (6 tests)
 ✓ test/context.test.ts   (5 tests)
 ✓ test/integration.test.ts (3 tests)

 Test Files  6 passed (6)
      Tests  33 passed (33)
```

All 33 tests pass.
