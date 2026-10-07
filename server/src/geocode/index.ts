// Address text → candidate map positions. The result is only a starting point: the user always
// drags the pin onto their actual building before anything is sent to NIPOST, because geocoders
// often land mid-street or on the wrong street for Nigerian addresses.
import { readFileSync } from "node:fs";
import path from "node:path";
import { ROOT, config } from "../config.ts";
import { log } from "../lib/log.ts";

export type Place = { label: string; lat: number; lng: number; kind: string; precision: "building" | "street" | "area" };

// ---------- Mock: fixtures only ----------
type Fixture = { label: string; address: string; lat: number; lng: number };
const fixtures: Fixture[] = JSON.parse(readFileSync(path.join(ROOT, "fixtures/demo-locations.json"), "utf8")).locations;

function mockSearch(q: string): Place[] {
  const words = q.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 3);
  return fixtures
    .map((f) => ({ f, score: words.filter((w) => f.address.toLowerCase().includes(w)).length }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map(({ f }) => ({ label: `${f.address} (mock)`, lat: f.lat, lng: f.lng, kind: "mock", precision: "building" as const }));
}

// ---------- Nominatim (public demo server or your own copy) ----------
// Public server policy: at most 1 request per second, an identifying User-Agent, no search-as-you-type.
let nextSlot = 0;
async function throttle() {
  const wait = Math.max(0, nextSlot - Date.now());
  nextSlot = Math.max(Date.now(), nextSlot) + 1100;
  if (wait) await new Promise((r) => setTimeout(r, wait));
}

function precisionOf(type: string, cls: string): Place["precision"] {
  if (["house", "building", "residential"].includes(type) || cls === "building" || cls === "amenity" || cls === "shop") return "building";
  if (cls === "highway") return "street";
  return "area";
}

async function nominatimSearch(q: string): Promise<Place[]> {
  await throttle();
  const url = new URL(config.geocoder.url + "/search");
  url.search = new URLSearchParams({
    q, format: "jsonv2", countrycodes: "ng", limit: "5", addressdetails: "0",
    ...(config.geocoder.email ? { email: config.geocoder.email } : {}),
  }).toString();
  const res = await fetch(url, {
    headers: { "User-Agent": config.geocoder.userAgent || "ReachNaija-demo/0.1", "Accept-Language": "en" },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Geocoder returned ${res.status}`);
  const rows: any[] = await res.json();
  return rows.map((r) => ({
    label: String(r.display_name), lat: Number(r.lat), lng: Number(r.lon),
    kind: `${r.category ?? r.class}:${r.type}`, precision: precisionOf(String(r.type), String(r.category ?? r.class)),
  }));
}

// Short in-memory cache. Typed addresses are personal data: never logged, kept 10 minutes at most.
const cache = new Map<string, { at: number; places: Place[] }>();

export async function geocode(query: string): Promise<Place[]> {
  const q = query.trim().replace(/\s+/g, " ").slice(0, 200);
  if (q.length < 3) return [];
  const key = q.toLowerCase();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 10 * 60_000) return hit.places;
  const started = Date.now();
  const places = config.geocoder.mode === "mock" ? mockSearch(q) : await nominatimSearch(q);
  log.info("geocode", { mode: config.geocoder.mode, results: places.length, ms: Date.now() - started });
  if (cache.size > 500) cache.clear();
  cache.set(key, { at: Date.now(), places });
  return places;
}
