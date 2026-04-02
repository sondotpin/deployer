import type { BotContext } from "../middleware/auth.js";

export async function startCommand(ctx: BotContext) {
  await ctx.reply(
    `Welcome, ${ctx.from?.first_name}! Role: ${ctx.role}\nType /help to see available commands.`,
  );
}
