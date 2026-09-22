import { useState, useRef, useEffect } from "react";
import { Plus, X, LayoutGrid, List } from "lucide-react";
import { useStore, Canvas } from "../stores/useStore";

function CanvasTab({ canvas, active, count, canDelete }: { canvas: Canvas; active: boolean; count: number; canDelete: boolean }) {
  const { setActiveCanvasId, setCanvases } = useStore();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(canvas.name);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => setName(canvas.name), [canvas.name]);
  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  const commit = () => {
    setEditing(false);
    const trimmed = name.trim();
    if (!trimmed || trimmed === canvas.name) {
      setName(canvas.name);
      return;
    }
    const canvases = useStore.getState().canvases;
    setCanvases(canvases.map((c) => (c.id === canvas.id ? { ...c, name: trimmed } : c)));
    fetch(`/api/canvases/${canvas.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: trimmed }),
    }).catch(console.error);
  };

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (count > 0 && !confirm(`Delete "${canvas.name}"? Its ${count} agent(s) will move to another canvas.`)) return;
    const res = await fetch(`/api/canvases/${canvas.id}`, { method: "DELETE" });
    if (!res.ok) return;
    const { movedTo } = await res.json();
    const state = useStore.getState();
    // Mirror the server-side move locally
    for (const s of state.sessions.values()) {
      if ((s.canvasId || "main") === canvas.id) state.updateSession(s.id, { canvasId: movedTo });
    }
    state.setNodes(
      state.nodes.map((n) =>
        n.type === "category" && (n.data as any).canvasId === canvas.id ? { ...n, data: { ...n.data, canvasId: movedTo } } : n
      )
    );
    setCanvases(state.canvases.filter((c) => c.id !== canvas.id));
    if (state.activeCanvasId === canvas.id) setActiveCanvasId(movedTo);
  };

  return (
    <div
      onClick={() => setActiveCanvasId(canvas.id)}
      onDoubleClick={() => setEditing(true)}
      className={`group relative flex items-center gap-2 h-full px-5 cursor-pointer text-sm transition-colors ${
        active ? "text-white bg-white/[0.04]" : "text-zinc-500 hover:text-zinc-300"
      }`}
      title="Double-click to rename"
    >
      {editing ? (
        <input
          ref={inputRef}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") {
              setName(canvas.name);
              setEditing(false);
            }
          }}
          onClick={(e) => e.stopPropagation()}
          className="bg-transparent outline-none w-28 text-white"
        />
      ) : (
        <span className="truncate max-w-[160px]">{canvas.name}</span>
      )}
      {count > 0 && !editing && <span className="text-[10px] text-zinc-600">{count}</span>}
      {canDelete && !editing && (
        <button
          onClick={handleDelete}
          className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-zinc-500 hover:text-white hover:bg-white/10"
          title="Delete canvas"
        >
          <X className="w-3 h-3" />
        </button>
      )}
      {active && <div className="absolute bottom-0 left-2 right-2 h-0.5 bg-white rounded-full" />}
    </div>
  );
}

export function CanvasTabs() {
  const { canvases, setCanvases, activeCanvasId, setActiveCanvasId, viewMode, setViewMode } = useStore();
  const sessions = useStore((state) => state.sessions);

  const counts = new Map<string, number>();
  for (const s of sessions.values()) {
    if (s.archived) continue;
    const id = s.canvasId || "main";
    counts.set(id, (counts.get(id) || 0) + 1);
  }

  const handleNew = async () => {
    const res = await fetch("/api/canvases", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: `Canvas ${canvases.length + 1}` }),
    });
    if (!res.ok) return;
    const canvas = await res.json();
    setCanvases([...useStore.getState().canvases, canvas]);
    setActiveCanvasId(canvas.id);
  };

  return (
    <div className="h-11 flex items-center justify-between border-b border-border bg-canvas-dark flex-shrink-0 pr-3">
      <div className="flex items-center h-full min-w-0 overflow-x-auto">
        {canvases.map((canvas) => (
          <CanvasTab
            key={canvas.id}
            canvas={canvas}
            active={canvas.id === activeCanvasId}
            count={counts.get(canvas.id) || 0}
            canDelete={canvases.length > 1}
          />
        ))}
        <button
          onClick={handleNew}
          className="flex items-center gap-1.5 h-full px-4 text-sm text-zinc-500 hover:text-zinc-300 transition-colors flex-shrink-0"
        >
          <Plus className="w-4 h-4" />
          New Canvas
        </button>
      </div>

      <div className="flex items-center p-0.5 rounded-md bg-surface border border-border flex-shrink-0">
        <button
          onClick={() => setViewMode("canvas")}
          className={`p-1.5 rounded ${viewMode === "canvas" ? "bg-surface-active text-white" : "text-zinc-500 hover:text-zinc-300"}`}
          title="Canvas view"
        >
          <LayoutGrid className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => setViewMode("list")}
          className={`p-1.5 rounded ${viewMode === "list" ? "bg-surface-active text-white" : "text-zinc-500 hover:text-zinc-300"}`}
          title="List view"
        >
          <List className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
