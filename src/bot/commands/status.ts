import { getServer } from "../../config.js";
import { sshExec } from "../../ssh/manager.js";
import { codeBlock, truncate } from "../../utils/format.js";
import type { BotContext } from "../middleware/auth.js";

export async function statusCommand(ctx: BotContext) {
  const args = ctx.message && "text" in ctx.message
    ? ctx.message.text.split(/\s+/).slice(1)
    : [];

  if (args.length < 1) {
    return ctx.reply("Usage: /status <server>");
  }

  const server = getServer(args[0]);
  if (!server) return ctx.reply(`Server "${args[0]}" not found.`);

  await ctx.reply(`Checking ${server.name}...`);

  try {
    const result = await sshExec(server, "uptime && free -h && df -h /");
    const output = truncate(result.stdout + result.stderr);
    await ctx.reply(codeBlock(output), { parse_mode: "MarkdownV2" });
  } catch (err) {
    await ctx.reply(`Failed to connect to ${server.name}: ${err}`);
  }
}
