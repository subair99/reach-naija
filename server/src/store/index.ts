import { config } from "../config.ts";
import { memoryStore } from "./memory.ts";
import { postgresStore } from "./postgres.ts";
import type { Store } from "./types.ts";

export const store: Store = config.store === "postgres" ? postgresStore() : memoryStore();
export * from "./types.ts";
