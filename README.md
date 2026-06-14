# FFXI Jarvis

A **free, open-source, self-hostable** Discord bot for organizing Final Fantasy XI events — a no-paywall alternative to Raid-Helper. Your linkshell's own event butler.

Members sign up straight from a message with buttons: they pick a **role** (Tank / Melee DPS / Ranged DPS / Support) and their **Job** (WAR, WHM, PLD, … all 22 jobs) from a dropdown. The roster updates live and event times are shown in each member's own local timezone.

- 🆓 MIT licensed, no premium tiers, host it yourself
- 🗡️ FFXI Jobs (all 22, each with an icon) + Tank / Melee / Ranged / Support roles
- 🟢 Live roster **grouped by Job**, with per-member signup numbers
- 🧭 Role-summary line + 👥 headcount (with optional attendee **cap** and **Standby** overflow)
- 🏳️ Event **leader**, optional **title link** and **image/banner**
- 📅 One-click **Add to Google Calendar** link
- ❔ Tentative / ❌ Absence / 🚪 Withdraw
- 🕒 Per-viewer local times (Discord timestamps)
- 🔔 Optional reminder ping before the event starts
- 💾 Zero native dependencies — uses Node's built-in SQLite

## Requirements

- **Node.js 22.5.0 or newer** (uses the built-in `node:sqlite` module)
- A Discord application + bot token

## Setup

### 1. Create the Discord application

1. Go to the [Discord Developer Portal](https://discord.com/developers/applications) → **New Application**.
2. Open the **Bot** tab → **Reset Token** → copy the token.
3. On **General Information**, copy the **Application ID** (this is your `CLIENT_ID`).
4. Invite the bot to your server. Use this URL (replace `CLIENT_ID`):

   ```
   https://discord.com/oauth2/authorize?client_id=CLIENT_ID&scope=bot+applications.commands&permissions=275414871552
   ```

   That permission integer grants: View Channels, Send Messages, Embed Links, Read History, Mention Everyone. No privileged intents are required.

### 2. Configure

```bash
git clone <your-repo-url>
cd ffxi-jarvis
npm install
cp .env.example .env   # on Windows: copy .env.example .env
```

Edit `.env` and fill in `DISCORD_TOKEN` and `CLIENT_ID`. Set `GUILD_ID` to your server's ID for instant command registration while testing (leave blank for global).

### 3. Register the slash commands

```bash
npm run deploy
```

With `GUILD_ID` set, commands appear immediately. Globally they can take up to ~1 hour.

### 4. Run the bot

```bash
npm start
```

## Usage

| Command | What it does |
| --- | --- |
| `/event create title:<…> date:YYYY-MM-DD time:HH:MM [description:] [timezone:] [cap:] [duration:] [leader:] [url:] [image:]` | Posts an event with signup buttons. `cap` limits attendees (extras go to **Standby**); `duration` (minutes) feeds the calendar link; `url` links the title; `image` adds a banner. |
| `/event close id:<#>` | Locks signups (keeps the roster). |
| `/event delete id:<#>` | Deletes the event and its roster. |
| `/event help` | Quick usage reference. |

Members then:

1. Click a role button — **Tank**, **Melee DPS**, **Ranged DPS**, or **Support**.
2. Pick their **Job** from the dropdown.
3. Or use **Tentative** / **Absence**, and **Withdraw** to remove themselves.

`date`/`time` are interpreted in the event's `timezone` (the `DEFAULT_TIMEZONE` from `.env` unless overridden). Everyone sees the time converted to their own local zone automatically.

## Free hosting options

This bot is a single lightweight process and stores everything in a local SQLite file, so it runs almost anywhere:

- A spare PC, home server, or Raspberry Pi (`npm start` under `pm2` or a systemd service)
- Free/low-cost tiers on Fly.io, Railway, or a small VPS

Keep the `data/` directory (or your `DATABASE_PATH`) on persistent storage so events survive restarts.

## Configuration reference

| Variable | Default | Description |
| --- | --- | --- |
| `DISCORD_TOKEN` | — | Bot token (required). |
| `CLIENT_ID` | — | Application ID (required). |
| `GUILD_ID` | _(blank)_ | Register commands to one server instantly; blank = global. |
| `DEFAULT_TIMEZONE` | `America/New_York` | IANA timezone used when `/event create` omits one. |
| `REMINDER_MINUTES` | `15` | Minutes before start to ping attendees. `0` disables reminders. |
| `DATABASE_PATH` | `data/ffxi-jarvis.db` | SQLite file location. |

## License

MIT — see [LICENSE](LICENSE). Contributions welcome.
