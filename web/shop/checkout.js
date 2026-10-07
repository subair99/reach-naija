// Checkout: free NIPOST L1 validity check before the order, then live delivery status
// ending in a signed Verified Arrival record.
import { api, esc, mockRibbon, plateHTML } from "/shared/plate.js";

const $ = (id) => document.getElementById(id);
let validCode = null;

const cfg = await mockRibbon();

// Optional: NIPOST's own web widget, when a publishable key and SDK URL are configured.
if (cfg.widget) {
  const s = document.createElement("script");
  s.src = cfg.widget.scriptUrl;
  s.onload = () => { $("widget").hidden = false; };
  document.head.append(s);
  $("widget").onclick = async () => {
    try {
      const widget = new window.PostcodeWidget({ key: cfg.widget.key, environment: cfg.widget.environment, identifierType: "email" });
      const sel = await widget.open();
      if (sel) { $("code").value = sel.formatted.replace(/-/g, " "); await check(); }
    } catch (e) {
      $("check-result").innerHTML = `<div class="notice danger">The NIPOST widget could not open: ${esc(e.message)}</div>`;
    }
  };
}

async function check() {
  validCode = null;
  $("place").disabled = true;
  const out = $("check-result");
  out.innerHTML = `<p class="muted">Checking with NIPOST…</p>`;
  try {
    const r = await api("/api/checkout/validate", { method: "POST", body: { code: $("code").value } });
    if (r.valid) {
      validCode = r.formatted;
      out.innerHTML = `<div class="notice ok"><strong>${esc(r.display)}</strong> is a valid NIPOST postcode${r.state ? ` in ${esc(r.state)}` : ""}.</div>`;
      $("place").disabled = false;
    } else {
      out.innerHTML = `<div class="notice danger">${esc(r.message)}</div>`;
    }
  } catch (e) {
    out.innerHTML = `<div class="notice danger">${esc(e.message)}</div>`;
  }
}

$("check").onclick = check;
$("code").addEventListener("keydown", (e) => { if (e.key === "Enter") check(); });
$("code").addEventListener("input", () => { validCode = null; $("place").disabled = true; });

$("place").onclick = async () => {
  $("place").disabled = true;
  try {
    const { order, otp } = await api("/api/orders", { method: "POST", body: { postcode: validCode, item: $("item").textContent } });
    $("checkout").hidden = true;
    renderOrder(order, otp);
    poll(order.id, otp);
  } catch (e) {
    $("check-result").innerHTML = `<div class="notice danger">${esc(e.message)}</div>`;
    $("place").disabled = false;
  }
};

const STEPS = ["Order placed", "Rider at your building", "Delivery verified"];

function renderOrder(o, otp) {
  const done = o.status === "verified" ? 3 : o.status === "at_location" ? 2 : 1;
  const steps = STEPS.map((s, i) => `<li class="${i < done ? "done" : i === done ? "now" : ""}">${s}</li>`).join("");
  const el = $("order");
  el.hidden = false;
  el.innerHTML = `
    <h2 class="${o.status === "verified" ? "verified-title" : ""}">${o.status === "verified" ? `Delivery verified at ${esc(o.display)}` : `Order ${esc(o.orderRef)}`}</h2>
    ${plateHTML(o.postcode, { small: true })}
    <ol class="steps">${steps}</ol>
    ${o.status !== "verified" ? `
      <div class="panel">
        <h3>Your hand-over code</h3>
        <p class="otp">${esc(otp)}</p>
        <p class="muted">Give this code to the rider only when your order is in your hands.</p>
        <p class="muted"><small>Demo shortcut: in the pilot this code goes to you by WhatsApp or SMS, never through the shop.</small></p>
      </div>` : `
      <div class="notice ok">The rider's location matched your postcode and you confirmed the hand-over. Reach Naija signed this record.</div>
      ${o.signed?.record?.gps_simulated ? `<div class="notice warn">The rider's location was simulated for this demo, and the signed record says so.</div>` : ""}
      <pre class="record">${esc(JSON.stringify(o.signed, null, 2))}</pre>
      <button id="verify" class="secondary">Check signature</button> <span id="verify-out" aria-live="polite"></span>`}
  `;
  if (o.status === "verified") {
    $("verify").onclick = async () => {
      const r = await api("/api/verify-record", { method: "POST", body: { record: o.signed.record, signature: o.signed.signature } });
      $("verify-out").textContent = r.valid ? "Signature valid" : "Signature does not match";
    };
  }
}

function poll(id, otp) {
  let last = "";
  const t = setInterval(async () => {
    try {
      const { arrival } = await api(`/api/arrival/${id}`);
      if (arrival.status !== last) { last = arrival.status; renderOrder(arrival, otp); }
      if (arrival.status === "verified" || arrival.status === "failed") clearInterval(t);
    } catch { /* keep polling */ }
  }, 2000);
}
