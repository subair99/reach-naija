// Ed25519 signing of Verified Arrival records. In the demo the key pair lives in keys/;
// in production the private key moves into the HSMs described in the hosting design.
import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, sign, verify } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { ROOT } from "../config.ts";
import { log } from "../lib/log.ts";
import type { SignedRecord } from "../store/types.ts";

const DIR = path.join(ROOT, "keys");
const PRIV = path.join(DIR, "ed25519-private.pem");
const PUB = path.join(DIR, "ed25519-public.pem");

export function ensureKeys(): void {
  if (existsSync(PRIV) && existsSync(PUB)) return;
  mkdirSync(DIR, { recursive: true });
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  writeFileSync(PRIV, privateKey.export({ type: "pkcs8", format: "pem" }), { mode: 0o600 });
  writeFileSync(PUB, publicKey.export({ type: "spki", format: "pem" }));
  log.info("signing_keys_created", { dir: "keys/" });
}

let cache: { priv: ReturnType<typeof createPrivateKey>; pubPem: string; keyId: string } | null = null;
function keys() {
  if (cache) return cache;
  ensureKeys();
  const pubPem = readFileSync(PUB, "utf8");
  const der = createPublicKey(pubPem).export({ type: "spki", format: "der" });
  cache = {
    priv: createPrivateKey(readFileSync(PRIV, "utf8")),
    pubPem,
    keyId: createHash("sha256").update(der).digest("hex").slice(0, 16),
  };
  return cache;
}

// Canonical JSON: keys sorted at every level, so the same record always signs the same bytes.
export function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  if (v && typeof v === "object") {
    return `{${Object.keys(v as object).sort().map((k) => `${JSON.stringify(k)}:${canonical((v as any)[k])}`).join(",")}}`;
  }
  return JSON.stringify(v);
}

export function signRecord(record: Record<string, unknown>): SignedRecord {
  const k = keys();
  const signature = sign(null, Buffer.from(canonical(record)), k.priv).toString("base64");
  return { record, signature, alg: "Ed25519", keyId: k.keyId };
}

export function verifyRecord(record: Record<string, unknown>, signatureB64: string): boolean {
  try {
    return verify(null, Buffer.from(canonical(record)), createPublicKey(keys().pubPem), Buffer.from(signatureB64, "base64"));
  } catch {
    return false;
  }
}

export function publicKeyInfo() {
  const k = keys();
  return { alg: "Ed25519", keyId: k.keyId, publicKeyPem: k.pubPem };
}
