import { useState, useEffect, useRef, useMemo, ReactNode } from "react";
import {
  Plus,
  Rows3,
  ArrowUpDown,
  Columns3,
  Filter,
  ChevronUp,
  ChevronDown,
  GitBranch,
  Folder,
  Zap,
  Clock,
  Pin,
  Archive,
  Trash2,
  Check,
  Cpu,
  FolderInput,
} from "lucide-react";
import { Node } from "@xyflow/react";
import { useStore, AgentSession, savePref } from "../stores/useStore";
import {
  statusConfig,
  formatTokens,
  formatModel,
  formatRelative,
  contextPercent,
  contextColor,
  shortPath,
  displayName,
  agentActions,
} from "../lib/agents";
import { PrBadges, prVisual } from "./PrBadges";
import { iconMap } from "./AgentNode/index";

type ColumnId = "branch" | "prs" | "cwd" | "tokens" | "status" | "lastActive" | "started";
type SortKey = "name" | "status" | "tokens" | "context" | "lastActive" | "started";
type GroupKey = "none" | "status" | "category" | "directory";
type FilterKey = "all" | "active" | "attention" | "idle" | "pinned" | "archived";

const COLUMNS: { id: ColumnId; label: string; sort?: SortKey; className: string }[] = [
  { id: "branch", label: "Branch", className: "w-[150px]" },
  { id: "prs", label: "PRs", className: "w-[110px]" },
  { id: "cwd", label: "CWD", className: "w-[150px]" },
  { id: "tokens", label: "Tokens", sort: "tokens", className: "w-[100px]" },
  { id: "status", label: "Status", sort: "status", className: "w-[100px]" },
  { id: "lastActive", label: "Last active", sort: "lastActive", className: "w-[90px]" },
  { id: "started", label: "Started", sort: "started", className: "w-[80px]" },
];

const SORT_LABELS: Record<SortKey, string> = {
  name: "Name",
  status: "Status",
  tokens: "Tokens",
  context: "Context",
  lastActive: "Last active",
  started: "Started",
};

const GROUP_LABELS: Record<GroupKey, string> = {
  none: "No grouping",
  status: "Status",
  category: "Category",
  directory: "Directory",
};

const FILTER_LABELS: Record<FilterKey, string> = {
  all: "All agents",
  active: "Working",
  attention: "Needs attention",
  idle: "Idle",
  pinned: "Pinned",
  archived: "Archived",
};

const STATUS_ORDER: Record<string, number> = {
  waiting_input: 0,
  error: 1,
  running: 2,
  tool_calling: 2,
  idle: 3,
  disconnected: 4,
};

function loadPref<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(`openui:list:${key}`);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function usePref<T>(key: string, fallback: T) {
  const [value, setValue] = useState<T>(() => loadPref(key, fallback));
  const set = (v: T) => {
    setValue(v);
    savePref(`list:${key}`, v);
  };
  return [value, set] as const;
}

function useNow(interval = 30_000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), interval);
    return () => clearInterval(id);
  }, [interval]);
  return now;
}

function Dropdown({ label, icon: Icon, children, active }: { label: string; icon: any; children: (close: () => void) => ReactNode; active?: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as HTMLElement)) setOpen(false);
    };
    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-sm transition-colors ${
          active ? "border-zinc-500 text-white bg-surface-active" : "border-border text-zinc-400 hover:text-white hover:bg-surface"
        }`}
      >
        <Icon className="w-3.5 h-3.5" />
        {label}
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-30 min-w-[180px] rounded-lg border border-border bg-[#1c1c1c] shadow-xl py-1">
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

function MenuItem({ selected, onClick, children }: { selected?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button onClick={onClick} className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs text-zinc-300 hover:bg-white/5">
      <Check className={`w-3 h-3 ${selected ? "opacity-100" : "opacity-0"}`} />
      {children}
    </button>
  );
}

// Which category rectangle (if any) contains an agent node on the canvas
function categoryFor(agentNode: Node | undefined, categories: Node[]): string | null {
  if (!agentNode) return null;
  const { x, y } = agentNode.position;
  for (const cat of categories) {
    const w = cat.measured?.width || (cat.style?.width as number) || 250;
    const h = cat.measured?.height || (cat.style?.height as number) || 200;
    if (x >= cat.position.x && y >= cat.position.y && x < cat.position.x + w && y < cat.position.y + h) {
      return (cat.data as any).label || "Category";
    }
  }
  return null;
}

export function ListView() {
  const sessions = useStore((state) => state.sessions);
  const nodes = useStore((state) => state.nodes);
  const canvases = useStore((state) => state.canvases);
  const activeCanvasId = useStore((state) => state.activeCanvasId);
  const selectedNodeId = useStore((state) => (state.sidebarOpen ? state.selectedNodeId : null));
  const setAddAgentModalOpen = useStore((state) => state.setAddAgentModalOpen);
  const now = useNow();

  const [sortKey, setSortKey] = usePref<SortKey>("sort", "name");
  const [sortAsc, setSortAsc] = usePref("sortAsc", true);
  const [group, setGroup] = usePref<GroupKey>("group", "none");
  const [filter, setFilter] = usePref<FilterKey>("filter", "all");
  const [allCanvases, setAllCanvases] = usePref("allCanvases", false);
  const [hidden, setHidden] = usePref<ColumnId[]>("hiddenColumns", []);
  const [checked, setChecked] = useState<Set<string>>(new Set());

  const visibleColumns = COLUMNS.filter((c) => !hidden.includes(c.id));

  const rows = useMemo(() => {
    let list = Array.from(sessions.values()).filter((s) => allCanvases || (s.canvasId || "main") === activeCanvasId);
    list = list.filter((s) => {
      const info = statusConfig[s.status] || statusConfig.idle;
      switch (filter) {
        case "archived":
          return !!s.archived;
        case "active":
          return !s.archived && info.isActive;
        case "attention":
          return !s.archived && info.needsAttention;
        case "idle":
          return !s.archived && s.status === "idle";
        case "pinned":
          return !s.archived && !!s.pinned;
        default:
          return !s.archived;
      }
    });

    const value = (s: AgentSession): string | number => {
      switch (sortKey) {
        case "status":
          return STATUS_ORDER[s.status] ?? 9;
        case "tokens":
          return s.metrics?.totalTokens || 0;
        case "context":
          return s.metrics?.contextTokens || 0;
        case "lastActive":
          return s.lastActivityAt || 0;
        case "started":
          return new Date(s.createdAt).getTime();
        default:
          return displayName(s).toLowerCase();
      }
    };

    return list.sort((a, b) => {
      // Pinned always float to the top
      if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
      const va = value(a);
      const vb = value(b);
      const cmp = va < vb ? -1 : va > vb ? 1 : 0;
      return sortAsc ? cmp : -cmp;
    });
  }, [sessions, activeCanvasId, allCanvases, filter, sortKey, sortAsc]);

  const groups = useMemo(() => {
    if (group === "none") return [{ key: "", rows }];
    const categories = nodes.filter((n) => n.type === "category");
    const map = new Map<string, AgentSession[]>();
    for (const s of rows) {
      let key: string;
      if (group === "status") key = (statusConfig[s.status] || statusConfig.idle).label;
      else if (group === "directory") key = shortPath(s.originalCwd || s.cwd) || "–";
      else {
        const agentNode = nodes.find((n) => n.id === s.id);
        const sameCanvas = categories.filter((c) => ((c.data as any).canvasId || "main") === (s.canvasId || "main"));
        key = categoryFor(agentNode, sameCanvas) || "Uncategorized";
      }
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(s);
    }
    return Array.from(map.entries()).map(([key, rows]) => ({ key, rows }));
  }, [rows, group, nodes]);

  const handleSort = (key: SortKey) => {
    if (key === sortKey) setSortAsc(!sortAsc);
    else {
      setSortKey(key);
      setSortAsc(key === "name");
    }
  };

  const toggleChecked = (id: string) => {
    const next = new Set(checked);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setChecked(next);
  };

  const bulk = (fn: (id: string) => void) => {
    checked.forEach(fn);
    setChecked(new Set());
  };

  const SortIndicator = ({ k }: { k: SortKey }) =>
    sortKey === k ? sortAsc ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" /> : null;

  const renderRow = (s: AgentSession) => {
    const info = statusConfig[s.status] || statusConfig.idle;
    const Icon = iconMap[(nodes.find((n) => n.id === s.id)?.data as any)?.icon] || Cpu;
    const color = s.customColor || s.color;
    const percent = contextPercent(s);
    const model = formatModel(s.metrics?.model);
    const isSelected = selectedNodeId === s.id;
    const openPrs = (s.prs || []).filter((pr) => pr.state === "OPEN");
    const primaryPr = (openPrs[0] || s.prs?.[0]) ?? null;

    return (
      <tr
        key={s.id}
        onClick={() => agentActions.open(s.id)}
        className={`group border-b border-[#1f1f1f] cursor-pointer transition-colors ${
          isSelected ? "bg-white/[0.05]" : "hover:bg-white/[0.03]"
        }`}
        style={{ boxShadow: isSelected ? `inset 3px 0 0 ${info.color}` : undefined }}
      >
        <td className="pl-4 pr-1 py-3 w-[52px]">
          <div className="flex items-center gap-2">
            <button
              onClick={(e) => {
                e.stopPropagation();
                toggleChecked(s.id);
              }}
              className={`w-4 h-4 rounded border flex items-center justify-center transition-opacity ${
                checked.has(s.id) ? "bg-white border-white opacity-100" : "border-zinc-600 opacity-0 group-hover:opacity-100"
              }`}
            >
              {checked.has(s.id) && <Check className="w-3 h-3 text-black" />}
            </button>
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: info.color }} />
          </div>
        </td>
        <td className="py-3 pr-3">
          <div className="flex items-center gap-3 min-w-0">
            <Icon className="w-6 h-6 flex-shrink-0" style={{ color }} />
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-medium text-white truncate">{displayName(s)}</span>
                {s.pinned && <Pin className="w-3 h-3 text-zinc-400 fill-zinc-400 flex-shrink-0" />}
              </div>
              <div className="text-[11px] text-zinc-500 truncate">
                {model || s.agentName}
                {allCanvases && ` · ${canvases.find((c) => c.id === (s.canvasId || "main"))?.name || ""}`}
              </div>
            </div>
          </div>
        </td>
        {visibleColumns.map((col) => {
          switch (col.id) {
            case "branch":
              return (
                <td key={col.id} className="py-3 pr-3">
                  {s.gitBranch && (
                    <div className="flex items-center gap-1.5 text-purple-400 text-xs font-mono min-w-0" title={s.gitBranch}>
                      <GitBranch className="w-3.5 h-3.5 flex-shrink-0" />
                      <span className="truncate">{s.gitBranch}</span>
                    </div>
                  )}
                </td>
              );
            case "prs":
              return (
                <td key={col.id} className="py-3 pr-3">
                  {primaryPr &&
                    ((s.prs || []).length > 1 ? (
                      <div
                        className="flex items-center gap-1.5 text-xs"
                        style={{ color: prVisual(primaryPr).color }}
                        title={(s.prs || []).map((p) => `#${p.number} ${p.title}`).join("\n")}
                      >
                        {(() => {
                          const { Icon } = prVisual(primaryPr);
                          return <Icon className="w-3.5 h-3.5" />;
                        })()}
                        {(s.prs || []).length} PRs
                      </div>
                    ) : (
                      <PrBadges prs={s.prs || []} max={1} />
                    ))}
                </td>
              );
            case "cwd":
              return (
                <td key={col.id} className="py-3 pr-3">
                  <div className="flex items-center gap-1.5 text-xs text-zinc-400 font-mono min-w-0" title={s.cwd}>
                    <Folder className="w-3.5 h-3.5 flex-shrink-0 text-zinc-500" />
                    <span className="truncate">{shortPath(s.cwd)}</span>
                  </div>
                </td>
              );
            case "tokens":
              return (
                <td key={col.id} className="py-3 pr-3 font-mono text-xs">
                  {s.metrics ? (
                    <div>
                      <div className="flex items-center gap-1 text-zinc-300">
                        <Zap className="w-3 h-3 text-zinc-500" />
                        {formatTokens(s.metrics.totalTokens)}
                      </div>
                      {percent !== null && (
                        <div className="text-[11px]" style={{ color: percent >= 30 ? contextColor(percent) : "#71717a" }}>
                          {formatTokens(s.metrics.contextTokens)} ctx
                        </div>
                      )}
                    </div>
                  ) : (
                    <span className="text-zinc-600">–</span>
                  )}
                </td>
              );
            case "status":
              return (
                <td key={col.id} className="py-3 pr-3 text-xs" style={{ color: info.color }}>
                  {info.label}
                </td>
              );
            case "lastActive":
              return (
                <td key={col.id} className="py-3 pr-3 text-xs text-zinc-400">
                  <div className="flex items-center gap-1.5">
                    <Clock className="w-3 h-3 text-zinc-500" />
                    {formatRelative(s.lastActivityAt, now)}
                  </div>
                </td>
              );
            case "started":
              return (
                <td key={col.id} className="py-3 pr-3 text-xs text-zinc-400" title={new Date(s.createdAt).toLocaleString()}>
                  <div className="flex items-center gap-1.5">
                    <Clock className="w-3 h-3 text-zinc-500" />
                    {formatRelative(s.createdAt, now)}
                  </div>
                </td>
              );
          }
        })}
      </tr>
    );
  };

  return (
    <div className="h-full flex flex-col bg-canvas overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-border flex-shrink-0">
        <span className="text-sm text-zinc-500 whitespace-nowrap">
          {rows.length} agent{rows.length !== 1 ? "s" : ""}
        </span>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {checked.size > 0 ? (
            <>
              <span className="text-xs text-zinc-400">{checked.size} selected</span>
              <button
                onClick={() => bulk((id) => agentActions.setArchived(id, filter !== "archived"))}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border text-sm text-zinc-300 hover:bg-surface"
              >
                <Archive className="w-3.5 h-3.5" />
                {filter === "archived" ? "Unarchive" : "Archive"}
              </button>
              {canvases.length > 1 && (
                <Dropdown label="Move" icon={FolderInput}>
                  {(close) =>
                    canvases.map((c) => (
                      <MenuItem
                        key={c.id}
                        onClick={() => {
                          bulk((id) => agentActions.moveToCanvas(id, c.id));
                          close();
                        }}
                      >
                        {c.name}
                      </MenuItem>
                    ))
                  }
                </Dropdown>
              )}
              <button
                onClick={() => {
                  if (confirm(`Delete ${checked.size} agent(s)?`)) bulk((id) => agentActions.remove(id));
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-red-500/30 text-sm text-red-400 hover:bg-red-500/10"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete
              </button>
            </>
          ) : (
            <button
              onClick={() => setAddAgentModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-white text-canvas text-sm font-medium hover:bg-zinc-100"
            >
              <Plus className="w-3.5 h-3.5" />
              New Agent
            </button>
          )}

          <Dropdown label={group === "none" ? "Group" : GROUP_LABELS[group]} icon={Rows3} active={group !== "none"}>
            {(close) =>
              (Object.keys(GROUP_LABELS) as GroupKey[]).map((k) => (
                <MenuItem key={k} selected={group === k} onClick={() => { setGroup(k); close(); }}>
                  {GROUP_LABELS[k]}
                </MenuItem>
              ))
            }
          </Dropdown>

          <Dropdown label={SORT_LABELS[sortKey]} icon={ArrowUpDown}>
            {(close) => (
              <>
                {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => (
                  <MenuItem key={k} selected={sortKey === k} onClick={() => { handleSort(k); close(); }}>
                    {SORT_LABELS[k]}
                  </MenuItem>
                ))}
                <div className="my-1 border-t border-border" />
                <MenuItem selected={sortAsc} onClick={() => setSortAsc(true)}>Ascending</MenuItem>
                <MenuItem selected={!sortAsc} onClick={() => setSortAsc(false)}>Descending</MenuItem>
              </>
            )}
          </Dropdown>

          <Dropdown label="" icon={Columns3} active={hidden.length > 0}>
            {() =>
              COLUMNS.map((col) => (
                <MenuItem
                  key={col.id}
                  selected={!hidden.includes(col.id)}
                  onClick={() =>
                    setHidden(hidden.includes(col.id) ? hidden.filter((h) => h !== col.id) : [...hidden, col.id])
                  }
                >
                  {col.label}
                </MenuItem>
              ))
            }
          </Dropdown>

          <Dropdown label={FILTER_LABELS[filter]} icon={Filter} active={filter !== "all" || allCanvases}>
            {(close) => (
              <>
                {(Object.keys(FILTER_LABELS) as FilterKey[]).map((k) => (
                  <MenuItem key={k} selected={filter === k} onClick={() => { setFilter(k); setChecked(new Set()); close(); }}>
                    {FILTER_LABELS[k]}
                  </MenuItem>
                ))}
                <div className="my-1 border-t border-border" />
                <MenuItem selected={allCanvases} onClick={() => setAllCanvases(!allCanvases)}>
                  Include all canvases
                </MenuItem>
              </>
            )}
          </Dropdown>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full table-fixed border-collapse min-w-[760px]">
          <thead className="sticky top-0 z-10 bg-canvas">
            <tr className="border-b border-border text-left text-xs text-zinc-500">
              <th className="w-[52px]" />
              <th className="py-2.5 pr-3 font-normal">
                <button onClick={() => handleSort("name")} className={`flex items-center gap-1 ${sortKey === "name" ? "text-orange-400" : "hover:text-zinc-300"}`}>
                  Agent <SortIndicator k="name" />
                </button>
              </th>
              {visibleColumns.map((col) => (
                <th key={col.id} className={`py-2.5 pr-3 font-normal ${col.className}`}>
                  {col.sort ? (
                    <button
                      onClick={() => handleSort(col.sort!)}
                      className={`flex items-center gap-1 ${sortKey === col.sort ? "text-orange-400" : "hover:text-zinc-300"}`}
                    >
                      {col.label} <SortIndicator k={col.sort} />
                    </button>
                  ) : (
                    col.label
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groups.map(({ key, rows }) => (
              <GroupRows key={key || "all"} label={key} count={rows.length} colSpan={visibleColumns.length + 2}>
                {rows.map(renderRow)}
              </GroupRows>
            ))}
          </tbody>
        </table>

        {rows.length === 0 && (
          <div className="py-16 text-center text-sm text-zinc-500">
            {filter === "all" ? "No agents on this canvas yet" : `No agents match “${FILTER_LABELS[filter]}”`}
          </div>
        )}
      </div>
    </div>
  );
}

function GroupRows({ label, count, colSpan, children }: { label: string; count: number; colSpan: number; children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  if (!label) return <>{children}</>;
  return (
    <>
      <tr className="border-b border-[#1f1f1f] bg-white/[0.02] cursor-pointer" onClick={() => setCollapsed(!collapsed)}>
        <td colSpan={colSpan} className="px-4 py-2 text-xs text-zinc-400">
          <span className="inline-flex items-center gap-1.5">
            {collapsed ? <ChevronDown className="w-3 h-3 -rotate-90" /> : <ChevronDown className="w-3 h-3" />}
            <span className="font-medium text-zinc-300">{label}</span>
            <span className="text-zinc-600">{count}</span>
          </span>
        </td>
      </tr>
      {!collapsed && children}
    </>
  );
}
