import { useState } from "react";
import { Plus, Folder, Settings, Search, Loader2 } from "lucide-react";
import { motion } from "framer-motion";
import { useStore } from "../stores/useStore";
import { shortPath, statusConfig } from "../lib/agents";
import { SettingsModal } from "./SettingsModal";

export function Header() {
  const { setAddAgentModalOpen, launchCwd, setSearchOpen } = useStore();
  const sessions = useStore((state) => state.sessions);
  const [settingsOpen, setSettingsOpen] = useState(false);

  let working = 0;
  let attention = 0;
  let idle = 0;
  for (const s of sessions.values()) {
    if (s.archived) continue;
    const info = statusConfig[s.status] || statusConfig.idle;
    if (info.isActive) working++;
    else if (info.needsAttention) attention++;
    else if (s.status === "idle") idle++;
  }

  const selectedCwd = useStore((state) =>
    state.selectedNodeId && state.sidebarOpen ? state.sessions.get(state.selectedNodeId)?.cwd : undefined
  );

  return (
    <header className="h-14 px-4 flex items-center justify-between border-b border-border bg-canvas-dark flex-shrink-0">
      {/* Logo */}
      <div className="flex items-center gap-3 min-w-0">
        <div className="flex items-center gap-2 flex-shrink-0">
          <div className="w-6 h-6 rounded-md bg-gradient-to-br from-violet-500 to-orange-500 flex items-center justify-center">
            <div className="w-2 h-2 rounded-full bg-white" />
          </div>
          <span className="text-sm font-semibold text-white">OpenUI</span>
          <div className="w-1.5 h-1.5 rounded-full bg-green-500" title="Connected" />
        </div>

        <div className="h-4 w-px bg-border mx-2" />

        <div className="flex items-center gap-1.5 text-xs text-zinc-500 min-w-0">
          <Folder className="w-3 h-3 flex-shrink-0" />
          <span className="font-mono truncate max-w-[360px]" title={selectedCwd || launchCwd}>
            {shortPath(selectedCwd || launchCwd) || "~"}
          </span>
        </div>
      </div>

      {/* Right side */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <div
          className="flex items-center gap-2.5 px-3 py-1 rounded-full bg-surface border border-border text-xs"
          title={`${working} working · ${attention} need attention · ${idle} idle`}
        >
          <span className="flex items-center gap-1 text-green-400">
            <Loader2 className={`w-3 h-3 ${working > 0 ? "animate-spin" : ""}`} />
            {working}
          </span>
          {attention > 0 && (
            <span className="flex items-center gap-1 text-orange-400">
              <span className="w-1.5 h-1.5 rounded-full bg-orange-400" />
              {attention}
            </span>
          )}
          <span className="flex items-center gap-1 text-amber-400/80">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400/80" />
            {idle}
          </span>
        </div>

        <button
          onClick={() => setSearchOpen(true)}
          className="flex items-center gap-2 p-2 rounded-md text-zinc-400 hover:text-white hover:bg-surface-active transition-colors"
          title="Search agents (⌘K)"
        >
          <Search className="w-4 h-4" />
        </button>
        <button
          onClick={() => setSettingsOpen(true)}
          className="p-2 rounded-md text-zinc-400 hover:text-white hover:bg-surface-active transition-colors"
          title="Settings"
        >
          <Settings className="w-4 h-4" />
        </button>
        <motion.button
          onClick={() => setAddAgentModalOpen(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-white text-canvas text-sm font-medium hover:bg-zinc-100 transition-colors"
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          <Plus className="w-4 h-4" />
          New Agent
        </motion.button>
      </div>

      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </header>
  );
}
