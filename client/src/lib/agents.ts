import { useStore, AgentSession, AgentStatus } from "../stores/useStore";

// Status config shared by cards, list rows and the panel
export const statusConfig: Record<
  AgentStatus,
  { label: string; color: string; bgColor: string; isActive?: boolean; needsAttention?: boolean }
> = {
  running: { label: "Working", color: "#22C55E", bgColor: "#22C55E15", isActive: true },
  tool_calling: { label: "Working", color: "#22C55E", bgColor: "#22C55E15", isActive: true },
  waiting_input: { label: "Needs Input", color: "#F97316", bgColor: "#F9731620", needsAttention: true },
  idle: { label: "Idle", color: "#FBBF24", bgColor: "#FBBF2415" },
  disconnected: { label: "Offline", color: "#6B7280", bgColor: "#6B728015" },
  error: { label: "Error", color: "#EF4444", bgColor: "#EF444415", needsAttention: true },
};

export function formatTokens(n: number | undefined): string {
  if (!n) return "0";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return String(n);
}

// "claude-opus-4-8" -> "Opus 4.8", "claude-haiku-4-5-20251001" -> "Haiku 4.5"
export function formatModel(model: string | undefined): string | null {
  if (!model) return null;
  const match = model.match(/(opus|sonnet|haiku|fable)-(\d+)(?:-(\d{1,2}))?(?!\d)/i);
  if (!match) return model.replace(/^claude-/, "");
  const family = match[1][0].toUpperCase() + match[1].slice(1).toLowerCase();
  return match[3] ? `${family} ${match[2]}.${match[3]}` : `${family} ${match[2]}`;
}

export function formatRelative(ts: number | string | undefined, now = Date.now()): string {
  if (!ts) return "–";
  const time = typeof ts === "string" ? new Date(ts).getTime() : ts;
  const diff = Math.max(0, now - time);
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "<1m";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

export function contextPercent(session: AgentSession | undefined): number | null {
  const m = session?.metrics;
  if (!m || !m.contextWindow || !m.contextTokens) return null;
  return Math.min(100, Math.round((m.contextTokens / m.contextWindow) * 100));
}

export function contextColor(percent: number): string {
  if (percent >= 70) return "#EF4444";
  if (percent >= 30) return "#F97316";
  return "#22C55E";
}

export function shortPath(path: string | undefined): string {
  if (!path) return "";
  const home = path.match(/^\/(?:Users|home)\/[^/]+/)?.[0];
  return home ? `~${path.slice(home.length)}` : path;
}

export function displayName(session: AgentSession): string {
  return session.customName || session.metrics?.title || session.agentName;
}

// Agents shown on a canvas, in shortcut order (pinned first, then oldest first)
export function orderedAgents(sessions: Map<string, AgentSession>, canvasId: string): AgentSession[] {
  return Array.from(sessions.values())
    .filter((s) => !s.archived && (s.canvasId || "main") === canvasId)
    .sort((a, b) => {
      if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });
}

function patchSession(session: AgentSession, updates: Record<string, unknown>) {
  return fetch(`/api/sessions/${session.sessionId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updates),
  }).catch(console.error);
}

// Imperative actions usable from any component or keyboard handler
export const agentActions = {
  open(nodeId: string) {
    const state = useStore.getState();
    const session = state.sessions.get(nodeId);
    if (!session) return;
    const canvasId = session.canvasId || "main";
    if (canvasId !== state.activeCanvasId) state.setActiveCanvasId(canvasId);
    state.setSelectedNodeId(nodeId);
    state.setSidebarOpen(true);
  },

  togglePin(nodeId: string) {
    const { sessions, updateSession } = useStore.getState();
    const session = sessions.get(nodeId);
    if (!session) return;
    updateSession(nodeId, { pinned: !session.pinned });
    patchSession(session, { pinned: !session.pinned });
  },

  setArchived(nodeId: string, archived: boolean) {
    const state = useStore.getState();
    const session = state.sessions.get(nodeId);
    if (!session) return;
    state.updateSession(nodeId, { archived });
    patchSession(session, { archived });
    if (archived && state.selectedNodeId === nodeId) {
      state.setSelectedNodeId(null);
      state.setSidebarOpen(false);
    }
  },

  moveToCanvas(nodeId: string, canvasId: string) {
    const state = useStore.getState();
    const session = state.sessions.get(nodeId);
    if (!session) return;
    state.updateSession(nodeId, { canvasId });
    patchSession(session, { canvasId });
    if (state.selectedNodeId === nodeId) {
      state.setSelectedNodeId(null);
      state.setSidebarOpen(false);
    }
  },

  async remove(nodeId: string) {
    const state = useStore.getState();
    const session = state.sessions.get(nodeId);
    if (session) {
      await fetch(`/api/sessions/${session.sessionId}`, { method: "DELETE" }).catch(console.error);
    }
    state.removeSession(nodeId);
    state.removeNode(nodeId);
    if (state.selectedNodeId === nodeId) {
      state.setSelectedNodeId(null);
      state.setSidebarOpen(false);
    }
  },

  copyLink(nodeId: string) {
    const url = new URL(window.location.href);
    url.search = "";
    url.searchParams.set("agent", nodeId);
    navigator.clipboard?.writeText(url.toString()).catch(console.error);
  },
};
