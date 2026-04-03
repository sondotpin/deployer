import { Telegraf } from "telegraf";
import { config } from "../config.js";
import { log } from "../utils/logger.js";
import { type BotContext, authMiddleware, requireRole, requirePerm } from "./middleware/auth.js";
import { startCommand } from "./commands/start.js";
import { helpCommand } from "./commands/help.js";
import { serversCommand, addserverCommand, removeserverCommand, editserverCommand, checkCommand, pubkeyCommand } from "./commands/servers.js";
import { statusCommand } from "./commands/status.js";
import { logsCommand } from "./commands/logs.js";
import { deployCommand, setscriptCommand, scriptCommand, delscriptCommand } from "./commands/deploy.js";
import { restartCommand } from "./commands/restart.js";
import { execCommand } from "./commands/exec.js";
import { adddevCommand, removedevCommand, listdevsCommand, grantCommand, revokeCommand, permsCommand } from "./commands/devs.js";
import { envCommand, setenvCommand, delenvCommand, setenvpathCommand, envpathsCommand, grantenvCommand, revokeenvCommand, envpermsCommand } from "./commands/env.js";

export function createBot(): Telegraf<BotContext> {
  const bot = new Telegraf<BotContext>(config.botToken);

  bot.use(authMiddleware);

  bot.command("start", startCommand);
  bot.command("help", helpCommand);
  // Developer default: deploy + check
  bot.command("deploy", requireRole("developer"), deployCommand);
  bot.command("check", requireRole("developer"), checkCommand);

  // Developer with granted permission
  bot.command("servers", requirePerm("servers"), serversCommand);
  bot.command("status", requirePerm("status"), statusCommand);
  bot.command("logs", requirePerm("logs"), logsCommand);
  bot.command("env", requirePerm("env"), envCommand);
  bot.command("setenv", requirePerm("env"), setenvCommand);
  bot.command("delenv", requirePerm("env"), delenvCommand);
  bot.command("restart", requirePerm("restart"), restartCommand);
  bot.command("exec", requirePerm("exec"), execCommand);

  // Admin only
  bot.command("adddev", requireRole("admin"), adddevCommand);
  bot.command("removedev", requireRole("admin"), removedevCommand);
  bot.command("listdevs", requireRole("admin"), listdevsCommand);
  bot.command("grant", requireRole("admin"), grantCommand);
  bot.command("revoke", requireRole("admin"), revokeCommand);
  bot.command("perms", requireRole("admin"), permsCommand);
  bot.command("addserver", requireRole("admin"), addserverCommand);
  bot.command("removeserver", requireRole("admin"), removeserverCommand);
  bot.command("editserver", requireRole("admin"), editserverCommand);
  bot.command("pubkey", requireRole("admin"), pubkeyCommand);
  bot.command("setscript", requireRole("admin"), setscriptCommand);
  bot.command("script", requireRole("admin"), scriptCommand);
  bot.command("delscript", requireRole("admin"), delscriptCommand);
  bot.command("setenvpath", requireRole("admin"), setenvpathCommand);
  bot.command("envpaths", requireRole("admin"), envpathsCommand);
  bot.command("grantenv", requireRole("admin"), grantenvCommand);
  bot.command("revokeenv", requireRole("admin"), revokeenvCommand);
  bot.command("envperms", requireRole("admin"), envpermsCommand);

  bot.on("text", (ctx) => ctx.reply("Unknown command. Try /help"));

  log.info("Bot commands registered");
  return bot;
}
