// PostgreSQL store. Same behaviour as the memory store, persisted.
import { migrate } from "../db/migrate.ts";
import { getPool } from "../db/pool.ts";
import type { Arrival, Card, Store } from "./types.ts";

export function postgresStore(): Store {
  const q = async (sql: string, params: unknown[] = []) => (await getPool()).query(sql, params);

  return {
    async init() { await migrate(); },
    cards: {
      async create(card) {
        await q(
          `INSERT INTO address_cards (id, owner_hash, data, created_at, expires_at, revoked_at)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [card.id, card.ownerHash, card, card.createdAt, card.expiresAt, card.revokedAt],
        );
        return card;
      },
      async get(id) {
        const r = await q(`SELECT data FROM address_cards WHERE id = $1`, [id]);
        return (r.rows[0]?.data as Card) ?? null;
      },
      async update(id, patch) {
        const current = await this.get(id);
        if (!current) return null;
        const next = { ...current, ...patch };
        await q(`UPDATE address_cards SET data = $2, expires_at = $3, revoked_at = $4 WHERE id = $1`,
          [id, next, next.expiresAt, next.revokedAt]);
        return next;
      },
      async latestForOwner(ownerHash) {
        const r = await q(
          `SELECT data FROM address_cards WHERE owner_hash = $1 AND revoked_at IS NULL AND data->>'mode' <> 'help'
           ORDER BY created_at DESC LIMIT 1`, [ownerHash]);
        return (r.rows[0]?.data as Card) ?? null;
      },
    },
    saved: {
      async add(ownerHash, postcode, cardId) {
        await q(
          `INSERT INTO saved_postcodes (owner_hash, postcode, card_id) VALUES ($1, $2, $3)
           ON CONFLICT (owner_hash, postcode) DO UPDATE SET card_id = EXCLUDED.card_id, saved_at = now()`,
          [ownerHash, postcode, cardId]);
      },
      async list(ownerHash) {
        const r = await q(
          `SELECT postcode, card_id, saved_at FROM saved_postcodes WHERE owner_hash = $1
           ORDER BY saved_at DESC LIMIT 10`, [ownerHash]);
        return r.rows.map((x: any) => ({ postcode: x.postcode, cardId: x.card_id, savedAt: new Date(x.saved_at).toISOString() }));
      },
    },
    prefs: {
      async getLang(ownerHash) {
        const r = await q(`SELECT lang FROM user_prefs WHERE owner_hash = $1`, [ownerHash]);
        return r.rows[0]?.lang ?? null;
      },
      async setLang(ownerHash, lang) {
        await q(`INSERT INTO user_prefs (owner_hash, lang) VALUES ($1, $2)
                 ON CONFLICT (owner_hash) DO UPDATE SET lang = EXCLUDED.lang`, [ownerHash, lang]);
      },
    },
    arrivals: {
      async create(a) {
        await q(`INSERT INTO arrivals (id, status, data, created_at, updated_at) VALUES ($1, $2, $3, $4, $5)`,
          [a.id, a.status, a, a.createdAt, a.updatedAt]);
        return a;
      },
      async get(id) {
        const r = await q(`SELECT data FROM arrivals WHERE id = $1`, [id]);
        return (r.rows[0]?.data as Arrival) ?? null;
      },
      async update(id, patch) {
        const current = await this.get(id);
        if (!current) return null;
        const next = { ...current, ...patch, updatedAt: new Date().toISOString() };
        await q(`UPDATE arrivals SET status = $2, data = $3, updated_at = $4 WHERE id = $1`,
          [id, next.status, next, next.updatedAt]);
        return next;
      },
      async list(status) {
        const r = status
          ? await q(`SELECT data FROM arrivals WHERE status = $1 ORDER BY created_at DESC LIMIT 50`, [status])
          : await q(`SELECT data FROM arrivals ORDER BY created_at DESC LIMIT 50`);
        return r.rows.map((x: any) => x.data as Arrival);
      },
    },
  };
}
