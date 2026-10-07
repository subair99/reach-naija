// Rider flow: pick a delivery → check in at the building (GPS) → enter the customer's code.
import { api, esc, mockRibbon, plateHTML } from "/shared/plate.js";

const $ = (id) => document.getElementById(id);
const RIDER_ID = localStorage.getItem("reach-rider") || (() => {
  const v = "rider-" + Math.random().toString(36).slice(2, 8);
  localStorage.setItem("reach-rider", v); return v;
})();

mockRibbon();

async function loadList() {
  const [open, here] = await Promise.all([api("/api/arrivals?status=open"), api("/api/arrivals?status=at_location")]);
  const jobs = [...here.arrivals, ...open.arrivals];
  $("list").innerHTML = jobs.length
    ? jobs.map((a) => `
        <button class="job-item" data-id="${esc(a.id)}">
          ${plateHTML(a.postcode, { small: true })}
          <span class="job-meta"><span>${esc(a.item || "Delivery")}</span><span>${esc(a.orderRef)}</span></span>
        </button>`).join("")
    : `<p class="muted">No deliveries waiting. Place an order on the <a href="/shop/">shop page</a>.</p>`;
  document.querySelectorAll(".job-item").forEach((b) => (b.onclick = () => openJob(b.dataset.id)));
}

async function openJob(id) {
  const { arrival } = await api(`/api/arrival/${id}`);
  $("list").hidden = true;
  render(arrival);
}

function render(a, message = "") {
  const job = $("job");
  job.hidden = false;
  const gps = a.gps;
  job.innerHTML = `
    <button class="secondary" id="back">All deliveries</button>
    <h2>Deliver to</h2>
    ${plateHTML(a.postcode)}
    <p class="muted">${esc(a.item || "")} · ${esc(a.orderRef)}</p>
    ${message}
    ${gps ? `<div class="notice ${gps.matched ? "ok" : "danger"}">
        ${gps.matched
          ? `Location matches ${esc(a.display)}${gps.distanceM != null ? ` (${gps.distanceM} m)` : ""}.`
          : `You are not at this building yet. Your location resolves to ${esc(gps.resolvedPostcode ? gps.resolvedPostcode.replace(/-/g, " ") : "no building nearby")}.`}
        ${gps.simulated ? "<br><strong>Simulated location.</strong>" : ""}
      </div>` : ""}
    ${a.status === "verified" ? `
      <div class="notice ok"><strong>Delivery verified.</strong> The signed record has been sent to the shop.</div>
      <pre class="record">${esc(JSON.stringify(a.signed, null, 2))}</pre>`
    : a.status === "at_location" ? `
      <label for="otp">Customer's hand-over code</label>
      <input id="otp" type="text" inputmode="numeric" maxlength="6" autocomplete="one-time-code">
      <button class="big-action" id="confirm">Confirm hand-over</button>`
    : `<button class="big-action" id="checkin">I'm at the building</button>`}
  `;
  $("back").onclick = () => { job.hidden = true; $("list").hidden = false; loadList(); };
  $("checkin")?.addEventListener("click", () => checkIn(a));
  $("confirm")?.addEventListener("click", () => confirm(a));
}

function realPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error("This browser cannot read GPS. Use the simulated location in Demo controls."));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      (e) => reject(new Error(e.code === 1
        ? "Location permission was refused. Allow location for this site, or use the simulated location."
        : "Could not get a GPS fix. Move outside and try again, or use the simulated location.")),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  });
}

async function checkIn(a) {
  const simulated = !!window.reachSim?.enabled();
  try {
    const pos = simulated ? window.reachSim.position() : await realPosition();
    const { arrival } = await api(`/api/arrival/${a.id}/position`, { method: "POST", body: { ...pos, simulated, providerId: RIDER_ID } });
    render(arrival);
  } catch (e) {
    render(a, `<div class="notice danger">${esc(e.message)}</div>`);
  }
}

async function confirm(a) {
  try {
    const { arrival } = await api(`/api/arrival/${a.id}/confirm`, { method: "POST", body: { otp: $("otp").value } });
    render(arrival);
  } catch (e) {
    const { arrival } = await api(`/api/arrival/${a.id}`);
    render(arrival, `<div class="notice danger">${esc(e.message)}</div>`);
  }
}

loadList();
