// Signal one of Verified Arrival: does the provider's GPS resolve to the destination building?
// Matched only when NIPOST's nearest unit to the provider IS the destination unit.
import { sameCode } from "../lib/postcode.ts";
import { nipost } from "../nipost/index.ts";
import type { GpsCheck } from "../store/types.ts";

// 50 m allows for normal phone GPS error at a gate; the unit must still be the nearest one.
const MATCH_RADIUS_M = 50;

export async function checkPosition(destination: string, lat: number, lng: number, simulated: boolean): Promise<GpsCheck> {
  const r = await nipost.reverse(lat, lng, MATCH_RADIUS_M);
  const resolved = r.found && r.unit ? r.unit.postcode : null;
  return {
    matched: !!resolved && sameCode(resolved, destination),
    resolvedPostcode: resolved,
    distanceM: r.unit?.distance_m ?? null,
    confidence: r.unit?.confidence ?? null,
    simulated,
    checkedAt: new Date().toISOString(),
  };
}
