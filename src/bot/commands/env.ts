import { db } from "../../db.js";
import { sshExec } from "../../ssh/manager.js";
import { codeBlock, truncate } from "../../utils/format.js";
import type { BotContext } from "../middleware/auth.js";

function checkEnvAccess(ctx: BotContext, serverName: string, appName: string): boolean {
  const userId = ctx.from!.id;
  if (ctx.role === "admin") return true;
  if (db.hasEnvAccess(userId, serverName, appName)) return true;
  ctx.reply("Access denied.");
  return false;
}

export async function envCommand(ctx: BotContext) {
  const text = ctx.message && "text" in ctx.message ? ctx.message.text : "";
  const match = text.match(/^\/env\s+(\S+)\s+(\S+)$/);
  if (!match) return ctx.reply("Usage: /env <server> <app>");

  const [, serverName, appName] = match;
  const server = db.getServer(serverName);
  if (!server) return ctx.reply(`Server "${serverName}" not found.`);
  if (!checkEnvAccess(ctx, serverName, appName)) return;

  const envPath = db.getEnvPath(serverName, appName);

  try {
    const result = await sshExec(server, `cat ${envPath}`);
    if (result.code !== 0) {
      return ctx.reply(`Failed (exit ${result.code}): ${result.stderr}`);
    }
    const output = truncate(result.stdout);
    await ctx.reply(codeBlock(output), { parse_mode: "MarkdownV2" });
  } catch (err) {
    await ctx.reply(`Failed: ${err}`);
  }
}

export async function setenvCommand(ctx: BotContext) {
  const text = ctx.message && "text" in ctx.message ? ctx.message.text : "";
  const match = text.match(/^\/setenv\s+(\S+)\s+(\S+)\s+(\S+)\s+(.+)$/s);
  if (!match) return ctx.reply("Usage: /setenv <server> <app> <KEY> <VALUE>");

  const [, serverName, appName, key, value] = match;
  const server = db.getServer(serverName);
  if (!server) return ctx.reply(`Server "${serverName}" not found.`);
  if (!checkEnvAccess(ctx, serverName, appName)) return;

  const envPath = db.getEnvPath(serverName, appName);
  const cmd = `grep -q "^${key}=" ${envPath} 2>/dev/null && sed -i "s/^${key}=.*/${key}=${value}/" ${envPath} || echo "${key}=${value}" >> ${envPath}`;

  try {
    const result = await sshExec(server, cmd);
    if (result.code !== 0) {
      return ctx.reply(`Failed (exit ${result.code}): ${result.stderr}`);
    }
    await ctx.reply(`Set ${key} on ${serverName}/${appName}.`);
  } catch (err) {
    await ctx.reply(`Failed: ${err}`);
  }
}

export async function delenvCommand(ctx: BotContext) {
  const text = ctx.message && "text" in ctx.message ? ctx.message.text : "";
  const match = text.match(/^\/delenv\s+(\S+)\s+(\S+)\s+(\S+)$/);
  if (!match) return ctx.reply("Usage: /delenv <server> <app> <KEY>");

  const [, serverName, appName, key] = match;
  const server = db.getServer(serverName);
  if (!server) return ctx.reply(`Server "${serverName}" not found.`);
  if (!checkEnvAccess(ctx, serverName, appName)) return;

  const envPath = db.getEnvPath(serverName, appName);

  try {
    const result = await sshExec(server, `sed -i "/^${key}=/d" ${envPath}`);
    if (result.code !== 0) {
      return ctx.reply(`Failed (exit ${result.code}): ${result.stderr}`);
    }
    await ctx.reply(`Deleted ${key} from ${serverName}/${appName}.`);
  } catch (err) {
    await ctx.reply(`Failed: ${err}`);
  }
}

export async function setenvpathCommand(ctx: BotContext) {
  const text = ctx.message && "text" in ctx.message ? ctx.message.text : "";
  const match = text.match(/^\/setenvpath\s+(\S+)\s+(\S+)\s+(.+)$/);
  if (!match) return ctx.reply("Usage: /setenvpath <server> <app> <path>");

  const [, serverName, appName, path] = match;
  const server = db.getServer(serverName);
  if (!server) return ctx.reply(`Server "${serverName}" not found.`);

  db.setEnvPath(serverName, appName, path);
  await ctx.reply(`Env path set: ${serverName}/${appName} → ${path}`);
}

export async function envpathsCommand(ctx: BotContext) {
  const paths = db.getAllEnvPaths();
  if (paths.length === 0) return ctx.reply("No custom env paths. Default: ~/<app>/backend.env");

  const lines = paths.map((p) => `• ${p.server_name}/${p.app_name} → ${p.path}`);
  await ctx.reply(`Env paths:\n${lines.join("\n")}`);
}

export async function grantenvCommand(ctx: BotContext) {
  const text = ctx.message && "text" in ctx.message ? ctx.message.text : "";
  const match = text.match(/^\/grantenv\s+(\d+)\s+(\S+)\s+(\S+)$/);
  if (!match) return ctx.reply("Usage: /grantenv <userId> <server> <app>");

  const [, userId, serverName, appName] = match;
  db.grantEnvAccess(Number(userId), serverName, appName);
  await ctx.reply(`Granted env access: user ${userId} → ${serverName}/${appName}`);
}

export async function revokeenvCommand(ctx: BotContext) {
  const text = ctx.message && "text" in ctx.message ? ctx.message.text : "";
  const match = text.match(/^\/revokeenv\s+(\d+)\s+(\S+)\s+(\S+)$/);
  if (!match) return ctx.reply("Usage: /revokeenv <userId> <server> <app>");

  const [, userId, serverName, appName] = match;
  const removed = db.revokeEnvAccess(Number(userId), serverName, appName);
  if (!removed) return ctx.reply("Permission not found.");
  await ctx.reply(`Revoked env access: user ${userId} → ${serverName}/${appName}`);
}

export async function envpermsCommand(ctx: BotContext) {
  const text = ctx.message && "text" in ctx.message ? ctx.message.text : "";
  const match = text.match(/^\/envperms(?:\s+(\S+))?$/);
  if (!match) return ctx.reply("Usage: /envperms [server]");

  const serverName = match[1];
  const perms = db.getEnvPermissions(serverName);

  if (perms.length === 0) {
    return ctx.reply(serverName ? `No env permissions for ${serverName}.` : "No env permissions.");
  }

  const lines = perms.map((p) => `• user ${p.user_id} → ${p.server_name}/${p.app_name}`);
  await ctx.reply(lines.join("\n"));
}
