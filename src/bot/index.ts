import { Telegraf } from "telegraf";
import { config } from "../config.js";
import { log } from "../utils/logger.js";
import { type BotContext, authMiddleware, requireRole, requirePerm } from "./middleware/auth.js";
import { startCommand } from "./commands/start.js";
import { helpCommand } from "./commands/help.js";
import { serversCommand, addserverCommand, removeserverCommand, editserverCommand, checkCommand, pubkeyCommand } from "./commands/servers.js";
import { statusCommand } from "./commands/status.js";
import { logsCommand } from "./commands/logs.js";
import { deployCommand, deploystatsCommand, setscriptCommand, scriptCommand, delscriptCommand } from "./commands/deploy.js";
import { restartCommand } from "./commands/restart.js";
import { execCommand } from "./commands/exec.js";
import { adddevCommand, removedevCommand, listdevsCommand, grantCommand, revokeCommand, permsCommand } from "./commands/devs.js";
import { envCommand, setenvCommand, delenvCommand, setenvpathCommand, envpathsCommand, grantenvCommand, revokeenvCommand, envpermsCommand } from "./commands/env.js";
import { taskCommand, bugCommand, taskPhotoCommand, bugPhotoCommand, ticketDetailCommand, tasksListCommand, bugsListCommand, assignCommand, commentCommand, deadlineCommand, editTaskCommand, imageCommand, myStatsCommand, handleTicketStatusCallback, handleTicketPriorityCallback } from "./commands/tasks.js";

export function createBot(): Telegraf<BotContext> {
  const bot = new Telegraf<BotContext>(config.botToken);

  bot.use(authMiddleware);

  bot.command("start", startCommand);
  bot.command("help", helpCommand);
  // Developer default: deploy + check
  bot.command("deploy", requireRole("developer"), deployCommand);
  bot.command("deploystats", requireRole("developer"), deploystatsCommand);
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

  // Ticket management — all developers
  bot.command("task", requireRole("developer"), taskCommand);
  bot.command("bug", requireRole("developer"), bugCommand);
  bot.command("t", requireRole("developer"), ticketDetailCommand);
  bot.command("tasks", requireRole("developer"), tasksListCommand);
  bot.command("bugs", requireRole("developer"), bugsListCommand);
  bot.command("assign", requireRole("developer"), assignCommand);
  bot.command("comment", requireRole("developer"), commentCommand);
  bot.command("deadline", requireRole("developer"), deadlineCommand);
  bot.command("edit", requireRole("developer"), editTaskCommand);
  bot.command("image", requireRole("developer"), imageCommand);
  bot.command("mystats", requireRole("developer"), myStatsCommand);

  // Handle photo messages with /task or /bug caption
  bot.on("photo", (ctx) => {
    const caption = ctx.message.caption ?? "";
    if (caption.startsWith("/task")) return taskPhotoCommand(ctx as unknown as BotContext);
    if (caption.startsWith("/bug")) return bugPhotoCommand(ctx as unknown as BotContext);
    if (caption.startsWith("/image")) return imageCommand(ctx as unknown as BotContext);
  });

  // Inline keyboard callbacks for tickets
  bot.action(/^ts_\d+_.+$/, handleTicketStatusCallback);
  bot.action(/^tp_\d+_.+$/, handleTicketPriorityCallback);

  bot.on("text", (ctx) => ctx.reply("Unknown command. Try /help"));

  log.info("Bot commands registered");
  return bot;
}
