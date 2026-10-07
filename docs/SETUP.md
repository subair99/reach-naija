# Reach Naija: setup and running guide

*One postcode. Verified. Actionable. Everywhere.*

A working demo of the Reach Naija proposal for the NIPOST postcode challenge. It covers these pieces:

- **WhatsApp assistant:** share a location pin and get back your NIPOST postcode, an Address Card link and a voice note.
- **USSD menus:** step through state, LGA, district, area and building on a feature phone.
- **Address Card:** a shareable page in Deliver mode (for riders) and Help mode (for responders).
- **Pharmacy checkout:** checks the postcode with NIPOST for free before the order is placed.
- **Rider view with Verified Arrival:** a record is signed only when the rider's GPS matches the building *and* the customer gives their hand-over code.

It runs straight away with **no keys, no database and no Meta account**, using a built-in mock NIPOST. Everything the mock returns is labelled as mock data on every screen and message. Switch to the real NIPOST API when your staging keys arrive.

---

## 1. Run it in five minutes (WSL)

Requirements: Windows 10/11 with WSL 2 (Ubuntu), and **Node.js 22.18 or newer**. Node runs the TypeScript directly, so there is no build step.

```bash
# In Ubuntu (WSL). Keep the project in your Linux home, not under /mnt/c (much faster).
cd ~ && unzip reach-naija.zip && cd reach-naija

bash scripts/setup-wsl.sh     # first time only: Node, ffmpeg, cloudflared, npm install, .env
source ~/.bashrc              # so this terminal finds the Node that nvm just installed
npm run dev                   # starts the server with auto-reload
```

Open <http://localhost:3000> in your Windows browser. WSL forwards localhost automatically.

In a second terminal, check everything end to end:

```bash
npm run smoke
```

You should see `All checks passed.`

| Page | What it shows |
| --- | --- |
| `/` | Demo home, status, WhatsApp dry-run outbox |
| `/find/` | Type an address, confirm the pin, get the postcode |
| `/c/<id>` | Address Card, Deliver mode (`?mode=help` for Help mode) |
| `/shop/` | Pharmacy checkout with free L1 validation and live delivery status |
| `/rider/` | Rider check-in, hand-over code, signed record |
| `/ussd/` | Feature-phone simulator posting to the USSD webhook |

---

## 2. Project tour

```
server/src/
  index.ts              HTTP server, static pages, error handling
  config.ts             Reads .env, refuses unsafe settings (e.g. a publishable key used as secret)
  nipost/               NIPOST client: search (reverse, nearby, autocomplete), lookup, assembly,
                        cache, and mock.ts (the stand-in used when NIPOST_MODE=mock)
  cards/                Pin → postcode resolution, Address Cards, Help cards that expire
  geocode/              Address text → map positions (mock or Nominatim)
  find/                 Endpoints behind the /find/ page
  channels/whatsapp/    Webhook, replies in English and Pidgin, Cloud API sending
  channels/ussd/        Africa's Talking callback and autocomplete-driven menus
  arrival/              Verified Arrival: GPS check, one-time code, Ed25519 signing
  checkout/             Free L1 check and orders
  store/                memory (default) or postgres, same interface
  voice/stitch.ts       Builds voice notes from recorded clips with ffmpeg
web/                    Plain HTML/JS pages, no build step
fixtures/               NIPOST test postcodes and demo coordinates
scripts/                setup, tunnel, migrate, keys, smoke test
audio/                  Your recorded clips (see audio/README.md)
```

### Rules the code follows

These come from the proposal and NIPOST's docs.

- **Secret key stays on the server.** The NIPOST secret key is only used in `server/src/nipost/client.ts`. Only the publishable key ever reaches a browser, and only for NIPOST's widget.
- **No silent wrong answers.** Anything below HIGH confidence asks the user to pick their building from nearby units.
- **NIPOST is the only source of location.** Every field on a card is labelled with its source. Voice notes are stitched from recorded clips, so nothing is generated.
- **Lookups stop at level 3.** The server never requests levels 4–5 (building-owner info, point geometry).
- **Identifiers are hashed.** Phone numbers and rider ids are stored only as keyed hashes. Coordinates are never stored, and reverse-geocode results are never cached.
- **Verified Arrival needs two signals.** The rider's GPS must match the destination unit *and* the customer must give their code. A simulated location is recorded as `gps_simulated: true` inside the signed record.

---

## 3. Switch to the real NIPOST API

1. Get staging keys through the NIPOST developer portal: organisation account → KYB → access request → staging tokens.
2. Edit `.env`:
   ```
   NIPOST_MODE=live
   NIPOST_SECRET_KEY=nipost_test_...
   NIPOST_MAX_LEVEL=3          # whatever level you were granted
   ```
3. **Replace the coordinates in `fixtures/demo-locations.json`.** The ones shipped are placeholders. You need points that reverse-geocode to each test postcode on staging. Ask NIPOST onboarding, or find them with the widget's map mode.
4. Restart and run `npm run smoke`. Every check should pass against staging.

### Check these on staging

The public reference left them open, so the code is defensive about each:

| Question | Where it matters |
| --- | --- |
| Does `/v1/search/nearby` return a list under `units`, `results`, or as a bare array? | `nipost/search.ts` accepts all three |
| Does autocomplete suggest the *next* segment when the query ends with a space (`"LA 11 "`)? | `channels/ussd/menus.ts` |
| Does autocomplete accept an empty query for the state list? | The USSD menu falls back to the state list from `fixtures/` |
| Does Search need `X-API-Key`? The overview says no; the endpoint pages say yes. | The client always sends it |
| The overview says postcodes are 12 characters; the five segments total 11. | Local parsing uses 11; Assembly is the canonical parser |

---

## 4. Make it reachable from a phone (tunnel)

WhatsApp, Africa's Talking and phone GPS all need a public **HTTPS** address.

```bash
bash scripts/tunnel.sh        # prints https://<random>.trycloudflare.com
```

Put that URL in `.env` as `PUBLIC_URL=https://<random>.trycloudflare.com` and restart `npm run dev`, so card links point to it. The quick-tunnel URL changes each time you start it; a named Cloudflare tunnel keeps a fixed address.

Open `https://<random>.trycloudflare.com/rider/` on your phone. Browsers only allow GPS on HTTPS pages.

---

## 5. WhatsApp (Meta Cloud API)

1. At developers.facebook.com create an app, add **WhatsApp**, and note the test **phone number ID** and a **token**. Add your own number as a test recipient.
2. In `.env`: `WA_TOKEN`, `WA_PHONE_ID`, and any `WA_VERIFY_TOKEN` you choose. Optionally set `WA_APP_SECRET` to verify Meta's request signatures.
3. In the app's WhatsApp → Configuration, set the callback URL to `https://<your-tunnel>/webhooks/whatsapp` and the same verify token. Subscribe to **messages**.
4. Restart. From your phone, message the test number, then share your location.

| Reply | What it does |
| --- | --- |
| *(location pin)* | Postcode, card link, voice note |
| *(an address, e.g. `12 Adeola Odeku St, VI`)* | A link to `/find/` with the address filled in, to confirm the pin |
| `1`–`3` | Pick your building when the pin was ambiguous |
| `NOTE second gate after the pharmacy` | Adds a delivery note to your card |
| `HELP` | A Help card that expires in 12 hours (it does not call 112) |
| `CARD` | Resend your card |
| `DELETE` | Withdraw your card |
| `PIDGIN` / `ENGLISH` | Switch language |

Without credentials the server runs in **dry-run** mode. Replies go to the outbox on the home page (`/api/dev/outbox`), so you can rehearse anywhere.

**Voice notes:** record about 40 short clips per language into `audio/en/` and `audio/pcm/` (see `audio/README.md`). Missing clips just mean text-only replies, and the server logs which characters are missing.

**Pidgin:** the replies in `channels/whatsapp/replies.ts` need review by a native speaker before the demo.

---

## 6. USSD (Africa's Talking sandbox)

Rehearse offline with `/ussd/`. To use a real phone simulator:

1. Create a sandbox app at africastalking.com and a USSD channel (sandbox service code).
2. Set its callback URL to `https://<your-tunnel>/webhooks/ussd`.
3. Use the sandbox simulator on their site.

Sending the card link by SMS at the end of the flow is marked `TODO pilot` in `channels/ussd/handler.ts`.

---

## 7. Optional: PostgreSQL instead of memory

```bash
docker compose up -d          # PostGIS 16 on localhost:5432 (Docker Desktop with WSL integration on)
# .env: STORE=postgres
npm run migrate
npm run dev
```

The memory store is fine for the demo; Postgres keeps cards and arrivals across restarts.

---

## 8. Optional: the NIPOST web widget on the checkout

The web SDK is "publication pending". Build it from `sdks/widget-js` in NIPOST's gateway repository and serve the built script. Then set these in `.env`:

```
NIPOST_PUBLISHABLE_KEY=nipost_pk_test_...    # with http://localhost:3000 and your tunnel on its origin allowlist
NIPOST_WIDGET_SCRIPT_URL=https://.../sdk.js
NIPOST_WIDGET_ENVIRONMENT=staging
```

A **Choose with NIPOST** button then appears on `/shop/`.

---

## 9. Find a postcode from a typed address

The `/find/` page turns an address into a postcode in three steps: search, put the pin on the building, ask NIPOST. On WhatsApp, anyone who types an address (instead of sharing a pin) gets a link to this page with the address filled in, because WhatsApp can't show a draggable map.

**Rehearsal (default):** `GEOCODER_MODE=mock` only knows the addresses in `fixtures/demo-locations.json`. Search for `Lagos` or `demo`.

**Demo with real addresses:** use OpenStreetMap's public geocoder. In `.env`:

```
GEOCODER_MODE=nominatim
GEOCODER_USER_AGENT=ReachNaija-demo/0.1 you@example.com
GEOCODER_EMAIL=you@example.com
```

Its usage policy allows about one search per second and requires the User-Agent to identify you; the server spaces requests out automatically. It searches on submit, never as you type.

**Pilot:** run your own Nominatim with the Nigeria extract of OpenStreetMap inside the Lagos hosting zone, and set `GEOCODER_URL` to it. That removes the rate limit and keeps typed addresses in Nigeria. Serve your own map tiles too, and set `MAP_TILE_URL`.

**What happens at each result:**

| NIPOST says | The page shows |
| --- | --- |
| One building, high confidence | The postcode, an optional note, **Create my Address Card** |
| Several buildings near the pin | A list to pick from. The server checks the chosen building really is near the pin |
| Nothing within 300 m | The confirmed coordinates and a Google Maps link to copy, plus a button to NIPOST's registration site |
| Pin outside Nigeria | A message to move the pin |

NIPOST has no public API for registering a building, so Reach Naija hands the user the location to paste into NIPOST's site rather than submitting it. Ask NIPOST during onboarding whether a submission API is planned.

## 10. The 90-second demo, mapped to this repo

| Time | Beat | Where |
| --- | --- | --- |
| 0–10 s | "The house after the pharmacy, opposite the school…" | Narration |
| 10–25 s | Share a pin and get the postcode, HIGH badge and voice note | WhatsApp |
| 25–40 s | Open the card: segments, NIPOST record, the occupant's note | `/c/<id>` |
| 40–60 s | Checkout validates; rider checks in; customer gives the code; *Delivery verified* | `/shop/` + `/rider/` on a phone |
| 60–80 s | Reply HELP; open the dispatcher view | WhatsApp → `/c/<id>?mode=help` |
| 80–90 s | *Reach Naija. One postcode. Verified. Actionable. Everywhere.* | Home page |

If you demo away from the test building, turn on **Demo controls → Use a simulated location** in the rider view. The yellow banner stays on screen and the signed record says `gps_simulated: true`. Don't hide it; showing it is what makes the "verified" claim credible. Record a clean run as a backup video.

---

## 11. Troubleshooting

| Problem | Fix |
| --- | --- |
| `SyntaxError` on a `.ts` file or `type` keyword | Node is older than 22.18: `nvm install --lts` |
| Slow start, file watching misses changes | Move the project out of `/mnt/c/...` into `~/` |
| Rider page says location permission refused | Open it over the HTTPS tunnel URL, not `http://` |
| NIPOST `401` / `403` | Wrong key, wrong environment (test keys only work on staging), or level too high: lower `NIPOST_MAX_LEVEL` |
| NIPOST `429` | Rate limit: the client already backs off and retries; slow the demo down |
| `reverse geocode found no building` in smoke test (live) | Replace the placeholder coordinates in `fixtures/demo-locations.json` |
| WhatsApp webhook not verifying | `WA_VERIFY_TOKEN` must match Meta's field exactly; the tunnel must be running |
| Address search says it isn't responding | The public Nominatim server is busy or blocking you: set `GEOCODER_USER_AGENT`, slow down, or switch back to `GEOCODER_MODE=mock` |
| `/find/` shows "The map couldn't load" | The browser can't reach cdnjs.cloudflare.com; check the internet connection |
| "Use my location" is refused on a phone | Open `/find/` over the HTTPS tunnel address, not `http://` |
| `STORE=postgres needs the 'pg' package` | `npm install` (pg is an optional dependency) |

---

## Not for production as-is

This is a demo. Before real users:
- move signing keys from `keys/` into an HSM;
- host in the Nigerian sovereign zone described in the hosting design;
- complete the DPIA;
- replace in-memory WhatsApp pick sessions with the database;
- add authentication for riders and dispatchers;
- send hand-over codes to the recipient by WhatsApp or SMS instead of showing them on the shop page.
