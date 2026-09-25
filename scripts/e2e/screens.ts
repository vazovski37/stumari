/**
 * Small PNG screenshots of the running demo app for docs/plan/e2e-screens/ (headless Edge or Chrome
 * over the DevTools protocol). Admin pages are captured signed in: the operator (an ADMIN_WALLETS
 * entry) signs in with SIWS from Node and the session cookie is handed to the browser.
 *   pnpm --filter @stumari/scripts e2e:screens -- [--base http://localhost:3000] [--booking <id>]
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { addDays, localDate } from "@stumari/core";
import { loadEnv } from "../lib/env";
import { loadOperator } from "../lib/keys";
import { REPO } from "../lib/paths";
import { Http } from "./http";
import { sleep } from "./steps";
import { signIn } from "./wallet";

const OUT_DIR = resolve(REPO, "docs/plan/e2e-screens");
const VIEWPORT = { width: 1280, height: 800 };
/** Rendered at 60% device scale: 768 × 480 PNGs of a 1280 × 800 layout. */
const SCALE = 0.6;

const BROWSERS = [
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
];

interface Shot {
  file: string;
  path: string;
  signedIn?: boolean;
  /** JS run after load (e.g. a click), then a pause before the capture. */
  script?: string;
  /** Scroll so the first heading containing this text is near the top. */
  scrollToText?: string;
}

/**
 * Checkout: sets the stay dates the way a user would (React listens to input events), then asks for
 * prices. The dates move with every run: an earlier run's quote still holds its unit for 10 minutes.
 */
function seePrices(checkin: string, checkout: string): string {
  return `(async () => {
    const set = (el, v) => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, v);
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    };
    const [inEl, outEl] = document.querySelectorAll('input[type="date"]');
    set(inEl, "${checkin}");
    set(outEl, "${checkout}");
    await new Promise((r) => setTimeout(r, 2500));
    [...document.querySelectorAll("button")].find((b) => b.textContent.includes("See prices"))?.click();
  })()`;
}

class Cdp {
  private id = 0;
  private readonly pending = new Map<number, (msg: { result?: unknown; error?: { message: string } }) => void>();

  private constructor(private readonly ws: WebSocket) {
    ws.addEventListener("message", (event) => {
      const msg = JSON.parse(String(event.data)) as { id?: number; result?: unknown; error?: { message: string } };
      if (msg.id !== undefined) this.pending.get(msg.id)?.(msg);
    });
  }

  static async connect(url: string): Promise<Cdp> {
    const ws = new WebSocket(url);
    await new Promise((ok, fail) => {
      ws.addEventListener("open", ok, { once: true });
      ws.addEventListener("error", fail, { once: true });
    });
    return new Cdp(ws);
  }

  send<T = Record<string, unknown>>(method: string, params: Record<string, unknown> = {}, sessionId?: string): Promise<T> {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    return new Promise((ok, fail) =>
      this.pending.set(id, (msg) => (msg.error ? fail(new Error(`${method}: ${msg.error.message}`)) : ok(msg.result as T))),
    );
  }

  close() {
    this.ws.close();
  }
}

async function launchBrowser(): Promise<{ cdp: Cdp; stop: () => void }> {
  const exe = BROWSERS.find((b) => existsSync(b));
  if (!exe) throw new Error("no Edge or Chrome found for headless screenshots");
  const profile = mkdtempSync(resolve(tmpdir(), "stumari-screens-"));
  const child = spawn(exe, ["--headless=new", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "--no-first-run", "about:blank"], {
    stdio: ["ignore", "ignore", "pipe"],
  });
  const wsUrl = await new Promise<string>((ok, fail) => {
    let err = "";
    child.stderr!.on("data", (chunk: Buffer) => {
      err += chunk.toString();
      const match = /DevTools listening on (ws:\/\/\S+)/.exec(err);
      if (match) ok(match[1]!);
    });
    child.once("exit", (code) => fail(new Error(`browser exited (${code}): ${err.slice(0, 500)}`)));
  });
  const cdp = await Cdp.connect(wsUrl);
  return {
    cdp,
    stop: () => {
      cdp.close();
      child.kill();
      setTimeout(() => rmSync(profile, { recursive: true, force: true }), 1_000).unref();
    },
  };
}

async function main() {
  const { values } = parseArgs({
    args: process.argv.slice(2).filter((a) => a !== "--"),
    options: { base: { type: "string", default: "http://localhost:3000" }, booking: { type: "string" } },
  });
  const base = values.base.replace(/\/+$/, "");
  const env = loadEnv();
  const admin = new Http(base, "admin");
  const me = await signIn(admin, (await loadOperator(env)).signer);
  if (!me.is_admin) throw new Error("the operator is not in ADMIN_WALLETS");
  const session = admin.cookie("stumari_session")!;
  const hotels = await admin.ok<{ id: string; slug: string }[]>("GET", "/api/admin/hotels");
  const demo = hotels.find((h) => h.slug === "stumari-demo");
  if (!demo) throw new Error("stumari-demo not found: run the bootstrap first");

  const today = localDate(Math.floor(Date.now() / 1000), "Asia/Tbilisi");
  const checkin = addDays(today, 40 + Math.floor(Math.random() * 60));
  const shots: Shot[] = [
    { file: "01-landing-en.png", path: "/" },
    { file: "02-landing-ka.png", path: "/ka" },
    { file: "03-landing-ru.png", path: "/ru" },
    { file: "04-apply.png", path: "/apply" },
    { file: "05-checkout-menu.png", path: "/h/stumari-demo", script: seePrices(checkin, addDays(checkin, 2)), scrollToText: "Choose your cancellation terms" },
    ...(values.booking ? [{ file: "06-booking.png", path: `/b/${values.booking}` }] : []),
    { file: "07-model.png", path: "/model", scrollToText: "Calibration" },
    { file: "08-admin.png", path: "/admin", signedIn: true },
    { file: "09-dashboard.png", path: `/dashboard/${demo.id}`, signedIn: true },
  ];

  mkdirSync(OUT_DIR, { recursive: true });
  const browser = await launchBrowser();
  try {
    const { cdp } = browser;
    const { targetId } = await cdp.send<{ targetId: string }>("Target.createTarget", { url: "about:blank" });
    const { sessionId } = await cdp.send<{ sessionId: string }>("Target.attachToTarget", { targetId, flatten: true });
    const page = (method: string, params: Record<string, unknown> = {}) => cdp.send(method, params, sessionId);
    await page("Page.enable");
    await page("Emulation.setDeviceMetricsOverride", { ...VIEWPORT, deviceScaleFactor: SCALE, mobile: false });

    for (const shot of shots) {
      const url = new URL(shot.path, base);
      if (shot.signedIn) await page("Network.setCookie", { name: "stumari_session", value: session, url: base });
      else await page("Network.deleteCookies", { name: "stumari_session", url: base });
      await page("Page.navigate", { url: url.toString() });
      await sleep(4_000);
      if (shot.script) {
        await page("Runtime.evaluate", { expression: shot.script, awaitPromise: true });
        await sleep(6_000);
      }
      if (shot.scrollToText) {
        const text = JSON.stringify(shot.scrollToText);
        await page("Runtime.evaluate", {
          // "instant": a smooth scroll never finishes in a background headless tab.
          expression: `{ const h = [...document.querySelectorAll("h2, h3")].find((e) => e.textContent.includes(${text})); if (h) window.scrollTo({ top: h.getBoundingClientRect().top + window.scrollY - 24, behavior: "instant" }); }`,
        });
        await sleep(800);
      }
      const { data } = (await page("Page.captureScreenshot", { format: "png" })) as { data: string };
      writeFileSync(resolve(OUT_DIR, shot.file), Buffer.from(data, "base64"));
      console.log(`${shot.file}  ${url.pathname}`);
    }
  } finally {
    browser.stop();
  }
}

main().catch((error: unknown) => {
  console.error(`screens failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
