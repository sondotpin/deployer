import { config } from "../../config.js";
import { db } from "../../db.js";
import { log } from "../../utils/logger.js";
import type { BotContext } from "../middleware/auth.js";

export async function adddevCommand(ctx: BotContext) {
  const args = ctx.message && "text" in ctx.message
    ? ctx.message.text.split(/\s+/).slice(1)
    : [];

  if (args.length < 1) {
    return ctx.reply("Usage: /adddev <userId>");
  }

  const userId = parseInt(args[0], 10);
  if (isNaN(userId)) return ctx.reply("Invalid userId.");
  if (config.adminIds.includes(userId)) return ctx.reply("User is already admin.");
  if (db.isDev(userId)) return ctx.reply("User is already a developer.");

  db.addDev(userId);
  log.info(`Developer added: ${userId} by admin ${ctx.from?.id}`);
  await ctx.reply(`Added developer ${userId}.`);
}

export async function removedevCommand(ctx: BotContext) {
  const args = ctx.message && "text" in ctx.message
    ? ctx.message.text.split(/\s+/).slice(1)
    : [];

  if (args.length < 1) {
    return ctx.reply("Usage: /removedev <userId>");
  }

  const userId = parseInt(args[0], 10);
  if (isNaN(userId)) return ctx.reply("Invalid userId.");
  if (!db.isDev(userId)) return ctx.reply("User is not a developer.");

  db.removeDev(userId);
  log.info(`Developer removed: ${userId} by admin ${ctx.from?.id}`);
  await ctx.reply(`Removed developer ${userId}.`);
}

export async function listdevsCommand(ctx: BotContext) {
  const ids = db.getAllDevs();
  if (ids.length === 0) return ctx.reply("No developers configured.");
  await ctx.reply(`Developers:\n${ids.map((id) => `• ${id}`).join("\n")}`);
}

export async function grantCommand(ctx: BotContext) {
  const args = ctx.message && "text" in ctx.message
    ? ctx.message.text.split(/\s+/).slice(1)
    : [];

  if (args.length < 2) {
    return ctx.reply("Usage: /grant <userId> <command>\nCommands: servers, status, logs, env, setenv, delenv, restart, exec");
  }

  const userId = parseInt(args[0], 10);
  if (isNaN(userId)) return ctx.reply("Invalid userId.");

  const command = args[1].replace(/^\//, "");
  db.grantCommand(userId, command);
  await ctx.reply(`Granted /${command} to ${userId}.`);
}

export async function revokeCommand(ctx: BotContext) {
  const args = ctx.message && "text" in ctx.message
    ? ctx.message.text.split(/\s+/).slice(1)
    : [];

  if (args.length < 2) {
    return ctx.reply("Usage: /revoke <userId> <command>");
  }

  const userId = parseInt(args[0], 10);
  if (isNaN(userId)) return ctx.reply("Invalid userId.");

  const command = args[1].replace(/^\//, "");
  const revoked = db.revokeCommand(userId, command);
  await ctx.reply(revoked ? `Revoked /${command} from ${userId}.` : "Permission not found.");
}

export async function permsCommand(ctx: BotContext) {
  const args = ctx.message && "text" in ctx.message
    ? ctx.message.text.split(/\s+/).slice(1)
    : [];

  if (args.length >= 1) {
    const userId = parseInt(args[0], 10);
    if (isNaN(userId)) return ctx.reply("Invalid userId.");
    const cmds = db.getUserCommands(userId);
    if (cmds.length === 0) return ctx.reply(`No extra permissions for ${userId}.`);
    return ctx.reply(`Permissions for ${userId}:\n${cmds.map((c) => `• /${c}`).join("\n")}`);
  }

  const all = db.getAllCommandPerms();
  if (all.length === 0) return ctx.reply("No command permissions configured.");
  const lines = all.map((p) => `• ${p.user_id} → /${p.command}`);
  await ctx.reply(`Command permissions:\n${lines.join("\n")}`);
}
