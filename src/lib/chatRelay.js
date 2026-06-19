/**
 * Chat Relay HTTP endpoint
 *
 * Exposes recent messages from configured Discord channel(s) over a tiny local
 * HTTP server so an in-game Ashita addon (discordfeed) can poll them as JSON-ish
 * text and display Discord chat in FFXI.
 *
 * This is the ToS-safe alternative to scraping discord.com: the bot already has
 * legitimate API access to the channel, and simply re-serves recent messages on
 * a polling endpoint.
 *
 * Endpoint:
 *   GET /chat?after=<seq>
 *     -> text/plain body:
 *        LAST=<maxSeq>
 *        <seq>\t<author>\t<ts>\t<content>
 *        <seq>\t<author>\t<ts>\t<content>
 *        ...
 *     <ts> is the Discord message's Unix time (seconds) so clients can show it
 *     in their own local time. Only messages with seq > after are returned.
 *     Content newlines are escaped to the literal two characters "\n" and tabs
 *     are replaced with spaces, so every message is exactly one line with
 *     four tab-separated fields.
 */

const http = require('http');

const MAX_BUFFER = 100;

let buffer = []; // rolling list of { seq, author, content, ts }
let seq = 0;
let server = null;
let relayChannelIds = new Set();
let guildName = ''; // Discord server name, surfaced to the addon as a feed label

/**
 * Record a Discord message into the rolling buffer if it belongs to a relayed
 * channel. Safe to call for every MessageCreate.
 */
function ingest(message) {
  try {
    if (!message || !message.channel) return;
    if (!relayChannelIds.has(message.channel.id)) return;

    // Remember the Discord server name even from our own messages, so the addon
    // can label the feed before any real user has posted.
    if (message.guild?.name) guildName = message.guild.name;

    // Skip our own bot's messages. These are the linkshell->Discord bridge posts
    // (and the tunnel announcement), which originated in-game; echoing them back
    // into the game would be a redundant loop. Players only want messages that
    // real people type in Discord.
    const selfId = message.client?.user?.id;
    if (selfId && message.author?.id === selfId) return;
    if (message.webhookId) return;

    const author =
      message.member?.displayName || message.author?.username || 'unknown';

    let content = message.content || '';
    if ((!content || content.length === 0) && message.attachments?.size) {
      content = '[attachment]';
    }
    if (!content) return;

    // Use Discord's own message timestamp so every viewer can render it in
    // their local time, rather than the moment our relay happened to read it.
    const ts = message.createdTimestamp
      ? Math.floor(message.createdTimestamp / 1000)
      : Math.floor(Date.now() / 1000);

    seq += 1;
    buffer.push({
      seq,
      author,
      content,
      ts,
    });
    if (buffer.length > MAX_BUFFER) buffer.shift();
  } catch (err) {
    console.error('[ChatRelay] ingest error:', err.message);
  }
}

// One message must serialize to exactly one line with tab-delimited fields.
function escapeField(s) {
  return String(s)
    .replace(/\t/g, ' ')
    .replace(/\r?\n/g, '\\n');
}

function buildBody(after) {
  const lines = [];
  let last = after;
  for (const m of buffer) {
    if (m.seq > after) {
      lines.push(`${m.seq}\t${escapeField(m.author)}\t${m.ts}\t${escapeField(m.content)}`);
      if (m.seq > last) last = m.seq;
    }
  }
  const header = `LAST=${last}`;
  const guildLine = guildName ? `\nGUILD=${escapeField(guildName)}` : '';
  return `${header}${guildLine}\n${lines.join('\n')}`;
}

/**
 * Start the relay HTTP server.
 * @param {string[]} channelIds - Discord channel ids whose messages to relay.
 * @param {number} port - TCP port to listen on (default 3007).
 */
function start(channelIds, port) {
  relayChannelIds = new Set((channelIds || []).filter(Boolean));
  if (relayChannelIds.size === 0) {
    console.log('[ChatRelay] No relay channels configured, in-game feed disabled.');
    return;
  }

  const listenPort = port || 3007;

  server = http.createServer((req, res) => {
    try {
      if (!req.url || !req.url.startsWith('/chat')) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('not found');
        return;
      }
      const u = new URL(req.url, 'http://localhost');
      const after = parseInt(u.searchParams.get('after') || '0', 10) || 0;
      const body = buildBody(after);
      res.writeHead(200, {
        'Content-Type': 'text/plain; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-store',
      });
      res.end(body);
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('error');
      console.error('[ChatRelay] request error:', err.message);
    }
  });

  server.on('error', (err) => {
    console.error('[ChatRelay] server error:', err.message);
  });

  server.listen(listenPort, () => {
    console.log(
      `[ChatRelay] Listening on :${listenPort} for ${relayChannelIds.size} channel(s).`
    );
  });
}

function stop() {
  if (server) {
    server.close();
    server = null;
  }
}

module.exports = { start, stop, ingest };
