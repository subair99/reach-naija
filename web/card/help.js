// Help mode: the dispatcher view. High contrast, essentials first, expiry visible.
import { badgeText, esc, plateHTML } from "/shared/plate.js";

export function renderHelp(app, card) {
  document.body.classList.add("help");
  document.title = `Help · ${card.formatted.replace(/-/g, " ")}`;
  app.innerHTML = `
    <div class="card-head">
      <h1>Emergency location</h1>
      <span class="badge ${esc(card.confidence)}">${esc(badgeText[card.confidence] || card.confidence)}${card.distance_m != null ? ` · ${card.distance_m} m` : ""}</span>
    </div>
    ${plateHTML(card.postcode)}
    <div class="call-first">This page does not call for help. If no one has called 112 yet, call now.</div>
    <dl class="facts">
      <dt>State</dt><dd>${esc(card.names?.state || "Not in NIPOST record")}</dd>
      <dt>LGA</dt><dd>${esc(card.names?.lga || "Not in NIPOST record")}</dd>
      ${card.address ? `<dt>House address</dt><dd>${esc(card.address)}<span class="source">NIPOST record, as returned</span></dd>` : ""}
      ${card.note ? `<dt>Directions</dt><dd>${esc(card.note)}<span class="source">From the occupant</span></dd>` : ""}
      ${card.building_use ? `<dt>Building use</dt><dd>${esc(card.building_use)}</dd>` : ""}
      ${card.expires_at ? `<dt>Link expires</dt><dd class="expiry" id="expiry"></dd>` : ""}
    </dl>
  `;
  if (card.expires_at) {
    const el = document.getElementById("expiry");
    const tick = () => {
      const ms = new Date(card.expires_at) - Date.now();
      if (ms <= 0) { el.textContent = "Expired"; return; }
      const h = Math.floor(ms / 3.6e6), m = Math.floor((ms % 3.6e6) / 6e4);
      el.textContent = `in ${h} h ${String(m).padStart(2, "0")} min`;
    };
    tick(); setInterval(tick, 30_000);
  }
}
