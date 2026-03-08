# sb Execution Plan

Implementation plan for the design in `2026-03-06-sb-public-and-plugin-integration.md`.

Strategy: build all sb commands first, then do plugin integration as a separate effort.

Design doc: `docs/plans/2026-03-06-sb-public-and-plugin-integration.md`

## Batch 1: Core New Commands (provenance, inbox list, note read)

Highest-impact commands for plugin integration. These fill the biggest gaps between what sb can do and what the plugin needs.

### Task 1: `sb provenance` command

**What:** New top-level command that returns git context as JSON.

**Steps:**
1. Create `src/commands/provenance/index.ts`
2. Implement git detection: run `git rev-parse --show-toplevel`, `git branch --show-current`, `git rev-parse --short HEAD`
3. Return JSON: `{ "repo": "name", "branch": "main", "commit": "abc1234" }`
4. Return `"none"` for each field when not in a git repo (or git commands fail)
5. Extract repo name from the toplevel path (basename)
6. Register command in `src/index.ts`
7. Write tests in `test/provenance.test.ts`:
   - In a git repo: returns repo, branch, commit
   - Outside a git repo: returns "none" values
   - Partial git info (detached HEAD, etc.)

**Verification:** `npm test` passes, `npx sb provenance` returns valid JSON in this repo.

### Task 2: `--source auto` on `note create`

**What:** Extend existing `note create` to accept `--source auto` which calls provenance logic internally.

**Steps:**
1. Extract provenance logic from Task 1 into a shared service (`src/services/ProvenanceService.ts`)
2. Update `src/commands/provenance/index.ts` to use the service
3. Add `--source auto` option to `note create` command
4. When `--source auto`: call ProvenanceService, format as `conversation:repo=X,branch=Y,commit=Z`
5. When `--source <string>`: use the string as-is (existing behavior)
6. When no `--source`: default to `manual` (existing behavior)
7. Add tests:
   - `note create --source auto` in a git repo produces correct frontmatter
   - `note create --source auto` outside a git repo produces `none` values
   - Existing `--source "conversation:..."` behavior unchanged

**Verification:** `npm test` passes, manual test of `npx sb note create --source auto --title "test" --content "test"`.

### Task 3: `sb inbox list` command

**What:** New command group `inbox` with `list` subcommand.

**Steps:**
1. Create `src/commands/inbox/index.ts`
2. Implement lightweight listing:
   - Get vault inbox path (reuse existing inbox resolution from NoteBuilder)
   - Read directory contents
   - Parse Zettelkasten filenames: extract timestamp and title slug
   - Return JSON array of `{ filename, timestamp, title }`
3. Add `--detail` flag:
   - For each note, read file and parse frontmatter
   - Add frontmatter fields to each entry
4. Handle empty inbox (return empty array, not error)
5. Handle missing inbox directory (error with helpful message)
6. Register command in `src/index.ts`
7. Write tests in `test/inbox.test.ts`:
   - Empty inbox returns `[]`
   - Inbox with notes returns sorted list
   - `--detail` includes frontmatter
   - Non-Zettelkasten filenames handled gracefully
   - Missing inbox directory gives useful error

**Verification:** `npm test` passes. Create a test note with `npx sb note create`, then `npx sb inbox list` shows it.

### Task 4: `sb note read` command

**What:** Add `read` subcommand to existing `note` command group.

**Steps:**
1. Add `read` subcommand to `src/commands/note/index.ts`
2. Accept `--note <path>` (vault-relative path)
3. Implement structured parsing:
   - Read file content
   - Parse frontmatter (reuse existing frontmatter parser from NoteAnalyzer)
   - Extract title from first `# Heading`
   - Extract section headings (## level)
   - Extract wiki-links (`[[...]]` patterns)
   - Include raw content
4. Return JSON: `{ path, title, frontmatter, sections, links, content }`
5. Handle missing file (error with message)
6. Handle file without frontmatter (frontmatter: null or {})
7. Handle file without heading (title from filename)
8. Write tests in `test/note-read.test.ts`:
   - Full note with frontmatter, heading, sections, links
   - Note without frontmatter
   - Note without heading (falls back to filename)
   - Non-existent file gives error
   - File with no wiki-links returns empty array

**Verification:** `npm test` passes. `npx sb note read --note "path/to/existing/note.md"` returns structured JSON.

## Batch 2: Setup and Permissions (init, permissions, config qmd-collection)

### Task 5: `sb config qmd-collection` command

**Steps:**
1. Add `qmd-collection` subcommand to config
2. Read `qmd_collection` from config's Settings section (need to extend ConfigManager to parse settings)
3. Accept `--vault` to scope to a vault's settings
4. Default to `second-brain` if not configured
5. Tests: configured value, default fallback, per-vault settings

**Verification:** `npm test` passes.

### Task 6: `sb permissions` command

**Steps:**
1. New top-level command
2. Accept `--vault` (defaults to default vault)
3. Generate Read/Write/Edit permission strings from vault path
4. Return JSON with vault name, path, and permissions array
5. Tests: single vault, specific vault by name, path expansion

**Verification:** `npm test` passes, output matches expected format.

### Task 7: `sb init` command (non-interactive mode)

**Steps:**
1. New top-level command
2. Accept `--name`, `--path`, `--scaffold` flags
3. Validate path exists, check for .obsidian/
4. Write/update `~/.claude/second-brain.md`
5. If `--scaffold`: write vault CLAUDE.md from template (skip if exists)
6. Output permissions info on success
7. Tests: fresh init, adding second vault, scaffold creation, scaffold skip when exists, invalid path

**Verification:** `npm test` passes.

### Task 8: `sb init` interactive mode

**Steps:**
1. When no args, prompt for path and name
2. Use readline or similar for prompts
3. Same operations as non-interactive
4. Tests: harder to unit test interactive mode, focus on the shared logic

**Verification:** Manual test of `npx sb init` with interactive prompts.

## Batch 3: Cross-Cutting Concerns

### Task 9: Input validation

**Steps:**
1. Create `src/utils/validation.ts`
2. Implement path sanitization: reject `../`, control chars, pre-encoded strings
3. Canonicalize and verify paths stay within vault
4. Wire into all commands that accept path args
5. Tests: traversal attempts, control characters, encoded strings, valid paths pass through

**Verification:** `npm test` passes.

### Task 10: `--dry-run` on mutating commands

**Steps:**
1. Add `--dry-run` flag to `note create`, `note move`, `daily append`, `init`
2. Each command returns what would happen without executing
3. Tests: dry-run output matches expected shape, no side effects

**Verification:** `npm test` passes, manual verification that `--dry-run` doesn't write files.

### Task 11: `sb describe` command

**Steps:**
1. New top-level command accepting dotted command path (e.g., `note.create`)
2. Build schema registry from Commander.js command definitions
3. Return flags, types, required status, descriptions, output shape
4. Tests: known commands return correct schema, unknown command gives error

**Verification:** `npm test` passes.

## Batch 4: Going Public

### Task 12: LICENSE and package naming

**Steps:**
1. Add MIT LICENSE file
2. Check npm name availability
3. Update package.json name if needed
4. Verify `files` field includes everything needed

**Verification:** `npm pack --dry-run` shows correct contents.

### Task 13: Make repo public and publish

**Steps:**
1. Flip GitHub repo to public
2. `npm publish`
3. Verify install works: `npm install -g <package-name> && sb --version`

**Verification:** Package visible on npmjs.com, `npx <package-name> --version` works.

### Task 14: CI setup (optional)

**Steps:**
1. GitHub Actions workflow: test on push
2. Automated npm publish on version tags
3. Test the pipeline

**Verification:** Push triggers CI, tag triggers publish.

## Batch 5: Plugin Integration (separate repo, separate effort)

Tracked separately. See design doc "Plugin Integration Plan" section for the 12-step sequence.
