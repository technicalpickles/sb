# Content via Write Tool Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make `--content` optional on `sb note create` so the plugin can use Claude's Write tool for note bodies instead of passing content via CLI args (which creates hard-to-approve Bash prompts).

**Architecture:** sb handles metadata (frontmatter, Zettelkasten filename, provenance) and returns the path. Claude's Write tool handles the body. This aligns with the existing design principle: "sb handles data, Claude handles decisions/prose."

**Tech Stack:** TypeScript, Vitest, Commander.js

**Beans:** gt-904u (sb CLI change), gt-szcn (plugin integration)

---

## Context: The Approval Problem

When the `insight` command runs today, it calls:

```bash
npx @techpickles/sb note create \
  --source auto \
  --title "My Insight" \
  --content "# My Insight

Three paragraphs of cleaned-up prose about the insight,
plus context about what was being discussed...

## Context

Captured while working on something.

---
*Captured via /second-brain:insight*"
```

That multiline `--content` arg creates a wall of text in the Bash approval prompt. It's hard to scan, hard to approve quickly, and the content is doing double duty: sb writes it into the file, but Claude is the one who composed it. The Write tool already has a clean approval UI for exactly this.

The fix: sb creates the file with frontmatter + heading only, returns the path. Claude uses Write to fill in the body.

---

## Part 1: sb CLI (repos/sb/worktrees/main)

### Task 1: Write failing test for content-optional note create

**Files:**
- Modify: `test/note.test.ts`

**Step 1: Write the failing test**

Add to the `NoteBuilder` describe block:

```typescript
it('creates note with frontmatter only when no content provided', async () => {
  const builder = new NoteBuilder({
    title: 'Frontmatter only note',
  });

  const result = await builder.create(tempDir, 'Inbox');
  const content = await readFile(result.path, 'utf-8');

  // Should have frontmatter
  expect(content).toContain('---');
  expect(content).toContain('captured:');
  expect(content).toContain('source: manual');

  // Should have title heading
  expect(content).toContain('# Frontmatter only note');

  // Should NOT have the trailing "Captured via" boilerplate
  // (that's content the caller provides, not sb's job)
  expect(content).not.toContain('Captured via');
});
```

**Step 2: Run test to verify it fails**

Run: `cd ~/gt/repos/sb/worktrees/main && npm test -- --reporter verbose test/note.test.ts`
Expected: FAIL because `NoteOptions.content` is required

### Task 2: Make content optional in NoteBuilder

**Files:**
- Modify: `src/services/NoteBuilder.ts`

**Step 1: Make content optional in the interface and constructor**

In `NoteOptions`, change `content: string` to `content?: string`.

In the `NoteBuilder` constructor, store content as `this.content = opts.content ?? ''`.

**Step 2: Adjust the file template for empty content**

In both `preview()` and `create()`, change the `lines` array to conditionally include content:

```typescript
const lines = [
  '---',
  `captured: ${isoTimestamp}`,
  `source: ${this.provenance.source}`,
  `repo: ${this.provenance.repo ?? 'none'}`,
  `branch: ${this.provenance.branch ?? 'none'}`,
  `commit: ${this.provenance.commit ?? 'none'}`,
  '---',
  '',
  `# ${this.title}`,
  '',
];

if (this.content) {
  lines.push(this.content, '');
}
```

Remove the trailing `---` and `*Captured via sb note create*` lines. That footer is content the caller should control, not sb. (Existing tests that check for it will need updating in the next task.)

**Step 3: Run test to verify it passes**

Run: `cd ~/gt/repos/sb/worktrees/main && npm test -- --reporter verbose test/note.test.ts`
Expected: All tests pass

### Task 3: Make --content optional in the CLI command

**Files:**
- Modify: `src/commands/note/index.ts`

**Step 1: Change requiredOption to option**

Change line 22 from:
```typescript
.requiredOption('--content <content>', 'Note content')
```
to:
```typescript
.option('--content <content>', 'Note content (omit for frontmatter-only)')
```

Update the action type signature: change `content: string` to `content?: string`.

**Step 2: Run full test suite**

Run: `cd ~/gt/repos/sb/worktrees/main && npm test`
Expected: All pass

**Step 3: Commit**

```bash
git add src/services/NoteBuilder.ts src/commands/note/index.ts test/note.test.ts
git commit -m "feat: make --content optional on note create

When omitted, creates note with frontmatter and title heading only.
Returns the path so callers can use their own tools to write the body.

Ref: gt-904u"
```

### Task 4: Fix existing tests for removed footer

The `*Captured via sb note create*` footer was removed from the template. Check if any existing tests assert on it and update them.

**Step 1: Search for affected assertions**

```bash
grep -n "Captured via" test/note.test.ts test/dry-run.test.ts test/integration.test.ts
```

**Step 2: Remove or update those assertions**

If tests check for `Captured via sb note create`, remove those assertions. The footer is now the caller's responsibility.

**Step 3: Run full test suite**

Run: `cd ~/gt/repos/sb/worktrees/main && npm test`
Expected: All pass

**Step 4: Commit if any changes were needed**

```bash
git commit -am "test: update assertions for content-optional note create"
```

### Task 5: Update describe command schema (if applicable)

**Files:**
- Check: `src/commands/describe/index.ts`

**Step 1: Check if describe reflects option requirements**

The `describe` command provides runtime schema introspection. Check if it reports `content` as required.

Run: `cd ~/gt/repos/sb/worktrees/main && npm run build && node bin/sb.js describe note create`

**Step 2: If it shows content as required, update accordingly**

The describe command may auto-detect from Commander.js. If it does, the change to `.option()` should be sufficient. If it has hardcoded schema, update it.

**Step 3: Commit if changes needed**

### Task 6: Update sb docs

**Files:**
- Modify: `docs/command-reference.md`

**Step 1: Update note create documentation**

Change the `--content` entry from required to optional. Add a note about the two-step flow:

```markdown
- `--content <content>` - Note content (optional). When omitted, creates note
  with frontmatter and title heading only. Use the returned path to write
  content with your own tools.
```

**Step 2: Commit**

```bash
git add docs/command-reference.md
git commit -m "docs: document optional --content on note create"
```

---

## Part 2: second-brain plugin (repos/pickled-claude-plugins/worktrees/gt-szcn)

These changes go on the existing `gt-szcn` branch.

### Task 7: Update sb-cli.md reference

**Files:**
- Modify: `skills/obsidian/references/sb-cli.md`

**Step 1: Update the note create entry**

Change:
```markdown
- `npx @techpickles/sb note create --source auto --title "..." --content "..."` - create Zettelkasten note in inbox
```
to:
```markdown
- `npx @techpickles/sb note create --source auto --title "..."` - create note in inbox (frontmatter + heading only, returns path)
- `npx @techpickles/sb note create --source auto --title "..." --content "..."` - create note with body (use for short content only)
```

**Step 2: Commit**

### Task 8: Update insight command to two-step flow

**Files:**
- Modify: `commands/insight.md`

**Step 1: Replace the note creation step (Step 3)**

Change from:
```bash
npx @techpickles/sb note create \
  --source auto \
  --title "short descriptive title" \
  --content "# {Insight Title}
..."
```

To the two-step flow:
```markdown
## Step 3: Create Note with Provenance

Create the note scaffold using sb CLI:

\`\`\`bash
npx @techpickles/sb note create \
  --source auto \
  --title "short descriptive title"
\`\`\`

This returns JSON with the created file's path. Parse the path from the response.

Then write the body using Claude's Write tool on the returned path:

\`\`\`
Write tool: {returned-path}

---
captured: {from frontmatter, already written by sb}
source: {from frontmatter, already written by sb}
...
---

# {Insight Title}

{The insight, cleaned up and clearly written. 1-3 paragraphs.}

## Context

Captured while {brief description of what you were working on/discussing}.

---
*Captured via /second-brain:insight*
\`\`\`

**Important:** The Write tool overwrites the file. Include the frontmatter that sb already wrote (visible in the sb JSON output or by reading the file), plus the heading and body content.
```

Actually, a cleaner approach: sb creates the file with frontmatter + heading. Then use the **Edit tool** (or Write tool) to append the body after the heading. Let me reconsider.

The cleanest flow:
1. sb creates file with frontmatter + `# Title` + empty line
2. Claude uses **Write** to rewrite with full content (reading the sb output to know the path)

Or even simpler:
1. sb creates file with frontmatter + `# Title`
2. Claude uses **Edit** to add body after the title heading

Edit is better because it doesn't require re-specifying the frontmatter. But Edit needs to know what's in the file. Since sb just created it, we know the structure.

Go with this approach:

```markdown
## Step 3: Create Note with Provenance

**3a. Create the note scaffold:**

\`\`\`bash
npx @techpickles/sb note create \
  --source auto \
  --title "short descriptive title"
\`\`\`

sb creates the file with frontmatter and title heading, returns JSON with the path.

**3b. Read the created file** to confirm the path and see the frontmatter.

**3c. Write the full note** using Write tool on the returned path. Include the frontmatter sb wrote (from the read), the title heading, and the insight body:

Use **Insight Note** pattern with cleaned up prose (1-3 paragraphs).
```

Hmm, this is getting complicated in the plan. Let me simplify. The actual cleanest approach given how the Write tool works:

1. sb returns the path + the frontmatter content in JSON
2. Claude uses Write with the full note (frontmatter from sb output + body from Claude)

But that requires sb to return the frontmatter in the JSON response. Let me check what it currently returns... It returns `{ path, filename }`. We could add the frontmatter content to the response.

Actually, the simplest thing: sb creates the scaffold file, returns `{ path, filename, frontmatter }`. Claude composes the full file content using that frontmatter and writes it with Write tool. One sb call, one Write call, clean approval.

Let me revise the plan with this approach.

**Step 2: Revise to also update the approach**

I'll update NoteBuilder to also return frontmatter in the JSON output when content is omitted.

OK let me just write the plan now.

```

**Step 1: Revise the note create step**

Replace the current Step 3 ("Create Note with Provenance") with:

```markdown
## Step 3: Create Note Scaffold

Create the note using sb CLI (without --content):

\`\`\`bash
npx @techpickles/sb note create \
  --source auto \
  --title "short descriptive title"
\`\`\`

sb creates the file with frontmatter and title heading. Returns JSON:
\`\`\`json
{
  "path": "/path/to/vault/Inbox/202603111430 short-descriptive-title.md",
  "filename": "202603111430 short-descriptive-title.md"
}
\`\`\`

Then write the insight body using Claude's Write tool at the returned path.
Compose the full note: re-include the frontmatter (read the file first if needed),
the title heading, and the insight content using **Insight Note** pattern
with cleaned up prose (1-3 paragraphs):

\`\`\`
# {Insight Title}

{The insight, cleaned up and clearly written. 1-3 paragraphs.}

## Context

Captured while {brief description of what you were working on/discussing}.

---
*Captured via /second-brain:insight*
\`\`\`
```

**Step 2: Commit**

### Task 9: Update distill-conversation command

**Files:**
- Modify: `commands/distill-conversation.md`

**Step 1: Update Step 5 (Capture Selected)**

Same pattern as insight: replace `sb note create --content` with the two-step flow. For batch creation, each note gets:
1. `sb note create --source auto --title "..."` (returns path)
2. Write tool to fill in body

**Step 2: Commit**

### Task 10: Bump plugin version and verify

**Step 1: Bump version in package metadata**

Check how versioning works for the plugin (likely in a manifest or directory name).

**Step 2: Verify end-to-end**

Reinstall plugin, run `/second-brain:insight` with a test insight. Verify:
- sb creates the scaffold (one short, approvable Bash command)
- Write tool fills in the body (clean Write approval)
- Routing, daily linking still work

---

## What's NOT in scope

- **`daily append --content`**: The content there is usually 1-2 lines of wiki links. Short enough that CLI arg approval is fine. Revisit if it becomes a pain point.
- **stdin support for content**: Could add `--content -` to read from stdin, but the Write tool approach is better for the plugin use case because it's already in Claude's approved tool set.
- **Other commands**: `note move`, `note context`, etc. don't pass large content via args.
