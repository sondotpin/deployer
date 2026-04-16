import type { BotContext } from "../middleware/auth.js";
import { db, type TicketRow, type CommentRow } from "../../db.js";
import { Markup } from "telegraf";

// --- MarkdownV2 escape ---
const MD2_CHARS = /[_*[\]()~`>#+\-=|{}.!\\]/g;
function esc(text: string | number): string {
  return String(text).replace(MD2_CHARS, "\\$&");
}

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

const PRIORITY_LABEL: Record<string, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
};

const STATUS_LABEL: Record<string, string> = {
  open: "Open",
  in_progress: "In Progress",
  review: "Review",
  done: "Done",
  closed: "Closed",
};

// --- Format helpers (MarkdownV2) ---
function formatTicketShort(t: TicketRow): string {
  const pri = PRIORITY_ICON[t.priority] ?? "";
  const type = TYPE_ICON[t.type] ?? "";
  const assignee = t.assignee_name ? ` → ${esc(t.assignee_name)}` : "";
  const dl = t.deadline ? ` ⏰ ${esc(t.deadline)}` : "";
  const img = t.image_file_id ? " 🖼" : "";
  const st = STATUS_ICON[t.status] ?? "";
  return `${type}${pri} *\\#${t.id}* ${esc(t.title)} \\[${st}${esc(t.status)}\\]${assignee}${dl}${img}`;
}

function formatTicketDetail(t: TicketRow): string {
  const type = TYPE_ICON[t.type] ?? "";
  const pri = PRIORITY_ICON[t.priority] ?? "";
  const st = STATUS_ICON[t.status] ?? "";
  const assignee = t.assignee_name ?? (t.assignee_id ? String(t.assignee_id) : "—");
  const deadline = t.deadline ?? "—";
  const img = t.image_file_id ? "🖼 attached" : "—";

  const lines = [
    `${type} *${esc(t.type.toUpperCase())} \\#${t.id}*`,
    `*${esc(t.title)}*`,
    ``,
    `${pri} *Priority:*  ${esc(PRIORITY_LABEL[t.priority] ?? t.priority)}`,
    `${st} *Status:*  ${esc(STATUS_LABEL[t.status] ?? t.status)}`,
    `👤 *Assigner:*  ${esc(t.assigner_name ?? t.assigner_id)}`,
    `👥 *Assignee:*  ${esc(assignee)}`,
    `⏰ *Deadline:*  ${esc(deadline)}`,
    `🖼 *Image:*  ${esc(img)}`,
  ];

  if (t.description) {
    lines.push(``);
    lines.push(`📝 *Description:*`);
    lines.push(esc(t.description));
  }

  lines.push(``);
  lines.push(`_Created: ${esc(t.created_at)}_`);
  lines.push(`_Updated: ${esc(t.updated_at)}_`);

  return lines.join("\n");
}

function formatComments(comments: CommentRow[]): string {
  if (comments.length === 0) return "";
  let msg = `\n\n💬 *Comments:*`;
  for (const c of comments) {
    msg += `\n• *${esc(c.username ?? c.user_id)}* \\(${esc(c.created_at)}\\):\n  ${esc(c.content)}`;
  }
  return msg;
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

// Helper to merge parse_mode with inline keyboard
function md2Options(ticketId: number) {
  return { parse_mode: "MarkdownV2" as const, ...ticketActionButtons(ticketId) };
}

function md2() {
  return { parse_mode: "MarkdownV2" as const };
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
  const caption = `✅ *${esc(type.toUpperCase())} \\#${id} created\\!*\n\n${formatTicketDetail(ticket)}`;

  // If ticket has image, send as photo with caption
  if (ticket.image_file_id) {
    await ctx.replyWithPhoto(ticket.image_file_id, {
      caption,
      parse_mode: "MarkdownV2",
      ...ticketActionButtons(id),
    });
  } else {
    await ctx.reply(caption, md2Options(id));
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
  msg += formatComments(comments);

  // If ticket has image, send as photo
  if (ticket.image_file_id) {
    // Telegram caption limit is 1024
    if (msg.length <= 1024) {
      await ctx.replyWithPhoto(ticket.image_file_id, {
        caption: msg,
        parse_mode: "MarkdownV2",
        ...ticketActionButtons(id),
      });
    } else {
      await ctx.replyWithPhoto(ticket.image_file_id);
      await ctx.reply(msg, md2Options(id));
    }
  } else {
    await ctx.reply(msg, md2Options(id));
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

  if (tickets.length === 0) return ctx.reply(`${esc(header)}\n\n_No tickets found\\._`, md2());

  const lines = tickets.map(formatTicketShort);
  await ctx.reply(`*${esc(header)}*\n\n${lines.join("\n")}`, md2());
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

  if (tickets.length === 0) return ctx.reply(`${esc(header)}\n\n_No bugs found\\._`, md2());

  const lines = tickets.map(formatTicketShort);
  await ctx.reply(`*${esc(header)}*\n\n${lines.join("\n")}`, md2());
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

// /edit <id> <title> [| description] [| priority]
// OR /edit <id> <field> <value>  (field = title, desc, priority)
export async function editTaskCommand(ctx: BotContext) {
  const text = getMessageText(ctx);
  const firstSpace = text.indexOf(" ");
  if (firstSpace === -1) return ctx.reply(EDIT_USAGE);

  const afterCmd = text.slice(firstSpace + 1).trim();
  const idEnd = afterCmd.indexOf(" ");
  if (idEnd === -1) return ctx.reply(EDIT_USAGE);

  const ticketId = parseInt(afterCmd.slice(0, idEnd), 10);
  if (isNaN(ticketId)) return ctx.reply("Invalid ticket ID.");

  const ticket = db.getTicket(ticketId);
  if (!ticket) return ctx.reply(`Ticket #${ticketId} not found.`);

  const rest = afterCmd.slice(idEnd + 1).trim();

  // If contains |, use pipe format: title | desc | priority
  if (rest.includes("|")) {
    const segments = rest.split("|").map(s => s.trim());
    const updated: string[] = [];

    if (segments[0]) {
      db.updateTicketTitle(ticketId, segments[0]);
      updated.push("title");
    }
    if (segments[1]) {
      db.updateTicketDescription(ticketId, segments[1]);
      updated.push("desc");
    }
    if (segments[2]) {
      const p = segments[2].toLowerCase();
      if (["low", "medium", "high", "critical"].includes(p)) {
        db.updateTicketPriority(ticketId, p);
        updated.push("priority");
      }
    }

    if (updated.length === 0) return ctx.reply("Nothing to update\\.", md2());
    const t = db.getTicket(ticketId)!;
    return ctx.reply(`✏️ *\\#${ticketId} updated:* ${esc(updated.join(", "))}\n\n${formatTicketDetail(t)}`, md2Options(ticketId));
  }

  // Otherwise: /edit <id> <field> <value>
  const fieldEnd = rest.indexOf(" ");
  if (fieldEnd === -1) return ctx.reply(EDIT_USAGE);

  const field = rest.slice(0, fieldEnd).toLowerCase();
  const value = rest.slice(fieldEnd + 1).trim();

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
      return ctx.reply(EDIT_USAGE);
  }

  const t = db.getTicket(ticketId)!;
  await ctx.reply(`✏️ *\\#${ticketId} ${esc(field)} updated\\.*\n\n${formatTicketDetail(t)}`, md2Options(ticketId));
}

const EDIT_USAGE = `Usage:
/edit <id> <title> | <description> | <priority>
/edit <id> title <new title>
/edit <id> desc <new description>
/edit <id> priority <low|medium|high|critical>

Example: /edit 1 Thẻ này thừa | Xem nếu không cần thì bỏ đi | medium`;

// /mystats — Personal ticket stats
export async function myStatsCommand(ctx: BotContext) {
  const myTickets = db.listTicketsByAssignee(ctx.from!.id);
  const myDone = db.listDoneTickets().filter(t => t.assignee_id === ctx.from!.id);

  const byStatus: Record<string, number> = {};
  for (const t of myTickets) {
    byStatus[t.status] = (byStatus[t.status] ?? 0) + 1;
  }

  let msg = `📊 *My Stats*\n\n*Active:* ${myTickets.length}\n*Done \\(recent\\):* ${myDone.length}\n`;
  for (const [status, count] of Object.entries(byStatus)) {
    msg += `${STATUS_ICON[status] ?? ""} ${esc(status)}: ${count}\n`;
  }

  const stats = db.getTicketStats();
  msg += `\n📈 *Overall:*`;
  for (const s of stats) {
    msg += `\n${TYPE_ICON[s.type] ?? ""} ${esc(s.type)}/${esc(s.status)}: ${s.count}`;
  }

  await ctx.reply(msg, md2());
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
    if (ticket.image_file_id) {
      await ctx.editMessageCaption(text, { parse_mode: "MarkdownV2", ...buttons });
    } else {
      await ctx.editMessageText(text, { parse_mode: "MarkdownV2", ...buttons });
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
      await ctx.editMessageCaption(text, { parse_mode: "MarkdownV2", ...buttons });
    } else {
      await ctx.editMessageText(text, { parse_mode: "MarkdownV2", ...buttons });
    }
  } catch { /* message not modified */ }
}
