/** Starts the web app (`next dev`) on a free port for the E2E run and stops it with its process tree. */
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { createWriteStream } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { WEB_DIR } from "../lib/paths";

export const WEB_LOG = resolve(tmpdir(), "stumari-e2e-web.log");

export function freePort(): Promise<number> {
  return new Promise((done, fail) => {
    const server = createServer();
    server.once("error", fail);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as { port: number };
      server.close(() => done(port));
    });
  });
}

export interface WebServer {
  baseUrl: string;
  stop(): void;
}

/**
 * `next dev --port <port>` in apps/web. `env` overrides apps/web/.env.local (Next never replaces a
 * variable that is already set in the process environment). Output goes to WEB_LOG.
 */
export async function startWebServer(port: number, env: Record<string, string>): Promise<WebServer> {
  const baseUrl = `http://localhost:${port}`;
  const log = createWriteStream(WEB_LOG);
  const child: ChildProcess = spawn(
    process.execPath,
    [resolve(WEB_DIR, "node_modules/next/dist/bin/next"), "dev", "--port", String(port), "--hostname", "localhost"],
    { cwd: WEB_DIR, env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"] },
  );
  child.stdout?.pipe(log);
  child.stderr?.pipe(log);
  const stop = () => {
    if (child.exitCode !== null || child.pid === undefined) return;
    // next dev forks a server process; kill the whole tree.
    if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
    else child.kill("SIGTERM");
  };

  const deadline = Date.now() + 180_000;
  for (;;) {
    if (child.exitCode !== null) throw new Error(`next dev exited with ${child.exitCode}; see ${WEB_LOG}`);
    try {
      const res = await fetch(`${baseUrl}/api/config/public`, { signal: AbortSignal.timeout(60_000) });
      if (res.ok) return { baseUrl, stop };
    } catch {
      // not listening yet, or still compiling
    }
    if (Date.now() > deadline) {
      stop();
      throw new Error(`web app did not answer on ${baseUrl} within 180 s; see ${WEB_LOG}`);
    }
    await new Promise((r) => setTimeout(r, 1_000));
  }
}
