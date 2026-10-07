import { HttpError, json, route } from "../lib/http.ts";
import { store } from "../store/index.ts";
import { ArrivalError, confirmHandover, publicArrival, reportPosition, startArrival } from "./service.ts";
import { publicKeyInfo, verifyRecord } from "./sign.ts";

const wrap = async <T>(fn: () => Promise<T>) => {
  try { return await fn(); } catch (e) {
    if (e instanceof ArrivalError) throw new HttpError(e.status, e.code, e.message);
    throw e;
  }
};

route("POST", "/api/arrival/start", async (req, res) => {
  const { arrival, otp } = await wrap(() => startArrival({
    postcode: String(req.body.postcode ?? ""), item: req.body.item ?? null, serviceType: req.body.serviceType,
  }));
  // In the demo the code is shown to the customer on the shop page. In the pilot it goes to the
  // recipient by WhatsApp or SMS and never passes through the merchant or rider.
  json(res, 201, { arrival: publicArrival(arrival), otp });
});

route("GET", "/api/arrivals", async (req, res) => {
  const status = req.query.get("status") as any;
  const list = await store.arrivals.list(status || undefined);
  json(res, 200, { arrivals: list.map(publicArrival) });
});

route("GET", "/api/arrival/:id", async (req, res) => {
  const a = await store.arrivals.get(req.params.id);
  if (!a) throw new HttpError(404, "not_found", "No delivery with that id.");
  json(res, 200, { arrival: publicArrival(a) });
});

route("POST", "/api/arrival/:id/position", async (req, res) => {
  const lat = Number(req.body.lat), lng = Number(req.body.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw new HttpError(400, "bad_input", "lat and lng are required.");
  const a = await wrap(() => reportPosition(req.params.id, {
    lat, lng, simulated: req.body.simulated === true, providerId: String(req.body.providerId ?? ""),
  }));
  json(res, 200, { arrival: publicArrival(a) });
});

route("POST", "/api/arrival/:id/confirm", async (req, res) => {
  const a = await wrap(() => confirmHandover(req.params.id, String(req.body.otp ?? "")));
  json(res, 200, { arrival: publicArrival(a) });
});

route("GET", "/api/public-key", (_req, res) => json(res, 200, publicKeyInfo()));

// Anyone can check a record: change one field and the signature stops verifying.
route("POST", "/api/verify-record", (req, res) => {
  const ok = !!req.body.record && typeof req.body.signature === "string" && verifyRecord(req.body.record, req.body.signature);
  json(res, 200, { valid: ok });
});
