// Search endpoints: reverse geocode, nearby units, segment-aware autocomplete.
import { nipostRequest } from "./client.ts";
import type { AutocompleteResult, NearbyUnit, ReverseResult } from "./types.ts";

export function reverse(lat: number, lng: number, maxDistanceM = 25): Promise<ReverseResult> {
  // NIPOST clamps max_distance_m to 250; we never ask for more.
  return nipostRequest("GET", "/v1/search/reverse", {
    query: { lat, lng, max_distance_m: Math.min(250, Math.max(0, maxDistanceM)) },
  });
}

export async function nearby(lat: number, lng: number, radius = 300): Promise<NearbyUnit[]> {
  const data: any = await nipostRequest("GET", "/v1/search/nearby", { query: { lat, lng, radius } });
  // The reference documents this as "units with distances" without a full schema,
  // so accept the likely shapes.
  const list: any[] = Array.isArray(data) ? data : data?.units ?? data?.results ?? data?.items ?? [];
  return list
    .map((u) => ({
      postcode: u.postcode ?? u.code ?? "",
      display: u.display ?? (u.postcode ?? "").replace(/-/g, " "),
      distance_m: Number(u.distance_m ?? u.distance ?? NaN),
    }))
    .filter((u) => u.postcode)
    .sort((a, b) => a.distance_m - b.distance_m);
}

export function autocomplete(q: string): Promise<AutocompleteResult> {
  return nipostRequest("GET", "/v1/search/autocomplete", { query: { q } });
}
