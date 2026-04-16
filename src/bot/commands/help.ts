import type { BotContext } from "../middleware/auth.js";

const TICKET_CMDS = `

📌 Task Management:
/task <title> [-p priority] [-d deadline] — Create task
/bug <title> [-p priority] [-d deadline] — Create bug
/tasks [mine|done|all] — List tasks
/bugs [mine|done] — List bugs
/t <id> — View ticket detail
/assign <id> <user_id> [name] — Assign ticket
/comment <id> <text> — Add comment
/deadline <id> <YYYY-MM-DD> — Set deadline
/edit <id> <title|desc|priority> <value> — Edit ticket
/image <id> — Reply photo to attach image
/mystats — Your ticket stats

Tip: Use | to add description: /task Title | Description
Tip: Send photo with /task caption to attach image`;

const DEVELOPER_CMDS = `

🖥 Server Management:
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
/envperms [server] — List env permissions
/setscript <server> <app> <script> — Set deploy script
/script <server> <app> — View deploy script
/delscript <server> <app> — Delete deploy script
/settopic [label] — Allow bot in this topic
/deltopic — Remove bot from this topic
/topics — List allowed topics`;

export async function helpCommand(ctx: BotContext) {
  let msg = "/start — Welcome\n/help — This message";
  msg += TICKET_CMDS;
  msg += DEVELOPER_CMDS;
  if (ctx.role === "admin") msg += ADMIN_CMDS;
  await ctx.reply(msg);
}
