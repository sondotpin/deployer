import "dotenv/config";

export interface ServerConfig {
  name: string;
  host: string;
  port: number;
  username: string;
  keyEnv: string;
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
  servers: parseJsonArray<ServerConfig>("SERVERS"),
};

export function getServer(name: string): ServerConfig | undefined {
  return config.servers.find((s) => s.name === name);
}

export function getSSHKey(server: ServerConfig): string {
  const key = process.env[server.keyEnv];
  if (!key) throw new Error(`Missing SSH key env: ${server.keyEnv}`);
  return key.replace(/\\n/g, "\n");
}
