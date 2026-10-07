// Shared helpers for the demo pages.
export const LABELS = ["State", "LGA", "District", "Area", "Building"];

export function plateHTML(code, { small = false, reveal = false } = {}) {
  const c = String(code).toUpperCase().replace(/[^A-Z0-9]/g, "");
  const parts = [c.slice(0, 2), c.slice(2, 4), c.slice(4, 7), c.slice(7, 9), c.slice(9, 11)];
  const segs = parts.map((p, i) =>
    `<div class="seg"><span class="code">${p}</span><span class="label">${LABELS[i]}</span></div>`).join("");
  return `<div class="plate${small ? " small" : ""}${reveal ? " reveal" : ""}" role="img" aria-label="Postcode ${parts.join(" ")}">${segs}</div>`;
}

export async function api(path, { method = "GET", body, headers = {} } = {}) {
  const res = await fetch(path, {
    method,
    headers: body ? { "Content-Type": "application/json", ...headers } : headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data?.error?.message || `Request failed (${res.status})`);
    err.status = res.status; err.code = data?.error?.code;
    throw err;
  }
  return data;
}

// Shows a yellow ribbon on every page while the server uses mock NIPOST data.
export async function mockRibbon() {
  try {
    const cfg = await api("/api/config");
    if (cfg.mock) {
      const r = document.createElement("div");
      r.className = "mock-ribbon";
      r.textContent = "Mock NIPOST data: for rehearsal only, not real postcode records";
      document.body.prepend(r);
    }
    return cfg;
  } catch { return {}; }
}

export function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

export const badgeText = { high: "High confidence", confirmed: "Confirmed by occupant", selected: "Selected by the user" };
