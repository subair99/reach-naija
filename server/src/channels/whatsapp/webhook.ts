// WhatsApp Cloud API webhook: verification (GET) and incoming messages (POST).
import { createHmac, timingSafeEqual } from "node:crypto";
import { config } from "../../config.ts";
import { buildCard, helpCardFrom, resolvePin } from "../../cards/service.ts";
import { hashId } from "../../lib/hash.ts";
import { json, route, text } from "../../lib/http.ts";
import { log } from "../../lib/log.ts";
import { cardUrl } from "../../lib/qr.ts";
import { isMock } from "../../nipost/index.ts";
import type { NearbyUnit } from "../../nipost/index.ts";
import { store } from "../../store/index.ts";
import { voiceNote } from "../../voice/stitch.ts";
import { badge, looksPidgin, say } from "./replies.ts";
import type { Lang } from "./replies.ts";
import { dryRun, getOutbox, sendText, sendVoice } from "./send.ts";

// Pending "pick your building" choices, kept in memory for 15 minutes only.
const pending = new Map<string, { candidates: NearbyUnit[]; expires: number }>();

route("GET", "/webhooks/whatsapp", (req, res) => {
  const q = req.query;
  if (q.get("hub.mode") === "subscribe" && config.whatsapp.verifyToken && q.get("hub.verify_token") === config.whatsapp.verifyToken) {
    return text(res, 200, q.get("hub.challenge") ?? "");
  }
  text(res, 403, "Verification failed");
});

route("POST", "/webhooks/whatsapp", async (req, res) => {
  // Optional: verify Meta's signature when WA_APP_SECRET is set.
  const secret = process.env.WA_APP_SECRET?.trim();
  if (secret) {
    const sig = String(req.headers["x-hub-signature-256"] ?? "").replace("sha256=", "");
    const expected = createHmac("sha256", secret).update((req as any).rawBody ?? "").digest("hex");
    if (sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
      return text(res, 401, "Bad signature");
    }
  }
  text(res, 200, "OK"); // acknowledge fast; Meta retries slow webhooks
  const messages = req.body?.entry?.flatMap((e: any) => e.changes?.flatMap((c: any) => c.value?.messages ?? []) ?? []) ?? [];
  for (const m of messages) {
    handle(m).catch((e) => log.error("whatsapp_handle_failed", { error: (e as Error).message }));
  }
});

// Dry-run outbox for rehearsing without Meta credentials.
route("GET", "/api/dev/outbox", (_req, res) => {
  if (!dryRun) return json(res, 404, { error: { code: "not_available", message: "WhatsApp is live; no outbox." } });
  json(res, 200, { messages: getOutbox() });
});

async function langFor(owner: string, textBody?: string): Promise<Lang> {
  const saved = await store.prefs.getLang(owner);
  if (saved === "en" || saved === "pcm") return saved;
  if (textBody && looksPidgin(textBody)) { await store.prefs.setLang(owner, "pcm"); return "pcm"; }
  return "en";
}

const tag = (lang: Lang) => (isMock ? say("mockTag", lang) : "");

async function replyWithCard(to: string, lang: Lang, card: Awaited<ReturnType<typeof buildCard>>["card"]) {
  await sendText(to, say("found", lang, {
    display: card.display, badge: badge(card.confidence, lang, card.distanceM), url: cardUrl(card.id),
  }) + tag(lang));
  const voice = await voiceNote(card.formatted, lang);
  if (voice.file !== null) await sendVoice(to, voice.file);
  else if (voice.missing.length) log.warn("voice_clips_missing", { lang, missing: voice.missing.join("") });
}

async function handle(m: any) {
  const from: string = m.from;
  const owner = hashId("phone", from);
  const body: string = m.type === "text" ? String(m.text?.body ?? "").trim() : "";
  const lang = await langFor(owner, body);
  log.info("whatsapp_in", { owner, type: m.type });

  if (m.type === "location") {
    const { latitude, longitude } = m.location ?? {};
    try {
      const r = await resolvePin(Number(latitude), Number(longitude));
      if (r.status === "high") {
        const { card } = await buildCard({ code: r.unit.postcode, confidence: "high", distanceM: r.unit.distance_m, source: "whatsapp", ownerHash: owner });
        return replyWithCard(from, lang, card);
      }
      if (r.status === "confirm") {
        pending.set(owner, { candidates: r.candidates, expires: Date.now() + 15 * 60_000 });
        const list = r.candidates.map((c, i) => `${i + 1}. ${c.display} (${Math.round(c.distance_m)} m)`).join("\n");
        return sendText(from, say("pick", lang, { list }) + tag(lang));
      }
      return sendText(from, say("none", lang, { radius: r.radiusM }));
    } catch (e) {
      log.error("resolve_failed", { error: (e as Error).message });
      return sendText(from, say("error", lang));
    }
  }

  if (m.type !== "text") return sendText(from, say("greet", lang));

  const upper = body.toUpperCase();
  const p = pending.get(owner);
  if (/^[1-3]$/.test(body) && p && p.expires > Date.now()) {
    const choice = p.candidates[Number(body) - 1];
    if (choice) {
      pending.delete(owner);
      const { card } = await buildCard({ code: choice.postcode, confidence: "confirmed", distanceM: Math.round(choice.distance_m), source: "whatsapp", ownerHash: owner });
      return replyWithCard(from, lang, card);
    }
  }

  if (upper === "PIDGIN" || upper === "ENGLISH") {
    const next: Lang = upper === "PIDGIN" ? "pcm" : "en";
    await store.prefs.setLang(owner, next);
    return sendText(from, say("langSet", next));
  }

  const latestEveryday = await store.cards.latestForOwner(owner);

  if (upper === "HELP") {
    if (!latestEveryday) return sendText(from, say("noCard", lang));
    const help = await helpCardFrom(latestEveryday, 12);
    return sendText(from, say("help", lang, { display: help.display, url: cardUrl(help.id, "help"), hours: 12 }) + tag(lang));
  }

  if (upper.startsWith("NOTE")) {
    const note = body.slice(4).trim();
    if (!latestEveryday) return sendText(from, say("noCard", lang));
    if (!note) return sendText(from, say("found", lang, { display: latestEveryday.display, badge: badge(latestEveryday.confidence, lang, latestEveryday.distanceM), url: cardUrl(latestEveryday.id) }));
    const updated = await store.cards.update(latestEveryday.id, { note: note.slice(0, 280) });
    return sendText(from, say("noteSaved", lang, { note: updated!.note!, url: cardUrl(updated!.id) }));
  }

  if (upper === "CARD" || upper === "MY POSTCODE") {
    if (!latestEveryday) return sendText(from, say("noCard", lang));
    return replyWithCard(from, lang, latestEveryday);
  }

  if (upper === "DELETE") {
    if (!latestEveryday) return sendText(from, say("noCard", lang));
    await store.cards.update(latestEveryday.id, { revokedAt: new Date().toISOString() });
    return sendText(from, say("deleted", lang, { display: latestEveryday.display }));
  }

  return sendText(from, say("greet", lang));
}
