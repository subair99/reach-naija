// Reach Naija demo server: one process serves the API, the webhooks and the web pages.
import { createServer } from "node:http";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { ROOT, checkConfig, config } from "./config.ts";
import { HttpError, json, match, readBody } from "./lib/http.ts";
import type { Req } from "./lib/http.ts";
import { log } from "./lib/log.ts";
import { NipostError } from "./nipost/index.ts";
import { store } from "./store/index.ts";
import { ensureKeys } from "./arrival/sign.ts";

// Route modules register themselves on import.
import "./cards/routes.ts";
import "./checkout/routes.ts";
import "./arrival/routes.ts";
import "./channels/whatsapp/webhook.ts";
import "./channels/ussd/handler.ts";
import "./find/routes.ts";
import { route } from "./lib/http.ts";
import { dryRun } from "./channels/whatsapp/send.ts";

const WEB = path.join(ROOT, "web");
const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon", ".json": "application/json",
};

// Settings the web pages need. Only the publishable key ever goes to the browser.
route("GET", "/api/config", (_req, res) => json(res, 200, {
  mock: config.nipost.mode === "mock",
  publicUrl: config.publicUrl,
  whatsappDryRun: dryRun,
  geocoder: config.geocoder.mode,
  map: config.map,
  widget: config.nipost.publishableKey && config.nipost.widgetScriptUrl
    ? { key: config.nipost.publishableKey, scriptUrl: config.nipost.widgetScriptUrl, environment: config.nipost.widgetEnvironment }
    : null,
}));

// Coordinates for the rider page's "Simulated location" switch.
route("GET", "/api/demo/locations", (_req, res) => {
  const data = JSON.parse(readFileSync(path.join(ROOT, "fixtures/demo-locations.json"), "utf8"));
  json(res, 200, { locations: data.locations.map(({ id, label, postcode, lat, lng }: any) => ({ id, label, postcode, lat, lng })) });
});

route("GET", "/healthz", (_req, res) => json(res, 200, { ok: true, nipost: config.nipost.mode, store: config.store }));

function serveStatic(pathname: string, res: import("node:http").ServerResponse): boolean {
  const rel = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const file = path.normalize(path.join(WEB, rel));
  if (!file.startsWith(WEB + path.sep) && file !== path.join(WEB, "index.html")) return false;
  let target = file;
  if (existsSync(target) && statSync(target).isDirectory()) target = path.join(target, "index.html");
  if (!existsSync(target) || !statSync(target).isFile()) return false;
  res.writeHead(200, { "Content-Type": MIME[path.extname(target)] ?? "application/octet-stream", "Cache-Control": "no-cache" });
  res.end(readFileSync(target));
  return true;
}

const server = createServer(async (rawReq, res) => {
  const req = rawReq as Req;
  const url = new URL(req.url ?? "/", "http://localhost");
  req.query = url.searchParams;
  try {
    const found = match(req.method ?? "GET", url.pathname);
    if (found) {
      req.params = found.params;
      req.body = req.method === "POST" ? await readBody(req) : {};
      await found.handler(req, res);
      return;
    }
    if (req.method === "GET" && serveStatic(url.pathname, res)) return;
    json(res, 404, { error: { code: "not_found", message: `Nothing at ${url.pathname}` } });
  } catch (e) {
    if (res.headersSent) return;
    if (e instanceof HttpError) return json(res, e.status, { error: { code: e.code, message: e.message } });
    if (e instanceof NipostError) {
      log.warn("nipost_error", { status: e.status, code: e.code });
      return json(res, 502, { error: { code: `nipost_${e.code}`, message: `NIPOST returned an error: ${e.message}` } });
    }
    log.error("unhandled", { path: url.pathname, error: (e as Error).message });
    json(res, 500, { error: { code: "server_error", message: "Something went wrong on the server. Check the logs." } });
  }
});

async function main() {
  const warnings = checkConfig();
  await store.init();
  ensureKeys();
  server.listen(config.port, () => {
    const lines = [
      "",
      "  Reach Naija demo server",
      `  Local:      http://localhost:${config.port}`,
      `  Public URL: ${config.publicUrl}`,
      `  NIPOST:     ${config.nipost.mode === "mock" ? "MOCK (fixtures, not real data)" : `live → ${config.nipost.baseUrl} (max level ${config.nipost.maxLevel})`}`,
      `  Store:      ${config.store}`,
      `  Geocoder:   ${config.geocoder.mode === "mock" ? "MOCK (fixtures)" : config.geocoder.url}`,
      `  WhatsApp:   ${dryRun ? "dry run (see /api/dev/outbox)" : "live"}`,
      ...warnings.map((w) => `  ! ${w}`),
      "",
    ];
    console.log(lines.join("\n"));
  });
}

main().catch((e) => { console.error(`Startup failed: ${(e as Error).message}`); process.exit(1); });
