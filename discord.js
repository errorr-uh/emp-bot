// EMPÍRE Bot Control Portal — Tencent EdgeOne Makers Cloud Function
// Route: POST /api/discord
// Main service actions use the bot token supplied for that request.
// The token is never stored, returned, or logged. Admin/Staff portal login
// is intentionally NOT required for these bot-service requests.

const DISCORD_API = "https://discord.com/api/v10";
const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store, max-age=0",
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer"
};
const ID_RE = /^\d{17,20}$/;
const MAX_BODY_BYTES = 16 * 1024;
const MAX_AMOUNT = 10;
const ALLOWED_ACTIONS = new Set([
  "ban", "unban", "kick", "timeout", "send-message",
  "create-channel", "delete-channel", "create-role", "delete-role",
  "validate-token"
]);

function reply(status, payload, extraHeaders = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...JSON_HEADERS, ...extraHeaders }
  });
}
function clean(value, max = 200) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}
function normalizeToken(value) {
  const token = clean(value, 300).replace(/^Bot\s+/i, "").trim();
  if (!token || token.length < 20 || token.length > 250 || /\s/.test(token)) {
    throw Object.assign(new Error("Paste a valid Discord Bot Token."), { status: 400 });
  }
  return token;
}
function discordMessage(status, data) {
  if (status === 401) return "Discord rejected this bot token (401 Unauthorized). Copy the token from the Bot section of the correct Discord application, not the Client Secret.";
  if (status === 403) return "Discord denied this action. Check that the bot is in this server and has the required permission and role position.";
  if (status === 404) return "Discord could not find that server or target. Check the ID and confirm the bot has access.";
  if (status === 429) return "Discord rate limit reached. Wait briefly and try again.";
  return clean(data?.message, 300) || `Discord API returned ${status}.`;
}
async function discord(token, path, method = "GET", body, retry = true) {
  const response = await fetch(`${DISCORD_API}${path}`, {
    method,
    headers: {
      authorization: `Bot ${token}`,
      "content-type": "application/json",
      "user-agent": "EmpireBotControlPortal/1.2"
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  if (response.status === 429 && retry) {
    const data = await response.json().catch(() => ({}));
    const waitMs = Math.min(4000, Math.max(250, Number(data.retry_after || 1) * 1000));
    await new Promise(resolve => setTimeout(resolve, waitMs));
    return discord(token, path, method, body, false);
  }
  const data = response.status === 204 ? null : await response.json().catch(() => ({}));
  if (!response.ok) {
    throw Object.assign(new Error(discordMessage(response.status, data)), {
      status: response.status === 401 || response.status === 403 || response.status === 429 ? response.status : 400
    });
  }
  return data;
}
async function assertChannelInGuild(token, channelId, guildId) {
  const channel = await discord(token, `/channels/${channelId}`);
  if (!channel?.id || channel.guild_id !== guildId) {
    throw Object.assign(new Error("That channel does not belong to the selected server."), { status: 400 });
  }
  return channel;
}

export async function onRequestGet() {
  return reply(200, {
    ok: true,
    service: "EMPÍRE Bot Control Portal API",
    route: "/api/discord",
    methods: ["GET", "POST", "OPTIONS"],
    message: "API route is deployed. POST a supported action from the portal."
  });
}
function corsHeaders(origin) {
  // The portal may be served from a custom domain while EdgeOne routes the
  // function through an internal hostname. Echo the requesting site origin
  // (without credentials) instead of comparing it to request.url.
  // This API uses caller-supplied bot tokens and never uses cookie auth.
  return {
    ...(origin ? { "access-control-allow-origin": origin, "vary": "Origin" } : {}),
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "content-type",
    "access-control-max-age": "600"
  };
}

export async function onRequestOptions({ request }) {
  const origin = request.headers.get("origin");
  return new Response(null, {
    status: 204,
    headers: { ...JSON_HEADERS, ...corsHeaders(origin) }
  });
}
export async function onRequestPost({ request }) {
  const origin = request.headers.get("origin");
  const respond = (status, payload) => reply(status, payload, corsHeaders(origin));

  let raw;
  try {
    raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) {
      return respond(413, { ok: false, error: "Request is too large." });
    }
  } catch {
    return respond(400, { ok: false, error: "Could not read request body." });
  }

  let input;
  try { input = JSON.parse(raw); }
  catch { return respond(400, { ok: false, error: "Request body must be valid JSON." }); }
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return respond(400, { ok: false, error: "Request body must be a JSON object." });
  }

  const action = clean(input.action, 40);
  if (!ALLOWED_ACTIONS.has(action)) return respond(400, { ok: false, error: "Unsupported action." });

  let token;
  try { token = normalizeToken(input.botToken); }
  catch (error) { return respond(error.status || 400, { ok: false, error: error.message }); }

  // Token validation is intentionally independent of a server ID.
  if (action === "validate-token") {
    try {
      const bot = await discord(token, "/users/@me");
      return respond(200, {
        ok: true,
        bot: { id: clean(bot?.id, 32), username: clean(bot?.username, 100) },
        message: "Token is valid. No server action was performed."
      });
    } catch (error) {
      return respond(error.status || 400, { ok: false, error: error.message || "Token validation failed." });
    }
  }

  const server = clean(input.server, 32);
  const target = clean(input.target, 32);
  const name = clean(input.name, 100);
  const amountValue = Number(input.amount);
  const amount = Number.isInteger(amountValue) ? Math.max(1, Math.min(MAX_AMOUNT, amountValue)) : 1;
  if (!ID_RE.test(server)) return respond(400, { ok: false, error: "Enter the numeric Discord Server ID." });

  const needsTarget = ["ban", "unban", "kick", "timeout", "send-message", "delete-channel", "delete-role"].includes(action);
  if (needsTarget && !ID_RE.test(target)) return respond(400, { ok: false, error: "Enter a valid numeric target ID for this service." });
  if (["create-channel", "create-role"].includes(action) && !name) return respond(400, { ok: false, error: "Enter a name for the new resource." });
  if (action === "create-channel" && target && !["text", "0", "voice", "2", "announcement", "news", "5"].includes(target.toLowerCase())) {
    return respond(400, { ok: false, error: "Choose a supported channel type." });
  }
  if (action === "create-role" && target && (!/^\d{1,3}$/.test(target) || Number(target) < 1 || Number(target) > 250)) {
    return respond(400, { ok: false, error: "Role position must be between 1 and 250, or left blank." });
  }

  const items = [];
  let summary = "";
  try {
    if (action === "send-message") {
      await assertChannelInGuild(token, target, server);
      const content = clean(input.messageContent, 2000);
      const title = clean(input.embedTitle, 256);
      const description = clean(input.embedDescription, 4096);
      if (!content && !title && !description) return respond(400, { ok: false, error: "Enter message content or an embed field." });
      const payload = {};
      if (content) payload.content = content;
      if (title || description) payload.embeds = [{ ...(title ? { title } : {}), ...(description ? { description } : {}) }];
      const sent = await discord(token, `/channels/${target}/messages`, "POST", payload);
      items.push(sent?.id || "message sent");
      summary = `Sent message/embed to channel ${target}`;
    } else if (action === "create-channel") {
      const typeText = target.toLowerCase();
      const type = ["voice", "2"].includes(typeText) ? 2 : ["announcement", "news", "5"].includes(typeText) ? 5 : 0;
      const channelName = name.toLowerCase().replace(/[^a-z0-9_-]/g, "-").slice(0, 100);
      for (let i = 0; i < amount; i++) {
        const channel = await discord(token, `/guilds/${server}/channels`, "POST", { name: channelName, type });
        items.push(channel?.id || channel?.name || "channel created");
      }
      summary = `Created ${items.length} channel(s): ${channelName}`;
    } else if (action === "delete-channel") {
      await assertChannelInGuild(token, target, server);
      await discord(token, `/channels/${target}`, "DELETE");
      items.push(target);
      summary = `Deleted channel ${target}`;
    } else if (action === "create-role") {
      for (let i = 0; i < amount; i++) {
        const role = await discord(token, `/guilds/${server}/roles`, "POST", { name: name.slice(0, 100) });
        items.push(role?.id || role?.name || "role created");
        const position = Number(target);
        if (target && Number.isInteger(position) && position >= 1 && role?.id) {
          await discord(token, `/guilds/${server}/roles`, "PATCH", [{ id: role.id, position }]);
        }
      }
      summary = `Created ${items.length} role(s): ${name}`;
    } else if (action === "delete-role") {
      await discord(token, `/guilds/${server}/roles/${target}`, "DELETE");
      items.push(target);
      summary = `Deleted role ${target}`;
    } else if (action === "ban") {
      await discord(token, `/guilds/${server}/bans/${target}`, "PUT", { delete_message_seconds: 0 });
      items.push(target);
      summary = `Banned user ${target}`;
    } else if (action === "unban") {
      await discord(token, `/guilds/${server}/bans/${target}`, "DELETE");
      items.push(target);
      summary = `Unbanned user ${target}`;
    } else if (action === "kick") {
      await discord(token, `/guilds/${server}/members/${target}`, "DELETE");
      items.push(target);
      summary = `Kicked member ${target}`;
    } else if (action === "timeout") {
      const minutes = Math.max(1, Math.min(40320, amount));
      const until = new Date(Date.now() + minutes * 60 * 1000).toISOString();
      await discord(token, `/guilds/${server}/members/${target}`, "PATCH", { communication_disabled_until: until });
      items.push(target);
      summary = `Timed out member ${target} for ${minutes} minute(s)`;
    }
    return respond(200, { ok: true, count: items.length, items, summary });
  } catch (error) {
    // Never log or return the supplied token or request body.
    return respond(error.status || 400, { ok: false, error: error.message || "Discord request failed." });
  }
}
