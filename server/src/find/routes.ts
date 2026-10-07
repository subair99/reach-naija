// Address → confirmed pin → postcode. Powers the /find/ page and WhatsApp's "type your address" path.
import { buildCard, resolvePin } from "../cards/service.ts";
import { publicCard } from "../cards/schema.ts";
import { config } from "../config.ts";
import { geocode } from "../geocode/index.ts";
import { HttpError, json, route } from "../lib/http.ts";
import { sameCode } from "../lib/postcode.ts";
import { nipost } from "../nipost/index.ts";

function coord(v: unknown, name: string, min: number, max: number): number {
  const n = Number(v);
  if (!Number.isFinite(n) || n < min || n > max) throw new HttpError(400, "bad_input", `${name} must be between ${min} and ${max}.`);
  return n;
}

// Rough bounding box for Nigeria, so a stray pin in the ocean gets a clear message.
const inNigeria = (lat: number, lng: number) => lat >= 4 && lat <= 14 && lng >= 2.6 && lng <= 14.7;

function registration(lat: number, lng: number) {
  const ll = `${lat.toFixed(6)},${lng.toFixed(6)}`;
  return { coordinates: ll, mapsLink: `https://www.google.com/maps?q=${ll}`, registerUrl: config.nipostRegisterUrl };
}

route("GET", "/api/geocode", async (req, res) => {
  const q = String(req.query.get("q") ?? "");
  if (q.trim().length < 3) throw new HttpError(400, "bad_input", "Type at least 3 characters of the address.");
  try {
    json(res, 200, { mode: config.geocoder.mode, results: await geocode(q) });
  } catch {
    throw new HttpError(502, "geocoder_unavailable", "Address search is not responding. Drag the pin or use your location instead.");
  }
});

// Step 2: the user has placed the pin. Ask NIPOST what is there.
route("POST", "/api/find/check", async (req, res) => {
  const lat = coord(req.body.lat, "lat", -90, 90), lng = coord(req.body.lng, "lng", -180, 180);
  if (!inNigeria(lat, lng)) {
    return json(res, 200, { status: "outside", message: "That pin is outside Nigeria. Move it onto your building." });
  }
  const r = await resolvePin(lat, lng);
  if (r.status === "none") return json(res, 200, { status: "none", radiusM: r.radiusM, register: registration(lat, lng) });
  json(res, 200, r);
});

// Step 3: create the card. The server re-checks the pin rather than trusting the browser, so a
// card is only marked HIGH when NIPOST says so, and a picked building must really be nearby.
route("POST", "/api/find/card", async (req, res) => {
  const lat = coord(req.body.lat, "lat", -90, 90), lng = coord(req.body.lng, "lng", -180, 180);
  const picked = req.body.postcode ? String(req.body.postcode) : null;
  const note = typeof req.body.note === "string" ? req.body.note : null;
  const r = await resolvePin(lat, lng);

  if (r.status === "high" && (!picked || sameCode(picked, r.unit.postcode))) {
    const { card, manageToken } = await buildCard({ code: r.unit.postcode, confidence: "high", distanceM: r.unit.distance_m, source: "web", note, withManageToken: true });
    return json(res, 201, { card: publicCard(card), manageToken });
  }
  if (picked) {
    const near = r.status === "confirm" ? r.candidates : r.status === "high" ? await nipost.nearby(lat, lng, 300) : [];
    const match = near.find((c) => sameCode(c.postcode, picked));
    if (!match) throw new HttpError(400, "not_nearby", "That building is not near the pin. Move the pin and check again.");
    const { card, manageToken } = await buildCard({ code: match.postcode, confidence: "confirmed", distanceM: Math.round(match.distance_m), source: "web", note, withManageToken: true });
    return json(res, 201, { card: publicCard(card), manageToken });
  }
  throw new HttpError(409, "needs_choice", "NIPOST isn't certain which building this is. Pick yours from the list.");
});
