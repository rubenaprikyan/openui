import { useState, useEffect, useRef, useMemo } from "react";
import { createPortal } from "react-dom";
import { Search, GitBranch, Folder, Cpu, Archive } from "lucide-react";
import { useStore, AgentSession } from "../stores/useStore";
import { statusConfig, shortPath, displayName, agentActions } from "../lib/agents";
import { iconMap } from "./AgentNode/index";

// Simple subsequence scoring: contiguous and early matches rank higher
function score(haystack: string, needle: string): number {
  if (!needle) return 1;
  const h = haystack.toLowerCase();
  const n = needle.toLowerCase();
  const idx = h.indexOf(n);
  if (idx !== -1) return 1000 - idx;
  let hi = 0;
  let s = 0;
  for (const ch of n) {
    const found = h.indexOf(ch, hi);
    if (found === -1) return 0;
    s += found === hi ? 2 : 1;
    hi = found + 1;
  }
  return s;
}

function searchText(s: AgentSession, canvasName: string) {
  return [displayName(s), s.agentName, s.gitBranch, s.cwd, s.ticketId, s.ticketTitle, s.notes, canvasName, ...(s.prs || []).map((p) => `#${p.number} ${p.title}`)]
    .filter(Boolean)
    .join(" ");
}

export function SearchPalette() {
  const { searchOpen, setSearchOpen } = useStore();
  const sessions = useStore((state) => state.sessions);
  const canvases = useStore((state) => state.canvases);
  const nodes = useStore((state) => state.nodes);
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (searchOpen) {
      setQuery("");
      setIndex(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [searchOpen]);

  const results = useMemo(() => {
    const canvasName = (id?: string) => canvases.find((c) => c.id === (id || "main"))?.name || "";
    return Array.from(sessions.values())
      .map((s) => ({ s, score: score(searchText(s, canvasName(s.canvasId)), query) }))
      .filter((r) => r.score > 0)
      // Archived agents are searchable but rank below active ones
      .map((r) => ({ ...r, score: r.score - (r.s.archived ? 5000 : 0) }))
      .sort((a, b) => b.score - a.score || (b.s.lastActivityAt || 0) - (a.s.lastActivityAt || 0))
      .slice(0, 12)
      .map((r) => r.s);
  }, [sessions, canvases, query]);

  useEffect(() => setIndex(0), [query]);

  if (!searchOpen) return null;

  const choose = (s: AgentSession) => {
    setSearchOpen(false);
    agentActions.open(s.id);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && results[index]) {
      choose(results[index]);
    } else if (e.key === "Escape") {
      setSearchOpen(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-start justify-center pt-[15vh] bg-black/50 backdrop-blur-sm" onMouseDown={() => setSearchOpen(false)}>
      <div
        className="w-full max-w-xl mx-4 rounded-xl border border-border bg-[#161616] shadow-2xl overflow-hidden"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-4 h-12 border-b border-border">
          <Search className="w-4 h-4 text-zinc-500" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search agents by name, branch, directory, PR, ticket…"
            className="flex-1 bg-transparent outline-none text-sm text-white placeholder-zinc-600"
          />
          <kbd className="text-[10px] text-zinc-500 border border-border rounded px-1.5 py-0.5">esc</kbd>
        </div>
        <div className="max-h-[50vh] overflow-y-auto py-1">
          {results.length === 0 && <div className="px-4 py-8 text-center text-sm text-zinc-500">No agents found</div>}
          {results.map((s, i) => {
            const info = statusConfig[s.status] || statusConfig.idle;
            const Icon = iconMap[(nodes.find((n) => n.id === s.id)?.data as any)?.icon] || Cpu;
            const canvas = canvases.find((c) => c.id === (s.canvasId || "main"));
            return (
              <button
                key={s.id}
                onMouseEnter={() => setIndex(i)}
                onClick={() => choose(s)}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-left ${i === index ? "bg-white/[0.06]" : ""}`}
              >
                <Icon className="w-5 h-5 flex-shrink-0" style={{ color: s.customColor || s.color }} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-white truncate">{displayName(s)}</span>
                    {s.archived && <Archive className="w-3 h-3 text-zinc-500" />}
                    {canvases.length > 1 && canvas && <span className="text-[10px] text-zinc-600">{canvas.name}</span>}
                  </div>
                  <div className="flex items-center gap-3 text-[11px] text-zinc-500 font-mono min-w-0">
                    {s.gitBranch && (
                      <span className="flex items-center gap-1 text-purple-400/80 truncate">
                        <GitBranch className="w-3 h-3 flex-shrink-0" />
                        {s.gitBranch}
                      </span>
                    )}
                    <span className="flex items-center gap-1 truncate">
                      <Folder className="w-3 h-3 flex-shrink-0" />
                      {shortPath(s.cwd)}
                    </span>
                  </div>
                </div>
                <span className="text-xs flex-shrink-0" style={{ color: info.color }}>
                  {info.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>,
    document.body
  );
}
