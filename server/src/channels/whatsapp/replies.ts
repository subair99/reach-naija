// Every message the assistant sends, in English (en) and Nigerian Pidgin (pcm).
// Have a native speaker review the Pidgin before the demo.
export type Lang = "en" | "pcm";

type Vars = Record<string, string | number>;
const fill = (t: string, v: Vars) => t.replace(/\{(\w+)\}/g, (_m, k) => String(v[k] ?? ""));

const T = {
  greet: {
    en: "Welcome to Reach Naija.\nShare your location pin (tap 📎, then Location, then Send your current location) and I'll find your NIPOST postcode.\n\nReply PIDGIN to switch language.",
    pcm: "Welcome to Reach Naija.\nSend your location pin (press 📎, then Location, then Send your current location) make I find your NIPOST postcode.\n\nReply ENGLISH to change language.",
  },
  found: {
    en: "Your postcode is {display}\nConfidence: {badge}\n\nYour Address Card: {url}\n\nReply NOTE and your directions to add a delivery note.\nReply HELP to get an emergency link.",
    pcm: "Your postcode na {display}\nConfidence: {badge}\n\nYour Address Card: {url}\n\nReply NOTE plus your direction to add delivery note.\nReply HELP to collect emergency link.",
  },
  pick: {
    en: "I found more than one building near your pin. Reply with the number of yours:\n{list}\n\nNot listed? Move closer to your building and share your pin again.",
    pcm: "I see more than one building near your pin. Reply with the number wey be your own:\n{list}\n\nE no dey there? Waka near your building, then send your pin again.",
  },
  none: {
    en: "I couldn't find a NIPOST building within {radius} m of that pin. Stand closer to the building or wait for a stronger GPS signal, then share your pin again.",
    pcm: "I no fit find NIPOST building inside {radius} m of that pin. Stand near the building or wait make GPS signal strong, then send your pin again.",
  },
  help: {
    en: "Help card for {display}:\n{url}\n\nThis link does NOT call for help. Call 112 first, then share this link with the responder.\nIt stops working after {hours} hours.",
    pcm: "Help card for {display}:\n{url}\n\nThis link NO dey call for help. Call 112 first, then send this link give the person wey dey come.\nE go stop to work after {hours} hours.",
  },
  noteSaved: {
    en: "Delivery note saved on your card:\n\"{note}\"\n{url}",
    pcm: "I don save your delivery note for your card:\n\"{note}\"\n{url}",
  },
  noCard: {
    en: "You don't have an Address Card yet. Share your location pin first.",
    pcm: "You never get Address Card. Send your location pin first.",
  },
  deleted: {
    en: "Your Address Card for {display} has been withdrawn. The link no longer works.",
    pcm: "I don cancel your Address Card for {display}. The link no go work again.",
  },
  langSet: {
    en: "OK, I'll reply in English.",
    pcm: "Oya, I go dey reply you for Pidgin.",
  },
  error: {
    en: "Something went wrong looking up that location. Please share your pin again in a minute.",
    pcm: "Wahala happen as I dey check that location. Abeg send your pin again after small time.",
  },
  mockTag: {
    en: "\n\n(Demo: mock NIPOST data)",
    pcm: "\n\n(Demo: mock NIPOST data)",
  },
} as const;

export type Key = keyof typeof T;

export function say(key: Key, lang: Lang, vars: Vars = {}): string {
  return fill(T[key][lang], vars);
}

export function badge(confidence: string, lang: Lang, distanceM: number | null): string {
  const d = distanceM !== null ? ` (${distanceM} m)` : "";
  if (confidence === "high") return "HIGH" + d;
  if (confidence === "confirmed") return lang === "pcm" ? "You confirm am" : "Confirmed by you";
  return lang === "pcm" ? "You choose am" : "Selected by you";
}

// Pidgin detection is deliberately simple; users can always switch with PIDGIN / ENGLISH.
const PIDGIN_HINTS = /\b(abeg|wetin|dey|una|wahala|howfa|how far|oya|sabi|wan|na im|no wahala)\b/i;
export function looksPidgin(text: string): boolean {
  return PIDGIN_HINTS.test(text);
}
