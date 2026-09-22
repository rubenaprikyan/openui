import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  Terminal as TerminalIcon,
  Clock,
  Folder,
  Pencil,
  RotateCcw,
  Play,
  Sparkles,
  Code,
  Cpu,
  Zap,
  Rocket,
  Bot,
  Brain,
  Wand2,
  GitBranch,
  Plus,
  Maximize2,
  Minimize2,
  ChevronRight,
  Pin,
  Link2,
  Gauge,
  Ticket,
} from "lucide-react";
import { useStore } from "../stores/useStore";
import {
  statusConfig,
  formatTokens,
  formatModel,
  formatRelative,
  contextPercent,
  contextColor,
  shortPath,
  agentActions,
  displayName,
} from "../lib/agents";
import { prVisual, checksVisual } from "./PrBadges";
import { iconMap } from "./AgentNode/index";
import { Terminal } from "./Terminal";

const presetColors = ["#F97316", "#22C55E", "#3B82F6", "#8B5CF6", "#EC4899", "#EF4444", "#FBBF24", "#14B8A6"];

const iconOptions = [
  { id: "sparkles", icon: Sparkles },
  { id: "code", icon: Code },
  { id: "cpu", icon: Cpu },
  { id: "zap", icon: Zap },
  { id: "rocket", icon: Rocket },
  { id: "bot", icon: Bot },
  { id: "brain", icon: Brain },
  { id: "wand2", icon: Wand2 },
];

function patch(sessionId: string, body: Record<string, unknown>) {
  fetch(`/api/sessions/${sessionId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).catch(console.error);
}

export function AgentPanel() {
  const {
    selectedNodeId,
    setSelectedNodeId,
    setSidebarOpen,
    updateSession,
    updateNode,
    setNewSessionModalOpen,
    setNewSessionForNodeId,
    panelMaximized,
    setPanelMaximized,
  } = useStore();
  const session = useStore((state) => (selectedNodeId ? state.sessions.get(selectedNodeId) : undefined));
  const node = useStore((state) => (selectedNodeId ? state.nodes.find((n) => n.id === selectedNodeId) : undefined));

  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editColor, setEditColor] = useState("");
  const [editIcon, setEditIcon] = useState("");
  const [terminalKey, setTerminalKey] = useState(0);
  const [activeTab, setActiveTab] = useState<string>("agent");
  const [detailsOpen, setDetailsOpen] = useState(() => {
    try {
      return localStorage.getItem("openui:detailsOpen") === "true";
    } catch {
      return false;
    }
  });

  // Reset edit state when session changes (but NOT when nodes change)
  useEffect(() => {
    if (session) {
      setEditName(session.customName || session.agentName);
      setEditNotes(session.notes || "");
      setEditColor(session.customColor || session.color);
      const nodeIcon = node?.data?.icon;
      setEditIcon(typeof nodeIcon === "string" ? nodeIcon : "cpu");
    }
    setIsEditing(false);
    setActiveTab("agent");
    // The terminal is keyed by sessionId, so it's recreated without a key bump;
    // bumping here would mount+dispose it in the same tick, which xterm can't handle
  }, [session?.sessionId]);

  const shells = session?.shells || [];
  useEffect(() => {
    if (activeTab !== "agent" && !shells.includes(activeTab)) setActiveTab("agent");
  }, [shells.join(","), activeTab]);

  if (!session || !selectedNodeId) return null;

  const handleClose = () => {
    setSidebarOpen(false);
    setSelectedNodeId(null);
    setIsEditing(false);
    setPanelMaximized(false);
  };

  const handleNewSession = () => {
    setNewSessionForNodeId(selectedNodeId);
    setNewSessionModalOpen(true);
  };

  const handleRestart = async () => {
    const res = await fetch(`/api/sessions/${session.sessionId}/restart`, { method: "POST" });
    if (res.ok) {
      updateSession(selectedNodeId, { status: "running", isRestored: false });
      setTerminalKey((k) => k + 1);
    }
  };

  const addShell = async () => {
    const res = await fetch(`/api/sessions/${session.sessionId}/shells`, { method: "POST" });
    if (!res.ok) return;
    const { shellId } = await res.json();
    updateSession(selectedNodeId, { shells: [...shells, shellId] });
    setActiveTab(shellId);
  };

  const closeShell = (shellId: string) => {
    fetch(`/api/shells/${shellId}`, { method: "DELETE" }).catch(console.error);
    updateSession(selectedNodeId, { shells: shells.filter((s) => s !== shellId) });
    if (activeTab === shellId) setActiveTab("agent");
  };

  const toggleDetails = () => {
    setDetailsOpen(!detailsOpen);
    try {
      localStorage.setItem("openui:detailsOpen", String(!detailsOpen));
    } catch {
      // ignore
    }
  };

  const displayColor = editColor || session.customColor || session.color || "#888";
  const statusInfo = statusConfig[session.status] || statusConfig.idle;
  const isDisconnected = session.status === "disconnected";
  const Icon = iconMap[editIcon] || Cpu;
  const percent = contextPercent(session);
  const model = formatModel(session.metrics?.model);
  const prs = session.prs || [];

  const toolbarButton = (title: string, IconCmp: any, onClick: () => void, active = false) => (
    <button
      onClick={onClick}
      title={title}
      className={`w-7 h-7 rounded flex items-center justify-center transition-colors ${
        active ? "text-white bg-surface-active" : "text-zinc-500 hover:text-white hover:bg-surface-active"
      }`}
    >
      <IconCmp className="w-4 h-4" />
    </button>
  );

  return (
    <div className="h-full flex flex-col bg-canvas-dark min-w-0">
      {/* Header with tabs */}
      <div className="flex-shrink-0 h-11 px-3 border-b border-border flex items-center gap-2">
        <Icon className="w-4 h-4 flex-shrink-0" style={{ color: displayColor }} />
        <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: statusInfo.color }} title={statusInfo.label} />
        <h2 className="text-sm font-medium text-white truncate max-w-[200px]">{displayName(session)}</h2>

        <div className="flex items-center gap-0.5 ml-1 min-w-0 overflow-x-auto">
          <button
            onClick={() => setActiveTab("agent")}
            className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs flex-shrink-0 ${
              activeTab === "agent" ? "bg-surface-active text-white" : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            <TerminalIcon className="w-3 h-3" />
            Agent
          </button>
          {shells.map((shellId, i) => (
            <div
              key={shellId}
              className={`group flex items-center gap-1 pl-2 pr-1 py-1 rounded text-xs cursor-pointer flex-shrink-0 ${
                activeTab === shellId ? "bg-surface-active text-white" : "text-zinc-500 hover:text-zinc-300"
              }`}
              onClick={() => setActiveTab(shellId)}
            >
              <TerminalIcon className="w-3 h-3" />
              Shell {i + 1}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  closeShell(shellId);
                }}
                className="p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-white/10"
              >
                <X className="w-2.5 h-2.5" />
              </button>
            </div>
          ))}
          <button
            onClick={addShell}
            disabled={isDisconnected}
            title="New shell in this agent's directory"
            className="p-1 rounded text-zinc-600 hover:text-zinc-300 disabled:opacity-30 flex-shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="flex items-center gap-0.5 ml-auto flex-shrink-0">
          {toolbarButton("Copy link", Link2, () => agentActions.copyLink(selectedNodeId))}
          {toolbarButton(session.pinned ? "Unpin" : "Pin", Pin, () => agentActions.togglePin(selectedNodeId), !!session.pinned)}
          {toolbarButton("Restart with new session", RotateCcw, handleNewSession)}
          {toolbarButton("Edit", Pencil, () => setIsEditing(!isEditing), isEditing)}
          {toolbarButton(panelMaximized ? "Restore" : "Maximize", panelMaximized ? Minimize2 : Maximize2, () =>
            setPanelMaximized(!panelMaximized)
          )}
          {toolbarButton("Close (Esc)", ChevronRight, handleClose)}
        </div>
      </div>

      {/* Disconnected banner */}
      {isDisconnected && (
        <div className="flex-shrink-0 px-4 py-3 bg-red-500/10 border-b border-red-500/20 flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-sm text-red-400 font-medium">Session Disconnected</p>
            <p className="text-xs text-red-400/70 mt-0.5">The agent process is not running.</p>
          </div>
          <button
            onClick={handleRestart}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-surface-active text-zinc-200 text-xs font-medium hover:bg-zinc-700"
          >
            <Play className="w-3 h-3" />
            Resume
          </button>
          <button
            onClick={handleNewSession}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-red-500 text-white text-xs font-medium hover:bg-red-600"
          >
            <RotateCcw className="w-3 h-3" />
            New Session
          </button>
        </div>
      )}

      {/* Edit Panel */}
      <AnimatePresence>
        {isEditing && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="flex-shrink-0 overflow-hidden border-b border-border"
          >
            <div className="p-4 grid grid-cols-2 gap-4">
              <div>
                <label className="text-[10px] text-zinc-500 uppercase tracking-wider">Name</label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => {
                    const newName = e.target.value;
                    setEditName(newName);
                    const customName = newName !== session.agentName ? newName : undefined;
                    updateSession(selectedNodeId, { customName });
                    if (node) updateNode(selectedNodeId, { data: { ...node.data, label: newName } });
                    patch(session.sessionId, { customName });
                  }}
                  className="mt-1 w-full px-3 py-2 rounded-md bg-canvas border border-border text-white text-sm focus:outline-none focus:border-zinc-500"
                />
              </div>
              <div>
                <label className="text-[10px] text-zinc-500 uppercase tracking-wider">Notes</label>
                <input
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  onBlur={() => {
                    patch(session.sessionId, { notes: editNotes || "" });
                    updateSession(selectedNodeId, { notes: editNotes || undefined });
                  }}
                  placeholder="Add notes..."
                  className="mt-1 w-full px-3 py-2 rounded-md bg-canvas border border-border text-white text-sm placeholder-zinc-600 focus:outline-none focus:border-zinc-500"
                />
              </div>
              <div>
                <label className="text-[10px] text-zinc-500 uppercase tracking-wider">Color</label>
                <div className="mt-2 flex flex-wrap gap-2">
                  {presetColors.map((color) => (
                    <button
                      key={color}
                      onClick={() => {
                        setEditColor(color);
                        updateSession(selectedNodeId, { customColor: color });
                        if (node) updateNode(selectedNodeId, { data: { ...node.data, color } });
                        patch(session.sessionId, { customColor: color });
                      }}
                      className={`w-6 h-6 rounded-md transition-all ${
                        editColor === color ? "ring-2 ring-white ring-offset-2 ring-offset-canvas-dark scale-110" : "hover:scale-110"
                      }`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </div>
              <div>
                <label className="text-[10px] text-zinc-500 uppercase tracking-wider">Icon</label>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {iconOptions.map(({ id, icon: IconComponent }) => (
                    <button
                      key={id}
                      onClick={() => {
                        setEditIcon(id);
                        if (node) updateNode(selectedNodeId, { data: { ...node.data, icon: id } });
                        patch(session.sessionId, { icon: id });
                      }}
                      className={`w-7 h-7 rounded-md flex items-center justify-center border ${
                        editIcon === id ? "bg-white/10 border-zinc-400" : "bg-canvas border-border hover:bg-white/5"
                      }`}
                    >
                      <IconComponent className="w-3.5 h-3.5" style={{ color: editIcon === id ? editColor : "#888" }} />
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Terminal */}
      <div className="flex-1 min-h-0 bg-[#0d0d0d]">
        {activeTab === "agent" ? (
          <Terminal
            key={`${session.sessionId}-${terminalKey}`}
            sessionId={session.sessionId}
            color={displayColor}
            nodeId={selectedNodeId}
          />
        ) : (
          <Terminal key={activeTab} sessionId={activeTab} color="#a1a1aa" nodeId={selectedNodeId} trackStatus={false} />
        )}
      </div>

      {/* Details */}
      <div className="flex-shrink-0 border-t border-border">
        <button
          onClick={toggleDetails}
          className="w-full flex items-center gap-2 px-4 py-2 text-xs text-zinc-500 hover:text-zinc-300"
        >
          <ChevronRight className={`w-3 h-3 transition-transform ${detailsOpen ? "rotate-90" : ""}`} />
          Details
          {!detailsOpen && (
            <span className="ml-auto flex items-center gap-3 font-mono text-[11px] text-zinc-600">
              {model && <span>{model}</span>}
              {session.metrics && <span>{formatTokens(session.metrics.totalTokens)} tokens</span>}
              {percent !== null && <span style={{ color: contextColor(percent) }}>{percent}% ctx</span>}
            </span>
          )}
        </button>
        {detailsOpen && (
          <div className="px-4 pb-4 grid grid-cols-2 gap-x-6 gap-y-2 text-xs max-h-[40vh] overflow-y-auto">
            {session.notes && <p className="col-span-2 text-zinc-400 italic pb-2 border-b border-border">{session.notes}</p>}
            <DetailRow icon={Cpu} label="Model" value={model || "–"} />
            <DetailRow
              icon={Zap}
              label="Tokens"
              value={session.metrics ? `${formatTokens(session.metrics.totalTokens)} (${formatTokens(session.metrics.outputTokens)} out)` : "–"}
            />
            <DetailRow
              icon={Gauge}
              label="Context"
              value={
                session.metrics && percent !== null
                  ? `${formatTokens(session.metrics.contextTokens)} / ${formatTokens(session.metrics.contextWindow)} · ${percent}%`
                  : "–"
              }
              color={percent !== null ? contextColor(percent) : undefined}
            />
            <DetailRow icon={Clock} label="Started" value={`${new Date(session.createdAt).toLocaleString()} (${formatRelative(session.createdAt)})`} />
            <DetailRow icon={Clock} label="Last active" value={formatRelative(session.lastActivityAt)} />
            <DetailRow icon={Folder} label="Directory" value={shortPath(session.cwd)} title={session.cwd} />
            {session.gitBranch && <DetailRow icon={GitBranch} label="Branch" value={session.gitBranch} color="#C084FC" />}
            {session.ticketId && (
              <DetailRow icon={Ticket} label="Ticket" value={`${session.ticketId}${session.ticketTitle ? ` · ${session.ticketTitle}` : ""}`} />
            )}
            {prs.length > 0 && (
              <div className="col-span-2 mt-1 space-y-1.5">
                <div className="text-[10px] uppercase tracking-wider text-zinc-500">Pull requests</div>
                {prs.map((pr) => {
                  const { Icon: PrIcon, color, label } = prVisual(pr);
                  const checks = pr.state === "OPEN" ? checksVisual(pr.checks) : null;
                  return (
                    <a
                      key={pr.number}
                      href={pr.url}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-surface hover:bg-surface-active"
                    >
                      <PrIcon className="w-3.5 h-3.5 flex-shrink-0" style={{ color }} />
                      <span className="font-mono" style={{ color }}>#{pr.number}</span>
                      <span className="text-zinc-300 truncate flex-1">{pr.title}</span>
                      <span className="text-[10px] text-zinc-500">{label}</span>
                      {pr.reviewDecision && (
                        <span className="text-[10px] text-zinc-500">{pr.reviewDecision.replace(/_/g, " ").toLowerCase()}</span>
                      )}
                      {checks && <checks.Icon className="w-3.5 h-3.5 flex-shrink-0" style={{ color: checks.color }} />}
                    </a>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function DetailRow({ icon: Icon, label, value, color, title }: { icon: any; label: string; value: string; color?: string; title?: string }) {
  return (
    <div className="flex items-center gap-2 min-w-0">
      <Icon className="w-3 h-3 text-zinc-600 flex-shrink-0" />
      <span className="text-zinc-500 flex-shrink-0">{label}</span>
      <span className="font-mono ml-auto truncate text-right" style={{ color: color || "#a1a1aa" }} title={title || value}>
        {value}
      </span>
    </div>
  );
}
