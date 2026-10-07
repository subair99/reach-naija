// Turns a location pin or a typed code into a verified Address Card.
import { randomBytes, createHash } from "node:crypto";
import { config } from "../config.ts";
import { compact, display, formatted, parse } from "../lib/postcode.ts";
import { isMock, nipost } from "../nipost/index.ts";
import type { NearbyUnit, ReverseUnit } from "../nipost/index.ts";
import { store } from "../store/index.ts";
import type { Card, CardConfidence, CardMode } from "../store/index.ts";

export type Resolution =
  | { status: "high"; unit: ReverseUnit }
  | { status: "confirm"; candidates: NearbyUnit[] }
  | { status: "none"; radiusM: number };

// Pin → postcode. Never a silent wrong answer: anything below HIGH becomes a pick-from-nearby.
export async function resolvePin(lat: number, lng: number): Promise<Resolution> {
  const rev = await nipost.reverse(lat, lng, 25);
  if (rev.found && rev.unit && rev.unit.confidence === "high") {
    return { status: "high", unit: rev.unit };
  }
  const near = (await nipost.nearby(lat, lng, 300)).slice(0, 3);
  if (near.length > 0) return { status: "confirm", candidates: near };
  return { status: "none", radiusM: 300 };
}

const id = () => randomBytes(9).toString("base64url");   // 12 chars, unguessable enough for a demo link
export const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");

export async function buildCard(input: {
  code: string;
  confidence: CardConfidence;
  distanceM?: number | null;
  source: Card["source"];
  ownerHash?: string | null;
  note?: string | null;
  mode?: CardMode;
  expiresInHours?: number;
  withManageToken?: boolean;
}): Promise<{ card: Card; manageToken?: string }> {
  const seg = parse(input.code);
  if (!seg) throw new Error(`Not a well-formed postcode: ${input.code}`);

  // L2-L3 adds names, recent house address and building use when the key allows it.
  const level = Math.min(3, config.nipost.maxLevel) as 1 | 2 | 3;
  const info = await nipost.lookup(formatted(seg), level);
  if (!info.valid) throw new Error(`NIPOST does not recognise ${display(seg)} as an active postcode.`);

  const now = new Date();
  const manageToken = input.withManageToken ? randomBytes(18).toString("base64url") : undefined;
  const card: Card = {
    id: id(),
    version: 1,
    postcode: compact(formatted(seg)),
    formatted: formatted(seg),
    display: display(seg),
    segments: seg,
    names: {
      state: info.administrative_address?.state_name,
      lga: info.administrative_address?.lga_name,
      locality: info.administrative_address?.locality_name,
      zone: info.administrative_address?.zone,
    },
    address: info.recent_house_address?.recent ?? null,
    buildingUse: info.building_use_status ?? null,
    confidence: input.confidence,
    distanceM: input.distanceM ?? null,
    note: input.note?.trim() ? input.note.trim().slice(0, 280) : null,
    mode: input.mode ?? "deliver",
    source: input.source,
    ownerHash: input.ownerHash ?? null,
    manageTokenHash: manageToken ? hashToken(manageToken) : null,
    mock: isMock,
    createdAt: now.toISOString(),
    expiresAt: input.expiresInHours ? new Date(now.getTime() + input.expiresInHours * 3_600_000).toISOString() : null,
    revokedAt: null,
  };
  await store.cards.create(card);
  if (card.ownerHash) await store.saved.add(card.ownerHash, card.formatted, card.id);
  return { card, manageToken };
}

// A Help card is a short-lived copy of the user's card, so the everyday card link never
// exposes emergency context and the Help link stops working after the incident.
export async function helpCardFrom(card: Card, hours = 12): Promise<Card> {
  const { card: help } = await buildCard({
    code: card.formatted, confidence: card.confidence, distanceM: card.distanceM,
    source: card.source, ownerHash: card.ownerHash, note: card.note, mode: "help", expiresInHours: hours,
  });
  return help;
}

export type CardState = { ok: true; card: Card } | { ok: false; reason: "not_found" | "revoked" | "expired" };

export async function liveCard(cardId: string): Promise<CardState> {
  const card = await store.cards.get(cardId);
  if (!card) return { ok: false, reason: "not_found" };
  if (card.revokedAt) return { ok: false, reason: "revoked" };
  if (card.expiresAt && new Date(card.expiresAt) < new Date()) return { ok: false, reason: "expired" };
  return { ok: true, card };
}
