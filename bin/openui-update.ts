#!/usr/bin/env bun

// Pull the latest fork and rebuild so the global `openui` command runs it
import { $ } from "bun";
import { join } from "path";

const REPO_DIR = join(import.meta.dir, "..");
const CLIENT_DIR = join(REPO_DIR, "client");

console.log("\x1b[38;5;141m[update]\x1b[0m Pulling latest changes...");
await $`git pull --ff-only`.cwd(REPO_DIR);
console.log("\x1b[38;5;141m[update]\x1b[0m Installing dependencies...");
await $`bun install`.cwd(REPO_DIR).quiet();
await $`bun install`.cwd(CLIENT_DIR).quiet();
console.log("\x1b[38;5;141m[update]\x1b[0m Building client...");
await $`bun run build`.cwd(CLIENT_DIR).quiet();
console.log("\x1b[38;5;82m[update]\x1b[0m Done. Run `openui` to start.");
