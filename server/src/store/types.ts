// Storage interface shared by the in-memory store (default) and PostgreSQL.

export type CardMode = "deliver" | "help" | "register";
// high: NIPOST reverse geocode returned confidence "high".
// confirmed: the occupant picked their building from nearby units.
// selected: the user stepped through the segments by hand (USSD) or typed the code.
export type CardConfidence = "high" | "confirmed" | "selected";

// Extends NIPOST's PostcodeSelection (version 1) wire shape: postcode, formatted, segments,
// names, address, plus Reach Naija fields (confidence, mode, note, expiry).
export type Card = {
  id: string;
  version: 1;
  postcode: string;                 // compact, e.g. "LA11W06TC10"
  formatted: string;                // "LA-11-W06-TC-10"
  display: string;                  // "LA 11 W06 TC 10"
  segments: { state: string; lga: string; district: string; area: string; unit: string };
  names: { state?: string; lga?: string; locality?: string; zone?: string };
  address: string | null;           // NIPOST recent_house_address, exactly as returned
  buildingUse: string | null;       // NIPOST building_use_status (L3)
  confidence: CardConfidence;
  distanceM: number | null;
  note: string | null;              // the occupant's own note, always labelled as theirs
  mode: CardMode;
  source: "whatsapp" | "ussd" | "web";
  ownerHash: string | null;
  manageTokenHash: string | null;   // lets the creator revoke a web-created card
  mock: boolean;                    // true when built from the mock NIPOST
  createdAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
};

export type ArrivalStatus = "open" | "at_location" | "verified" | "failed";

export type GpsCheck = {
  matched: boolean;
  resolvedPostcode: string | null;
  distanceM: number | null;
  confidence: string | null;
  simulated: boolean;
  checkedAt: string;
};

export type SignedRecord = {
  record: Record<string, unknown>;
  signature: string;   // base64 Ed25519 over the canonical JSON of `record`
  alg: "Ed25519";
  keyId: string;
};

export type Arrival = {
  id: string;
  orderRef: string;
  item: string | null;
  postcode: string;                 // destination, formatted
  display: string;
  serviceType: "delivery" | "health_visit" | "input_drop";
  providerHash: string | null;
  status: ArrivalStatus;
  otpHash: string;
  otpExpiresAt: string;
  otpAttempts: number;
  gps: GpsCheck | null;
  signed: SignedRecord | null;
  createdAt: string;
  updatedAt: string;
};

export interface Store {
  init(): Promise<void>;
  cards: {
    create(card: Card): Promise<Card>;
    get(id: string): Promise<Card | null>;
    update(id: string, patch: Partial<Card>): Promise<Card | null>;
    // Latest everyday card (Help cards excluded), not revoked.
    latestForOwner(ownerHash: string): Promise<Card | null>;
  };
  saved: {
    add(ownerHash: string, formatted: string, cardId: string): Promise<void>;
    list(ownerHash: string): Promise<{ postcode: string; cardId: string; savedAt: string }[]>;
  };
  prefs: {
    getLang(ownerHash: string): Promise<string | null>;
    setLang(ownerHash: string, lang: string): Promise<void>;
  };
  arrivals: {
    create(a: Arrival): Promise<Arrival>;
    get(id: string): Promise<Arrival | null>;
    update(id: string, patch: Partial<Arrival>): Promise<Arrival | null>;
    list(status?: ArrivalStatus): Promise<Arrival[]>;
  };
}
