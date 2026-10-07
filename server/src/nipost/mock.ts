// A stand-in for the NIPOST API, so the demo runs before staging keys arrive.
// Everything it returns is built from fixtures/ and is clearly marked as mock data.
// It mimics the documented shapes, not NIPOST's real data or exact grading rules.
import { readFileSync } from "node:fs";
import path from "node:path";
import { ROOT, config } from "../config.ts";
import { compact, display, formatted, parse } from "../lib/postcode.ts";
import { NipostError } from "./types.ts";
import type { AutocompleteResult, LookupResult, NearbyUnit, NipostApi, ReverseResult } from "./types.ts";

type Loc = {
  postcode: string; lat: number; lng: number;
  mock: { state_name: string; lga_name: string; locality_name: string; zone: string;
          recent_house_address: string; building_use_status: string };
};

const locations: Loc[] = JSON.parse(readFileSync(path.join(ROOT, "fixtures/demo-locations.json"), "utf8")).locations;
const testCodes: { postcode: string; state: string }[] =
  JSON.parse(readFileSync(path.join(ROOT, "fixtures/test-postcodes.json"), "utf8")).postcodes;

const known = new Set([...testCodes.map((t) => compact(t.postcode)), ...locations.map((l) => compact(l.postcode))]);
const stateNames = new Map(testCodes.map((t) => [compact(t.postcode).slice(0, 2), t.state]));

function metres(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6_371_000, rad = Math.PI / 180;
  const dLat = (bLat - aLat) * rad, dLng = (bLng - aLng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function grade(distance: number): string {
  if (distance <= 15) return "high";
  if (distance <= 50) return "medium";
  return "low";
}

function byDistance(lat: number, lng: number) {
  return locations
    .map((l) => ({ l, d: metres(lat, lng, l.lat, l.lng) }))
    .sort((a, b) => a.d - b.d);
}

const SEGMENTS: [string, number][] = [["state", 2], ["lga", 4], ["district", 7], ["area", 9], ["unit", 11]];

export const mockNipost: NipostApi = {
  async reverse(lat, lng, maxDistanceM = 25): Promise<ReverseResult> {
    const radius = Math.min(250, Math.max(0, maxDistanceM));
    const best = byDistance(lat, lng)[0];
    if (!best || best.d > radius) {
      return { found: false, message: "No active unit within range (mock).", radius_m: radius };
    }
    const seg = parse(best.l.postcode)!;
    const names = config.nipost.maxLevel >= 2
      ? { state_name: best.l.mock.state_name, lga_name: best.l.mock.lga_name,
          locality_name: best.l.mock.locality_name, address: best.l.mock.recent_house_address }
      : {};
    return {
      found: true,
      unit: { postcode: formatted(seg), display: display(seg), distance_m: Math.round(best.d),
              confidence: grade(best.d), ...names },
      area: formatted(seg).slice(0, 12), district: formatted(seg).slice(0, 9), state: seg.state,
      radius_m: radius,
    };
  },

  async nearby(lat, lng, radius = 300): Promise<NearbyUnit[]> {
    return byDistance(lat, lng)
      .filter((x) => x.d <= radius)
      .map((x) => {
        const seg = parse(x.l.postcode)!;
        return { postcode: formatted(seg), display: display(seg), distance_m: Math.round(x.d) };
      });
  },

  async autocomplete(q): Promise<AutocompleteResult> {
    const prefix = compact(q);
    const idx = SEGMENTS.findIndex(([, end]) => prefix.length < end);
    if (idx === -1) return { segment: "unit", suggestions: [] };
    const [segment, end] = SEGMENTS[idx];
    const start = idx === 0 ? 0 : SEGMENTS[idx - 1][1];
    const codes = new Set<string>();
    for (const c of known) if (c.startsWith(prefix.slice(0, start))) codes.add(c.slice(start, end));
    const suggestions = [...codes]
      .filter((code) => code.startsWith(prefix.slice(start)))
      .sort()
      .map((code) => ({ code, label: segment === "state" ? stateNames.get(code) ?? code : code }));
    return { segment, suggestions };
  },

  async lookup(code, level): Promise<LookupResult> {
    const seg = parse(code);
    if (!seg) throw new NipostError(400, "invalid_postcode", "Postcode is not well formed (mock).");
    const loc = locations.find((l) => compact(l.postcode) === compact(code));
    const result: LookupResult = { postcode: formatted(seg), valid: known.has(compact(code)) };
    if (!result.valid) return result;
    const lvl = Math.min(level, config.nipost.maxLevel);
    result.administrative_address = {
      state_name: loc?.mock.state_name ?? (stateNames.get(seg.state) ?? "").toUpperCase(),
      ...(lvl >= 2 ? { lga_name: loc?.mock.lga_name ?? "MOCK LGA", locality_name: loc?.mock.locality_name ?? "MOCK LOCALITY" } : {}),
      zone: loc?.mock.zone,
    };
    if (lvl >= 2) result.recent_house_address = { recent: loc?.mock.recent_house_address ?? "MOCK ADDRESS (replace with staging data)" };
    if (lvl >= 3) result.building_use_status = loc?.mock.building_use_status ?? "residential";
    return result;
  },

  async assemble(s) {
    const seg = parse(
      s.state.padStart(2, "0") + s.lga.padStart(2, "0") + s.district.padStart(3, "0") + s.area.padStart(2, "0") + s.unit.padStart(2, "0"),
    );
    if (!seg) throw new NipostError(400, "invalid_segments", "Segments do not form a valid postcode (mock).");
    return { postcode: formatted(seg), display: display(seg), compact: compact(formatted(seg)) };
  },

  async disassemble(code) {
    const seg = parse(code);
    if (!seg) throw new NipostError(400, "invalid_postcode", "Postcode is not well formed (mock).");
    return { postcode: formatted(seg), display: display(seg), compact: compact(code), segments: { ...seg } };
  },
};
