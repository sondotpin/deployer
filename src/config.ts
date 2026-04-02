import "dotenv/config";

export interface ServerConfig {
  name: string;
  host: string;
  port: number;
  username: string;
  apps: string[];
}

function required(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing env: ${key}`);
  return val;
}

function parseJsonArray<T>(key: string): T[] {
  const raw = required(key);
  try {
    return JSON.parse(raw) as T[];
  } catch {
    throw new Error(`Invalid JSON for env: ${key}`);
  }
}

export const config = {
  botToken: required("BOT_TOKEN"),
  adminIds: parseJsonArray<number>("ADMIN_IDS"),
};
