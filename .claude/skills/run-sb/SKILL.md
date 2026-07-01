---
name: run-sb
description: Build and run the sb CLI (Second Brain / Obsidian vault manager) against a disposable vault, or drive individual commands directly. Use when asked to run sb, test it, smoke-test it, verify a change to a command, or exercise the note/vault/daily/inbox pipeline end to end.
---

sb is a Node CLI (Commander.js), no server or GUI — there's no window to
screenshot, only JSON on stdout. Drive it either via the smoke-test driver
(`.claude/skills/run-sb/driver.sh`), which exercises the full pipeline
against a disposable vault, or by invoking `node dist/index.js <command>`
directly for a single command under test. All paths below are relative to
the repo root.

## Prerequisites

Node.js 20+ (verified with v24.17.0). `jq` is used by the driver script to
parse JSON output — already present on most dev machines; install via your
package manager if missing.

## Setup

```bash
npm install
```

## Build

```bash
npm run build
```

Compiles `src/` to `dist/index.js` via `tsc`. Must be re-run after any
source change — the driver and direct invocation both run compiled JS
from `dist/`, not `src/` (the `npm run dev` ts-node path also exists but
the driver below uses the built output, matching what actually ships).

## Run (agent path)

Use the driver for an end-to-end pipeline check:

```bash
.claude/skills/run-sb/driver.sh
```

It creates a scratch `HOME` and vault under `mktemp -d` (sb reads config
from `$HOME/.claude/second-brain.md`, and `os.homedir()` respects `$HOME`,
so this never touches your real second-brain config), then runs:
`init --scaffold` → `config show` → `vault info` → `vault structure` →
`note create` → `note context` → `note move` → `note read` → `daily path`
→ `daily append` → `permissions` → `provenance` → `describe` → a
`--dry-run` example. Pass a directory as `$1` to reuse a fixed scratch dir
instead of a fresh `mktemp -d` one. It leaves the scratch dir in place on
exit — rm -rf it yourself when done inspecting.

For a single command under test, skip the driver and sandbox `HOME`
yourself:

```bash
SCRATCH=$(mktemp -d)
export HOME="$SCRATCH/home"
mkdir -p "$HOME/.claude" "$SCRATCH/vault"/{Inbox,Daily,Areas/Productivity,Resources/Tools}
node dist/index.js init --name primary --path "$SCRATCH/vault" --scaffold
node dist/index.js note create --title "My insight" --content "Something worth remembering"
node dist/index.js inbox list
```

Every command outputs JSON on stdout (except `daily path`, `provenance`
prints JSON too, and `config show` which prints the raw markdown config
file) and exits 1 with a plain-text message on user-facing errors (e.g.
missing config prints `Second brain not configured. Run
/second-brain:setup first.` and exits 1) — no scraping needed, pipe
straight to `jq`.

## Run (human path)

```bash
npx sb --help
```

Same binary, meant for interactive use with a real vault configured at
`~/.claude/second-brain.md` (see `sb init`). Nothing about it differs
from the agent path other than not bothering to sandbox `HOME`.

## Test

```bash
npm test
```

92 tests across 16 files, all passing as of this writing (`vitest --run`).
A few tests intentionally print warnings/errors to stderr as part of
exercising error paths (e.g. "Warning: ... does not have .obsidian/
directory", "Vault CLAUDE.md already exists, skipping scaffold.") — those
are expected output from passing tests, not failures.

## Gotchas

- **`sb` doesn't scaffold vault folders.** `init --scaffold` only writes
  a vault `CLAUDE.md`; it does not create `Inbox/`, `Daily/`, or any
  PARA folders. `note create` and `inbox list` fail with ENOENT / "Inbox
  directory not found" unless you `mkdir` those folders yourself first
  (or point at a real Obsidian vault that already has them).
- **`daily append` requires the daily note to already exist.**
  `DailyNoteManager.appendToSection` does a bare `readFile` — it does not
  create the file. Pre-create `Daily/<today>.md` with any content before
  calling `daily append`, or it throws ENOENT.
- **Config lives at `$HOME/.claude/second-brain.md`, not a CLI flag.**
  There's no `--config` override — the only way to sandbox a run against
  a disposable config is exporting `HOME` before invoking `node
  dist/index.js`, relying on `os.homedir()` respecting `$HOME`.
- **`init` refuses to add a vault name that already exists** in the
  config file (`Vault "x" already exists in config. Use a different
  name.`, exit 1) — use a fresh scratch `HOME` per run rather than
  reusing one with the same vault name already registered.
