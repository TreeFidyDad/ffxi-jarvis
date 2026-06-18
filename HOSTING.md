# Hosting FFXI Jarvis 24/7

The bot only needs to stay running — it makes an outbound connection to Discord, so
there are **no inbound ports** to expose. Pick whichever option fits you. All of them
keep the SQLite database (events + signups) on persistent storage so nothing is lost
across restarts.

You will need two secrets from the [Discord Developer Portal](https://discord.com/developers/applications):

- `DISCORD_TOKEN` — Bot → Reset Token
- `CLIENT_ID` — General Information → Application ID

Optionally set `GUILD_ID` to register slash commands instantly to one server.

---

## ⭐ Admin quick-start (linkshell bridge + in-game Discord feed)

If you're an admin helping host the **linkshell↔Discord chat bridge** and the in-game
**discordfeed**, this is the path for you. Three pieces work together on **one Windows PC**:

| Piece | What it does | Where it runs |
|---|---|---|
| **FFXI Jarvis** (this repo) | Bridges LS↔Discord, serves the in-game feed | Your PC |
| **lsbridge** Ashita addon ([repo](https://github.com/TreeFidyDad/lsbridge)) | Captures in-game LS chat → hands it to the bot | Your FFXI client |
| **cloudflared** | Gives the feed a public URL (no port forwarding) | Your PC (auto-started) |

> **Important — must run on the same PC as FFXI.** The game→Discord direction works by the
> `lsbridge` addon writing chat to a file the bot reads, so Jarvis has to run on the same
> machine as a logged-in FFXI client with `lsbridge` loaded. (Cloud hosting in the options
> below only covers the *events* bot, not the chat bridge.)

**Steps:**

1. Install [Node.js 22.5+](https://nodejs.org/) and FFXI/Ashita with the
   [`lsbridge`](https://github.com/TreeFidyDad/lsbridge) addon.
2. Clone this repo and run the setup helper — it installs deps, creates `.env`, installs
   cloudflared, and registers the slash commands:
   ```
   git clone https://github.com/TreeFidyDad/ffxi-jarvis
   cd ffxi-jarvis
   setup.cmd
   ```
3. When Notepad opens `.env`, fill in:
   - `DISCORD_TOKEN`, `CLIENT_ID` — from the Discord Developer Portal
   - `BRIDGE_CHANNEL_ID` — the Discord channel that mirrors your linkshell
   - `ENABLE_TUNNEL=true` — to publish the in-game feed
4. Start it (auto-restarts if it ever crashes):
   ```
   run-bot.cmd
   ```

On boot the bot posts the player install + `/df host …` instructions to your bridge
channel automatically. That's it — players just follow that message.

See **[Running several admin hosts at once](#running-several-admin-hosts-at-once)** below
for the master/standby (de-dup) details when 5 of you host together.

---

## Option A — Fly.io (recommended: cloud, always-on, nothing running at home)

Prereqs: a free [Fly.io](https://fly.io) account and the `flyctl` CLI
([install guide](https://fly.io/docs/flyctl/install/)).

```bash
# from the repo root
fly auth login

# create the app (uses the bundled fly.toml; don't deploy yet)
fly launch --no-deploy --copy-config --name ffxi-jarvis

# create the persistent volume for the SQLite DB (1GB is plenty)
fly volumes create ffxi_jarvis_data --size 1 --region iad

# set your secrets (never commit these)
fly secrets set DISCORD_TOKEN=xxxxx CLIENT_ID=xxxxx
# optional: fly secrets set GUILD_ID=xxxxx

# deploy
fly deploy
```

The container registers slash commands on boot, then starts the bot. Check logs with:

```bash
fly logs
```

To update after pulling new code: `git pull && fly deploy`.

---

## Option B — Railway (cloud, very simple)

1. Create a project at [railway.app](https://railway.app) → **Deploy from GitHub repo** →
   pick `TreeFidyDad/ffxi-jarvis`.
2. Railway detects the `Dockerfile` automatically.
3. In the service **Variables**, add `DISCORD_TOKEN`, `CLIENT_ID`, and optionally
   `GUILD_ID`. Set `DATABASE_PATH=/data/ffxi-jarvis.db`.
4. Add a **Volume** mounted at `/data` so the database persists.
5. Deploy. Watch the **Deploy Logs** for `Logged in as FFXI Jarvis#...`.

---

## Option C — Any Docker host (VPS, home server)

```bash
docker build -t ffxi-jarvis .

docker run -d --name ffxi-jarvis --restart unless-stopped \
  -e DISCORD_TOKEN=xxxxx \
  -e CLIENT_ID=xxxxx \
  -e DATABASE_PATH=/data/ffxi-jarvis.db \
  -v ffxi_jarvis_data:/data \
  ffxi-jarvis
```

`--restart unless-stopped` brings it back after reboots. Logs: `docker logs -f ffxi-jarvis`.

---

## Option D — A spare PC / Raspberry Pi with PM2

Keeps it running and auto-restarting on a machine you already have on.

```bash
npm install
cp .env.example .env   # fill in DISCORD_TOKEN + CLIENT_ID
npm run deploy         # register slash commands once

npm install -g pm2
pm2 start src/index.js --name ffxi-jarvis
pm2 save
pm2 startup            # follow the printed instruction so it survives reboots
```

Update later with: `git pull && pm2 restart ffxi-jarvis`.

---

## Notes

- **Run only one instance.** A Discord gateway bot must not be scaled to multiple
  always-on copies, or it will process interactions twice. If you move to the cloud,
  stop the copy running on your PC so only one is live.
- **Keep your existing events.** The bot tracks posted events in its SQLite file
  (`DATABASE_PATH`). A fresh host starts empty, so it won't be able to edit events that
  are already posted in Discord. To carry them over, copy your local `data/ffxi-jarvis.db`
  onto the new host's volume *before* first boot (e.g. Fly: `fly ssh sftp shell` then
  `put data/ffxi-jarvis.db /data/ffxi-jarvis.db`). Or just start fresh and post new events.
- **Back up** the SQLite file (`DATABASE_PATH`) if you care about historical events.
- If you rotate the bot token, update the secret/`.env` and restart.

---

## In-game Discord feed (chat relay + Cloudflare tunnel)

Jarvis can re-serve recent messages from a Discord linkshell channel to an in-game
Ashita addon (`discordfeed`), so players see Discord chat **in FFXI without running the
bot themselves**. The bot already has legitimate API access to the channel, so this is
the ToS-safe alternative to scraping discord.com.

Unlike the core bot (outbound only), this feature needs an **inbound** endpoint the
addon can poll. Jarvis can open that for you automatically with a Cloudflare quick tunnel
— no port forwarding required.

Enable it in `.env`:

```ini
# Serve recent messages from BRIDGE_CHANNEL_ID (or RELAY_CHANNEL_IDS) on this port
RELAY_PORT=3007
# Auto-start a Cloudflare quick tunnel for a public URL
ENABLE_TUNNEL=true
# Only if cloudflared isn't on PATH:
CLOUDFLARED_PATH=C:\Program Files (x86)\cloudflared\cloudflared.exe
# Where to announce the live URL (defaults to BRIDGE_CHANNEL_ID):
TUNNEL_ANNOUNCE_CHANNEL_ID=
```

Install `cloudflared` once (Windows): `winget install Cloudflare.cloudflared`.

On boot the bot:
1. starts the relay on `RELAY_PORT`,
2. launches `cloudflared`, and
3. **posts the live `/df host <url>` command to the bridge channel** and writes the URL
   to `tunnel-url.txt`.

Players then run that `/df host …` command in-game.

> **Heads up — quick-tunnel URLs are random and change every restart.** That's why the bot
> re-announces the URL on each boot. The `discordfeed` addon accepts a comma-separated list
> of hosts and fails over between them, so if several admins host Jarvis, players can list
> all of them and stay covered. For a **permanent** hostname, run a *named* Cloudflare tunnel
> (free account + a domain) pointed at `localhost:3007` and set `ENABLE_TUNNEL=false`.

### Running several admin hosts at once

Multiple admins can host Jarvis simultaneously. The linkshell→Discord bridge uses
**cross-host de-duplication** (an 8-second window keyed on the message body) so the same LS
line isn't posted to Discord five times. Each host independently serves the in-game feed, so
players get automatic failover if one admin's PC or tunnel goes down.

> **Caveat:** the de-dup only covers the linkshell↔Discord bridge and the in-game feed.
> Slash-command features (events/signups) are *not* de-duplicated, so running several full
> bots will double-handle those interactions (see "Run only one instance" above). If you go
> multi-host purely for chat coverage, consider designating one host as the primary for
> events, or split the relay into its own lightweight process.

