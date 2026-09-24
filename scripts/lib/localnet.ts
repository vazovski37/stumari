import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { LOCALNET_SH } from "./paths";

/**
 * Git Bash on Windows: a bare `bash` can resolve to WSL's System32\bash.exe, which cannot reach
 * Docker's published ports the same way (ADR-0015).
 */
function bashPath(): string {
  if (process.platform !== "win32") return "bash";
  const gitBash = resolve(process.env["ProgramFiles"] ?? "C:/Program Files", "Git/bin/bash.exe");
  return existsSync(gitBash) ? gitBash : "bash";
}

/** Runs `scripts/localnet.sh start|reset` (Surfpool in Docker on 127.0.0.1:8899), streaming its output. */
export function localnet(command: "start" | "reset"): void {
  const result = spawnSync(bashPath(), [LOCALNET_SH.replaceAll("\\", "/"), command], { stdio: "inherit" });
  if (result.status !== 0) throw new Error(`scripts/localnet.sh ${command} failed (exit ${result.status ?? result.error?.message})`);
}
