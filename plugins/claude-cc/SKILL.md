---
name: claude-cc
description: Use Claude Code from within Codex to review code, challenge design decisions, or delegate tasks. Mirrors openai/codex-plugin-cc but reversed — Claude Code runs inside Codex. Commands: review, adversarial-review, rescue, setup, status, result, cancel. Triggers: "claude review", "let claude check", "claude:review", "claude rescue", "delegate to claude".
---

# /claude-cc — Claude Code inside Codex

Reverse of `openai/codex-plugin-cc`. Runs `claude` CLI non-interactively from within Codex.

## Commands

Parse the first word of `$ARGUMENTS` as the subcommand, rest as arguments.

### `review` — Standard Claude Code Review
Read-only review against local git state.

```bash
node ~/.codex/skills/claude-cc/scripts/claude-companion.mjs review $ARGUMENTS
```

- Estimate review size first with `git status --short` and `git diff --shortstat`
- Small (1-2 files): run foreground
- Larger or unclear: recommend background
- Return output verbatim — do not paraphrase, summarize, or fix anything

### `adversarial-review` — Challenge Mode Review
Challenges the implementation approach, design choices, and assumptions.

```bash
node ~/.codex/skills/claude-cc/scripts/claude-companion.mjs adversarial-review $ARGUMENTS
```

- Same size estimation as `review`
- Framing: question whether the approach is right, what assumptions it depends on, where the design could fail
- Return output verbatim — do not fix anything

### `rescue` — Delegate Task to Claude Code
Hand off investigation, a fix request, or follow-up work to Claude Code running as a subagent.

```bash
node ~/.codex/skills/claude-cc/scripts/claude-companion.mjs task $ARGUMENTS
```

- `--background`: run detached, check `/claude-cc status`
- `--wait`: run foreground
- `--resume`: continue last Claude thread
- `--fresh`: start new thread
- Default: foreground
- Return output verbatim

### `setup` — Verify Installation
Check if `claude` CLI is installed and authenticated.

```bash
node ~/.codex/skills/claude-cc/scripts/claude-companion.mjs setup $ARGUMENTS
```

If not installed, offer to install: `npm install -g @anthropic-ai/claude-code`
If not authenticated: tell user to run `claude auth login`

### `status` — Show Active and Recent Jobs

```bash
node ~/.codex/skills/claude-cc/scripts/claude-companion.mjs status $ARGUMENTS
```

Render as compact Markdown table: job ID, kind, status, elapsed, summary.

### `result` — Show Finished Job Output

```bash
node ~/.codex/skills/claude-cc/scripts/claude-companion.mjs result $ARGUMENTS
```

Return full output verbatim — preserve all findings, file paths, line numbers.

### `cancel` — Cancel Active Job

```bash
node ~/.codex/skills/claude-cc/scripts/claude-companion.mjs cancel $ARGUMENTS
```

## Flags (all commands)
- `--wait` / `--background` — execution mode
- `--base <ref>` — compare against branch/commit
- `--scope auto|working-tree|branch` — what to review
- `--model <model>` — override Claude model (default: claude-opus-4-7)
- `--effort <low|medium|high|max>` — reasoning effort

## Rules
- Never fix issues mentioned in review output
- Return companion script stdout verbatim always
- If Claude is missing, tell user to run `/claude-cc setup`
