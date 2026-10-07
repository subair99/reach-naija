// Verified Arrival: two signals must agree before a record is signed —
// (1) provider GPS resolves to the destination unit, (2) the recipient's one-time code.
import { randomBytes } from "node:crypto";
import { hashId } from "../lib/hash.ts";
import { display, formatted, parse } from "../lib/postcode.ts";
import { nipost } from "../nipost/index.ts";
import { store } from "../store/index.ts";
import type { Arrival } from "../store/index.ts";
import { OTP_MAX_ATTEMPTS, OTP_TTL_MS, hashOtp, newOtp, otpMatches } from "./otp.ts";
import { signRecord } from "./sign.ts";
import { checkPosition } from "./verify.ts";

export class ArrivalError extends Error {
  status: number; code: string;
  constructor(status: number, code: string, message: string) { super(message); this.status = status; this.code = code; }
}

export function publicArrival(a: Arrival) {
  const { otpHash: _h, otpAttempts: _n, ...rest } = a;
  return rest;
}

export async function startArrival(input: {
  postcode: string; item?: string | null; serviceType?: Arrival["serviceType"]; orderRef?: string;
}): Promise<{ arrival: Arrival; otp: string }> {
  const seg = parse(input.postcode);
  if (!seg) throw new ArrivalError(400, "invalid_postcode", "Enter all 11 characters of the postcode, e.g. LA 11 W06 TC 10.");
  const l1 = await nipost.lookup(formatted(seg), 1);
  if (!l1.valid) throw new ArrivalError(400, "unknown_postcode", `${display(seg)} is not an active NIPOST postcode.`);

  const id = randomBytes(8).toString("base64url");
  const otp = newOtp();
  const now = new Date();
  const arrival: Arrival = {
    id,
    orderRef: input.orderRef ?? `RN-${now.getTime().toString(36).toUpperCase().slice(-6)}`,
    item: input.item ?? null,
    postcode: formatted(seg),
    display: display(seg),
    serviceType: input.serviceType ?? "delivery",
    providerHash: null,
    status: "open",
    otpHash: hashOtp(id, otp),
    otpExpiresAt: new Date(now.getTime() + OTP_TTL_MS).toISOString(),
    otpAttempts: 0,
    gps: null,
    signed: null,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
  await store.arrivals.create(arrival);
  return { arrival, otp };
}

export async function reportPosition(id: string, input: { lat: number; lng: number; simulated: boolean; providerId: string }) {
  const a = await store.arrivals.get(id);
  if (!a) throw new ArrivalError(404, "not_found", "No delivery with that id.");
  if (a.status === "verified") throw new ArrivalError(409, "already_verified", "This delivery is already verified.");
  const gps = await checkPosition(a.postcode, input.lat, input.lng, input.simulated);
  return (await store.arrivals.update(id, {
    gps,
    providerHash: hashId("provider", input.providerId || "demo-rider"),
    status: gps.matched ? "at_location" : "open",
  }))!;
}

export async function confirmHandover(id: string, otp: string) {
  const a = await store.arrivals.get(id);
  if (!a) throw new ArrivalError(404, "not_found", "No delivery with that id.");
  if (a.status === "verified") throw new ArrivalError(409, "already_verified", "This delivery is already verified.");
  if (!a.gps?.matched) throw new ArrivalError(409, "not_at_location", "Check in at the building first: your location must match the delivery postcode.");
  if (new Date(a.otpExpiresAt) < new Date()) throw new ArrivalError(410, "code_expired", "The customer's code has expired. Ask the merchant to reissue the delivery.");
  if (a.otpAttempts >= OTP_MAX_ATTEMPTS) throw new ArrivalError(429, "too_many_attempts", "Too many wrong codes. This delivery is locked; contact the merchant.");

  if (!otpMatches(a.id, otp, a.otpHash)) {
    const updated = await store.arrivals.update(id, { otpAttempts: a.otpAttempts + 1, status: a.otpAttempts + 1 >= OTP_MAX_ATTEMPTS ? "failed" : a.status });
    throw new ArrivalError(400, "wrong_code", `That code is not right. ${OTP_MAX_ATTEMPTS - updated!.otpAttempts} attempts left.`);
  }

  const record = {
    arrival_id: a.id,
    postcode: a.postcode,
    time: new Date().toISOString(),
    confidence: a.gps.confidence,
    service_type: a.serviceType,
    hashed_provider_id: a.providerHash,
    recipient_confirmed: true,
    gps_distance_m: a.gps.distanceM,
    gps_simulated: a.gps.simulated,   // a simulated check is marked in the signed record, permanently
  };
  return (await store.arrivals.update(id, { status: "verified", signed: signRecord(record) }))!;
}
