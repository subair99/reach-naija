// Minimal USSD session: accumulates answers as "1*2*3", like the operator gateway does.
const $ = (id) => document.getElementById(id);
let answers = [];
let session = "";

async function send() {
  const body = new URLSearchParams({
    sessionId: session, serviceCode: "*384*1#", phoneNumber: $("phone").value, text: answers.join("*"),
  });
  const res = await fetch("/webhooks/ussd", { method: "POST", body });
  const reply = await res.text();
  const open = reply.startsWith("CON ");
  $("screen").textContent = reply.replace(/^(CON|END) /, "");
  $("answer").disabled = !open;
  $("send").disabled = !open;
  $("answer").value = "";
  if (open) $("answer").focus();
}

$("dial").onclick = () => { answers = []; session = crypto.randomUUID(); send(); };
$("send").onclick = () => { if ($("answer").value.trim()) { answers.push($("answer").value.trim()); send(); } };
$("answer").addEventListener("keydown", (e) => { if (e.key === "Enter") $("send").click(); });
$("cancel").onclick = () => { answers = []; $("screen").textContent = "Session ended."; $("answer").disabled = true; $("send").disabled = true; };
