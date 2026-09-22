import { NodeProps } from "@xyflow/react";
import { motion } from "framer-motion";
import { Sparkles, Code, Cpu, Zap, Rocket, Bot, Brain, Wand2 } from "lucide-react";
import { useStore, AgentStatus } from "../../stores/useStore";
import { orderedAgents } from "../../lib/agents";
import { AgentNodeCard } from "./AgentNodeCard";
import { AgentNodeContextMenu } from "./AgentNodeContextMenu";
import { useAgentNodeState } from "./useAgentNodeState";

export const iconMap: Record<string, any> = {
  sparkles: Sparkles,
  code: Code,
  cpu: Cpu,
  zap: Zap,
  rocket: Rocket,
  bot: Bot,
  brain: Brain,
  wand2: Wand2,
};

interface AgentNodeData {
  label: string;
  agentId: string;
  color: string;
  icon: string;
  sessionId: string;
}

export const AgentNode = ({ id, data, selected }: NodeProps) => {
  const nodeData = data as unknown as AgentNodeData;

  // Subscribe directly to status and currentTool as primitive values - this guarantees re-render on change
  const status: AgentStatus = useStore((state) => state.sessions.get(id)?.status) || "idle";
  const currentTool = useStore((state) => state.sessions.get(id)?.currentTool);
  const isSelected = useStore((state) => state.selectedNodeId === id && state.sidebarOpen);
  const shortcutIndex = useStore((state) => {
    const index = orderedAgents(state.sessions, state.activeCanvasId).findIndex((s) => s.id === id);
    return index === -1 ? undefined : index;
  });

  // Get the full session for other data
  const session = useStore((state) => state.sessions.get(id));

  const { contextMenu, handleContextMenu, closeContextMenu } = useAgentNodeState();

  const displayColor = session?.customColor || session?.color || nodeData.color || "#22C55E";
  const displayName = session?.customName || session?.metrics?.title || session?.agentName || nodeData.label || "Agent";
  const displayIcon = nodeData.icon || "cpu";
  const Icon = iconMap[displayIcon] || Cpu;

  return (
    <>
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        onContextMenu={handleContextMenu}
      >
        <AgentNodeCard
          nodeId={id}
          session={session}
          selected={selected || isSelected}
          displayColor={displayColor}
          displayName={displayName}
          Icon={Icon}
          agentId={nodeData.agentId}
          status={status}
          currentTool={currentTool}
          shortcutIndex={shortcutIndex}
        />
      </motion.div>

      {contextMenu && (
        <AgentNodeContextMenu nodeId={id} position={contextMenu} onClose={closeContextMenu} />
      )}
    </>
  );
};
