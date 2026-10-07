// Address → pin the user confirms → NIPOST postcode → Address Card.
// The geocoder only gets the map close; the user decides where the building is.
import { api, esc, mockRibbon, plateHTML } from "/shared/plate.js";

const $ = (id) => document.getElementById(id);
const cfg = await mockRibbon();
if (cfg.geocoder === "mock") $("mock-hint").hidden = false;

// The map library comes from a CDN. If it can't load (weak network), the page still works:
// search results and "Use my location" set the pin, there's just no map to drag it on.
const hasMap = typeof window.L !== "undefined";
let map = null, icon = null, marker = null;
let pin = null; // { lat, lng } — the position that will be sent to NIPOST

if (hasMap) {
  map = L.map("map", { zoomControl: true }).setView([9.08, 8.68], 6);
  L.tileLayer(cfg.map?.tileUrl || "https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19, attribution: cfg.map?.attribution || "&copy; OpenStreetMap contributors",
  }).addTo(map);
  icon = L.divIcon({ className: "", html: '<div class="reach-pin"></div>', iconSize: [26, 26], iconAnchor: [3, 26] });
  map.on("click", (e) => placePin(e.latlng.lat, e.latlng.lng));
} else {
  $("map").classList.add("no-map");
  $("map").innerHTML = `<div class="notice warn">The map couldn't load on this connection. You can still pick an address result or use your location, but you won't be able to adjust the pin, so only do this if you're standing at the building.</div>`;
  $("st-2").textContent = "Map unavailable: the pin stays where the result or your GPS put it";
}

function step(n) {
  [1, 2, 3].forEach((i) => { $(`st-${i}`).className = i < n ? "done" : i === n ? "now" : ""; });
}

function placePin(lat, lng, zoom) {
  pin = { lat, lng };
  if (hasMap) {
    if (!marker) {
      marker = L.marker([lat, lng], { draggable: true, icon, keyboard: true, title: "Your building" }).addTo(map);
      marker.on("dragend", () => { pin = marker.getLatLng(); clearOutcome(); step(2); });
    } else marker.setLatLng([lat, lng]);
    if (zoom) map.setView([lat, lng], zoom);
  }
  $("check").disabled = false;
  clearOutcome();
  step(2);
}

function clearOutcome(html = "") { $("outcome").innerHTML = html; }

// ---------- Search ----------
async function search(q) {
  $("results").innerHTML = `<p class="muted">Searching…</p>`;
  try {
    const { results } = await api(`/api/geocode?q=${encodeURIComponent(q)}`);
    if (!results.length) {
      $("results").innerHTML = `<div class="notice warn">No match for that address. Try a nearby street or landmark name, then drag the pin to the building.</div>`;
      return;
    }
    $("results").innerHTML = `<ul class="result-list">${results.map((r, i) =>
      `<li><button type="button" data-i="${i}">${esc(r.label)}${r.precision !== "building" ? `<br><small>Matches the ${r.precision}, not a building: you'll need to move the pin.</small>` : ""}</button></li>`).join("")}</ul>`;
    document.querySelectorAll(".result-list button").forEach((b) => (b.onclick = () => {
      const r = results[Number(b.dataset.i)];
      placePin(r.lat, r.lng, r.precision === "area" ? 16 : 18);
      $("results").innerHTML = `<p class="muted"><small>Showing: ${esc(r.label)}</small></p>`;
    }));
  } catch (e) {
    $("results").innerHTML = `<div class="notice danger">${esc(e.message)}</div>`;
  }
}

$("search").addEventListener("submit", (e) => { e.preventDefault(); const q = $("q").value.trim(); if (q) search(q); });

$("locate").onclick = () => {
  if (!navigator.geolocation) return clearOutcome(`<div class="notice danger">This browser can't read your location. Search for the address instead.</div>`);
  $("locate").disabled = true;
  navigator.geolocation.getCurrentPosition(
    (p) => { $("locate").disabled = false; placePin(p.coords.latitude, p.coords.longitude, 18); },
    (err) => {
      $("locate").disabled = false;
      clearOutcome(`<div class="notice danger">${err.code === 1
        ? "Location permission was refused. Allow it for this site (the page must be opened over https), or search for the address."
        : "Couldn't get a GPS fix. Step outside and try again, or search for the address."}</div>`);
    },
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
  );
};

// ---------- Ask NIPOST ----------
const noteField = `
  <label for="note">Directions for visitors (optional)</label>
  <input id="note" type="text" maxlength="280" placeholder="e.g. Second gate after the pharmacy">
  <p class="muted"><small>Shown on your card, labelled as yours.</small></p>`;

$("check").onclick = async () => {
  if (!pin) return;
  const { lat, lng } = pin;
  $("check").disabled = true;
  clearOutcome(`<p class="muted">Asking NIPOST…</p>`);
  try {
    const r = await api("/api/find/check", { method: "POST", body: { lat, lng } });
    step(3);
    if (r.status === "high") {
      clearOutcome(`
        <h2>Your postcode</h2>
        ${plateHTML(r.unit.postcode, { reveal: true })}
        <p><span class="badge high">High confidence · ${r.unit.distance_m} m</span></p>
        ${noteField}
        <button id="make" class="big">Create my Address Card</button>`);
      $("make").onclick = () => makeCard({ lat, lng });
    } else if (r.status === "confirm") {
      clearOutcome(`
        <h2>Which building is yours?</h2>
        <p class="muted">NIPOST found more than one building near the pin.</p>
        ${r.candidates.map((c, i) => `
          <label class="choice"><input type="radio" name="pick" value="${esc(c.postcode)}">
            ${plateHTML(c.postcode, { small: true })}<span class="muted">${Math.round(c.distance_m)} m</span></label>`).join("")}
        <p class="muted"><small>Not listed? Move the pin closer to the building and tap Get my postcode again.</small></p>
        ${noteField}
        <button id="make" class="big" disabled>Create my Address Card</button>`);
      document.querySelectorAll('input[name="pick"]').forEach((el) => (el.onchange = () => { $("make").disabled = false; }));
      $("make").onclick = () => makeCard({ lat, lng, postcode: document.querySelector('input[name="pick"]:checked')?.value });
    } else if (r.status === "none") {
      clearOutcome(`
        <h2>NIPOST hasn't mapped a building here yet</h2>
        <p>Check the pin is on the building itself. If it is, the building may not be registered yet, and you can ask NIPOST to add it.</p>
        <p class="muted">Your confirmed location:</p>
        <p class="coords" id="ll">${esc(r.register.coordinates)}</p>
        <div class="row">
          <button id="copy-ll" class="secondary">Copy coordinates</button>
          <button id="copy-maps" class="secondary">Copy map link</button>
          <a class="button" href="${esc(r.register.registerUrl)}" target="_blank" rel="noopener">Open NIPOST to register</a>
        </div>
        <p class="muted"><small>NIPOST registers buildings on its own website and app. Paste the coordinates or map link there. Reach Naija can't submit it for you yet.</small></p>`);
      $("copy-ll").onclick = (e) => copy(r.register.coordinates, e.target);
      $("copy-maps").onclick = (e) => copy(r.register.mapsLink, e.target);
    } else {
      clearOutcome(`<div class="notice warn">${esc(r.message)}</div>`);
    }
  } catch (e) {
    clearOutcome(`<div class="notice danger">${esc(e.message)}</div>`);
  } finally {
    $("check").disabled = false;
  }
};

async function makeCard(body) {
  $("make").disabled = true;
  try {
    const { card } = await api("/api/find/card", { method: "POST", body: { ...body, note: $("note")?.value || null } });
    location.href = `/c/${card.id}`;
  } catch (e) {
    $("make").disabled = false;
    $("outcome").insertAdjacentHTML("beforeend", `<div class="notice danger">${esc(e.message)}</div>`);
  }
}

async function copy(text, btn) {
  try { await navigator.clipboard.writeText(text); btn.textContent = "Copied"; }
  catch { btn.textContent = "Select and copy above"; }
}

// Arriving from WhatsApp with ?q=<address>
const q = new URLSearchParams(location.search).get("q");
if (q) { $("q").value = q; search(q); }
