// In-process cache. Public, non-personal results (autocomplete, assembly) are cached briefly;
// paid L2-L3 lookups are cached per building so a partner never pays twice for the same door.
// Reverse-geocode results are NOT cached: a coordinate is personal data.
type Entry = { value: unknown; expires: number };
const store = new Map<string, Entry>();
const MAX_ENTRIES = 5_000;

export async function cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const hit = store.get(key);
  if (hit && hit.expires > Date.now()) return hit.value as T;
  const value = await load();
  if (store.size >= MAX_ENTRIES) store.delete(store.keys().next().value as string);
  store.set(key, { value, expires: Date.now() + ttlMs });
  return value;
}

export const TTL = {
  autocomplete: 60 * 60 * 1000,
  assembly: 24 * 60 * 60 * 1000,
  lookup: 24 * 60 * 60 * 1000,
};
