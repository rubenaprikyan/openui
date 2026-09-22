import { existsSync, readdirSync, statSync, openSync, readSync, closeSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import type { Session, SessionMetrics, PullRequestInfo, ChecksState } from "../types";
import { sessions, getGitBranch } from "./sessionManager";

const QUIET = !!process.env.OPENUI_QUIET;
const log = QUIET ? () => {} : console.log.bind(console);

const CLAUDE_PROJECTS_DIR = join(homedir(), ".claude", "projects");
const DEFAULT_CONTEXT_WINDOW = Number(process.env.OPENUI_CONTEXT_WINDOW) || 200_000;
const LARGE_CONTEXT_WINDOW = 1_000_000;
const METRICS_INTERVAL = 5_000;
const PR_INTERVAL = 60_000;
// Cap how much of a transcript we read per tick so a huge first read doesn't stall the server
const MAX_READ_BYTES = 16 * 1024 * 1024;

const NON_PR_BRANCHES = new Set(["main", "master", "HEAD", "develop", "trunk"]);

// Messages already counted, per transcript (streamed assistant messages repeat the same id)
const seenMessageIds = new Map<string, Map<string, number>>();

function emptyMetrics(): SessionMetrics {
  return { totalTokens: 0, outputTokens: 0, contextTokens: 0, contextWindow: DEFAULT_CONTEXT_WINDOW, turns: 0, transcriptOffset: 0 };
}

// Locate a transcript by Claude session id when the hook hasn't reported its path
function findTranscript(claudeSessionId: string): string | undefined {
  if (!existsSync(CLAUDE_PROJECTS_DIR)) return undefined;
  try {
    for (const dir of readdirSync(CLAUDE_PROJECTS_DIR)) {
      const candidate = join(CLAUDE_PROJECTS_DIR, dir, `${claudeSessionId}.jsonl`);
      if (existsSync(candidate)) return candidate;
    }
  } catch {
    // Ignore unreadable dirs
  }
  return undefined;
}

// Incrementally parse new lines of the Claude Code JSONL transcript
export function updateTranscriptMetrics(session: Session) {
  if (!session.transcriptPath && session.claudeSessionId) {
    session.transcriptPath = findTranscript(session.claudeSessionId);
  }
  const path = session.transcriptPath;
  if (!path || !existsSync(path)) return;

  const metrics = session.metrics || emptyMetrics();
  let size: number;
  try {
    size = statSync(path).size;
  } catch {
    return;
  }

  let offset = metrics.transcriptOffset || 0;
  // Transcript was rotated/truncated - start over
  if (size < offset) {
    Object.assign(metrics, emptyMetrics());
    seenMessageIds.delete(path);
    offset = 0;
  }
  if (size === offset) {
    session.metrics = metrics;
    return;
  }

  const length = Math.min(size - offset, MAX_READ_BYTES);
  const buf = Buffer.alloc(length);
  const fd = openSync(path, "r");
  try {
    readSync(fd, buf, 0, length, offset);
  } finally {
    closeSync(fd);
  }

  const text = buf.toString("utf-8");
  // Only consume complete lines; the rest is picked up next tick
  const lastNewline = text.lastIndexOf("\n");
  if (lastNewline === -1) return;
  const chunk = text.slice(0, lastNewline);
  metrics.transcriptOffset = offset + Buffer.byteLength(chunk, "utf-8") + 1;

  let seen = seenMessageIds.get(path);
  if (!seen) {
    seen = new Map();
    seenMessageIds.set(path, seen);
  }

  for (const line of chunk.split("\n")) {
    if (!line) continue;
    let entry: any;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }

    if (entry.type === "ai-title" && typeof entry.aiTitle === "string") {
      metrics.title = entry.aiTitle;
      continue;
    }

    // Count real prompts: user entries that aren't tool results, meta or subagent traffic
    if (entry.type === "user") {
      const content = entry.message?.content;
      const isPrompt =
        typeof content === "string" ||
        (Array.isArray(content) && content.length > 0 && !content.some((b: any) => b?.type === "tool_result"));
      if (isPrompt && !entry.isMeta && !entry.isSidechain) metrics.turns++;
      continue;
    }

    const message = entry.message;
    if (entry.type !== "assistant" || !message?.usage) continue;
    // Sidechain (subagent) usage counts toward total spend but not the main context
    const isSidechain = !!entry.isSidechain;

    const usage = message.usage;
    const input = usage.input_tokens || 0;
    const cacheCreate = usage.cache_creation_input_tokens || 0;
    const cacheRead = usage.cache_read_input_tokens || 0;
    const output = usage.output_tokens || 0;

    const id = message.id || entry.uuid;
    const prevOutput = id ? seen.get(id) : undefined;
    if (prevOutput !== undefined) {
      // Later chunks of the same streamed message repeat input usage; only count new output
      const delta = Math.max(0, output - prevOutput);
      metrics.totalTokens += delta;
      metrics.outputTokens += delta;
      seen.set(id, Math.max(prevOutput, output));
    } else {
      if (id) seen.set(id, output);
      metrics.totalTokens += input + cacheCreate + cacheRead + output;
      metrics.outputTokens += output;
    }

    if (!isSidechain) {
      if (message.model && message.model !== "<synthetic>") metrics.model = message.model;
      metrics.contextTokens = input + cacheCreate + cacheRead + output;
    }
  }

  metrics.contextWindow =
    metrics.contextTokens > DEFAULT_CONTEXT_WINDOW || /\[1m\]/i.test(metrics.model || "")
      ? LARGE_CONTEXT_WINDOW
      : DEFAULT_CONTEXT_WINDOW;

  session.metrics = metrics;
}

function summarizeChecks(rollup: any[] | undefined): ChecksState {
  if (!rollup || rollup.length === 0) return "NONE";
  let pending = false;
  for (const check of rollup) {
    // CheckRun has status/conclusion, StatusContext has state
    const conclusion = (check.conclusion || check.state || "").toUpperCase();
    const status = (check.status || "").toUpperCase();
    if (["FAILURE", "ERROR", "TIMED_OUT", "CANCELLED", "ACTION_REQUIRED", "STARTUP_FAILURE"].includes(conclusion)) {
      return "FAILURE";
    }
    if ((status && status !== "COMPLETED") || conclusion === "PENDING" || conclusion === "EXPECTED" || (!conclusion && !status)) {
      pending = true;
    }
  }
  return pending ? "PENDING" : "SUCCESS";
}

// Cache PR lookups per repo+branch so agents sharing a branch share one gh call
const prCache = new Map<string, { at: number; prs: PullRequestInfo[] }>();
let ghAvailable: boolean | null = null;

async function fetchPullRequests(cwd: string, branch: string): Promise<PullRequestInfo[] | null> {
  if (ghAvailable === false) return null;

  const key = `${cwd}::${branch}`;
  const cached = prCache.get(key);
  if (cached && Date.now() - cached.at < PR_INTERVAL - 1000) return cached.prs;

  try {
    const proc = Bun.spawn(
      [
        "gh", "pr", "list",
        "--head", branch,
        "--state", "all",
        "--limit", "5",
        "--json", "number,url,title,state,isDraft,statusCheckRollup,reviewDecision",
      ],
      { cwd, stdout: "pipe", stderr: "pipe" }
    );
    const [out, code] = await Promise.all([new Response(proc.stdout).text(), proc.exited]);
    ghAvailable = true;
    if (code !== 0) {
      prCache.set(key, { at: Date.now(), prs: cached?.prs || [] });
      return cached?.prs || null;
    }

    const prs: PullRequestInfo[] = JSON.parse(out).map((pr: any) => ({
      number: pr.number,
      url: pr.url,
      title: pr.title,
      state: pr.state,
      isDraft: !!pr.isDraft,
      checks: summarizeChecks(pr.statusCheckRollup),
      reviewDecision: pr.reviewDecision || undefined,
    }));
    prCache.set(key, { at: Date.now(), prs });
    return prs;
  } catch (e: any) {
    if (e?.code === "ENOENT" || /ENOENT|not found/i.test(String(e?.message))) {
      ghAvailable = false;
      log(`\x1b[38;5;245m[metrics]\x1b[0m gh CLI not found, PR tracking disabled`);
    }
    return null;
  }
}

async function refreshPullRequests() {
  const seen = new Set<string>();
  for (const session of sessions.values()) {
    if (session.isShell || !session.gitBranch || NON_PR_BRANCHES.has(session.gitBranch)) {
      if (!session.isShell) session.prs = [];
      continue;
    }
    const key = `${session.cwd}::${session.gitBranch}`;
    const prs = await fetchPullRequests(session.cwd, session.gitBranch);
    if (prs) session.prs = prs;
    seen.add(key);
  }
  // Drop cache entries nobody uses anymore
  for (const key of prCache.keys()) {
    if (!seen.has(key)) prCache.delete(key);
  }
}

function refreshLocalMetrics() {
  for (const session of sessions.values()) {
    if (session.isShell) continue;
    try {
      updateTranscriptMetrics(session);
    } catch (e) {
      // Never let a bad transcript break the loop
    }
    // Agents switch branches while they work
    const branch = getGitBranch(session.cwd);
    if (branch && branch !== session.gitBranch) {
      session.gitBranch = branch;
      // Force a PR refresh for the new branch on the next cycle
      session.prs = [];
    }
  }
}

export function startMetricsLoop() {
  refreshLocalMetrics();
  setInterval(refreshLocalMetrics, METRICS_INTERVAL);

  let prRunning = false;
  const runPrs = async () => {
    if (prRunning) return;
    prRunning = true;
    try {
      await refreshPullRequests();
    } finally {
      prRunning = false;
    }
  };
  // Give restored sessions a moment before hitting gh
  setTimeout(runPrs, 2_000);
  setInterval(runPrs, PR_INTERVAL);
}

// Trigger an immediate PR refresh for a single session (e.g. after an agent stops)
export async function refreshSessionPullRequests(session: Session) {
  if (!session.gitBranch || NON_PR_BRANCHES.has(session.gitBranch)) return;
  prCache.delete(`${session.cwd}::${session.gitBranch}`);
  const prs = await fetchPullRequests(session.cwd, session.gitBranch);
  if (prs) session.prs = prs;
}
