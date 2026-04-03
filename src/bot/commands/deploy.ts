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

  const msg = await ctx.reply(`Deploying ${app} on ${server.name}...`);
  const chatId = msg.chat.id;
  const msgId = msg.message_id;

  let buffer = "";
  let dirty = false;
  const EDIT_INTERVAL = 3_000;
  const MAX_OUTPUT = 4_000;

  const editTimer = setInterval(async () => {
    if (!dirty) return;
    dirty = false;
    const tail = buffer.length > MAX_OUTPUT
      ? "...\n" + buffer.slice(-MAX_OUTPUT)
      : buffer;
    try {
      await ctx.telegram.editMessageText(chatId, msgId, undefined, `Deploying ${app}...\n\`\`\`\n${tail}\n\`\`\``);
    } catch {
      // rate limit or network error — will retry next interval
    }
  }, EDIT_INTERVAL);

  try {
    const output = await runDeploy(server, app, (chunk) => {
      buffer += chunk;
      dirty = true;
    });
    clearInterval(editTimer);
    const tail = output.length > MAX_OUTPUT
      ? "...\n" + output.slice(-MAX_OUTPUT)
      : output;
    await ctx.telegram.editMessageText(chatId, msgId, undefined, `Deploy complete:\n\`\`\`\n${tail}\n\`\`\``);
  } catch (err) {
    clearInterval(editTimer);
    const tail = buffer.length > MAX_OUTPUT
      ? "...\n" + buffer.slice(-MAX_OUTPUT)
      : buffer;
    const errOutput = tail ? `\n\`\`\`\n${tail}\n\`\`\`` : "";
    await ctx.telegram.editMessageText(chatId, msgId, undefined, `Deploy failed: ${err}${errOutput}`);
  }
}

export async function setscriptCommand(ctx: BotContext) {
  const text = ctx.message && "text" in ctx.message ? ctx.message.text : "";
  const parts = text.split(/\s+/);
  // /setscript <server> <app> <script...>
  if (parts.length < 4) {
    return ctx.reply("Usage: /setscript <server> <app> <script...>");
  }

  const serverName = parts[1];
  const appName = parts[2];
  let script = text.slice(text.indexOf(parts[3]));
  script = script.replace(/^["']|["']$/g, "").trim();

  const server = db.getServer(serverName);
  if (!server) return ctx.reply(`Server "${serverName}" not found.`);

  db.setDeployScript(serverName, appName, script);
  await ctx.reply(`Deploy script set for ${appName}@${serverName}:\n${script}`);
}

export async function scriptCommand(ctx: BotContext) {
  const args = ctx.message && "text" in ctx.message
    ? ctx.message.text.split(/\s+/).slice(1)
    : [];

  if (args.length < 2) {
    return ctx.reply("Usage: /script <server> <app>");
  }

  const [serverName, appName] = args;
  const script = db.getDeployScript(serverName, appName);
  if (!script) {
    return ctx.reply(`No custom script for ${appName}@${serverName}. Using default: bash ~/apps/${appName}/deploy.sh`);
  }
  await ctx.reply(`Deploy script for ${appName}@${serverName}:\n${script}`);
}

export async function delscriptCommand(ctx: BotContext) {
  const args = ctx.message && "text" in ctx.message
    ? ctx.message.text.split(/\s+/).slice(1)
    : [];

  if (args.length < 2) {
    return ctx.reply("Usage: /delscript <server> <app>");
  }

  const [serverName, appName] = args;
  const deleted = db.deleteDeployScript(serverName, appName);
  if (!deleted) {
    return ctx.reply(`No custom script found for ${appName}@${serverName}.`);
  }
  await ctx.reply(`Deploy script deleted for ${appName}@${serverName}. Will use default deploy.sh.`);
}
