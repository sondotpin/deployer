import type { BotContext } from "../middleware/auth.js";

const DEVELOPER_CMDS = `
/servers — List all servers
/status <server> — Server health check
/logs <server> <service> [lines] — View logs
/deploy <app> <server> — Deploy app`;

const ADMIN_CMDS = `
/restart <server> <service> — Restart service
/exec <server> <cmd> — Run command
/adddev <userId> — Add developer
/removedev <userId> — Remove developer
/listdevs — List developers`;

export async function helpCommand(ctx: BotContext) {
  let msg = "/start — Welcome\n/help — This message";
  msg += DEVELOPER_CMDS;
  if (ctx.role === "admin") msg += ADMIN_CMDS;
  await ctx.reply(msg);
}
