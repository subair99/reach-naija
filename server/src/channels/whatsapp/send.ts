// WhatsApp Cloud API calls. Without WA_TOKEN/WA_PHONE_ID the server runs in dry-run mode:
// replies go to an in-memory outbox (GET /api/dev/outbox) so you can rehearse without Meta.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { config } from "../../config.ts";
import { log } from "../../lib/log.ts";

export const dryRun = !config.whatsapp.token || !config.whatsapp.phoneId;
const outbox: { at: string; kind: "text" | "audio"; body: string }[] = [];

export function getOutbox() { return outbox.slice(-50); }

function graph(p: string) {
  return `https://graph.facebook.com/${config.whatsapp.apiVersion}/${config.whatsapp.phoneId}/${p}`;
}

async function post(p: string, body: unknown) {
  const res = await fetch(graph(p), {
    method: "POST",
    headers: { Authorization: `Bearer ${config.whatsapp.token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    const detail = await res.text();
    log.error("whatsapp_send_failed", { status: res.status, detail: detail.slice(0, 300) });
    throw new Error(`WhatsApp API ${res.status}`);
  }
  return res.json();
}

export async function sendText(to: string, body: string) {
  if (dryRun) { outbox.push({ at: new Date().toISOString(), kind: "text", body }); return; }
  await post("messages", { messaging_product: "whatsapp", to, type: "text", text: { body, preview_url: true } });
}

// Uploads an OGG/Opus file and sends it as a voice note.
export async function sendVoice(to: string, file: string) {
  if (dryRun) { outbox.push({ at: new Date().toISOString(), kind: "audio", body: path.basename(file) }); return; }
  const form = new FormData();
  form.append("messaging_product", "whatsapp");
  form.append("type", "audio/ogg");
  form.append("file", new Blob([await readFile(file)], { type: "audio/ogg" }), path.basename(file));
  const up = await fetch(graph("media"), {
    method: "POST",
    headers: { Authorization: `Bearer ${config.whatsapp.token}` },
    body: form,
    signal: AbortSignal.timeout(30_000),
  });
  if (!up.ok) { log.error("whatsapp_media_upload_failed", { status: up.status }); return; }
  const { id } = (await up.json()) as { id: string };
  await post("messages", { messaging_product: "whatsapp", to, type: "audio", audio: { id } });
}
