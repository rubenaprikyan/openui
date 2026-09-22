import { createPortal } from "react-dom";
import { Trash2, Pin, Archive, ArchiveRestore, Link2, FolderInput, PanelRight } from "lucide-react";
import { useStore } from "../../stores/useStore";
import { agentActions } from "../../lib/agents";

interface AgentNodeContextMenuProps {
  nodeId: string;
  position: { x: number; y: number };
  onClose: () => void;
}

export function AgentNodeContextMenu({ nodeId, position, onClose }: AgentNodeContextMenuProps) {
  const session = useStore((state) => state.sessions.get(nodeId));
  const canvases = useStore((state) => state.canvases);
  const currentCanvas = session?.canvasId || "main";
  const otherCanvases = canvases.filter((c) => c.id !== currentCanvas);

  const item = (label: string, Icon: any, action: () => void, danger = false) => (
    <button
      key={label}
      onClick={() => {
        action();
        onClose();
      }}
      className={`w-full px-3 py-2 text-left text-xs hover:bg-white/5 flex items-center gap-2 ${
        danger ? "text-red-400" : "text-zinc-300"
      }`}
    >
      <Icon className="w-3.5 h-3.5" />
      {label}
    </button>
  );

  return createPortal(
    <div
      className="context-menu-container fixed z-[9999] min-w-[180px] rounded-lg border shadow-xl py-1"
      style={{ left: position.x, top: position.y, backgroundColor: "#262626", borderColor: "#333" }}
    >
      {item("Open", PanelRight, () => agentActions.open(nodeId))}
      {item(session?.pinned ? "Unpin" : "Pin", Pin, () => agentActions.togglePin(nodeId))}
      {item(session?.archived ? "Unarchive" : "Archive", session?.archived ? ArchiveRestore : Archive, () =>
        agentActions.setArchived(nodeId, !session?.archived)
      )}
      {item("Copy link", Link2, () => agentActions.copyLink(nodeId))}
      {otherCanvases.length > 0 && (
        <>
          <div className="my-1 border-t border-[#333]" />
          <div className="px-3 py-1 text-[10px] uppercase tracking-wider text-zinc-500">Move to canvas</div>
          {otherCanvases.map((canvas) =>
            item(canvas.name, FolderInput, () => agentActions.moveToCanvas(nodeId, canvas.id))
          )}
        </>
      )}
      <div className="my-1 border-t border-[#333]" />
      {item("Delete", Trash2, () => agentActions.remove(nodeId), true)}
    </div>,
    document.body
  );
}
