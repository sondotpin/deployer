import type { BotContext } from "../middleware/auth.js";

const DEVELOPER_CMDS = `
/servers — List all servers
/status <server> — Server health check
/logs <server> <service> [lines] — View logs
/deploy <app> <server> — Deploy app
/env <server> <app> — View .env file
/setenv <server> <app> <KEY> <VALUE> — Set env var
/delenv <server> <app> <KEY> — Delete env var`;

const ADMIN_CMDS = `
/restart <server> <service> — Restart service
/exec <server> <cmd> — Run command
/adddev <userId> — Add developer
/removedev <userId> — Remove developer
/listdevs — List developers
/addserver <name> <host> <port> <user> [apps] — Add server
/removeserver <name> — Remove server
/pubkey — Show bot SSH public key
/grantenv <userId> <server> <app> — Grant env access
/revokeenv <userId> <server> <app> — Revoke env access
/envperms [server] — List env permissions`;

export async function helpCommand(ctx: BotContext) {
  let msg = "/start — Welcome\n/help — This message";
  msg += DEVELOPER_CMDS;
  if (ctx.role === "admin") msg += ADMIN_CMDS;
  await ctx.reply(msg);
}
