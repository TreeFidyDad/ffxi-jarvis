/**
 * Cloudflare Quick Tunnel manager
 *
 * Spawns `cloudflared tunnel --url http://localhost:<port>` so the in-game
 * chat relay (chatRelay.js) is reachable from anywhere without the admin having
 * to set up port forwarding. This lets other admins simply run Jarvis and have
 * a public relay endpoint come up automatically.
 *
 * IMPORTANT: Quick-tunnel (trycloudflare.com) URLs are RANDOM and change on
 * every restart. Because of that we announce the current URL to Discord on
 * startup (see index.js) so it's always discoverable, rather than relying on a
 * fixed hostname. Admins who want a stable hostname can run a *named* tunnel
 * instead and skip this (set ENABLE_TUNNEL=false).
 *
 * Controlled via env:
 *   ENABLE_TUNNEL   - "true" to auto-start the tunnel (default false)
 *   CLOUDFLARED_PATH- optional explicit path to cloudflared.exe
 *   RELAY_PORT      - local port the relay listens on (default 3007)
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

// Common install locations on Windows (winget / manual). First existing wins.
const DEFAULT_PATHS = [
  'cloudflared',
  'C:\\Program Files (x86)\\cloudflared\\cloudflared.exe',
  'C:\\Program Files\\cloudflared\\cloudflared.exe',
];

const URL_RE = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/i;
// Persist the live URL so it's recoverable without scraping Discord.
const URL_FILE = path.join(__dirname, '..', '..', 'tunnel-url.txt');

let child = null;
let currentUrl = null;
const listeners = [];

function resolveBinary() {
  if (process.env.CLOUDFLARED_PATH) return process.env.CLOUDFLARED_PATH;
  for (const p of DEFAULT_PATHS) {
    // The bare "cloudflared" entry relies on PATH; only file-system paths are
    // existence-checked here.
    if (p.includes('\\') || p.includes('/')) {
      try {
        if (fs.existsSync(p)) return p;
      } catch {
        /* ignore */
      }
    }
  }
  return 'cloudflared';
}

function handleLine(text) {
  if (currentUrl) return;
  const m = URL_RE.exec(text);
  if (m) {
    currentUrl = m[0];
    console.log(`[Tunnel] Public URL: ${currentUrl}`);
    try {
      fs.writeFileSync(URL_FILE, currentUrl + '\n');
    } catch (err) {
      console.error('[Tunnel] Could not write url file:', err.message);
    }
    for (const cb of listeners) {
      try {
        cb(currentUrl);
      } catch (err) {
        console.error('[Tunnel] listener error:', err.message);
      }
    }
  }
}

/**
 * Register a callback fired once the public URL is known. If the URL is already
 * available it fires immediately.
 */
function onUrl(cb) {
  if (typeof cb !== 'function') return;
  if (currentUrl) {
    cb(currentUrl);
    return;
  }
  listeners.push(cb);
}

function getUrl() {
  return currentUrl;
}

/**
 * Start the quick tunnel. No-op unless ENABLE_TUNNEL=true.
 * @param {number} port local port to expose (defaults to RELAY_PORT / 3007)
 */
function start(port) {
  if (String(process.env.ENABLE_TUNNEL || '').toLowerCase() !== 'true') {
    console.log('[Tunnel] Disabled (set ENABLE_TUNNEL=true to auto-start cloudflared).');
    return;
  }
  if (child) {
    console.log('[Tunnel] Already running.');
    return;
  }

  const listenPort =
    port || Number.parseInt(process.env.RELAY_PORT ?? '3007', 10) || 3007;
  const bin = resolveBinary();

  console.log(`[Tunnel] Launching cloudflared for http://localhost:${listenPort} ...`);
  try {
    child = spawn(
      bin,
      ['tunnel', '--url', `http://localhost:${listenPort}`],
      { windowsHide: true }
    );
  } catch (err) {
    console.error('[Tunnel] Failed to spawn cloudflared:', err.message);
    child = null;
    return;
  }

  // cloudflared prints the assigned URL to stderr; watch both streams to be safe.
  const onData = (buf) => {
    const text = buf.toString();
    for (const line of text.split(/\r?\n/)) {
      if (line.trim()) handleLine(line);
    }
  };
  child.stdout?.on('data', onData);
  child.stderr?.on('data', onData);

  child.on('error', (err) => {
    console.error('[Tunnel] cloudflared error:', err.message);
  });
  child.on('exit', (code) => {
    console.error(`[Tunnel] cloudflared exited (code ${code}). Public relay is offline.`);
    child = null;
    currentUrl = null;
  });
}

function stop() {
  if (child) {
    try {
      child.kill();
    } catch {
      /* ignore */
    }
    child = null;
  }
  currentUrl = null;
}

module.exports = { start, stop, onUrl, getUrl };
