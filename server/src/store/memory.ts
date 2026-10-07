// In-memory store: zero setup, data lost on restart. Good for rehearsing the demo.
import type { Arrival, Card, Store } from "./types.ts";

export function memoryStore(): Store {
  const cards = new Map<string, Card>();
  const saved = new Map<string, { postcode: string; cardId: string; savedAt: string }[]>();
  const langs = new Map<string, string>();
  const arrivals = new Map<string, Arrival>();

  return {
    async init() {},
    cards: {
      async create(card) { cards.set(card.id, card); return card; },
      async get(id) { return cards.get(id) ?? null; },
      async update(id, patch) {
        const c = cards.get(id); if (!c) return null;
        const next = { ...c, ...patch }; cards.set(id, next); return next;
      },
      async latestForOwner(ownerHash) {
        return [...cards.values()]
          .filter((c) => c.ownerHash === ownerHash && !c.revokedAt && c.mode !== "help")
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null;
      },
    },
    saved: {
      async add(ownerHash, postcode, cardId) {
        const list = (saved.get(ownerHash) ?? []).filter((s) => s.postcode !== postcode);
        list.unshift({ postcode, cardId, savedAt: new Date().toISOString() });
        saved.set(ownerHash, list.slice(0, 10));
      },
      async list(ownerHash) { return saved.get(ownerHash) ?? []; },
    },
    prefs: {
      async getLang(ownerHash) { return langs.get(ownerHash) ?? null; },
      async setLang(ownerHash, lang) { langs.set(ownerHash, lang); },
    },
    arrivals: {
      async create(a) { arrivals.set(a.id, a); return a; },
      async get(id) { return arrivals.get(id) ?? null; },
      async update(id, patch) {
        const a = arrivals.get(id); if (!a) return null;
        const next = { ...a, ...patch, updatedAt: new Date().toISOString() }; arrivals.set(id, next); return next;
      },
      async list(status) {
        return [...arrivals.values()]
          .filter((a) => !status || a.status === status)
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      },
    },
  };
}
