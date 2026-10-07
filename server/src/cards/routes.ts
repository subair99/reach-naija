import { readFileSync } from "node:fs";
import path from "node:path";
import { ROOT } from "../config.ts";
import { HttpError, json, route } from "../lib/http.ts";
import { store } from "../store/index.ts";
import { publicCard } from "./schema.ts";
import { buildCard, hashToken, liveCard, resolvePin } from "./service.ts";

function num(v: unknown, name: string, min: number, max: number): number {
  const n = Number(v);
  if (!Number.isFinite(n) || n < min || n > max) throw new HttpError(400, "bad_input", `${name} must be a number between ${min} and ${max}.`);
  return n;
}

// Resolve a pin without creating a card (used by tests and partner tools).
route("POST", "/api/resolve", async (req, res) => {
  const lat = num(req.body.lat, "lat", -90, 90);
  const lng = num(req.body.lng, "lng", -180, 180);
  json(res, 200, await resolvePin(lat, lng));
});

// Create a card from a postcode (web flow). Returns a manage token that can revoke it.
route("POST", "/api/cards", async (req, res) => {
  const code = String(req.body.postcode ?? "");
  const mode = ["deliver", "help", "register"].includes(req.body.mode) ? req.body.mode : "deliver";
  try {
    const { card, manageToken } = await buildCard({
      code, confidence: "selected", source: "web", note: req.body.note ?? null, mode,
      expiresInHours: mode === "help" ? 12 : undefined, withManageToken: true,
    });
    json(res, 201, { card: publicCard(card), manageToken });
  } catch (e) {
    throw new HttpError(400, "invalid_postcode", (e as Error).message);
  }
});

route("GET", "/api/cards/:id", async (req, res) => {
  const state = await liveCard(req.params.id);
  if (!state.ok) {
    const messages = {
      not_found: "There is no Address Card at this link. Check the link you were sent.",
      revoked: "The owner has withdrawn this Address Card.",
      expired: "This Help card has expired. Ask the person for a new link.",
    };
    return json(res, state.reason === "not_found" ? 404 : 410, { error: { code: state.reason, message: messages[state.reason] } });
  }
  json(res, 200, { card: publicCard(state.card) });
});

route("POST", "/api/cards/:id/revoke", async (req, res) => {
  const card = await store.cards.get(req.params.id);
  const token = String(req.headers["x-manage-token"] ?? "");
  if (!card || !card.manageTokenHash || !token || hashToken(token) !== card.manageTokenHash) {
    throw new HttpError(403, "forbidden", "Only the person who created this card can withdraw it.");
  }
  await store.cards.update(card.id, { revokedAt: new Date().toISOString() });
  json(res, 200, { ok: true });
});

// The card page itself. Data is fetched by the page from /api/cards/:id.
const cardPage = path.join(ROOT, "web/card/index.html");
route("GET", "/c/:id", async (_req, res) => {
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
  res.end(readFileSync(cardPage));
});
