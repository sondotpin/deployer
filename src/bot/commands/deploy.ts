import { db } from "../../db.js";
import { runDeploy } from "../../deploy/deployer.js";
import type { BotContext } from "../middleware/auth.js";

export async function deployCommand(ctx: BotContext) {
  const args = ctx.message && "text" in ctx.message
    ? ctx.message.text.split(/\s+/).slice(1)
    : [];

  if (args.length < 2) {
    return ctx.reply("Usage: /deploy <app> <server>");
  }

  const [app, serverName] = args;
  const server = db.getServer(serverName);
  if (!server) return ctx.reply(`Server "${serverName}" not found.`);
  if (!server.apps.includes(app)) {
    return ctx.reply(`App "${app}" not configured on ${serverName}. Available: ${server.apps.join(", ")}`);
  }

  await ctx.reply(`Deploying ${app} on ${server.name}...`);

  try {
    const output = await runDeploy(server, app);
    await ctx.reply(`Deploy complete:\n${output}`);
  } catch (err) {
    await ctx.reply(`Deploy failed: ${err}`);
  }
}
