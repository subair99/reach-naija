// End-to-end check against a running server: NIPOST calls, card, WhatsApp, USSD, Verified Arrival.
// Usage: npm run smoke   (BASE defaults to http://localhost:3000)
const BASE = (process.env.BASE ?? "http://localhost:3000").replace(/\/$/, "");
const ok = (m: string) => console.log(`  \x1b[32mok\x1b[0m   ${m}`);
function fail(m: string, detail?: unknown): never {
  console.log(`  \x1b[31mFAIL\x1b[0m ${m}`);
  if (detail !== undefined) console.log(typeof detail === "string" ? detail : JSON.stringify(detail, null, 2));
  process.exit(1);
}

async function call(path: string, init: { method?: string; json?: unknown; form?: Record<string, string> } = {}) {
  const res = await fetch(BASE + path, {
    method: init.method ?? (init.json || init.form ? "POST" : "GET"),
    headers: init.json ? { "Content-Type": "application/json" } : init.form ? { "Content-Type": "application/x-www-form-urlencoded" } : {},
    body: init.json ? JSON.stringify(init.json) : init.form ? new URLSearchParams(init.form) : undefined,
  });
  const text = await res.text();
  let body: any = text;
  try { body = JSON.parse(text); } catch { /* plain text (USSD) */ }
  return { status: res.status, body };
}

try { await call("/healthz"); } catch { fail(`No server at ${BASE}. Start it with: npm run dev`); }

const { body: locs } = await call("/api/demo/locations");
const { lat, lng, postcode: code } = locs.locations[0];
console.log(`Testing ${BASE} with ${code}`);

console.log("NIPOST");
const r = (await call("/api/resolve", { json: { lat, lng } })).body;
if (r.status === "none" || r.error) fail("reverse geocode found no building at the demo location. Update fixtures/demo-locations.json.", r);
ok(`reverse geocode → ${r.unit?.display ?? r.candidates.map((c: any) => c.display).join(", ")} (${r.status})`);
const v = (await call("/api/checkout/validate", { json: { code } })).body;
if (!v.valid) fail("L1 lookup says the test postcode is not valid", v);
ok(`L1 lookup: ${v.display} is valid`);

console.log("Address Card");
const c = await call("/api/cards", { json: { postcode: code, note: "Smoke test" } });
if (c.status !== 201) fail("card creation", c.body);
ok(`card created: ${c.body.card.url}`);

console.log("WhatsApp");
await call("/webhooks/whatsapp", { json: { entry: [{ changes: [{ value: { messages: [
  { from: "2348000000000", type: "location", location: { latitude: lat, longitude: lng } }] } }] }] } });
await new Promise((res) => setTimeout(res, 800));
const out = await call("/api/dev/outbox");
if (out.status === 200) ok(`dry-run reply: ${String(out.body.messages.at(-1)?.body ?? "(none)").split("\n")[0]}`);
else ok("WhatsApp is live: check the test phone for the reply");

console.log("USSD");
const u1 = (await call("/webhooks/ussd", { form: { sessionId: "s1", serviceCode: "*384*1#", phoneNumber: "+2348000000000", text: "" } })).body;
if (!String(u1).startsWith("CON")) fail("USSD main menu", u1);
ok("main menu");
const u2 = (await call("/webhooks/ussd", { form: { sessionId: "s1", serviceCode: "*384*1#", phoneNumber: "+2348000000000", text: `2*${code}` } })).body;
if (!/^END .*is a valid/.test(String(u2))) fail("USSD check a postcode", u2);
ok("check a postcode");

console.log("Verified Arrival");
const o = (await call("/api/orders", { json: { postcode: code, item: "Smoke test" } })).body;
const p = (await call(`/api/arrival/${o.order.id}/position`, { json: { lat, lng, simulated: true, providerId: "smoke" } })).body;
if (!p.arrival?.gps?.matched) fail("GPS did not match the destination", p);
ok("GPS matches destination");
const s = (await call(`/api/arrival/${o.order.id}/confirm`, { json: { otp: o.otp } })).body;
if (s.arrival?.status !== "verified") fail("hand-over confirmation", s);
ok("hand-over confirmed, record signed");
const vr = (await call("/api/verify-record", { json: { record: s.arrival.signed.record, signature: s.arrival.signed.signature } })).body;
if (!vr.valid) fail("signature does not verify", vr);
const tampered = (await call("/api/verify-record", { json: { record: { ...s.arrival.signed.record, postcode: "XX-00-X00-XX-00" }, signature: s.arrival.signed.signature } })).body;
if (tampered.valid) fail("a tampered record still verified");
ok("signature verifies, and a tampered copy is rejected");

console.log("All checks passed.");
