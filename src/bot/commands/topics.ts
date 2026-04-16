import type { BotContext } from "../middleware/auth.js";
import { db } from "../../db.js";

// /settopic [label] — Allow bot in the current topic
export async function setTopicCommand(ctx: BotContext) {
  const chatId = ctx.chat?.id;
  const msg = ctx.message;
  const threadId = msg && "message_thread_id" in msg ? msg.message_thread_id : undefined;

  if (!chatId || !threadId) {
    return ctx.reply("This command must be used inside a forum topic.");
  }

  const text = msg && "text" in msg ? msg.text ?? "" : "";
  const label = text.split(" ").slice(1).join(" ").trim() || undefined;

  db.addTopic(chatId, threadId, label);
  await ctx.reply(`✅ Bot enabled in this topic (thread ${threadId})${label ? `: ${label}` : ""}`);
}

// /deltopic — Remove bot from the current topic
export async function delTopicCommand(ctx: BotContext) {
  const chatId = ctx.chat?.id;
  const msg = ctx.message;
  const threadId = msg && "message_thread_id" in msg ? msg.message_thread_id : undefined;

  if (!chatId || !threadId) {
    return ctx.reply("This command must be used inside a forum topic.");
  }

  const removed = db.removeTopic(chatId, threadId);
  if (removed) {
    await ctx.reply(`🗑 Bot disabled in this topic (thread ${threadId})`);
  } else {
    await ctx.reply("This topic was not in the allowed list.");
  }
}

// /topics — List allowed topics for this chat
export async function topicsCommand(ctx: BotContext) {
  const chatId = ctx.chat?.id;
  if (!chatId) return;

  const topics = db.getTopics(chatId);
  if (topics.length === 0) {
    return ctx.reply("No topic restrictions — bot responds everywhere in this chat.\n\nUse /settopic inside a topic to restrict.");
  }

  let msg = "📋 Allowed topics:\n\n";
  for (const t of topics) {
    msg += `• Thread ${t.thread_id}${t.label ? ` — ${t.label}` : ""}\n`;
  }
  msg += "\nBot will only respond in these topics.";
  await ctx.reply(msg);
}
