import type { IPty } from "bun-pty";
import type { ServerWebSocket } from "bun";

export type AgentStatus = "running" | "waiting_input" | "tool_calling" | "idle" | "disconnected" | "error";

export interface Session {
  pty: IPty | null;
  agentId: string;
  agentName: string;
  command: string;
  cwd: string;
  originalCwd?: string; // The mother repo path when using worktrees
  gitBranch?: string;
  worktreePath?: string;
  createdAt: string;
  clients: Set<ServerWebSocket<WebSocketData>>;
  outputBuffer: string[];
  status: AgentStatus;
  lastOutputTime: number;
  lastInputTime: number;
  recentOutputSize: number;
  customName?: string;
  customColor?: string;
  notes?: string;
  nodeId: string;
  isRestored?: boolean;
  position?: { x: number; y: number };
  // Linear ticket info
  ticketId?: string;
  ticketTitle?: string;
  ticketUrl?: string;
  // Plugin-reported status
  pluginReportedStatus?: boolean;
  lastPluginStatusTime?: number;
  // Claude Code's internal session ID (different from our sessionId)
  claudeSessionId?: string;
  // Current tool being used (from plugin)
  currentTool?: string;
  // Last hook event received
  lastHookEvent?: string;
  // Permission detection
  preToolTime?: number;
  permissionTimeout?: ReturnType<typeof setTimeout>;
  // Organization
  canvasId: string;
  icon?: string;
  pinned?: boolean;
  archived?: boolean;
  // Metrics (from Claude transcript + git/gh)
  transcriptPath?: string;
  metrics?: SessionMetrics;
  prs?: PullRequestInfo[];
  lastActivityAt?: number;
  // Auxiliary shell terminals attached to this agent (not rendered as nodes)
  isShell?: boolean;
  parentSessionId?: string;
}

export interface SessionMetrics {
  model?: string;
  // Auto-generated conversation title from Claude Code
  title?: string;
  totalTokens: number;
  outputTokens: number;
  contextTokens: number;
  contextWindow: number;
  turns: number;
  // Internal: incremental transcript parsing
  transcriptOffset?: number;
}

export type PullRequestState = "OPEN" | "MERGED" | "CLOSED";
export type ChecksState = "SUCCESS" | "FAILURE" | "PENDING" | "NONE";

export interface PullRequestInfo {
  number: number;
  url: string;
  title: string;
  state: PullRequestState;
  isDraft: boolean;
  checks: ChecksState;
  reviewDecision?: string;
}

export interface LinearTicket {
  id: string;
  identifier: string;
  title: string;
  url: string;
  state: { name: string; color: string };
  priority: number;
  assignee?: { name: string };
  team?: { name: string; key: string };
}

export interface LinearConfig {
  apiKey?: string;
  defaultTeamId?: string;
  defaultBaseBranch?: string;
  createWorktree?: boolean;
  ticketPromptTemplate?: string;
}

export interface PersistedNode {
  nodeId: string;
  sessionId: string;
  agentId: string;
  agentName: string;
  command: string;
  cwd: string;
  createdAt: string;
  customName?: string;
  customColor?: string;
  notes?: string;
  icon?: string;
  position: { x: number; y: number };
  canvasId?: string;
  pinned?: boolean;
  archived?: boolean;
  gitBranch?: string;
  originalCwd?: string;
  ticketId?: string;
  ticketTitle?: string;
  ticketUrl?: string;
  claudeSessionId?: string;
  transcriptPath?: string;
  lastActivityAt?: number;
}

export interface PersistedCategory {
  id: string;
  label: string;
  color: string;
  canvasId?: string;
  position: { x: number; y: number };
  width: number;
  height: number;
}

export interface Canvas {
  id: string;
  name: string;
}

export interface PersistedState {
  nodes: PersistedNode[];
  categories?: PersistedCategory[];
  canvases?: Canvas[];
}

export interface Agent {
  id: string;
  name: string;
  command: string;
  description: string;
  color: string;
  icon: string;
}

export interface WebSocketData {
  sessionId: string;
}
