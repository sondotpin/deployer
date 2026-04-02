import { config } from "../../config.js";
import type { BotContext } from "../middleware/auth.js";

export async function serversCommand(ctx: BotContext) {
  const list = config.servers
    .map((s) => `• ${s.name} — ${s.host}:${s.port} [${s.apps.join(", ")}]`)
    .join("\n");

  await ctx.reply(list || "No servers configured.");
}
