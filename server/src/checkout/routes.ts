// Merchant checkout: free L1 validity check, then an order that a rider can deliver and prove.
import { HttpError, json, route } from "../lib/http.ts";
import { display, formatted, parse } from "../lib/postcode.ts";
import { nipost } from "../nipost/index.ts";
import { ArrivalError, publicArrival, startArrival } from "../arrival/service.ts";

route("POST", "/api/checkout/validate", async (req, res) => {
  const input = String(req.body.code ?? "");
  const seg = parse(input);
  if (!seg) {
    return json(res, 200, { valid: false, message: "A postcode has 11 characters in 5 parts, e.g. LA 11 W06 TC 10." });
  }
  const r = await nipost.lookup(formatted(seg), 1);
  json(res, 200, {
    valid: r.valid,
    formatted: formatted(seg),
    display: display(seg),
    state: r.administrative_address?.state_name ?? null,
    message: r.valid ? null : `${display(seg)} is not an active NIPOST postcode. Check it with the customer.`,
  });
});

route("POST", "/api/orders", async (req, res) => {
  try {
    const { arrival, otp } = await startArrival({ postcode: String(req.body.postcode ?? ""), item: req.body.item ?? null });
    json(res, 201, { order: publicArrival(arrival), otp });
  } catch (e) {
    if (e instanceof ArrivalError) throw new HttpError(e.status, e.code, e.message);
    throw e;
  }
});
