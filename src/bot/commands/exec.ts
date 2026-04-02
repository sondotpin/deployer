import { getServer } from "../../config.js";
import { sshExec } from "../../ssh/manager.js";
import { codeBlock, truncate } from "../../utils/format.js";
import type { BotContext } from "../middleware/auth.js";

export async function execCommand(ctx: BotContext) {
  const text = ctx.message && "text" in ctx.message ? ctx.message.text : "";
  const match = text.match(/^\/exec\s+(\S+)\s+(.+)$/s);

  if (!match) {
    return ctx.reply("Usage: /exec <server> <command>");
  }

  const [, serverName, command] = match;
  const server = getServer(serverName);
  if (!server) return ctx.reply(`Server "${serverName}" not found.`);

  await ctx.reply(`Executing on ${server.name}...`);

  try {
    const result = await sshExec(server, command);
    const output = truncate(result.stdout + result.stderr);
    await ctx.reply(`Exit code: ${result.code}\n${codeBlock(output)}`, {
      parse_mode: "MarkdownV2",
    });
  } catch (err) {
    await ctx.reply(`Failed: ${err}`);
  }
}
