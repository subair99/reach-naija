// Africa's Talking USSD callback. AT posts sessionId, serviceCode, phoneNumber and text
// (every answer so far joined with "*"); we reply "CON ..." to continue or "END ..." to finish.
// The whole menu state is rebuilt from `text` on each request, so the server keeps no session.
import { buildCard } from "../../cards/service.ts";
import { hashId } from "../../lib/hash.ts";
import { route, text } from "../../lib/http.ts";
import { log } from "../../lib/log.ts";
import { display, parse } from "../../lib/postcode.ts";
import { cardUrl } from "../../lib/qr.ts";
import { nipost } from "../../nipost/index.ts";
import { store } from "../../store/index.ts";
import { PAGE_SIZE, SEGMENTS, options } from "./menus.ts";

const NEXT = "8";
const MAIN = "CON Reach Naija\n1. Find my postcode\n2. Check a postcode\n3. My saved postcode";

route("POST", "/webhooks/ussd", async (req, res) => {
  const phone = String(req.body.phoneNumber ?? "");
  const input = String(req.body.text ?? "");
  const answers = input === "" ? [] : input.split("*");
  let reply: string;
  try {
    reply = await menu(answers, phone ? hashId("phone", phone) : null);
  } catch (e) {
    log.error("ussd_failed", { error: (e as Error).message });
    reply = "END Sorry, the postcode service is not responding. Please try again shortly.";
  }
  text(res, 200, reply);
});

async function menu(answers: string[], owner: string | null): Promise<string> {
  if (answers.length === 0) return MAIN;
  const [first, ...rest] = answers;

  if (first === "1") return findFlow(rest, owner);

  if (first === "2") {
    if (rest.length === 0) return "CON Enter the postcode, e.g. LA11W06TC10";
    const seg = parse(rest[0]);
    if (!seg) return "END That is not a full postcode. It has 11 characters, e.g. LA 11 W06 TC 10.";
    const r = await nipost.lookup(rest[0], 1);
    return r.valid ? `END ${display(seg)} is a valid NIPOST postcode.` : `END ${display(seg)} is not an active NIPOST postcode.`;
  }

  if (first === "3") {
    if (!owner) return "END No saved postcode for this number.";
    const saved = await store.saved.list(owner);
    if (!saved.length) return "END No saved postcode yet. Choose 1 to find yours.";
    return `END Your postcode: ${saved[0].postcode.replace(/-/g, " ")}\nCard: ${cardUrl(saved[0].cardId)}`;
  }

  return "END Choose 1, 2 or 3.";
}

// Walk the five segments. Each answer is either a pick (1-7) or NEXT (8) for the next page.
async function findFlow(answers: string[], owner: string | null): Promise<string> {
  const chosen: string[] = [];
  let page = 0;
  let opts = await options(chosen);

  for (const a of answers) {
    if (a === NEXT && (page + 1) * PAGE_SIZE < opts.length) { page++; continue; }
    const pick = opts[page * PAGE_SIZE + Number(a) - 1];
    if (!/^[1-7]$/.test(a) || !pick) return "END That option is not on the list. Dial again to start over.";
    chosen.push(pick.code);
    page = 0;
    if (chosen.length === SEGMENTS.length) break;
    opts = await options(chosen);
  }

  if (chosen.length === SEGMENTS.length) {
    const code = chosen.join("");
    const { card } = await buildCard({ code, confidence: "selected", source: "ussd", ownerHash: owner });
    // TODO pilot: also send the card link by SMS through the aggregator.
    return `END Your postcode:\n${card.display}\nCard: ${cardUrl(card.id)}`;
  }

  const seg = SEGMENTS[chosen.length];
  if (!opts.length) return `END No ${seg.label} found under ${chosen.join(" ")}. Dial again to start over.`;
  const pageOpts = opts.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const lines = pageOpts.map((o, i) => `${i + 1}. ${o.label === o.code ? o.code : `${o.label} (${o.code})`}`);
  if ((page + 1) * PAGE_SIZE < opts.length) lines.push(`${NEXT}. More`);
  const sofar = chosen.length ? `${chosen.join(" ")}\n` : "";
  return `CON ${sofar}Choose your ${seg.label}:\n${lines.join("\n")}`;
}
