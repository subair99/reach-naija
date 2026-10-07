// Deliver mode: what a rider, shop or visitor needs to find the door.
import { badgeText, esc, plateHTML } from "/shared/plate.js";

export function renderDeliver(app, card) {
  document.title = `${card.formatted.replace(/-/g, " ")} · Reach Naija`;
  const names = [card.names?.lga, card.names?.state].filter(Boolean).join(", ");
  app.innerHTML = `
    <div class="card-head">
      <h1>Address Card</h1>
      <span class="badge ${esc(card.confidence)}">${esc(badgeText[card.confidence] || card.confidence)}${card.distance_m != null ? ` · ${card.distance_m} m` : ""}</span>
    </div>
    ${plateHTML(card.postcode, { reveal: true })}

    ${card.note ? `
    <div class="panel">
      <span class="source">Directions from the occupant</span>
      <p class="note">${esc(card.note)}</p>
    </div>` : ""}

    <dl class="facts">
      ${names ? `<dt>Area</dt><dd>${esc(names)}<span class="source">NIPOST record</span></dd>` : ""}
      ${card.locality ? `<dt>Locality</dt><dd>${esc(card.locality)}<span class="source">NIPOST record</span></dd>` : ""}
      ${card.address ? `<dt>House address</dt><dd>${esc(card.address)}<span class="source">NIPOST record, as returned</span></dd>` : ""}
      ${card.building_use ? `<dt>Building use</dt><dd>${esc(card.building_use)}<span class="source">NIPOST record</span></dd>` : ""}
    </dl>

    <div class="panel qr-block">
      <div id="qr" aria-label="QR code for this card"></div>
      <div>
        <h3>Share this card</h3>
        <p class="muted">Scan to open this card, or send the link to a rider or visitor.</p>
        <div class="row">
          <button id="share">Share link</button>
          <button id="copy" class="secondary">Copy link</button>
        </div>
      </div>
    </div>
    <p class="muted"><small>Location from the NIPOST Postcode API. Reach Naija never adds landmarks or directions of its own.</small></p>
  `;

  const url = card.url || location.href.split("?")[0];
  if (window.QRCode) new window.QRCode(document.getElementById("qr"), { text: url, width: 264, height: 264, correctLevel: window.QRCode.CorrectLevel.M });
  else document.getElementById("qr").textContent = card.postcode;

  document.getElementById("copy").onclick = async (e) => {
    await navigator.clipboard?.writeText(url);
    e.target.textContent = "Link copied";
  };
  document.getElementById("share").onclick = async () => {
    if (navigator.share) await navigator.share({ title: "My Address Card", text: `My postcode: ${card.formatted.replace(/-/g, " ")}`, url }).catch(() => {});
    else await navigator.clipboard?.writeText(url);
  };
}
