// Public card view. Extends NIPOST's PostcodeSelection (version 1) wire shape, so anything
// built for the widget can read a Reach Naija card: same postcode, formatted, segments, names
// and address fields, plus confidence, mode, note and expiry.
import { cardUrl } from "../lib/qr.ts";
import type { Card } from "../store/types.ts";

export function publicCard(card: Card) {
  return {
    version: 1 as const,
    postcode: card.postcode,
    formatted: card.formatted,
    segments: card.segments,
    names: { state: card.names.state, lga: card.names.lga },
    address: card.address,
    // Reach Naija extension fields
    id: card.id,
    url: cardUrl(card.id),
    confidence: card.confidence,
    distance_m: card.distanceM,
    mode: card.mode,
    note: card.note,
    building_use: card.buildingUse,
    locality: card.names.locality ?? null,
    expires_at: card.expiresAt,
    created_at: card.createdAt,
    source: card.source,
    mock: card.mock,
  };
}
