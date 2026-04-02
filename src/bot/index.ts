import { Telegraf } from "telegraf";
import { config } from "../config.js";
import { log } from "../utils/logger.js";
import { type BotContext, authMiddleware, requireRole } from "./middleware/auth.js";
import { startCommand } from "./commands/start.js";
import { helpCommand } from "./commands/help.js";
import { serversCommand } from "./commands/servers.js";
import { statusCommand } from "./commands/status.js";
import { logsCommand } from "./commands/logs.js";
import { deployCommand } from "./commands/deploy.js";
import { restartCommand } from "./commands/restart.js";
import { execCommand } from "./commands/exec.js";
import { adddevCommand, removedevCommand, listdevsCommand } from "./commands/devs.js";

export function createBot(): Telegraf<BotContext> {
  const bot = new Telegraf<BotContext>(config.botToken);

  bot.use(authMiddleware);

  bot.command("start", startCommand);
  bot.command("help", helpCommand);
  bot.command("servers", requireRole("developer"), serversCommand);
  bot.command("status", requireRole("developer"), statusCommand);
  bot.command("logs", requireRole("developer"), logsCommand);
  bot.command("deploy", requireRole("developer"), deployCommand);
  bot.command("restart", requireRole("admin"), restartCommand);
  bot.command("exec", requireRole("admin"), execCommand);
  bot.command("adddev", requireRole("admin"), adddevCommand);
  bot.command("removedev", requireRole("admin"), removedevCommand);
  bot.command("listdevs", requireRole("admin"), listdevsCommand);

  bot.on("text", (ctx) => ctx.reply("Unknown command. Try /help"));

  log.info("Bot commands registered");
  return bot;
}
