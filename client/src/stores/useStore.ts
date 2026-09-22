import { create } from "zustand";
import { Node } from "@xyflow/react";

export interface Agent {
  id: string;
  name: string;
  command: string;
  description: string;
  color: string;
  icon: string;
}

export type AgentStatus = "running" | "waiting_input" | "tool_calling" | "idle" | "disconnected" | "error";

export interface AgentSession {
  id: string;
  sessionId: string;
  agentId: string;
  agentName: string;
  command: string;
  color: string;
  createdAt: string;
  cwd: string;
  originalCwd?: string; // Mother repo path when using worktrees
  gitBranch?: string;
  status: AgentStatus;
  customName?: string;
  customColor?: string;
  notes?: string;
  isRestored?: boolean;
  // Linear ticket info
  ticketId?: string;
  ticketTitle?: string;
  ticketUrl?: string;
  // Current tool being used (from plugin)
  currentTool?: string;
  // Organization
  canvasId?: string;
  pinned?: boolean;
  archived?: boolean;
  // Metrics
  metrics?: SessionMetrics;
  prs?: PullRequestInfo[];
  lastActivityAt?: number;
  shells?: string[];
}

export interface SessionMetrics {
  model?: string;
  title?: string;
  totalTokens: number;
  outputTokens: number;
  contextTokens: number;
  contextWindow: number;
  turns: number;
}

export interface PullRequestInfo {
  number: number;
  url: string;
  title: string;
  state: "OPEN" | "MERGED" | "CLOSED";
  isDraft: boolean;
  checks: "SUCCESS" | "FAILURE" | "PENDING" | "NONE";
  reviewDecision?: string;
}

export interface Canvas {
  id: string;
  name: string;
}

export type ViewMode = "canvas" | "list";

// Persist small UI preferences per browser
function loadPref<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(`openui:${key}`);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export function savePref(key: string, value: unknown) {
  try {
    localStorage.setItem(`openui:${key}`, JSON.stringify(value));
  } catch {
    // Storage unavailable - preference just won't persist
  }
}

interface AppState {
  // Config
  launchCwd: string;
  setLaunchCwd: (cwd: string) => void;

  // Agents
  agents: Agent[];
  setAgents: (agents: Agent[]) => void;

  // Sessions / Nodes
  sessions: Map<string, AgentSession>;
  addSession: (nodeId: string, session: AgentSession) => void;
  updateSession: (nodeId: string, updates: Partial<AgentSession>) => void;
  removeSession: (nodeId: string) => void;

  // Canvas
  nodes: Node[];
  setNodes: (nodes: Node[]) => void;
  addNode: (node: Node) => void;
  updateNode: (nodeId: string, updates: Partial<Node>) => void;
  removeNode: (nodeId: string) => void;

  // UI State
  selectedNodeId: string | null;
  setSelectedNodeId: (id: string | null) => void;
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  addAgentModalOpen: boolean;
  setAddAgentModalOpen: (open: boolean) => void;
  newSessionModalOpen: boolean;
  setNewSessionModalOpen: (open: boolean) => void;
  newSessionForNodeId: string | null;
  setNewSessionForNodeId: (nodeId: string | null) => void;

  // Canvases
  canvases: Canvas[];
  setCanvases: (canvases: Canvas[]) => void;
  activeCanvasId: string;
  setActiveCanvasId: (id: string) => void;

  // Layout
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  panelWidth: number;
  setPanelWidth: (width: number) => void;
  panelMaximized: boolean;
  setPanelMaximized: (maximized: boolean) => void;
  searchOpen: boolean;
  setSearchOpen: (open: boolean) => void;
}

export const useStore = create<AppState>((set) => ({
  // Config
  launchCwd: "",
  setLaunchCwd: (cwd) => set({ launchCwd: cwd }),

  // Agents
  agents: [],
  setAgents: (agents) => set({ agents }),

  // Sessions
  sessions: new Map(),
  addSession: (nodeId, session) =>
    set((state) => {
      const newSessions = new Map(state.sessions);
      newSessions.set(nodeId, session);
      return { sessions: newSessions };
    }),
  updateSession: (nodeId, updates) =>
    set((state) => {
      const newSessions = new Map(state.sessions);
      const session = newSessions.get(nodeId);
      if (session) {
        newSessions.set(nodeId, { ...session, ...updates });
      }
      return { sessions: newSessions };
    }),
  removeSession: (nodeId) =>
    set((state) => {
      const newSessions = new Map(state.sessions);
      newSessions.delete(nodeId);
      return { sessions: newSessions };
    }),

  // Canvas
  nodes: [],
  setNodes: (nodes) => set({ nodes }),
  addNode: (node) => set((state) => ({ nodes: [...state.nodes, node] })),
  updateNode: (nodeId, updates) =>
    set((state) => ({
      nodes: state.nodes.map((n) =>
        n.id === nodeId ? { ...n, ...updates } : n
      ),
    })),
  removeNode: (nodeId) =>
    set((state) => ({
      nodes: state.nodes.filter((n) => n.id !== nodeId),
    })),

  // UI State
  selectedNodeId: null,
  setSelectedNodeId: (id) => set({ selectedNodeId: id }),
  sidebarOpen: false,
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  addAgentModalOpen: false,
  setAddAgentModalOpen: (open) => set({ addAgentModalOpen: open }),
  newSessionModalOpen: false,
  setNewSessionModalOpen: (open) => set({ newSessionModalOpen: open }),
  newSessionForNodeId: null,
  setNewSessionForNodeId: (nodeId) => set({ newSessionForNodeId: nodeId }),

  // Canvases
  canvases: [{ id: "main", name: "Main" }],
  setCanvases: (canvases) => set({ canvases }),
  activeCanvasId: loadPref("activeCanvasId", "main"),
  setActiveCanvasId: (id) => {
    savePref("activeCanvasId", id);
    set({ activeCanvasId: id });
  },

  // Layout
  viewMode: loadPref<ViewMode>("viewMode", "canvas"),
  setViewMode: (mode) => {
    savePref("viewMode", mode);
    set({ viewMode: mode });
  },
  panelWidth: loadPref("panelWidth", 640),
  setPanelWidth: (width) => {
    savePref("panelWidth", width);
    set({ panelWidth: width });
  },
  panelMaximized: false,
  setPanelMaximized: (maximized) => set({ panelMaximized: maximized }),
  searchOpen: false,
  setSearchOpen: (open) => set({ searchOpen: open }),
}));
