import { db } from "../../db.js";
import { sshExec } from "../../ssh/manager.js";
import { codeBlock, truncate } from "../../utils/format.js";
import type { BotContext } from "../middleware/auth.js";

export async function logsCommand(ctx: BotContext) {
  const args = ctx.message && "text" in ctx.message
    ? ctx.message.text.split(/\s+/).slice(1)
    : [];

  if (args.length < 2) {
    return ctx.reply("Usage: /logs <server> <service> [lines=50]");
  }

  const [serverName, service] = args;
  const lines = parseInt(args[2] ?? "50", 10);
  const server = db.getServer(serverName);
  if (!server) return ctx.reply(`Server "${serverName}" not found.`);

  await ctx.reply(`Fetching ${lines} lines from ${service}@${server.name}...`);

  try {
    const result = await sshExec(
      server,
      `journalctl -u ${service} -n ${lines} --no-pager 2>/dev/null || tail -n ${lines} ~/apps/${service}/logs/app.log`,
    );
    const output = truncate(result.stdout + result.stderr);
    await ctx.reply(codeBlock(output), { parse_mode: "MarkdownV2" });
  } catch (err) {
    await ctx.reply(`Failed: ${err}`);
  }
}
