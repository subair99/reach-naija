// Loads the card and renders it in Deliver or Help mode.
import { api, esc, mockRibbon } from "/shared/plate.js";
import { renderDeliver } from "/card/deliver.js";
import { renderHelp } from "/card/help.js";

const app = document.getElementById("app");
const id = location.pathname.split("/").filter(Boolean)[1];
const params = new URLSearchParams(location.search);

mockRibbon();

try {
  const { card } = await api(`/api/cards/${encodeURIComponent(id)}`);
  const mode = params.get("mode") || card.mode;
  if (mode === "help") renderHelp(app, card);
  else renderDeliver(app, card);
} catch (e) {
  document.title = "Card unavailable · Reach Naija";
  app.innerHTML = `<h1>This card is not available</h1><p>${esc(e.message)}</p>`;
}
