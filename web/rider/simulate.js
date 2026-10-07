// "Simulated location" switch for stage demos. Shared with rider.js through window.reachSim.
import { api } from "/shared/plate.js";

const on = document.getElementById("sim-on");
const sel = document.getElementById("sim-loc");
const banner = document.getElementById("sim-banner");

const { locations } = await api("/api/demo/locations");
sel.innerHTML = locations.map((l) => `<option value="${l.id}">${l.label} (${l.postcode})</option>`).join("");

function sync() { banner.hidden = !on.checked; }
on.addEventListener("change", sync);
sync();

window.reachSim = {
  enabled: () => on.checked,
  position: () => {
    const l = locations.find((x) => x.id === sel.value);
    // A few metres of jitter so it behaves like a real fix.
    const j = () => (Math.random() - 0.5) * 0.00004;
    return { lat: l.lat + j(), lng: l.lng + j() };
  },
};
