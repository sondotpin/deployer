import { db } from "../../db.js";
import { sshExec } from "../../ssh/manager.js";
import { codeBlock, truncate } from "../../utils/format.js";
import type { BotContext } from "../middleware/auth.js";

export async function restartCommand(ctx: BotContext) {
  const args = ctx.message && "text" in ctx.message
    ? ctx.message.text.split(/\s+/).slice(1)
    : [];

  if (args.length < 2) {
    return ctx.reply("Usage: /restart <server> <service>");
  }

  const [serverName, service] = args;
  const server = db.getServer(serverName);
  if (!server) return ctx.reply(`Server "${serverName}" not found.`);

  await ctx.reply(`Restarting ${service} on ${server.name}...`);

  try {
    const result = await sshExec(server, `sudo systemctl restart ${service}`);
    if (result.code === 0) {
      await ctx.reply(`Restarted ${service} successfully.`);
    } else {
      await ctx.reply(codeBlock(truncate(result.stderr)));
    }
  } catch (err) {
    await ctx.reply(`Failed: ${err}`);
  }
}
