import { useEffect, useCallback, useRef, useMemo } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  useNodesState,
  BackgroundVariant,
  ReactFlowProvider,
  NodeChange,
  applyNodeChanges,
  useReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Plus } from "lucide-react";

import { useStore, AgentSession } from "./stores/useStore";
import { AgentNode } from "./components/AgentNode/index";
import { CategoryNode } from "./components/CategoryNode";
import { AgentPanel } from "./components/AgentPanel";
import { NewSessionModal } from "./components/NewSessionModal";
import { Header } from "./components/Header";
import { CanvasControls } from "./components/CanvasControls";
import { CanvasTabs } from "./components/CanvasTabs";
import { ListView } from "./components/ListView";
import { SearchPalette } from "./components/SearchPalette";
import { agentActions, orderedAgents } from "./lib/agents";

const nodeTypes = {
  agent: AgentNode,
  category: CategoryNode,
};

const MIN_PANEL_WIDTH = 380;
const MIN_MAIN_WIDTH = 320;

// Fields the server owns and the poll keeps fresh. Pinned/archived/canvas are
// changed optimistically on the client, so the poll doesn't overwrite them.
const POLLED_FIELDS = ["status", "metrics", "prs", "lastActivityAt", "gitBranch", "shells", "currentTool"] as const;

function isInsideTerminal(target: EventTarget | null) {
  return target instanceof HTMLElement && !!target.closest(".xterm");
}

function PanelResizer() {
  const setPanelWidth = useStore((state) => state.setPanelWidth);

  const onMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    const onMove = (ev: MouseEvent) => {
      const width = window.innerWidth - ev.clientX;
      setPanelWidth(Math.max(MIN_PANEL_WIDTH, Math.min(width, window.innerWidth - MIN_MAIN_WIDTH)));
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  return (
    <div
      onMouseDown={onMouseDown}
      onDoubleClick={() => setPanelWidth(640)}
      className="group relative w-1 flex-shrink-0 cursor-col-resize bg-border hover:bg-zinc-500 transition-colors"
      title="Drag to resize · double-click to reset"
    >
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-10 rounded-full bg-[#2a2a2a] border border-[#3a3a3a] flex flex-col items-center justify-center gap-0.5 group-hover:bg-zinc-600">
        {[0, 1, 2].map((i) => (
          <div key={i} className="w-0.5 h-0.5 rounded-full bg-zinc-400" />
        ))}
      </div>
    </div>
  );
}

function AppContent() {
  const {
    nodes: storeNodes,
    setNodes: setStoreNodes,
    setAgents,
    setLaunchCwd,
    setSelectedNodeId,
    addSession,
    updateSession,
    agents,
    addAgentModalOpen,
    setAddAgentModalOpen,
    newSessionModalOpen,
    setNewSessionModalOpen,
    newSessionForNodeId,
    setNewSessionForNodeId,
    sessions,
    sidebarOpen,
    setSidebarOpen,
    selectedNodeId,
    activeCanvasId,
    setActiveCanvasId,
    setCanvases,
    viewMode,
    panelWidth,
    panelMaximized,
    setPanelMaximized,
    setSearchOpen,
  } = useStore();

  const [nodes, setNodes, onNodesChange] = useNodesState(storeNodes);
  const positionUpdateTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasRestoredRef = useRef(false);
  const reactFlow = useReactFlow();

  // Sync nodes with store
  useEffect(() => {
    setStoreNodes(nodes);
  }, [nodes, setStoreNodes]);

  useEffect(() => {
    if (storeNodes.length > 0 || hasRestoredRef.current) {
      setNodes(storeNodes);
    }
  }, [storeNodes, setNodes]);

  // Fetch config, agents and canvases on mount
  useEffect(() => {
    fetch("/api/config")
      .then((res) => res.json())
      .then((config) => setLaunchCwd(config.launchCwd))
      .catch(console.error);

    fetch("/api/agents")
      .then((res) => res.json())
      .then((agents) => setAgents(agents))
      .catch(console.error);

    fetch("/api/canvases")
      .then((res) => res.json())
      .then((canvases) => {
        setCanvases(canvases);
        const active = useStore.getState().activeCanvasId;
        if (!canvases.some((c: { id: string }) => c.id === active)) setActiveCanvasId(canvases[0]?.id || "main");
      })
      .catch(console.error);
  }, [setAgents, setLaunchCwd, setCanvases, setActiveCanvasId]);

  // Poll for status + metrics every second to catch any missed WebSocket messages
  useEffect(() => {
    const pollStatus = async () => {
      try {
        const res = await fetch("/api/sessions");
        if (!res.ok) return;
        const sessionsData = await res.json();
        const currentSessions = useStore.getState().sessions;
        for (const data of sessionsData) {
          const existing = data.nodeId && currentSessions.get(data.nodeId);
          if (!existing || existing.sessionId !== data.sessionId) continue;
          const updates: Partial<AgentSession> = {};
          for (const field of POLLED_FIELDS) {
            if (JSON.stringify(existing[field]) !== JSON.stringify(data[field])) {
              (updates as any)[field] = data[field];
            }
          }
          if (Object.keys(updates).length > 0) updateSession(data.nodeId, updates);
        }
      } catch {
        // Ignore errors
      }
    };

    pollStatus();
    const interval = setInterval(pollStatus, 1000);
    return () => clearInterval(interval);
  }, [updateSession]);

  // Restore sessions and categories after agents are loaded
  useEffect(() => {
    if (agents.length === 0 || hasRestoredRef.current) return;

    Promise.all([
      fetch("/api/sessions").then((res) => res.json()),
      fetch("/api/state").then((res) => res.json()),
      fetch("/api/categories").then((res) => res.json()),
    ])
      .then(([sessions, { nodes: savedNodes }, categories]) => {
        const restoredNodes: any[] = [];

        // Restore categories first (they should be behind agents)
        categories.forEach((cat: any) => {
          restoredNodes.push({
            id: cat.id,
            type: "category",
            position: cat.position,
            style: { width: cat.width, height: cat.height },
            data: {
              label: cat.label,
              color: cat.color,
              canvasId: cat.canvasId || "main",
            },
            zIndex: -1, // Behind agent nodes
          });
        });

        // Restore agent sessions
        sessions.forEach((session: any, index: number) => {
          const saved = savedNodes?.find((n: any) => n.sessionId === session.sessionId);
          const agent = agents.find((a) => a.id === session.agentId);
          const position = saved?.position?.x
            ? saved.position
            : {
                x: 100 + (index % 5) * 280,
                y: 100 + Math.floor(index / 5) * 260,
              };

          addSession(session.nodeId, {
            id: session.nodeId,
            sessionId: session.sessionId,
            agentId: session.agentId,
            agentName: session.agentName,
            command: session.command,
            color: session.customColor || agent?.color || "#888",
            createdAt: session.createdAt,
            cwd: session.cwd,
            originalCwd: session.originalCwd,
            gitBranch: session.gitBranch,
            status: session.status || "idle",
            customName: session.customName,
            customColor: session.customColor,
            notes: session.notes,
            isRestored: session.isRestored,
            ticketId: session.ticketId,
            ticketTitle: session.ticketTitle,
            ticketUrl: session.ticketUrl,
            canvasId: session.canvasId || "main",
            pinned: session.pinned,
            archived: session.archived,
            metrics: session.metrics,
            prs: session.prs,
            lastActivityAt: session.lastActivityAt,
            shells: session.shells,
          });

          restoredNodes.push({
            id: session.nodeId,
            type: "agent",
            position,
            data: {
              label: session.customName || session.agentName,
              agentId: session.agentId,
              color: session.customColor || agent?.color || "#888",
              icon: session.icon || agent?.icon || "cpu",
              sessionId: session.sessionId,
            },
          });
        });

        hasRestoredRef.current = true;
        setNodes(restoredNodes);
        setStoreNodes(restoredNodes);

        // Deep link: ?agent=<nodeId>
        const linked = new URLSearchParams(window.location.search).get("agent");
        if (linked && useStore.getState().sessions.has(linked)) {
          agentActions.open(linked);
          window.history.replaceState(null, "", window.location.pathname);
        }
      })
      .catch(console.error);
  }, [agents, addSession, setNodes, setStoreNodes]);

  // Only show nodes that belong to the active canvas (and aren't archived)
  const visibilityKey = Array.from(sessions.values())
    .map((s) => `${s.id}:${s.canvasId || "main"}:${s.archived ? 1 : 0}`)
    .join("|");
  const displayNodes = useMemo(() => {
    return nodes.map((n) => {
      let visible: boolean;
      if (n.type === "category") {
        visible = ((n.data as any).canvasId || "main") === activeCanvasId;
      } else {
        const s = sessions.get(n.id);
        visible = !!s && !s.archived && (s.canvasId || "main") === activeCanvasId;
      }
      return n.hidden === !visible ? n : { ...n, hidden: !visible };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, visibilityKey, activeCanvasId]);

  // Fit the viewport to the canvas contents when switching canvases
  useEffect(() => {
    if (viewMode !== "canvas") return;
    const t = setTimeout(() => reactFlow.fitView({ padding: 0.2, maxZoom: 1, duration: 200 }), 50);
    return () => clearTimeout(t);
  }, [activeCanvasId, viewMode, reactFlow]);

  // Helper to save all positions - accepts nodes directly to avoid sync issues
  const saveAllPositions = useCallback((nodesToSave?: typeof nodes) => {
    const currentNodes = nodesToSave || useStore.getState().nodes;
    if (currentNodes.length === 0) return;

    const positions: Record<string, { x: number; y: number }> = {};
    const GRID_SIZE = 24;
    currentNodes.forEach((node) => {
      // Only save agent positions to state/positions
      if (node.type === "agent") {
        positions[node.id] = {
          x: Math.round(node.position.x / GRID_SIZE) * GRID_SIZE,
          y: Math.round(node.position.y / GRID_SIZE) * GRID_SIZE,
        };
      }
      // Save category positions/sizes separately
      if (node.type === "category") {
        const width = node.measured?.width || node.width || (typeof node.style?.width === "number" ? node.style.width : parseInt(node.style?.width as string) || 250);
        const height = node.measured?.height || node.height || (typeof node.style?.height === "number" ? node.style.height : parseInt(node.style?.height as string) || 200);

        fetch(`/api/categories/${node.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            position: {
              x: Math.round(node.position.x / GRID_SIZE) * GRID_SIZE,
              y: Math.round(node.position.y / GRID_SIZE) * GRID_SIZE,
            },
            width,
            height,
          }),
        }).catch(console.error);
      }
    });
    if (Object.keys(positions).length > 0) {
      fetch("/api/state/positions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ positions }),
      }).catch(console.error);
    }
  }, []);

  // Save positions on window close/refresh
  useEffect(() => {
    const handleBeforeUnload = () => saveAllPositions();
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [saveAllPositions]);

  // Save positions when nodes are moved or resized
  const handleNodesChange = useCallback(
    (changes: NodeChange[]) => {
      onNodesChange(changes);

      const positionChanges = changes.filter((c) => c.type === "position" && "dragging" in c && c.dragging === false);
      // Check for dimension changes - resizing property might be true, false, or undefined
      const dimensionChanges = changes.filter((c) => c.type === "dimensions" && (!("resizing" in c) || c.resizing === false));

      if (positionChanges.length > 0 || dimensionChanges.length > 0) {
        if (positionUpdateTimeout.current) {
          clearTimeout(positionUpdateTimeout.current);
        }
        // Compute updated nodes immediately to avoid sync delay issues
        const updatedNodes = applyNodeChanges(changes, nodes);
        positionUpdateTimeout.current = setTimeout(() => {
          saveAllPositions(updatedNodes);
        }, 300);
      }
    },
    [onNodesChange, saveAllPositions, nodes]
  );

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: any) => {
      // Only open the panel for agent nodes
      if (node.type === "agent") agentActions.open(node.id);
    },
    []
  );

  // Global keyboard shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const inTerminal = isInsideTerminal(e.target);

      // ⌘K (or Ctrl+K outside the terminal, where it's a readline binding)
      if (e.key.toLowerCase() === "k" && (e.metaKey || (e.ctrlKey && !inTerminal))) {
        e.preventDefault();
        e.stopPropagation();
        setSearchOpen(!useStore.getState().searchOpen);
        return;
      }

      // ⌥1-9 jumps to the Nth agent on the current canvas
      if (e.altKey && !e.metaKey && !e.ctrlKey && /^Digit[1-9]$/.test(e.code)) {
        const state = useStore.getState();
        const target = orderedAgents(state.sessions, state.activeCanvasId)[Number(e.code.slice(5)) - 1];
        if (target) {
          e.preventDefault();
          e.stopPropagation();
          agentActions.open(target.id);
        }
        return;
      }

      // Esc closes the panel - but never steal it from the terminal (it interrupts agents)
      if (e.key === "Escape" && !inTerminal) {
        const state = useStore.getState();
        if (state.searchOpen || state.addAgentModalOpen || state.newSessionModalOpen) return;
        if (state.sidebarOpen) {
          setSidebarOpen(false);
          setSelectedNodeId(null);
          setPanelMaximized(false);
        }
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [setSearchOpen, setSidebarOpen, setSelectedNodeId, setPanelMaximized]);

  const hasVisibleNodes = displayNodes.some((n) => !n.hidden);
  const panelOpen = sidebarOpen && !!selectedNodeId;

  return (
    <div className="w-screen h-screen bg-canvas overflow-hidden flex flex-col">
      <Header />

      <div className="flex-1 flex min-h-0">
        {/* Main area: canvas or list */}
        {!(panelOpen && panelMaximized) && (
          <div className="flex-1 flex flex-col min-w-0">
            <CanvasTabs />
            <div className="flex-1 relative min-h-0">
              {viewMode === "canvas" ? (
                <>
                  <ReactFlow
                    nodes={displayNodes}
                    edges={[]}
                    onNodesChange={handleNodesChange}
                    onNodeClick={onNodeClick}
                    nodeTypes={nodeTypes}
                    fitView
                    fitViewOptions={{ padding: 0.2, maxZoom: 1 }}
                    proOptions={{ hideAttribution: true }}
                    minZoom={0.3}
                    maxZoom={2}
                    nodesDraggable
                    nodesConnectable={false}
                    snapToGrid
                    snapGrid={[24, 24]}
                  >
                    <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="#252525" />
                    <Controls showInteractive={false} position="bottom-left" />
                    <CanvasControls />
                  </ReactFlow>

                  {/* Empty state */}
                  {!hasVisibleNodes && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <div className="text-center pointer-events-auto">
                        <div className="w-16 h-16 rounded-2xl bg-surface border border-border flex items-center justify-center mx-auto mb-4">
                          <Plus className="w-8 h-8 text-zinc-600" />
                        </div>
                        <h2 className="text-lg font-medium text-zinc-300 mb-2">No agents on this canvas</h2>
                        <p className="text-sm text-zinc-500 mb-4 max-w-xs">Spawn an AI agent to get started</p>
                        <button
                          onClick={() => setAddAgentModalOpen(true)}
                          className="px-4 py-2 rounded-lg bg-white text-canvas font-medium text-sm hover:bg-zinc-100 transition-colors"
                        >
                          Create Agent
                        </button>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <ListView />
              )}
            </div>
          </div>
        )}

        {/* Docked agent panel */}
        {panelOpen && (
          <>
            {!panelMaximized && <PanelResizer />}
            <div
              className="flex-shrink-0 min-w-0 h-full"
              style={{
                width: panelMaximized ? "100%" : Math.min(panelWidth, Math.max(MIN_PANEL_WIDTH, window.innerWidth - MIN_MAIN_WIDTH)),
              }}
            >
              <AgentPanel />
            </div>
          </>
        )}
      </div>

      <SearchPalette />

      <NewSessionModal
        open={addAgentModalOpen || newSessionModalOpen}
        onClose={() => {
          setAddAgentModalOpen(false);
          setNewSessionModalOpen(false);
          setNewSessionForNodeId(null);
        }}
        existingSession={newSessionForNodeId ? sessions.get(newSessionForNodeId) : undefined}
        existingNodeId={newSessionForNodeId || undefined}
      />
    </div>
  );
}

function App() {
  return (
    <ReactFlowProvider>
      <AppContent />
    </ReactFlowProvider>
  );
}

export default App;
