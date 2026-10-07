// Builds a WhatsApp voice note (OGG/Opus) that reads a postcode segment by segment,
// by stitching pre-recorded clips. Nothing is synthesised, so nothing can be invented.
//
// Clips live in audio/<lang>/ and are named by what they say:
//   a.mp3 ... z.mp3, 0.mp3 ... 9.mp3   one per character
//   intro.mp3   (optional) "Your postcode is"
//   pause.mp3   (optional) short silence between segments; generated if missing
// Any of .mp3 .wav .m4a .ogg works; mixed formats are fine.
import { execFile } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { ROOT, config } from "../config.ts";
import { log } from "../lib/log.ts";
import { compact, parse } from "../lib/postcode.ts";

const run = promisify(execFile);
const EXTS = [".mp3", ".wav", ".m4a", ".ogg"];
const OUT = path.join(ROOT, "audio/out");

function clip(lang: string, name: string): string | null {
  for (const ext of EXTS) {
    const p = path.join(ROOT, "audio", lang, name + ext);
    if (existsSync(p)) return p;
  }
  return null;
}

export type VoiceResult = { file: string } | { file: null; missing: string[] };

export async function voiceNote(code: string, lang: string): Promise<VoiceResult> {
  if (!config.voiceEnabled) return { file: null, missing: [] };
  const seg = parse(code);
  if (!seg) return { file: null, missing: [] };

  mkdirSync(OUT, { recursive: true });
  const outFile = path.join(OUT, `${lang}-${compact(code)}.ogg`);
  if (existsSync(outFile)) return { file: outFile };

  // Sequence of inputs: intro?, segment chars, pause between segments.
  const parts: (string | "PAUSE")[] = [];
  const intro = clip(lang, "intro");
  if (intro) parts.push(intro);
  const missing = new Set<string>();
  Object.values(seg).forEach((s, i) => {
    if (i > 0) parts.push("PAUSE");
    for (const ch of s.toLowerCase()) {
      const c = clip(lang, ch);
      if (c) parts.push(c); else missing.add(ch);
    }
  });
  if (missing.size) return { file: null, missing: [...missing].sort() };

  const pauseClip = clip(lang, "pause");
  const args: string[] = ["-y", "-hide_banner", "-loglevel", "error"];
  const labels: string[] = [];
  let n = 0;
  for (const p of parts) {
    if (p === "PAUSE") {
      if (pauseClip) args.push("-i", pauseClip);
      else args.push("-f", "lavfi", "-t", "0.35", "-i", "anullsrc=r=48000:cl=mono");
    } else {
      args.push("-i", p);
    }
    labels.push(`[${n}:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=mono[a${n}]`);
    n++;
  }
  const filter = labels.join(";") + ";" + Array.from({ length: n }, (_, i) => `[a${i}]`).join("") + `concat=n=${n}:v=0:a=1[out]`;
  args.push("-filter_complex", filter, "-map", "[out]", "-c:a", "libopus", "-b:a", "32k", outFile);

  try {
    await run("ffmpeg", args);
    return { file: outFile };
  } catch (e) {
    log.error("voice_stitch_failed", { error: (e as Error).message.slice(0, 300) });
    return { file: null, missing: [] };
  }
}
