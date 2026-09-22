import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import type { Canvas, PersistedState, Session } from "../types";

export const DEFAULT_CANVAS: Canvas = { id: "main", name: "Main" };

// Use local .openui folder where user ran openui from
const LAUNCH_CWD = process.env.LAUNCH_CWD || process.cwd();
const DATA_DIR = join(LAUNCH_CWD, ".openui");
const STATE_FILE = join(DATA_DIR, "state.json");
const BUFFERS_DIR = join(DATA_DIR, "buffers");

// Ensure directories exist
function ensureDirs() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  if (!existsSync(BUFFERS_DIR)) mkdirSync(BUFFERS_DIR, { recursive: true });
}

export function loadState(): PersistedState {
  ensureDirs();
  try {
    if (existsSync(STATE_FILE)) {
      const data = JSON.parse(readFileSync(STATE_FILE, "utf-8"));
      console.log(`\x1b[38;5;245m[persistence]\x1b[0m Loaded state from ${STATE_FILE}`);
      return data;
    }
  } catch (e) {
    console.error("Failed to load state:", e);
  }
  return { nodes: [] };
}

export function writeState(state: PersistedState) {
  ensureDirs();
  try {
    writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  } catch (e) {
    console.error("Failed to save state:", e);
  }
}

export function getCanvases(state: PersistedState = loadState()): Canvas[] {
  return state.canvases && state.canvases.length > 0 ? state.canvases : [DEFAULT_CANVAS];
}

export function saveState(sessions: Map<string, Session>) {
  ensureDirs();
  const savedState = loadState();

  // Preserve categories and canvases from existing state
  const state: PersistedState = {
    nodes: [],
    categories: savedState.categories || [],
    canvases: getCanvases(savedState),
  };

  for (const [sessionId, session] of sessions) {
    // Auxiliary shells are ephemeral
    if (session.isShell) continue;

    // Preserve existing position if we have one
    const existingNode = savedState.nodes.find(n => n.sessionId === sessionId);

    state.nodes.push({
      nodeId: session.nodeId,
      sessionId,
      agentId: session.agentId,
      agentName: session.agentName,
      command: session.command,
      cwd: session.cwd,
      createdAt: session.createdAt,
      customName: session.customName,
      customColor: session.customColor,
      notes: session.notes,
      icon: session.icon,
      position: session.position || existingNode?.position || { x: 0, y: 0 },
      canvasId: session.canvasId,
      pinned: session.pinned,
      archived: session.archived,
      gitBranch: session.gitBranch,
      originalCwd: session.originalCwd,
      ticketId: session.ticketId,
      ticketTitle: session.ticketTitle,
      ticketUrl: session.ticketUrl,
      claudeSessionId: session.claudeSessionId,
      transcriptPath: session.transcriptPath,
      lastActivityAt: session.lastActivityAt,
    });

    saveBuffer(sessionId, session.outputBuffer);
  }

  writeState(state);
}

export function savePositions(positions: Record<string, { x: number; y: number }>) {
  ensureDirs();
  const state = loadState();

  let updated = 0;
  for (const [nodeId, pos] of Object.entries(positions)) {
    const node = state.nodes.find(n => n.nodeId === nodeId);
    if (node) {
      node.position = pos;
      updated++;
    } else {
      console.log(`\x1b[38;5;245m[persistence]\x1b[0m Node ${nodeId} not found in state`);
    }
  }

  if (updated > 0) {
    try {
      writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
      console.log(`\x1b[38;5;245m[persistence]\x1b[0m Saved ${updated} positions to ${STATE_FILE}`);
    } catch (e) {
      console.error("Failed to save positions:", e);
    }
  }
}

export function saveBuffer(sessionId: string, buffer: string[]) {
  ensureDirs();
  const bufferFile = join(BUFFERS_DIR, `${sessionId}.txt`);
  try {
    writeFileSync(bufferFile, buffer.join(""));
  } catch (e) {
    console.error("Failed to save buffer:", e);
  }
}

export function loadBuffer(sessionId: string): string[] {
  ensureDirs();
  const bufferFile = join(BUFFERS_DIR, `${sessionId}.txt`);
  try {
    if (existsSync(bufferFile)) {
      return [readFileSync(bufferFile, "utf-8")];
    }
  } catch (e) {
    console.error("Failed to load buffer:", e);
  }
  return [];
}

export function getDataDir() {
  return DATA_DIR;
}
