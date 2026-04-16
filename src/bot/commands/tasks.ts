import type { BotContext } from "../middleware/auth.js";
import { db, type TicketRow } from "../../db.js";
import { Markup } from "telegraf";

// --- Emoji helpers ---
const PRIORITY_ICON: Record<string, string> = {
  critical: "🔴",
  high: "🟠",
  medium: "🟡",
  low: "🟢",
};

const STATUS_ICON: Record<string, string> = {
  open: "📋",
  in_progress: "🔧",
  review: "👀",
  done: "✅",
  closed: "🔒",
};

const TYPE_ICON: Record<string, string> = {
  task: "📌",
  bug: "🐛",
};

// --- Format helpers ---
function formatTicketShort(t: TicketRow): string {
  const pri = PRIORITY_ICON[t.priority] ?? "";
  const st = STATUS_ICON[t.status] ?? "";
  const type = TYPE_ICON[t.type] ?? "";
  const assignee = t.assignee_name ? ` → ${t.assignee_name}` : "";
  const dl = t.deadline ? ` ⏰${t.deadline}` : "";
  const img = t.image_file_id ? " 🖼" : "";
  return `${type}${pri} #${t.id} ${t.title} [${st}${t.status}]${assignee}${dl}${img}`;
}

function formatTicketDetail(t: TicketRow): string {
  const lines = [
    `${TYPE_ICON[t.type]} #${t.id} ${t.title}`,
    ``,
    `Type: ${t.type}`,
    `Priority: ${PRIORITY_ICON[t.priority]} ${t.priority}`,
    `Status: ${STATUS_ICON[t.status]} ${t.status}`,
    `Assigner: ${t.assigner_name ?? t.assigner_id}`,
    `Assignee: ${t.assignee_name ?? t.assignee_id ?? "—"}`,
    `Deadline: ${t.deadline ?? "—"}`,
    `Image: ${t.image_file_id ? "🖼 attached" : "—"}`,
  ];
  if (t.description) lines.push(`\nDescription:\n${t.description}`);
  lines.push(`\nCreated: ${t.created_at}`);
  lines.push(`Updated: ${t.updated_at}`);
  return lines.join("\n");
}

function ticketActionButtons(ticketId: number) {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback("🔧 In Progress", `ts_${ticketId}_in_progress`),
      Markup.button.callback("👀 Review", `ts_${ticketId}_review`),
    ],
    [
      Markup.button.callback("✅ Done", `ts_${ticketId}_done`),
      Markup.button.callback("🔒 Close", `ts_${ticketId}_closed`),
    ],
    [
      Markup.button.callback("🔴 Critical", `tp_${ticketId}_critical`),
      Markup.button.callback("🟠 High", `tp_${ticketId}_high`),
      Markup.button.callback("🟡 Medium", `tp_${ticketId}_medium`),
      Markup.button.callback("🟢 Low", `tp_${ticketId}_low`),
    ],
  ]);
}

// Extract photo file_id from message or replied message
function getPhotoFileId(ctx: BotContext): string | undefined {
  const msg = ctx.message;
  if (!msg) return undefined;

  // Photo sent with caption (direct photo message)
  if ("photo" in msg && msg.photo && msg.photo.length > 0) {
    return msg.photo[msg.photo.length - 1].file_id;
  }

  // Reply to a photo message
  const reply = "reply_to_message" in msg ? msg.reply_to_message : undefined;
  if (reply && "photo" in reply && reply.photo && reply.photo.length > 0) {
    return reply.photo[reply.photo.length - 1].file_id;
  }

  return undefined;
}

// Get text from message (works for both text messages and photo captions)
function getMessageText(ctx: BotContext): string {
  const msg = ctx.message;
  if (!msg) return "";
  if ("text" in msg && msg.text) return msg.text;
  if ("caption" in msg && msg.caption) return msg.caption;
  return "";
}

// --- Commands ---

async function createTicket(ctx: BotContext, type: "task" | "bug") {
  const text = getMessageText(ctx);
  const parts = text.split(" ").slice(1);
  if (parts.length === 0) {
    return ctx.reply(
      `Usage: /${type} <title> [| description]\n` +
      `Optional flags: -p <priority> -d <deadline> -a <assignee_id>\n` +
      `Attach image: send/reply photo with /${type} as caption\n\n` +
      `Example: /${type} Fix login bug | User can't login via Google -p high -d 2026-04-20`,
    );
  }

  // Join and split by pipe for description
  const fullText = parts.join(" ");
  const pipeIdx = fullText.indexOf("|");
  let rawTitle: string;
  let description: string | undefined;

  if (pipeIdx !== -1) {
    rawTitle = fullText.slice(0, pipeIdx).trim();
    description = fullText.slice(pipeIdx + 1).trim() || undefined;
  } else {
    rawTitle = fullText;
  }

  // Parse flags from rawTitle
  const titleTokens = rawTitle.split(" ");
  let priority = "medium";
  let deadline: string | undefined;
  let assigneeId: number | undefined;
  let assigneeName: string | undefined;
  const titleParts: string[] = [];
  let i = 0;

  while (i < titleTokens.length) {
    if (titleTokens[i] === "-p" && i + 1 < titleTokens.length) {
      const p = titleTokens[i + 1].toLowerCase();
      if (["low", "medium", "high", "critical"].includes(p)) priority = p;
      i += 2;
    } else if (titleTokens[i] === "-d" && i + 1 < titleTokens.length) {
      deadline = titleTokens[i + 1];
      i += 2;
    } else if (titleTokens[i] === "-a" && i + 1 < titleTokens.length) {
      assigneeId = parseInt(titleTokens[i + 1], 10);
      if (isNaN(assigneeId)) { assigneeId = undefined; }
      i += 2;
    } else {
      titleParts.push(titleTokens[i]);
      i++;
    }
  }

  const title = titleParts.join(" ").trim();
  if (!title) return ctx.reply("Title cannot be empty.");

  const userId = ctx.from!.id;
  const userName = ctx.from!.first_name + (ctx.from!.last_name ? ` ${ctx.from!.last_name}` : "");
  const imageFileId = getPhotoFileId(ctx);

  const id = db.createTicket({
    type,
    title,
    description,
    priority,
    assignerId: userId,
    assignerName: userName,
    assigneeId,
    assigneeName,
    deadline,
    imageFileId,
  });

  const ticket = db.getTicket(id)!;
  const caption = `${TYPE_ICON[type]} ${type.toUpperCase()} #${id} created!\n\n${formatTicketDetail(ticket)}`;

  // If ticket has image, send as photo with caption
  if (ticket.image_file_id) {
    await ctx.replyWithPhoto(ticket.image_file_id, {
      caption,
      ...ticketActionButtons(id),
    });
  } else {
    await ctx.reply(caption, ticketActionButtons(id));
  }
}

export async function taskCommand(ctx: BotContext) {
  return createTicket(ctx, "task");
}

export async function bugCommand(ctx: BotContext) {
  return createTicket(ctx, "bug");
}

// Also handle photo messages with /task or /bug caption
export async function taskPhotoCommand(ctx: BotContext) {
  return createTicket(ctx, "task");
}

export async function bugPhotoCommand(ctx: BotContext) {
  return createTicket(ctx, "bug");
}

// /t <id> — View ticket detail
export async function ticketDetailCommand(ctx: BotContext) {
  const text = getMessageText(ctx);
  const idStr = text.split(" ")[1];
  if (!idStr) return ctx.reply("Usage: /t <ticket_id>");
  const id = parseInt(idStr, 10);
  if (isNaN(id)) return ctx.reply("Invalid ticket ID.");

  const ticket = db.getTicket(id);
  if (!ticket) return ctx.reply(`Ticket #${id} not found.`);

  const comments = db.getComments(id);
  let msg = formatTicketDetail(ticket);
  if (comments.length > 0) {
    msg += "\n\n💬 Comments:";
    for (const c of comments) {
      msg += `\n• ${c.username ?? c.user_id} (${c.created_at}): ${c.content}`;
    }
  }

  // If ticket has image, send as photo
  if (ticket.image_file_id) {
    await ctx.replyWithPhoto(ticket.image_file_id, {
      caption: msg.slice(0, 1024), // Telegram caption limit
      ...ticketActionButtons(id),
    });
    // If caption was truncated, send rest as text
    if (msg.length > 1024) {
      await ctx.reply(msg.slice(1024), ticketActionButtons(id));
    }
  } else {
    await ctx.reply(msg, ticketActionButtons(id));
  }
}

// /image <ticket_id> — Reply to a photo to attach it
export async function imageCommand(ctx: BotContext) {
  const text = getMessageText(ctx);
  const parts = text.split(" ");
  if (parts.length < 2) return ctx.reply("Usage: Reply to a photo with /image <ticket_id>");

  const ticketId = parseInt(parts[1], 10);
  if (isNaN(ticketId)) return ctx.reply("Invalid ticket ID.");

  const ticket = db.getTicket(ticketId);
  if (!ticket) return ctx.reply(`Ticket #${ticketId} not found.`);

  const fileId = getPhotoFileId(ctx);
  if (!fileId) return ctx.reply("No photo found. Reply to a photo or send a photo with this command.");

  db.updateTicketImage(ticketId, fileId);
  await ctx.reply(`🖼 Image attached to ticket #${ticketId}`);
}

// /tasks [mine|done|all] — List tasks
export async function tasksListCommand(ctx: BotContext) {
  const text = getMessageText(ctx);
  const filter = text.split(" ")[1]?.toLowerCase();

  let tickets: TicketRow[];
  let header: string;

  if (filter === "mine") {
    tickets = db.listTicketsByAssignee(ctx.from!.id);
    header = "📌 My Tasks";
  } else if (filter === "done") {
    tickets = db.listDoneTickets();
    header = "✅ Completed Tickets (recent 20)";
  } else if (filter === "all") {
    tickets = db.listTickets();
    header = "📋 All Open Tickets";
  } else {
    tickets = db.listTickets("task");
    header = "📌 Open Tasks";
  }

  if (tickets.length === 0) return ctx.reply(`${header}\n\nNo tickets found.`);

  const lines = tickets.map(formatTicketShort);
  await ctx.reply(`${header}\n\n${lines.join("\n")}`);
}

// /bugs [mine|done] — List bugs
export async function bugsListCommand(ctx: BotContext) {
  const text = getMessageText(ctx);
  const filter = text.split(" ")[1]?.toLowerCase();

  let tickets: TicketRow[];
  let header: string;

  if (filter === "mine") {
    tickets = db.listTicketsByAssignee(ctx.from!.id).filter(t => t.type === "bug");
    header = "🐛 My Bugs";
  } else if (filter === "done") {
    tickets = db.listDoneTickets().filter(t => t.type === "bug");
    header = "✅ Closed Bugs (recent)";
  } else {
    tickets = db.listTickets("bug");
    header = "🐛 Open Bugs";
  }

  if (tickets.length === 0) return ctx.reply(`${header}\n\nNo bugs found.`);

  const lines = tickets.map(formatTicketShort);
  await ctx.reply(`${header}\n\n${lines.join("\n")}`);
}

// /assign <ticket_id> <user_id> — Assign ticket
export async function assignCommand(ctx: BotContext) {
  const text = getMessageText(ctx);
  const parts = text.split(" ");
  if (parts.length < 3) return ctx.reply("Usage: /assign <ticket_id> <user_id> [name]");

  const ticketId = parseInt(parts[1], 10);
  const assigneeId = parseInt(parts[2], 10);
  if (isNaN(ticketId) || isNaN(assigneeId)) return ctx.reply("Invalid ID.");

  const ticket = db.getTicket(ticketId);
  if (!ticket) return ctx.reply(`Ticket #${ticketId} not found.`);

  const assigneeName = parts.slice(3).join(" ") || String(assigneeId);
  db.updateTicketAssignee(ticketId, assigneeId, assigneeName);

  await ctx.reply(`✅ Ticket #${ticketId} assigned to ${assigneeName}`);
}

// /comment <ticket_id> <text> — Add comment
export async function commentCommand(ctx: BotContext) {
  const text = getMessageText(ctx);
  const parts = text.split(" ");
  if (parts.length < 3) return ctx.reply("Usage: /comment <ticket_id> <text>");

  const ticketId = parseInt(parts[1], 10);
  if (isNaN(ticketId)) return ctx.reply("Invalid ticket ID.");

  const ticket = db.getTicket(ticketId);
  if (!ticket) return ctx.reply(`Ticket #${ticketId} not found.`);

  const content = parts.slice(2).join(" ");
  const userName = ctx.from!.first_name + (ctx.from!.last_name ? ` ${ctx.from!.last_name}` : "");

  db.addComment(ticketId, ctx.from!.id, userName, content);
  await ctx.reply(`💬 Comment added to #${ticketId}`);
}

// /deadline <ticket_id> <date> — Set deadline
export async function deadlineCommand(ctx: BotContext) {
  const text = getMessageText(ctx);
  const parts = text.split(" ");
  if (parts.length < 3) return ctx.reply("Usage: /deadline <ticket_id> <YYYY-MM-DD>");

  const ticketId = parseInt(parts[1], 10);
  if (isNaN(ticketId)) return ctx.reply("Invalid ticket ID.");

  const ticket = db.getTicket(ticketId);
  if (!ticket) return ctx.reply(`Ticket #${ticketId} not found.`);

  db.updateTicketDeadline(ticketId, parts[2]);
  await ctx.reply(`⏰ Deadline for #${ticketId} set to ${parts[2]}`);
}

// /edit <ticket_id> <title|desc|priority> <value>
export async function editTaskCommand(ctx: BotContext) {
  const text = getMessageText(ctx);
  const parts = text.split(" ");
  if (parts.length < 4) return ctx.reply("Usage: /edit <ticket_id> <title|desc|priority> <value>");

  const ticketId = parseInt(parts[1], 10);
  if (isNaN(ticketId)) return ctx.reply("Invalid ticket ID.");

  const ticket = db.getTicket(ticketId);
  if (!ticket) return ctx.reply(`Ticket #${ticketId} not found.`);

  const field = parts[2].toLowerCase();
  const value = parts.slice(3).join(" ");

  switch (field) {
    case "title":
      db.updateTicketTitle(ticketId, value);
      break;
    case "desc":
      db.updateTicketDescription(ticketId, value);
      break;
    case "priority": {
      if (!["low", "medium", "high", "critical"].includes(value)) {
        return ctx.reply("Priority must be: low, medium, high, critical");
      }
      db.updateTicketPriority(ticketId, value);
      break;
    }
    default:
      return ctx.reply("Field must be: title, desc, priority");
  }

  await ctx.reply(`✏️ Ticket #${ticketId} ${field} updated.`);
}

// /mystats — Personal ticket stats
export async function myStatsCommand(ctx: BotContext) {
  const myTickets = db.listTicketsByAssignee(ctx.from!.id);
  const myDone = db.listDoneTickets().filter(t => t.assignee_id === ctx.from!.id);

  const byStatus: Record<string, number> = {};
  for (const t of myTickets) {
    byStatus[t.status] = (byStatus[t.status] ?? 0) + 1;
  }

  let msg = `📊 My Stats\n\nActive: ${myTickets.length}\nDone (recent): ${myDone.length}\n`;
  for (const [status, count] of Object.entries(byStatus)) {
    msg += `${STATUS_ICON[status] ?? ""} ${status}: ${count}\n`;
  }

  const stats = db.getTicketStats();
  msg += `\n📈 Overall:`;
  for (const s of stats) {
    msg += `\n${TYPE_ICON[s.type] ?? ""} ${s.type}/${s.status}: ${s.count}`;
  }

  await ctx.reply(msg);
}

// --- Callback handlers for inline keyboards ---

export async function handleTicketStatusCallback(ctx: BotContext) {
  const data = (ctx.callbackQuery && "data" in ctx.callbackQuery) ? ctx.callbackQuery.data : "";
  const match = data.match(/^ts_(\d+)_(.+)$/);
  if (!match) return;

  const ticketId = parseInt(match[1], 10);
  const status = match[2];

  const ticket = db.getTicket(ticketId);
  if (!ticket) return ctx.answerCbQuery("Ticket not found.");

  db.updateTicketStatus(ticketId, status);
  await ctx.answerCbQuery(`Status → ${status}`);

  const updated = db.getTicket(ticketId)!;
  const text = formatTicketDetail(updated);
  const buttons = ticketActionButtons(ticketId);

  try {
    // If original message is a photo, edit caption; otherwise edit text
    if (ticket.image_file_id) {
      await ctx.editMessageCaption(text, buttons);
    } else {
      await ctx.editMessageText(text, buttons);
    }
  } catch { /* message not modified */ }
}

export async function handleTicketPriorityCallback(ctx: BotContext) {
  const data = (ctx.callbackQuery && "data" in ctx.callbackQuery) ? ctx.callbackQuery.data : "";
  const match = data.match(/^tp_(\d+)_(.+)$/);
  if (!match) return;

  const ticketId = parseInt(match[1], 10);
  const priority = match[2];

  const ticket = db.getTicket(ticketId);
  if (!ticket) return ctx.answerCbQuery("Ticket not found.");

  db.updateTicketPriority(ticketId, priority);
  await ctx.answerCbQuery(`Priority → ${priority}`);

  const updated = db.getTicket(ticketId)!;
  const text = formatTicketDetail(updated);
  const buttons = ticketActionButtons(ticketId);

  try {
    if (ticket.image_file_id) {
      await ctx.editMessageCaption(text, buttons);
    } else {
      await ctx.editMessageText(text, buttons);
    }
  } catch { /* message not modified */ }
}
