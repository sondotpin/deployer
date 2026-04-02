import { type Context, type MiddlewareFn } from "telegraf";
import { config } from "../../config.js";
import { db } from "../../db.js";
import { log } from "../../utils/logger.js";

export type Role = "admin" | "developer" | "unauthorized";

export interface BotContext extends Context {
  role: Role;
}

export function resolveRole(userId: number): Role {
  if (config.adminIds.includes(userId)) return "admin";
  if (db.isDev(userId)) return "developer";
  return "unauthorized";
}

const ROLE_LEVEL: Record<Role, number> = {
  unauthorized: 0,
  developer: 1,
  admin: 2,
};

export const authMiddleware: MiddlewareFn<BotContext> = (ctx, next) => {
  const userId = ctx.from?.id;
  if (!userId) return;

  ctx.role = resolveRole(userId);

  if (ctx.role === "unauthorized") {
    log.warn(`Unauthorized access attempt from userId=${userId}`);
    return ctx.reply("Access denied.");
  }

  return next();
};

export function requireRole(minRole: Role): MiddlewareFn<BotContext> {
  return (ctx, next) => {
    if (ROLE_LEVEL[ctx.role] < ROLE_LEVEL[minRole]) {
      return ctx.reply(`Requires ${minRole} role.`);
    }
    return next();
  };
}
