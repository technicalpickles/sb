#!/usr/bin/env bash
# Drives the sb CLI end-to-end against a disposable vault + HOME, so it never
# touches the real ~/.claude/second-brain.md. sb reads config from
# $HOME/.claude/second-brain.md (via os.homedir(), which respects $HOME), so
# overriding $HOME is how you sandbox a run.
#
# Usage:
#   .claude/skills/run-sb/driver.sh              # fresh scratch dir each run
#   .claude/skills/run-sb/driver.sh /path/to/dir # reuse a specific scratch dir
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
SB="$REPO_ROOT/dist/index.js"

if [ ! -f "$SB" ]; then
  echo "dist/index.js missing — run 'npm run build' in $REPO_ROOT first" >&2
  exit 1
fi

SCRATCH="${1:-$(mktemp -d)}"
VAULT="$SCRATCH/vault"
export HOME="$SCRATCH/home"

echo "scratch dir: $SCRATCH"
mkdir -p "$HOME/.claude" "$VAULT"/Inbox "$VAULT"/Daily "$VAULT"/Areas/Productivity "$VAULT"/Resources/Tools
printf '# Daily note\n' > "$VAULT/Daily/$(date +%Y-%m-%d).md"

run() { echo "+ sb $*"; node "$SB" "$@"; echo; }

# Vault must already have the PARA folders (Inbox/, Daily/, Areas/*, Resources/*)
# it's going to use — sb discovers structure, it doesn't scaffold folders.
run init --name primary --path "$VAULT" --scaffold
run config show
run vault info
run vault structure

run note create --title "Redis guide" --content "Notes about redis pooling"
NOTE_PATH=$(node "$SB" inbox list | jq -r '.[0].filename')
echo "created: Inbox/$NOTE_PATH"

run note context --note "Inbox/$NOTE_PATH"
run note move --from "Inbox/$NOTE_PATH" --to "Resources/Tools/"
run note read --note "Resources/Tools/$NOTE_PATH"

run daily path
run daily append --section "## Links" --content "- [[Redis guide]]"

run permissions
run provenance
run describe --command note

echo "--- dry-run (no writes) ---"
run note create --title "Dry run test" --content "should not be written" --dry-run

echo "OK: full pipeline (init -> create -> context -> move -> read -> daily -> describe) succeeded"
echo "scratch dir left at: $SCRATCH (rm -rf it when done)"
