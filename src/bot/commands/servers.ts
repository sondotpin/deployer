import { db } from "../../db.js";
import type { BotContext } from "../middleware/auth.js";

export async function serversCommand(ctx: BotContext) {
  const servers = db.getAllServers();
  const list = servers
    .map((s) => `• ${s.name} — ${s.host}:${s.port} @${s.username} [${s.apps.join(", ")}]`)
    .join("\n");

  await ctx.reply(list || "No servers configured.");
}

export async function addserverCommand(ctx: BotContext) {
  const args = ctx.message && "text" in ctx.message
    ? ctx.message.text.split(/\s+/).slice(1)
    : [];

  if (args.length < 4) {
    return ctx.reply("Usage: /addserver <name> <host> <port> <username> [apps comma-separated]");
  }

  const [name, host, portStr, username] = args;
  const port = parseInt(portStr, 10);
  if (isNaN(port)) return ctx.reply("Port must be a number.");

  const apps = args[4] ? args[4].split(",").filter(Boolean) : [];

  db.addServer(name, host, port, username, apps);
  await ctx.reply(`Server "${name}" added (${host}:${port}).`);
}

export async function removeserverCommand(ctx: BotContext) {
  const args = ctx.message && "text" in ctx.message
    ? ctx.message.text.split(/\s+/).slice(1)
    : [];

  if (args.length < 1) {
    return ctx.reply("Usage: /removeserver <name>");
  }

  const removed = db.removeServer(args[0]);
  await ctx.reply(removed ? `Server "${args[0]}" removed.` : `Server "${args[0]}" not found.`);
}

export async function pubkeyCommand(ctx: BotContext) {
  const pubkey = db.getBotPublicKey();
  await ctx.reply(`Bot SSH public key:\n\n${pubkey}\nAdd this to ~/.ssh/authorized_keys on your servers.`);
}
