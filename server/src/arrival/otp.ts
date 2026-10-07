// One-time codes the recipient gives the provider at hand-over. Only a keyed hash is stored.
import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { config } from "../config.ts";

export const OTP_TTL_MS = 2 * 60 * 60 * 1000;   // 2 hours
export const OTP_MAX_ATTEMPTS = 5;

export function newOtp(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export function hashOtp(arrivalId: string, otp: string): string {
  return createHmac("sha256", config.hashSecret).update(`otp:${arrivalId}:${otp}`).digest("hex");
}

export function otpMatches(arrivalId: string, otp: string, storedHash: string): boolean {
  const a = Buffer.from(hashOtp(arrivalId, otp.trim()));
  const b = Buffer.from(storedHash);
  return a.length === b.length && timingSafeEqual(a, b);
}
