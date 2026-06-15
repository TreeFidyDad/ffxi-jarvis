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
