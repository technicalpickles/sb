# sb MCP Server — Validated Implementation Plan

A handoff plan for adding a remote-capable **HTTP MCP server** to the existing `sb`
CLI, validated against the actual codebase. This supersedes the prior *sb MCP Server —
Implementation Plan* draft: the structure and phasing are preserved, with corrections
where the draft's description of the code was inaccurate.

This is the **sb-code** companion to the *Second Brain MCP — Deployment Plan*. Where
that doc covers how sb, qmd, and the auth proxy are wired and run on the host (a
separate `homelab` repo), this doc covers what to build inside `sb`.

---

## 1. Context & scope

`sb` is a CLI for managing an Obsidian vault, already designed for agent use (JSON
output on every command, `--dry-run` on mutations, `sb describe` schema introspection,
path-traversal/input validation). We are adding an `sb mcp` subcommand that starts a
long-lived **Streamable HTTP** MCP server exposing a curated subset of sb's
functionality as MCP tools, plus a `search_vault` tool that delegates to a separate
**qmd** service.

**Two facts that define the boundaries:**

- **sb is the single Claude-facing connector.** It runs behind `mcp-auth-proxy` (which
  handles all OAuth) and is exposed via Tailscale Funnel. **Auth, TLS, OAuth, the
  proxy, Funnel, and Compose are OUT OF SCOPE** — do not add authentication, TLS, or
  networking beyond binding an HTTP listener. The server assumes every request it
  receives is already authenticated and arrives over a trusted private network.
- **Search is delegated to qmd, not implemented in sb.** sb exposes a thin
  `search_vault` tool that proxies to a separate qmd service over HTTP. sb itself does
  **no embedding, indexing, or model inference** — it has zero model/native
  dependencies and stays light enough to run anywhere, including the J3455 NUC.

**Transport:** Streamable HTTP via the official `@modelcontextprotocol/sdk`. (SSE is
deprecated; do not implement it.) The SDK's HTTP transport API has changed across
versions — **verify the current `StreamableHTTPServerTransport` API against the
installed SDK version** rather than assuming a signature.

---

## 2. Verdict

The original implementation plan is **sound and well-structured**: correct transport
choice (Streamable HTTP, no SSE), correct reuse-don't-shell-out stance, correct
blast-radius phasing (read → additive → gated-destructive), and it already anticipated
the gaps a fresh code read would raise (CLI-only today, no env config, no Dockerfile,
the remote-≠-local-native-tools problem). Proceed with it. The findings in §3 are
refinements, not a redesign.

---

## 3. Validation findings (plan vs. actual code)

### Confirmed accurate

- **Phase 0 is mandatory, not cleanup.** Every command action handler is entangled with
  `process.exit()` and `console.log()` and returns nothing. Representative:
  `src/commands/note/index.ts:36, :64, :69, :88, :113, :137`. In a long-lived server,
  `process.exit(1)` on a bad request would kill the whole process. Extracting
  `(args) => Promise<result>` functions is a hard prerequisite for in-process reuse.
- **Per-call config reload is real.** Each handler constructs `new ConfigManager()` and
  calls `.load()` (re-reads `~/.claude/second-brain.md` every invocation) —
  e.g. `note/index.ts:27-29`. The plan's "warm state: resolve config + vault once at
  startup and cache" is the right fix.
- **Business logic is already in services** — `NoteBuilder`, `NoteLister`,
  `DailyNoteManager`, `VaultDiscovery`, `NoteAnalyzer`, `ObsidianParser`,
  `ProvenanceService`. The refactor is mostly *lifting the orchestration out of the
  action handlers* (vault resolution, validation, the service calls) into reusable
  functions — the services themselves need little change.
- **Validation utilities exist and must be preserved** — `validatePath` /
  `validateWithinVault` in `src/utils/validation.ts`, already used in
  `note/index.ts:117-129, :159-166`. Route every MCP path through them.
- **`--source auto` is cwd-dependent** (`note/index.ts:43-48` → `ProvenanceService.detect()`)
  and correctly flagged as meaningless server-side.

### Needs correction

- **Schema-drift test.** `sb describe` resolves **top-level commands only** —
  `describe/index.ts:43` does `program.commands.find(c => c.name() === opts.command)`.
  There is **no** `describe --command note.create`; you call `describe --command note`
  and walk the returned `subcommands[]` to find `create`. Output shape is
  `{name, description, options:[{flags, description, required, defaultValue}], subcommands}`
  — **inputs only, no output/return schema** (the `{flags:{…}, output:{…}}` shape in the
  older 2026-03-06 doc was never implemented). So the drift test can assert input-schema
  parity but cannot cover return shapes.
- **"Schemas must not drift" vs. Phase 2 conflict.** The CLI makes `note create
  --content` *optional* (`note/index.ts:23`), but Phase 2 deliberately makes MCP
  `content` *required* (single-call, no stub-then-edit). The drift rule therefore can't
  mean exact equality — define it as **intentional tightening allowed**: the MCP schema
  may be a stricter superset (required ⊇ CLI-required, no *new* params). Encode that rule
  in the test, or it will red-flag a deliberate decision.
- **The `~`-expansion "bug" is stale.** `ConfigManager.expandTilde`
  (`ConfigManager.ts:107-115`) already expands `~` and `~/` at load. Using an absolute
  `/vault` in-container is still the right call, but drop the "sidestep the bug" framing
  — it's a non-issue with a correctly generated config.
- **"Over-eager vault-parser" is real but mild.** `parse()` (`ConfigManager.ts:52-105`)
  treats any `- key: value` line inside `## Vaults` as a vault, and matches `Default:`
  in any section. Mitigation (keep container config minimal, no `## Settings` block) is
  fine; no parser fix needed for v1.

---

## 4. Guiding constraints (apply to every phase)

1. **Reuse, don't duplicate.** MCP tool handlers call the same command logic the CLI
   uses. No copy-pasted vault logic, no shelling out to the `sb` binary.
2. **Never bypass validation.** All paths flow through the existing
   traversal/control-char validation before touching the filesystem.
3. **Single process = single writer.** One server instance owns vault writes.
4. **Curated, minimal tool surface.** `config`, `init`, `permissions`, `provenance`,
   and `describe` are **not** tools.
5. **Stage by blast radius:** read-only first, then additive writes, then destructive
   (gated). Ship and validate each tier before the next.
6. **Treat vault content as semi-trusted.** Notes contain clipped web content that may
   carry injected instructions. Destructive tools are gated behind an explicit `confirm`
   flag so injected text cannot trigger them.
7. **Schemas must not drift — beyond intentional tightening.** A test asserts each tool's
   input schema matches the relevant `sb describe` subset, allowing the MCP schema to be
   a stricter superset (e.g. required `content`).
8. **Remote ≠ local Claude Code.** Over MCP, Claude has *only* these tools — no native
   filesystem Edit/Write. Write tools must be self-contained (full content in one call).
9. **Search is a delegate.** `search_vault` is an HTTP client to qmd; it must degrade
   gracefully when qmd is unreachable and never block the other tools.

---

## 5. Phase 0 — Core extraction (PR1) — *largest phase*

- For each tool-backed command (`note read/list/move/create`, `note context`,
  `inbox list`, `vault structure/obsidian`, `daily path/append`), extract a pure
  `(args) => Promise<result>` function with **no** `process.exit` / `console.log`.
  Re-point the existing Commander actions at these functions (they keep printing/exiting)
  so CLI behavior is unchanged.
- Add a shared **vault-resolution + validation** module both CLI and MCP import (today
  the resolve-or-`process.exit` block is copy-pasted in every handler).
- Convert "no vault / not found / bad path" from `process.exit` into typed errors the
  caller maps (CLI → exit 1; MCP → `isError` result).
- **Container config:** use an **absolute** vault path (`/vault`); keep the container
  config minimal (avoid a `## Settings` block — see §3).
- **Acceptance:** existing tests green; each function callable from a test with no
  process spawn and no stdout write.

---

## 6. Phase 1 — Read-only HTTP MCP server + `search_vault` (PR2) + Dockerfile (PR3)

### Tools (all `readOnlyHint: true`)

| Tool             | Source             | Input                               | Returns                                            |
| ---------------- | ------------------ | ----------------------------------- | -------------------------------------------------- |
| `search_vault`   | **qmd (delegate)** | `{ query: string, limit?: number }` | ranked hits: path, snippet, score                  |
| `vault_structure`| `vault structure`  | `{}`                                | PARA/JD destinations (path + type)                 |
| `inbox_list`     | `inbox list`       | `{ detail?: boolean }`              | inbox notes                                        |
| `note_read`      | `note read`        | `{ path: string }`                  | parsed note: frontmatter, sections, links, content |
| `note_context`   | `note context`     | `{ path: string }`                  | routing context: keywords, destinations, related   |
| `daily_path`     | `daily path`       | `{}`                                | today's daily-note path                            |
| `vault_obsidian` | `vault obsidian`   | `{}`                                | parsed `.obsidian` settings (optional)             |

### Server tasks

- `sb mcp --listen :8080 [--vault <name>]`; `POST/GET /mcp`, `GET /healthz`. Bind
  `0.0.0.0` inside the container.
- Use `@modelcontextprotocol/sdk` `McpServer` + `StreamableHTTPServerTransport`
  (verify signature against installed version). Stateful w/ `Mcp-Session-Id` recommended
  (single process → safe). Stateless acceptable if simpler.
- **Warm state:** resolve config + vault once at startup and cache.
- **qmd client:** read `QMD_URL` + `QMD_SEARCH_MODE`; for v1 implement **`lex`** (qmd
  BM25 `/search`) only — no models, runs on the J3455. Normalize to `{path, snippet,
  score}`. On qmd error/timeout return a clean `isError` result; never throw, never
  affect other tools. Defer `vector`/`hybrid` until Open Q1 (§9) is answered.
- **Error mapping:** validation failures, unknown vault, missing paths, qmd errors →
  structured MCP tool errors. Never throw out of a handler.
- **Graceful shutdown:** trap `SIGTERM`/`SIGINT` → stop accepting, drain, exit.
- Structured logging; do not log full note bodies at info level. Since the protocol
  rides HTTP, stdout is no longer the wire.
- Write **model-facing tool descriptions** (not CLI `--help` text) and set MCP
  annotations on every tool.
- New deps: `@modelcontextprotocol/sdk` + an HTTP layer (Node `http`/`express`). Keep
  the footprint small — **no model/native deps**.

### Dockerfile (PR3)

- Multi-stage `node:20` build → slim runtime; **non-root** user; copy only `dist/` +
  production `node_modules`.
- `EXPOSE 8080`; `HEALTHCHECK` on `/healthz`. Entrypoint:
  `node dist/<entry> mcp --listen :8080`.
- Vault at `/vault` (**read-only** this phase); `QMD_URL` / `QMD_SEARCH_MODE` in env.
  Provide an entrypoint step that runs `sb init --name primary --path /vault` if no
  config is present, or mount the config in.

**Acceptance:** an MCP client completes `initialize → tools/list → tools/call` for every
read tool; `search_vault` returns hits when qmd is up and a clean error when down;
image runs non-root; healthcheck passes; no host port published.

---

## 7. Phase 2 — Additive write tools (PR4)

| Tool          | Source         | Input                                                | Annotations                                           |
| ------------- | -------------- | ---------------------------------------------------- | ----------------------------------------------------- |
| `note_create` | `note create`  | `{ title: string, content: string, source?: string }`| `readOnly:false, destructive:false, idempotent:false` |
| `daily_append`| `daily append` | `{ section: string, content: string }`               | `readOnly:false, destructive:false`                   |

- **`content` is required** (single-call; no stub-then-edit). This is the intentional
  tightening §3/§4-#7 allow for.
- `source` defaults to a fixed label (e.g. `claude-chat`); no git provenance server-side.
- Flip the vault mount to **`:rw`**.
- **Tests:** operate on a temp copy of `test/fixtures/`; assert ZK filename
  (`YYYYMMDDHHmm slug.md`) + inbox placement; assert section append/creation; `--dry-run`
  parity; traversal still rejected.

---

## 8. Phase 3 — Destructive tool (gated) (PR5)

| Tool        | Source      | Input                                              | Annotations            |
| ----------- | ----------- | -------------------------------------------------- | ---------------------- |
| `note_move` | `note move` | `{ from: string, to: string, confirm?: boolean }`  | `destructiveHint:true` |

- Without `confirm: true` → return the `--dry-run` preview; **do not move**.
- With `confirm: true` → perform the move. The explicit flag means injected note content
  can't trigger a move on its own.
- **Tests:** preview-without-confirm; move-with-confirm; traversal rejected on `from` and
  `to`.

---

## 9. Open questions — recommendations

1. **qmd vector-mode invocation** (the one real blocker for `vector`): start at `lex`
   via qmd's HTTP `/search` — no decision needed. Resolve the vector path
   (`searchVector()` lib call vs. dedicated daemon endpoint vs. `qmd vsearch`) only when
   moving to Tier 1, after the deployment plan's §4 verify step confirms node-llama-cpp
   runs on the no-AVX2 J3455. Not on the v1 critical path.
2. **Subcommand name:** `sb mcp` — explicit and matches the connector's purpose.
3. **Stateful vs stateless:** stateful with session IDs (single process makes it safe).
4. **Destructive approval:** the `confirm` flag is sufficient for v1; client-side human
   approval is a bonus, not a requirement.

---

## 10. Suggested PR sequencing

1. **PR1** — Phase 0 refactor (no behavior change).
2. **PR2** — Phase 1 read-only server **including `search_vault`** + qmd client + tests.
3. **PR3** — Dockerfile + container config + healthcheck.
4. **PR4** — Phase 2 additive writes.
5. **PR5** — Phase 3 gated `note_move`.

---

## 11. Deployment plan (homelab repo) — review-level notes

Out of this repo's scope, but validated for consistency with the sb side:

- **Coherent and consistent** with this plan — one public surface, sb fronts qmd,
  read-only vault to start, `QMD_URL`/`QMD_SEARCH_MODE` as the upgrade lever.
- **Hard dependency ordering:** the Compose stack can't come up until PR2+PR3 ship the
  `sb mcp` server and image. Don't provision the proxy/Funnel before the container passes
  local MCP Inspector verification.
- **Confirm before building (deployment doc §4, §12):** does node-llama-cpp load on the
  no-AVX2 J3455 (`qmd doctor`)? This gates whether Tier 1 is ever reachable on the
  current box and is independent of sb code.
- **Persist `/srv/data/mcp-auth-proxy`** (OAuth state + signing keys) or tokens silently
  break on restart.
- **qmd first-run egress exception** (≈2 GB model pull from HuggingFace) before locking
  the `internal` network.

---

## 12. Verification

- **Phase 0:** `npm test` stays green; add unit tests calling extracted functions
  directly (no spawn, no stdout).
- **Phase 1:** unit-test each tool handler against `test/fixtures/` (stub the qmd client;
  cover the qmd-down path); integration test boots the server and drives it with an SDK
  MCP client through `initialize → tools/list → tools/call`; schema-drift test compares
  each tool's `inputSchema` to the `sb describe --command <top-level>` subset **allowing
  intentional tightening**. Manual: MCP Inspector against `http://localhost:8080/mcp`.
- **Phases 2–3:** temp-vault write tests; dry-run/confirm parity; traversal rejection on
  every path arg.
- **End-to-end (after deploy):** MCP Inspector through the Funnel URL once the homelab
  stack is up; `search_vault` against the live qmd index.
