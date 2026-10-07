// Shapes taken from the NIPOST Postcode API reference. Fields we have not seen documented
// are optional and read defensively.

export type Confidence = "high" | "medium" | "low" | string;

export type ReverseUnit = {
  postcode: string;          // "EK-01-A03-FK-01"
  display: string;           // "EK 01 A03 FK 01"
  distance_m: number;
  confidence: Confidence;
  state_name?: string;       // only for keys granted lookup level 2+
  lga_name?: string;
  locality_name?: string;
  address?: string;
};

export type ReverseResult = {
  found: boolean;
  unit?: ReverseUnit;
  area?: string;
  district?: string;
  state?: string;
  message?: string;
  radius_m?: number;
};

export type NearbyUnit = { postcode: string; display: string; distance_m: number };

export type AutocompleteResult = {
  segment: string;
  suggestions: { code: string; label: string }[];
};

export type LookupResult = {
  postcode: string;
  valid: boolean;
  administrative_address?: {
    state_name?: string; lga_name?: string; locality_name?: string; zone?: string;
  };
  recent_house_address?: { recent?: string };
  building_use_status?: string;
};

export type AssembleResult = { postcode: string; display: string; compact: string };

export interface NipostApi {
  reverse(lat: number, lng: number, maxDistanceM?: number): Promise<ReverseResult>;
  nearby(lat: number, lng: number, radius?: number): Promise<NearbyUnit[]>;
  autocomplete(q: string): Promise<AutocompleteResult>;
  lookup(code: string, level: 1 | 2 | 3): Promise<LookupResult>;
  assemble(seg: { state: string; lga: string; district: string; area: string; unit: string }): Promise<AssembleResult>;
  disassemble(code: string): Promise<AssembleResult & { segments?: Record<string, string> }>;
}

export class NipostError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}
