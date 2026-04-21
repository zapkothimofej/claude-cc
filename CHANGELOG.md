# Changelog

## [1.0.0] — 2026-04-21

### Added
- `/claude-cc review` — standard Claude Code review against git state
- `/claude-cc adversarial-review` — challenge-mode review questioning the implementation approach
- `/claude-cc rescue` — delegate tasks to Claude Code with full write access
- `/claude-cc setup` — verify Claude Code installation and authentication
- `/claude-cc status` — show active and recent jobs
- `/claude-cc result` — view finished job output
- `/claude-cc cancel` — cancel active background jobs
- Background/foreground execution with `--background` / `--wait` flags
- Job persistence in `.claude-cc/jobs/` per repository
- `--resume` flag to continue previous Claude thread
- `--model` flag to override Claude model per command
- Auto diff-size estimation to recommend background vs foreground
