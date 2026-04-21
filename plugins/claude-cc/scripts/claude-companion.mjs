#!/usr/bin/env node
/**
 * claude-companion.mjs — reverse of codex-companion.mjs
 * Runs Claude Code CLI non-interactively from within Codex.
 *
 * Usage:
 *   node claude-companion.mjs setup [--json]
 *   node claude-companion.mjs review [--wait|--background] [--base <ref>] [--scope <auto|working-tree|branch>]
 *   node claude-companion.mjs adversarial-review [--wait|--background] [--base <ref>] [focus text]
 *   node claude-companion.mjs task [--background] [--write] [--resume-last] [--model <model>] [--effort <level>] [prompt]
 *   node claude-companion.mjs status [job-id] [--all]
 *   node claude-companion.mjs result [job-id]
 *   node claude-companion.mjs cancel [job-id]
 */

import { spawn, execSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import process from "node:process";
import crypto from "node:crypto";

// ── State directory ────────────────────────────────────────────────────────────
const WORKSPACE_ROOT = findWorkspaceRoot();
const STATE_DIR = path.join(WORKSPACE_ROOT, ".claude-cc");
const JOBS_DIR = path.join(STATE_DIR, "jobs");
fs.mkdirSync(JOBS_DIR, { recursive: true });

function findWorkspaceRoot() {
  try {
    return execSync("git rev-parse --show-toplevel", { encoding: "utf8", stdio: ["pipe","pipe","pipe"] }).trim();
  } catch {
    return process.cwd();
  }
}

function generateJobId() {
  return crypto.randomBytes(4).toString("hex");
}

function nowIso() {
  return new Date().toISOString();
}

function loadJobs() {
  if (!fs.existsSync(JOBS_DIR)) return [];
  return fs.readdirSync(JOBS_DIR)
    .filter(f => f.endsWith(".json"))
    .map(f => {
      try { return JSON.parse(fs.readFileSync(path.join(JOBS_DIR, f), "utf8")); }
      catch { return null; }
    })
    .filter(Boolean)
    .sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt));
}

function saveJob(job) {
  fs.writeFileSync(path.join(JOBS_DIR, `${job.id}.json`), JSON.stringify(job, null, 2));
}

// ── Claude CLI detection ───────────────────────────────────────────────────────
function findClaude() {
  const candidates = [
    "/usr/local/bin/claude",
    "/opt/homebrew/bin/claude",
    path.join(os.homedir(), ".npm-global/bin/claude"),
    path.join(os.homedir(), ".local/bin/claude"),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  try {
    const which = execSync("which claude", { encoding: "utf8", stdio: ["pipe","pipe","pipe"] }).trim();
    if (which) return which;
  } catch {}
  return null;
}

function getClaudeVersion(claudePath) {
  try {
    return execSync(`"${claudePath}" --version`, { encoding: "utf8", stdio: ["pipe","pipe","pipe"] }).trim();
  } catch {
    return null;
  }
}

// ── Git helpers ────────────────────────────────────────────────────────────────
function getGitDiff(base, scope) {
  try {
    if (base) return execSync(`git diff ${base}...HEAD`, { encoding: "utf8", cwd: WORKSPACE_ROOT }).trim();
    if (scope === "staged") return execSync("git diff --cached", { encoding: "utf8", cwd: WORKSPACE_ROOT }).trim();
    if (scope === "branch") {
      const main = tryGetMainBranch();
      return execSync(`git diff ${main}...HEAD`, { encoding: "utf8", cwd: WORKSPACE_ROOT }).trim();
    }
    // auto / working-tree
    const staged = execSync("git diff --cached", { encoding: "utf8", cwd: WORKSPACE_ROOT }).trim();
    const unstaged = execSync("git diff", { encoding: "utf8", cwd: WORKSPACE_ROOT }).trim();
    return [staged, unstaged].filter(Boolean).join("\n\n");
  } catch {
    return "";
  }
}

function tryGetMainBranch() {
  try {
    execSync("git rev-parse --verify origin/main", { stdio: "pipe" });
    return "origin/main";
  } catch {}
  try {
    execSync("git rev-parse --verify origin/master", { stdio: "pipe" });
    return "origin/master";
  } catch {}
  return "HEAD~10";
}

function getGitStatusShort() {
  try {
    return execSync("git status --short --untracked-files=all", { encoding: "utf8", cwd: WORKSPACE_ROOT }).trim();
  } catch { return ""; }
}

// ── Claude runner ──────────────────────────────────────────────────────────────
function runClaude(claudePath, prompt, opts = {}) {
  const {
    model = "claude-opus-4-7",
    allowedTools = "Read,Glob,Grep,Bash",
    background = false,
    outputFile = null,
  } = opts;

  const args = [
    "--print", prompt,
    "--model", model,
    "--allowedTools", allowedTools,
    "--dangerously-skip-permissions",
    "--output-format", "text",
  ];

  if (outputFile) {
    const child = spawn(claudePath, args, {
      detached: true,
      stdio: ["ignore", fs.openSync(outputFile, "w"), fs.openSync(outputFile + ".err", "w")],
      cwd: WORKSPACE_ROOT,
    });
    child.unref();
    return { pid: child.pid };
  } else {
    const result = spawnSync(claudePath, args, {
      encoding: "utf8",
      cwd: WORKSPACE_ROOT,
      maxBuffer: 50 * 1024 * 1024,
      timeout: 300000,
    });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(result.stderr || `exit ${result.status}`);
    return { output: result.stdout };
  }
}

// ── Commands ───────────────────────────────────────────────────────────────────

function cmdSetup(args) {
  const claudePath = findClaude();
  const json = args.includes("--json");

  if (!claudePath) {
    const msg = {
      available: false,
      message: "Claude Code CLI not found.",
      install: "npm install -g @anthropic-ai/claude-code",
    };
    if (json) { console.log(JSON.stringify(msg, null, 2)); return; }
    console.log("❌ Claude Code CLI not found.");
    console.log("Install with: npm install -g @anthropic-ai/claude-code");
    console.log("Then authenticate: claude auth login");
    return;
  }

  const version = getClaudeVersion(claudePath);
  const msg = {
    available: true,
    path: claudePath,
    version,
    message: `Claude Code ${version} ready at ${claudePath}`,
  };

  if (json) { console.log(JSON.stringify(msg, null, 2)); return; }
  console.log(`✅ Claude Code ${version}`);
  console.log(`   Path: ${claudePath}`);
  console.log(`   Workspace: ${WORKSPACE_ROOT}`);
  console.log(`   State: ${STATE_DIR}`);
}

function cmdReview(rawArgs, adversarial = false) {
  const claudePath = findClaude();
  if (!claudePath) { console.log("Claude Code not found. Run: /claude-cc setup"); return; }

  const args = rawArgs.split(/\s+/).filter(Boolean);
  const background = args.includes("--background");
  const wait = args.includes("--wait");
  const baseIdx = args.indexOf("--base");
  const base = baseIdx >= 0 ? args[baseIdx + 1] : null;
  const scopeIdx = args.indexOf("--scope");
  const scope = scopeIdx >= 0 ? args[scopeIdx + 1] : "auto";
  const focusText = args.filter(a => !a.startsWith("--") && a !== base && a !== scope).join(" ");

  const diff = getGitDiff(base, scope);
  const status = getGitStatusShort();

  if (!diff && !status) {
    console.log("Nothing to review — working tree is clean.");
    return;
  }

  const modelArg = args.includes("--model") ? args[args.indexOf("--model") + 1] : "claude-opus-4-7";

  const reviewType = adversarial ? "adversarial code review" : "code review";
  const adversarialInstructions = adversarial
    ? `\n\nThis is an ADVERSARIAL review. Your job is to CHALLENGE the implementation:\n- Question whether this approach is the right one\n- Identify what assumptions the design depends on\n- Find where the design could fail under real-world conditions\n- Challenge trade-offs and design decisions\n- Do NOT just find bugs — question the entire approach.`
    : "";

  const focusInstructions = focusText ? `\n\nFocus area: ${focusText}` : "";

  const prompt = `You are performing a ${reviewType} of the following code changes.

Git status:
${status}

Diff:
${diff.slice(0, 40000)}

Instructions:
- Group findings as: Critical / Warning / Nitpick
- For each finding: file:line + what + why + concrete fix
- If nothing critical found, say so explicitly
- This is review only — do not apply fixes${adversarialInstructions}${focusInstructions}`;

  const jobId = generateJobId();
  const outputFile = path.join(JOBS_DIR, `${jobId}.output`);

  if (background && !wait) {
    const job = {
      id: jobId,
      kind: adversarial ? "adversarial-review" : "review",
      status: "running",
      startedAt: nowIso(),
      outputFile,
      pid: null,
    };
    const { pid } = runClaude(claudePath, prompt, { model: modelArg, allowedTools: "Read,Glob,Grep,Bash", background: true, outputFile });
    job.pid = pid;
    saveJob(job);
    console.log(`Claude ${reviewType} started in background.`);
    console.log(`Job ID: ${jobId}`);
    console.log(`Check progress: /claude-cc status`);
    console.log(`View result:    /claude-cc result ${jobId}`);
  } else {
    const job = { id: jobId, kind: adversarial ? "adversarial-review" : "review", status: "running", startedAt: nowIso(), outputFile };
    saveJob(job);
    try {
      const { output } = runClaude(claudePath, prompt, { model: modelArg, allowedTools: "Read,Glob,Grep,Bash" });
      fs.writeFileSync(outputFile, output);
      job.status = "done";
      job.finishedAt = nowIso();
      saveJob(job);
      console.log(output);
    } catch (err) {
      job.status = "error";
      saveJob(job);
      console.error("Claude review failed:", err.message);
    }
  }
}

function cmdTask(rawArgs) {
  const claudePath = findClaude();
  if (!claudePath) { console.log("Claude Code not found. Run: /claude-cc setup"); return; }

  const args = rawArgs.split(/\s+/).filter(Boolean);
  const background = args.includes("--background");
  const modelIdx = args.indexOf("--model");
  const model = modelIdx >= 0 ? args[modelIdx + 1] : "claude-opus-4-7";
  const resumeLast = args.includes("--resume-last") || args.includes("--resume");

  const taskText = args
    .filter(a => !["--background","--wait","--resume-last","--resume","--fresh","--write"].includes(a))
    .filter((a, i, arr) => {
      if (a.startsWith("--")) return false;
      const prev = arr[i - 1];
      return prev !== "--model" && prev !== "--effort";
    })
    .join(" ");

  if (!taskText) { console.log("No task provided. What should Claude investigate or fix?"); return; }

  const jobId = generateJobId();
  const outputFile = path.join(JOBS_DIR, `${jobId}.output`);

  const prompt = resumeLast
    ? `Continue the previous task. Additional instructions: ${taskText}`
    : taskText;

  if (background) {
    const job = { id: jobId, kind: "task", status: "running", startedAt: nowIso(), outputFile, pid: null };
    const { pid } = runClaude(claudePath, prompt, {
      model,
      allowedTools: "all",
      background: true,
      outputFile,
    });
    job.pid = pid;
    saveJob(job);
    console.log(`Claude task started in background.`);
    console.log(`Job ID: ${jobId}`);
    console.log(`Check progress: /claude-cc status`);
    console.log(`View result:    /claude-cc result ${jobId}`);
  } else {
    const job = { id: jobId, kind: "task", status: "running", startedAt: nowIso(), outputFile };
    saveJob(job);
    try {
      const { output } = runClaude(claudePath, prompt, {
        model,
        allowedTools: "all",
      });
      fs.writeFileSync(outputFile, output);
      job.status = "done";
      job.finishedAt = nowIso();
      saveJob(job);
      console.log(output);
    } catch (err) {
      job.status = "error";
      saveJob(job);
      console.error("Claude task failed:", err.message);
    }
  }
}

function cmdStatus(rawArgs) {
  const args = rawArgs.split(/\s+/).filter(Boolean);
  const jobId = args.find(a => !a.startsWith("--"));
  const jobs = loadJobs();

  if (jobId) {
    const job = jobs.find(j => j.id === jobId);
    if (!job) { console.log(`Job ${jobId} not found.`); return; }
    // check if still running
    if (job.status === "running" && job.pid) {
      try { process.kill(job.pid, 0); }
      catch { job.status = "done"; saveJob(job); }
    }
    console.log(JSON.stringify(job, null, 2));
    return;
  }

  if (!jobs.length) { console.log("No Claude jobs found in this repository."); return; }

  // Check running jobs
  for (const job of jobs) {
    if (job.status === "running" && job.pid) {
      try { process.kill(job.pid, 0); }
      catch { job.status = "done"; saveJob(job); }
    }
  }

  const rows = jobs.slice(0, 10).map(j => {
    const elapsed = j.finishedAt
      ? `${Math.round((new Date(j.finishedAt) - new Date(j.startedAt)) / 1000)}s`
      : `${Math.round((Date.now() - new Date(j.startedAt)) / 1000)}s`;
    return `| ${j.id} | ${j.kind} | ${j.status} | ${elapsed} |`;
  });

  console.log("| ID | Kind | Status | Elapsed |");
  console.log("|---|---|---|---|");
  console.log(rows.join("\n"));
  console.log(`\nView result: /claude-cc result <id>`);
}

function cmdResult(rawArgs) {
  const args = rawArgs.split(/\s+/).filter(Boolean);
  const jobId = args[0];

  if (!jobId) {
    // show latest
    const jobs = loadJobs();
    const latest = jobs.find(j => j.status === "done");
    if (!latest) { console.log("No completed jobs found."); return; }
    const output = fs.existsSync(latest.outputFile) ? fs.readFileSync(latest.outputFile, "utf8") : "No output file.";
    console.log(`=== Job ${latest.id} (${latest.kind}) ===`);
    console.log(output);
    return;
  }

  const jobs = loadJobs();
  const job = jobs.find(j => j.id === jobId);
  if (!job) { console.log(`Job ${jobId} not found.`); return; }

  if (!fs.existsSync(job.outputFile)) { console.log(`Output for job ${jobId} not available yet.`); return; }
  console.log(`=== Job ${jobId} (${job.kind}) — ${job.status} ===`);
  console.log(fs.readFileSync(job.outputFile, "utf8"));
}

function cmdCancel(rawArgs) {
  const args = rawArgs.split(/\s+/).filter(Boolean);
  const jobs = loadJobs();

  const jobId = args[0];
  const job = jobId ? jobs.find(j => j.id === jobId) : jobs.find(j => j.status === "running");

  if (!job) { console.log(jobId ? `Job ${jobId} not found.` : "No active jobs to cancel."); return; }
  if (job.status !== "running") { console.log(`Job ${job.id} is not running (status: ${job.status}).`); return; }

  if (job.pid) {
    try {
      process.kill(job.pid, "SIGTERM");
      job.status = "cancelled";
      job.finishedAt = nowIso();
      saveJob(job);
      console.log(`✅ Cancelled job ${job.id} (PID ${job.pid})`);
    } catch {
      console.log(`Could not kill PID ${job.pid} — may have already finished.`);
      job.status = "done";
      saveJob(job);
    }
  }
}

// ── Main ───────────────────────────────────────────────────────────────────────
const [,, subcommand = "setup", ...rest] = process.argv;
const rawArgs = rest.join(" ");

switch (subcommand) {
  case "setup":              cmdSetup(rest); break;
  case "review":             cmdReview(rawArgs, false); break;
  case "adversarial-review": cmdReview(rawArgs, true); break;
  case "task":
  case "rescue":             cmdTask(rawArgs); break;
  case "status":             cmdStatus(rawArgs); break;
  case "result":             cmdResult(rawArgs); break;
  case "cancel":             cmdCancel(rawArgs); break;
  default:
    console.log(`Unknown command: ${subcommand}`);
    console.log("Commands: setup, review, adversarial-review, rescue, status, result, cancel");
}
