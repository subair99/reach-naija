// Graded lookup. Level 1 is free; levels 2-3 need a key with the lookup scope and consume credits.
// We never request levels 4-5 (building-owner info, point geometry): the card identifies a building, not a person.
import { config } from "../config.ts";
import { nipostRequest } from "./client.ts";
import type { LookupResult } from "./types.ts";

export function lookup(code: string, level: 1 | 2 | 3): Promise<LookupResult> {
  const capped = Math.min(level, config.nipost.maxLevel);
  return nipostRequest("GET", "/v1/lookup", { query: { code, level: capped } });
}
