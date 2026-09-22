#!/usr/bin/env bun

import { $ } from "bun";
import { existsSync, realpathSync, lstatSync, mkdirSync, renameSync, symlinkSync } from "fs";
import { join } from "path";
import { homedir } from "os";

// Read version from package.json
const PORT = process.env.PORT || 6969;
const LAUNCH_CWD = process.cwd();
const IS_DEV = process.env.NODE_ENV === "development" || process.argv.includes("--dev");

const REPO_DIR = join(import.meta.dir, "..");

// Link ~/.openui/claude-code-plugin to this checkout's plugin so hook changes ship with the repo
async function ensurePluginInstalled() {
  const openuiDir = join(homedir(), ".openui");
  const pluginDir = join(openuiDir, "claude-code-plugin");
  const repoPluginDir = join(REPO_DIR, "claude-code-plugin");

  try {
    if (existsSync(pluginDir) && realpathSync(pluginDir) === realpathSync(repoPluginDir)) return;

    mkdirSync(openuiDir, { recursive: true });
    if (existsSync(pluginDir) || lstatSync(pluginDir, { throwIfNoEntry: false })) {
      // Keep any previously downloaded copy around instead of deleting it
      renameSync(pluginDir, `${pluginDir}.bak-${Date.now()}`);
    }
    symlinkSync(repoPluginDir, pluginDir);
    await $`chmod +x ${repoPluginDir}/hooks/status-reporter.sh`.quiet();
    console.log("\x1b[38;5;82m[plugin]\x1b[0m Linked Claude Code plugin from this checkout");
  } catch (e) {
    console.error("\x1b[38;5;196m[plugin]\x1b[0m Failed to link plugin:", e);
  }
}

// Build the client if it has never been built (e.g. fresh clone or after `git clean`)
async function ensureClientBuilt() {
  if (existsSync(join(REPO_DIR, "client", "dist", "index.html"))) return;
  console.log("\x1b[38;5;141m[build]\x1b[0m Building client...");
  if (!existsSync(join(REPO_DIR, "client", "node_modules"))) {
    await $`bun install`.cwd(join(REPO_DIR, "client")).quiet();
  }
  await $`bun run build`.cwd(join(REPO_DIR, "client")).quiet();
}

// Check whether the fork has new commits upstream of this checkout (non-blocking)
async function checkForUpdates() {
  try {
    await $`git fetch --quiet origin`.cwd(REPO_DIR).quiet();
    const behind = (await $`git rev-list --count HEAD..@{u}`.cwd(REPO_DIR).quiet().text()).trim();
    if (behind && behind !== "0") {
      console.log(`\x1b[33m  ${behind} new commit(s) available. Run: openui-update\x1b[0m\n`);
    }
  } catch {
    // Silently ignore - no upstream branch or offline
  }
}

// Clear screen and show ASCII art
console.clear();
console.log(`
\x1b[38;5;141m
    ██╗      █████╗ ██╗   ██╗███╗   ██╗ ██████╗██╗  ██╗██╗███╗   ██╗ ██████╗
    ██║     ██╔══██╗██║   ██║████╗  ██║██╔════╝██║  ██║██║████╗  ██║██╔════╝
    ██║     ███████║██║   ██║██╔██╗ ██║██║     ███████║██║██╔██╗ ██║██║  ███╗
    ██║     ██╔══██║██║   ██║██║╚██╗██║██║     ██╔══██║██║██║╚██╗██║██║   ██║
    ███████╗██║  ██║╚██████╔╝██║ ╚████║╚██████╗██║  ██║██║██║ ╚████║╚██████╔╝
    ╚══════╝╚═╝  ╚═╝ ╚═════╝ ╚═╝  ╚═══╝ ╚═════╝╚═╝  ╚═╝╚═╝╚═╝  ╚═══╝ ╚═════╝

    ██╗   ██╗ ██████╗ ██╗   ██╗██████╗      █████╗ ██╗
    ╚██╗ ██╔╝██╔═══██╗██║   ██║██╔══██╗    ██╔══██╗██║
     ╚████╔╝ ██║   ██║██║   ██║██████╔╝    ███████║██║
      ╚██╔╝  ██║   ██║██║   ██║██╔══██╗    ██╔══██║██║
       ██║   ╚██████╔╝╚██████╔╝██║  ██║    ██║  ██║██║
       ╚═╝    ╚═════╝  ╚═════╝ ╚═╝  ╚═╝    ╚═╝  ╚═╝╚═╝

     ██████╗ ██████╗ ███╗   ███╗███╗   ███╗ █████╗ ███╗   ██╗██████╗
    ██╔════╝██╔═══██╗████╗ ████║████╗ ████║██╔══██╗████╗  ██║██╔══██╗
    ██║     ██║   ██║██╔████╔██║██╔████╔██║███████║██╔██╗ ██║██║  ██║
    ██║     ██║   ██║██║╚██╔╝██║██║╚██╔╝██║██╔══██║██║╚██╗██║██║  ██║
    ╚██████╗╚██████╔╝██║ ╚═╝ ██║██║ ╚═╝ ██║██║  ██║██║ ╚████║██████╔╝
     ╚═════╝ ╚═════╝ ╚═╝     ╚═╝╚═╝     ╚═╝╚═╝  ╚═╝╚═╝  ╚═══╝╚═════╝

     ██████╗███████╗███╗   ██╗████████╗███████╗██████╗
    ██╔════╝██╔════╝████╗  ██║╚══██╔══╝██╔════╝██╔══██╗
    ██║     █████╗  ██╔██╗ ██║   ██║   █████╗  ██████╔╝
    ██║     ██╔══╝  ██║╚██╗██║   ██║   ██╔══╝  ██╔══██╗
    ╚██████╗███████╗██║ ╚████║   ██║   ███████╗██║  ██║
     ╚═════╝╚══════╝╚═╝  ╚═══╝   ╚═╝   ╚══════╝╚═╝  ╚═╝
\x1b[0m

\x1b[38;5;251m                    ╔═══════════════════════════════════════╗
                    ║                                       ║
                    ║   \x1b[1m\x1b[38;5;141mhttp://localhost:${PORT}\x1b[0m\x1b[38;5;251m                 ║
                    ║                                       ║
                    ╚═══════════════════════════════════════╝\x1b[0m

\x1b[38;5;245m                         Press Ctrl+C to stop\x1b[0m
`);

// Ensure plugin is linked, client is built, and check for updates in background
await ensurePluginInstalled();
await ensureClientBuilt();
checkForUpdates();

// Start the server with LAUNCH_CWD env var
// In production mode, suppress server output
const server = Bun.spawn(["bun", "run", "server/index.ts"], {
  cwd: import.meta.dir + "/..",
  stdio: IS_DEV ? ["inherit", "inherit", "inherit"] : ["inherit", "ignore", "ignore"],
  env: { ...process.env, PORT: String(PORT), LAUNCH_CWD, OPENUI_QUIET: IS_DEV ? "" : "1" }
});

// Open browser (skip with --no-open)
if (!process.argv.includes("--no-open")) setTimeout(async () => {
  const platform = process.platform;
  const cmd = platform === "darwin" ? "open" : platform === "win32" ? "start" : "xdg-open";
  await $`${cmd} http://localhost:${PORT}`.quiet();
}, 1500);

process.on("SIGINT", () => {
  server.kill();
  process.exit(0);
});

process.on("SIGTERM", () => {
  server.kill();
  process.exit(0);
});

await server.exited;
