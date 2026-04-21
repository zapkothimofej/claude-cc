# claude-cc

> Use Claude Code from within OpenAI Codex — code review, adversarial review, and task delegation.

The mirror image of [`openai/codex-plugin-cc`](https://github.com/openai/codex-plugin-cc). That plugin brings Codex into Claude Code. This one brings Claude Code into Codex.

```
/claude-cc review
/claude-cc adversarial-review
/claude-cc rescue investigate the auth bug and fix it
```

---

## What it does

`claude-cc` is a Codex skill that lets you call Claude Code (`claude`) non-interactively from inside a Codex session. It mirrors the command surface of `codex-plugin-cc` exactly — same commands, same flags, same background/foreground execution model — but uses Claude as the engine instead of Codex.

| `codex-plugin-cc` command | `claude-cc` equivalent |
|---|---|
| `/codex:review` | `/claude-cc review` |
| `/codex:adversarial-review` | `/claude-cc adversarial-review` |
| `/codex:rescue <task>` | `/claude-cc rescue <task>` |
| `/codex:setup` | `/claude-cc setup` |
| `/codex:status` | `/claude-cc status` |
| `/codex:result <id>` | `/claude-cc result <id>` |
| `/codex:cancel <id>` | `/claude-cc cancel <id>` |

---

## Commands

### `/claude-cc review`
Standard read-only Claude Code review against your local git state.

```
/claude-cc review
/claude-cc review --wait
/claude-cc review --background
/claude-cc review --base main
/claude-cc review --scope branch
```

Estimates diff size automatically. Small reviews run in the foreground; larger ones are recommended to run in the background. Output is returned verbatim — Claude never applies fixes.

---

### `/claude-cc adversarial-review`
A review that challenges your implementation. Claude questions whether the approach is right, not just whether the code is correct.

```
/claude-cc adversarial-review
/claude-cc adversarial-review focus on the caching strategy
/claude-cc adversarial-review --background --base main
```

Framing: _What assumptions does this design depend on? Where could it fail under real-world conditions? Is this the right approach at all?_

---

### `/claude-cc rescue`
Delegate investigation or a fix to Claude Code running as a background agent. Claude gets full write access and works autonomously.

```
/claude-cc rescue investigate why the auth middleware rejects valid tokens
/claude-cc rescue fix the N+1 query in UserService
/claude-cc rescue --background refactor the payment module to use the new API
/claude-cc rescue --resume continue with the previous fix
```

Flags:
- `--background` — detach, check progress with `/claude-cc status`
- `--wait` — run in foreground (default)
- `--resume` — continue the last Claude thread in this repo
- `--fresh` — force a new thread
- `--model <model>` — override model (default: `claude-opus-4-7`)

---

### `/claude-cc setup`
Verify that Claude Code is installed and ready.

```
/claude-cc setup
```

If Claude Code isn't installed, offers to install it via npm. If not authenticated, shows the auth command.

---

### `/claude-cc status`
Show active and recent Claude jobs for the current repository.

```
/claude-cc status
/claude-cc status <job-id>
```

---

### `/claude-cc result`
Show the full output of a finished job.

```
/claude-cc result
/claude-cc result <job-id>
```

---

### `/claude-cc cancel`
Cancel an active background job.

```
/claude-cc cancel
/claude-cc cancel <job-id>
```

---

## Installation

### Requirements
- [OpenAI Codex](https://developers.openai.com/codex) (CLI or desktop app)
- [Claude Code](https://claude.ai/code) CLI (`npm install -g @anthropic-ai/claude-code`)
- Node.js 18.18+

### Install the skill

**Option A — Clone directly into your Codex skills directory:**
```bash
git clone https://github.com/zapkothimofej/claude-cc ~/.codex/skills/claude-cc
```

**Option B — If you use the shared `~/.agents/skills/` directory (Codex desktop app):**
```bash
git clone https://github.com/zapkothimofej/claude-cc ~/.agents/skills/claude-cc
```

**Option C — Per-project:**
```bash
git clone https://github.com/zapkothimofej/claude-cc .agents/skills/claude-cc
```

### Verify
Inside Codex, run:
```
/claude-cc setup
```

Expected output:
```
✅ Claude Code 2.x.x
   Path: /usr/local/bin/claude
   Workspace: /your/project
```

---

## How it works

The skill ships a Node.js companion script (`scripts/claude-companion.mjs`) that manages everything:

1. **Job tracking** — each review or task gets a unique ID, stored in `.claude-cc/jobs/` inside your repository
2. **Claude invocation** — calls `claude -p "..."` non-interactively with appropriate tool permissions
3. **Background execution** — detaches the process, writes output to a job file, tracks PID
4. **Diff collection** — builds the review context from `git diff` and `git status`

The `SKILL.md` tells Codex when to activate the skill and how to route each command to the companion script.

```
claude-cc/
├── SKILL.md                      # Codex skill entry point
├── agents/
│   └── openai.yaml               # UI metadata (display name, color)
└── scripts/
    └── claude-companion.mjs      # Node.js companion — all logic lives here
```

---

## Configuration

The skill picks up Claude's model from `--model` flags. To set a default per-project, add to `.codex/config.toml`:

```toml
# .codex/config.toml
[skills.claude-cc]
default_model = "claude-sonnet-4-6"
```

By default, all commands use `claude-opus-4-7`.

---

## Comparison

| | `codex-plugin-cc` | `claude-cc` |
|---|---|---|
| Direction | Codex inside Claude Code | Claude Code inside Codex |
| Install location | `~/.claude/plugins/` | `~/.codex/skills/` |
| Review engine | GPT-5.4 (Codex) | Claude Opus 4.7 |
| Task delegation | `codex exec` | `claude -p` |
| Job state | `.codex-cc/` | `.claude-cc/` |
| Background execution | ✅ | ✅ |
| Adversarial review | ✅ | ✅ |

---

## Contributing

PRs welcome. The companion script is self-contained — all logic is in `scripts/claude-companion.mjs`.

To test locally:
```bash
node plugins/claude-cc/scripts/claude-companion.mjs setup
node plugins/claude-cc/scripts/claude-companion.mjs review --wait
```

---

## License

Apache 2.0 — same as [`openai/codex-plugin-cc`](https://github.com/openai/codex-plugin-cc/blob/main/LICENSE).
