// The one NIPOST interface the rest of the server uses, in live or mock mode.
import { config } from "../config.ts";
import { assemble, disassemble } from "./assembly.ts";
import { cached, TTL } from "./cache.ts";
import { lookup } from "./lookup.ts";
import { mockNipost } from "./mock.ts";
import { autocomplete, nearby, reverse } from "./search.ts";
import type { NipostApi } from "./types.ts";

const live: NipostApi = { reverse, nearby, autocomplete, lookup, assemble, disassemble };
const base: NipostApi = config.nipost.mode === "live" ? live : mockNipost;

export const nipost: NipostApi = {
  reverse: base.reverse,
  nearby: base.nearby,
  autocomplete: (q) => cached(`ac:${q.toUpperCase()}`, TTL.autocomplete, () => base.autocomplete(q)),
  lookup: (code, level) => cached(`lk:${level}:${code.toUpperCase()}`, TTL.lookup, () => base.lookup(code, level)),
  assemble: (s) => cached(`as:${Object.values(s).join("|").toUpperCase()}`, TTL.assembly, () => base.assemble(s)),
  disassemble: (code) => cached(`ds:${code.toUpperCase()}`, TTL.assembly, () => base.disassemble(code)),
};

export const isMock = config.nipost.mode === "mock";
export * from "./types.ts";
