// Reads and validates environment configuration. Loads .env from the repo root if present.
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const envFile = path.join(ROOT, ".env");
if (existsSync(envFile)) process.loadEnvFile(envFile);

function str(name: string, fallback = ""): string {
  return (process.env[name] ?? fallback).trim();
}

function oneOf<T extends string>(name: string, allowed: readonly T[], fallback: T): T {
  const v = str(name, fallback) as T;
  if (!allowed.includes(v)) {
    throw new Error(`${name} must be one of ${allowed.join(", ")} (got "${v}")`);
  }
  return v;
}

const nipostMode = oneOf("NIPOST_MODE", ["mock", "live"] as const, "mock");
const store = oneOf("STORE", ["memory", "postgres"] as const, "memory");

export const config = {
  port: Number(str("PORT", "3000")),
  publicUrl: str("PUBLIC_URL", "http://localhost:3000").replace(/\/$/, ""),

  nipost: {
    mode: nipostMode,
    baseUrl: str("NIPOST_BASE_URL", "https://api.postcode.gov.ng").replace(/\/$/, ""),
    secretKey: str("NIPOST_SECRET_KEY"),
    maxLevel: Math.min(3, Math.max(1, Number(str("NIPOST_MAX_LEVEL", "3")))) as 1 | 2 | 3,
    publishableKey: str("NIPOST_PUBLISHABLE_KEY"),
    widgetScriptUrl: str("NIPOST_WIDGET_SCRIPT_URL"),
    widgetEnvironment: str("NIPOST_WIDGET_ENVIRONMENT", "staging"),
  },

  store,
  databaseUrl: str("DATABASE_URL"),
  hashSecret: str("HASH_SECRET", "dev-only-secret"),

  whatsapp: {
    token: str("WA_TOKEN"),
    phoneId: str("WA_PHONE_ID"),
    verifyToken: str("WA_VERIFY_TOKEN"),
    apiVersion: str("WA_API_VERSION", "v21.0"),
  },

  voiceEnabled: str("VOICE_ENABLED", "true") === "true",
};

export function checkConfig(): string[] {
  const warnings: string[] = [];
  if (config.nipost.mode === "live" && !config.nipost.secretKey) {
    throw new Error("NIPOST_MODE=live needs NIPOST_SECRET_KEY (your nipost_test_... staging key).");
  }
  if (config.nipost.secretKey.startsWith("nipost_pk_")) {
    throw new Error("NIPOST_SECRET_KEY holds a publishable key. Use the secret key (nipost_test_... / nipost_live_...).");
  }
  if (config.store === "postgres" && !config.databaseUrl) {
    throw new Error("STORE=postgres needs DATABASE_URL.");
  }
  if (config.hashSecret === "dev-only-secret" || config.hashSecret.startsWith("change-me")) {
    warnings.push("HASH_SECRET is the default value. Fine for a local demo; change it before real users.");
  }
  if (!config.whatsapp.token || !config.whatsapp.phoneId) {
    warnings.push("WhatsApp is not configured (WA_TOKEN / WA_PHONE_ID). Replies will be logged instead of sent.");
  }
  return warnings;
}
