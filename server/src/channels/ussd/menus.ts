// Segment-by-segment postcode menus fed by NIPOST autocomplete, so nobody types an 11-character code blind.
import { readFileSync } from "node:fs";
import path from "node:path";
import { ROOT } from "../../config.ts";
import { compact } from "../../lib/postcode.ts";
import { nipost } from "../../nipost/index.ts";

export const SEGMENTS = [
  { name: "state", label: "state", start: 0, end: 2 },
  { name: "lga", label: "LGA", start: 2, end: 4 },
  { name: "district", label: "district", start: 4, end: 7 },
  { name: "area", label: "area", start: 7, end: 9 },
  { name: "unit", label: "building", start: 9, end: 11 },
] as const;

export const PAGE_SIZE = 7;

// Fallback state list (from NIPOST's published test postcodes) if autocomplete needs a non-empty query.
const fallbackStates: { code: string; label: string }[] = (() => {
  const list: { postcode: string; state: string }[] =
    JSON.parse(readFileSync(path.join(ROOT, "fixtures/test-postcodes.json"), "utf8")).postcodes;
  const seen = new Map<string, string>();
  for (const p of list) seen.set(compact(p.postcode).slice(0, 2), p.state);
  return [...seen].map(([code, label]) => ({ code, label })).sort((a, b) => a.label.localeCompare(b.label));
})();

// The autocomplete query is the chosen segments so far, space-separated, e.g. "LA 11 ".
// Check on staging that a trailing space makes NIPOST suggest the NEXT segment.
export async function options(chosen: string[]): Promise<{ code: string; label: string }[]> {
  const level = chosen.length;
  const seg = SEGMENTS[level];
  const q = chosen.length ? chosen.join(" ") + " " : "";
  let suggestions: { code: string; label: string }[] = [];
  try {
    suggestions = (await nipost.autocomplete(q)).suggestions ?? [];
  } catch {
    suggestions = [];
  }
  if (!suggestions.length && level === 0) return fallbackStates;

  // Suggestions may carry the segment code alone ("11") or the whole prefix ("LA 11"); keep the segment.
  const prefix = chosen.join("");
  const width = seg.end - seg.start;
  const out = new Map<string, string>();
  for (const s of suggestions) {
    const c = compact(s.code);
    const code = c.length > width && c.startsWith(prefix) ? c.slice(seg.start, seg.end) : c.slice(0, width);
    if (code.length === width && !out.has(code)) out.set(code, s.label || code);
  }
  return [...out].map(([code, label]) => ({ code, label }));
}
