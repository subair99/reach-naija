// Assembly: the canonical way to turn user input into a well-formed postcode.
import { nipostRequest } from "./client.ts";
import type { AssembleResult } from "./types.ts";

export function assemble(seg: { state: string; lga: string; district: string; area: string; unit: string }) {
  return nipostRequest<AssembleResult>("POST", "/v1/assembly/assemble", { body: seg });
}

export function disassemble(code: string) {
  return nipostRequest<AssembleResult & { segments?: Record<string, string> }>(
    "GET", "/v1/assembly/disassemble", { query: { code } },
  );
}
