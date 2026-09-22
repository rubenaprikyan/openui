import {
  MessageSquare,
  WifiOff,
  GitBranch,
  Folder,
  Loader2,
  Coffee,
  AlertTriangle,
  Link2,
  Pin,
  Archive,
  Trash2,
  ExternalLink,
} from "lucide-react";
import { AgentSession, AgentStatus } from "../../stores/useStore";
import { statusConfig, formatModel, contextPercent, contextColor, agentActions } from "../../lib/agents";
import { PrBadges } from "../PrBadges";

// Tool name display mapping
const toolDisplayNames: Record<string, string> = {
  Read: "Reading",
  Write: "Writing",
  Edit: "Editing",
  Bash: "Running",
  Grep: "Searching",
  Glob: "Finding",
  Task: "Tasking",
  Agent: "Delegating",
  WebFetch: "Fetching",
  WebSearch: "Searching",
  TodoWrite: "Planning",
  AskUserQuestion: "Asking",
};

function StatusIcon({ status, color }: { status: AgentStatus; color: string }) {
  const cls = "w-3.5 h-3.5 flex-shrink-0";
  switch (status) {
    case "running":
    case "tool_calling":
      return <Loader2 className={`${cls} animate-spin`} style={{ color }} />;
    case "waiting_input":
      return <MessageSquare className={cls} style={{ color }} />;
    case "disconnected":
      return <WifiOff className={cls} style={{ color }} />;
    case "error":
      return <AlertTriangle className={cls} style={{ color }} />;
    default:
      return <Coffee className={cls} style={{ color }} />;
  }
}

interface AgentNodeCardProps {
  nodeId: string;
  session: AgentSession | undefined;
  selected: boolean;
  displayColor: string;
  displayName: string;
  Icon: any;
  agentId: string;
  status: AgentStatus;
  currentTool?: string;
  shortcutIndex?: number;
}

export function AgentNodeCard({
  nodeId,
  session,
  selected,
  displayColor,
  displayName,
  Icon,
  agentId,
  status,
  currentTool,
  shortcutIndex,
}: AgentNodeCardProps) {
  const statusInfo = statusConfig[status] || statusConfig.idle;
  const isActive = statusInfo.isActive;
  const needsAttention = statusInfo.needsAttention;

  // Extract directory name - use originalCwd (mother repo) if available, otherwise cwd
  const cwd = session?.cwd;
  const displayCwd = session?.originalCwd || cwd;
  const dirName = displayCwd ? displayCwd.split("/").pop() || displayCwd : null;
  const worktreeName = session?.originalCwd && cwd ? cwd.split("/").pop() : null;

  const toolDisplay = currentTool ? toolDisplayNames[currentTool] || currentTool : null;
  const model = formatModel(session?.metrics?.model);
  const percent = contextPercent(session);
  const prs = session?.prs || [];
  const turns = session?.metrics?.turns || 0;

  const stop = (fn: () => void) => (e: React.MouseEvent) => {
    e.stopPropagation();
    fn();
  };

  return (
    <div
      className={`group relative w-[260px] rounded-xl transition-all duration-300 cursor-pointer bg-[#151515] ${
        session?.archived ? "opacity-50" : ""
      }`}
      style={{
        border: selected
          ? "2px solid #FAFAFA"
          : needsAttention
          ? `2px solid ${statusInfo.color}`
          : isActive
          ? `1px solid ${statusInfo.color}55`
          : "1px solid #2a2a2a",
        boxShadow: needsAttention
          ? `0 0 16px ${statusInfo.color}40, 0 0 32px ${statusInfo.color}20, 0 4px 12px rgba(0, 0, 0, 0.4)`
          : selected
          ? "0 8px 32px rgba(0, 0, 0, 0.7)"
          : "0 4px 12px rgba(0, 0, 0, 0.4)",
      }}
    >
      {/* Pulsing border for attention states */}
      {needsAttention && !selected && (
        <div
          className="absolute inset-0 rounded-xl pointer-events-none"
          style={{ border: `2px solid ${statusInfo.color}`, animation: "attention-pulse 1.5s ease-in-out infinite" }}
        />
      )}

      {/* Status header */}
      <div
        className="px-3 h-9 flex items-center justify-between rounded-t-xl border-b border-[#232323]"
        style={{ backgroundColor: isActive || needsAttention ? statusInfo.bgColor : "transparent" }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <StatusIcon status={status} color={statusInfo.color} />
          <span className="text-xs font-medium" style={{ color: statusInfo.color }}>
            {statusInfo.label}
          </span>
          {isActive && toolDisplay && (
            <span className="text-[10px] text-zinc-500 truncate">{toolDisplay}</span>
          )}
          {turns > 0 && (
            <span className="flex items-center gap-0.5 text-[10px] text-zinc-500" title={`${turns} prompts`}>
              <MessageSquare className="w-2.5 h-2.5" />
              {turns}
            </span>
          )}
          {session?.pinned && <Pin className="w-3 h-3 text-zinc-400 fill-zinc-400" />}
        </div>

        {/* Hover actions */}
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={stop(() => agentActions.copyLink(nodeId))} title="Copy link" className="p-1 rounded text-zinc-500 hover:text-white hover:bg-white/10">
            <Link2 className="w-3.5 h-3.5" />
          </button>
          <button onClick={stop(() => agentActions.togglePin(nodeId))} title={session?.pinned ? "Unpin" : "Pin"} className="p-1 rounded text-zinc-500 hover:text-white hover:bg-white/10">
            <Pin className={`w-3.5 h-3.5 ${session?.pinned ? "fill-current" : ""}`} />
          </button>
          <button onClick={stop(() => agentActions.setArchived(nodeId, !session?.archived))} title={session?.archived ? "Unarchive" : "Archive"} className="p-1 rounded text-zinc-500 hover:text-white hover:bg-white/10">
            <Archive className="w-3.5 h-3.5" />
          </button>
          <button onClick={stop(() => agentActions.remove(nodeId))} title="Delete" className="p-1 rounded text-zinc-500 hover:text-red-400 hover:bg-white/10">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="p-3 pt-3 space-y-2.5">
        {/* Agent name and icon */}
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 flex items-center justify-center flex-shrink-0">
            <Icon className="w-6 h-6" style={{ color: displayColor }} />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold text-white truncate leading-tight">{displayName}</h3>
            <p className="text-[10px] text-zinc-500 truncate">
              {agentId}
              {model ? ` · ${model}` : ""}
            </p>
          </div>
        </div>

        {/* Ticket info */}
        {session?.ticketId && (
          <div className="px-2 py-1.5 rounded-md bg-indigo-500/10 border border-indigo-500/20">
            <span className="text-[10px] font-mono font-semibold text-indigo-400">{session.ticketId}</span>
            {session.ticketTitle && <p className="text-[10px] text-indigo-300/70 truncate mt-0.5">{session.ticketTitle}</p>}
          </div>
        )}

        {/* Repo & Branch */}
        {(dirName || session?.gitBranch) && (
          <div className="space-y-1">
            {dirName && (
              <div className="flex items-center gap-1.5" title={cwd}>
                <Folder className="w-3.5 h-3.5 text-zinc-500 flex-shrink-0" />
                <span className="text-[11px] text-zinc-400 font-mono truncate">
                  {worktreeName && worktreeName !== dirName ? worktreeName : dirName}
                </span>
              </div>
            )}
            {session?.gitBranch && (
              <div className="flex items-center gap-1.5" title={session.gitBranch}>
                <GitBranch className="w-3.5 h-3.5 text-purple-400 flex-shrink-0" />
                <span className="text-[11px] text-purple-400 font-mono truncate">{session.gitBranch}</span>
              </div>
            )}
          </div>
        )}

        {/* Context usage */}
        {percent !== null && (
          <div>
            <div className="flex items-center justify-between text-[10px] mb-1">
              <span className="text-zinc-500">Context</span>
              <span className="font-mono" style={{ color: percent >= 30 ? contextColor(percent) : "#a1a1aa" }}>
                {percent}%
              </span>
            </div>
            <div className="h-1 rounded-full bg-[#2a2a2a] overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${Math.max(percent, 2)}%`, backgroundColor: contextColor(percent) }}
              />
            </div>
          </div>
        )}

        {/* Pull requests */}
        {prs.length > 0 && (
          <div className="flex items-center gap-1.5">
            <ExternalLink className="w-3 h-3 text-zinc-600 flex-shrink-0" />
            <PrBadges prs={prs} />
          </div>
        )}
      </div>

      {/* Keyboard shortcut hint */}
      {shortcutIndex !== undefined && shortcutIndex < 9 && (
        <div
          className={`absolute -bottom-2.5 right-3 px-1.5 py-0.5 rounded border border-[#3a3a3a] bg-[#222] text-[10px] font-mono text-zinc-300 transition-opacity ${
            selected ? "opacity-100" : "opacity-0 group-hover:opacity-100"
          }`}
        >
          ⌥{shortcutIndex + 1}
        </div>
      )}

      <style>{`
        @keyframes attention-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  );
}
