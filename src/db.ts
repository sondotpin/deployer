import Database from "better-sqlite3";
import { createPublicKey, generateKeyPairSync } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import type { ServerConfig } from "./config.js";
import { log } from "./utils/logger.js";

mkdirSync("data", { recursive: true });

// --- SSH Keypair ---
const KEY_PATH = "data/bot_key";
const PUB_PATH = "data/bot_key.pub";

function pemToOpenSSH(pem: string): string {
  const der = createPublicKey(pem).export({ type: "spki", format: "der" });
  const rawKey = der.subarray(-32);
  const keyType = Buffer.from("ssh-ed25519");
  const encLen = (n: number) => { const b = Buffer.alloc(4); b.writeUInt32BE(n); return b; };
  return `ssh-ed25519 ${Buffer.concat([encLen(keyType.length), keyType, encLen(rawKey.length), rawKey]).toString("base64")}`;
}

if (!existsSync(KEY_PATH)) {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519", {
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  writeFileSync(KEY_PATH, privateKey, { mode: 0o600 });
  writeFileSync(PUB_PATH, pemToOpenSSH(publicKey));
  log.info("Generated new ed25519 SSH keypair");
}

// Migrate existing PEM public key to OpenSSH format
const pubContent = readFileSync(PUB_PATH, "utf-8");
if (pubContent.startsWith("-----BEGIN")) {
  writeFileSync(PUB_PATH, pemToOpenSSH(pubContent));
  log.info("Migrated public key to OpenSSH format");
}

const botPrivateKey = readFileSync(KEY_PATH, "utf-8");
const botPublicKey = readFileSync(PUB_PATH, "utf-8");

// --- Database ---
const sqlite = new Database("data/bot.db");
sqlite.pragma("journal_mode = WAL");

sqlite.exec(`
  CREATE TABLE IF NOT EXISTS developers (
    user_id INTEGER PRIMARY KEY
  )
`);

sqlite.exec(`
  CREATE TABLE IF NOT EXISTS servers (
    name TEXT PRIMARY KEY,
    host TEXT NOT NULL,
    port INTEGER NOT NULL DEFAULT 22,
    username TEXT NOT NULL,
    apps TEXT NOT NULL DEFAULT '[]'
  )
`);

// Seed developers from DEVELOPER_IDS env on first run
const devCount = sqlite.prepare("SELECT COUNT(*) as c FROM developers").get() as { c: number };
if (devCount.c === 0) {
  const raw = process.env.DEVELOPER_IDS;
  if (raw) {
    try {
      const ids = JSON.parse(raw) as number[];
      const insert = sqlite.prepare("INSERT OR IGNORE INTO developers (user_id) VALUES (?)");
      const seedMany = sqlite.transaction((devIds: number[]) => {
        for (const id of devIds) insert.run(id);
      });
      seedMany(ids);
      log.info(`Seeded ${ids.length} developers from env`);
    } catch {
      log.warn("Failed to parse DEVELOPER_IDS env for seeding");
    }
  }
}

// Seed servers from SERVERS env on first run
const serverCount = sqlite.prepare("SELECT COUNT(*) as c FROM servers").get() as { c: number };
if (serverCount.c === 0) {
  const raw = process.env.SERVERS;
  if (raw) {
    try {
      const servers = JSON.parse(raw) as Array<{
        name: string;
        host: string;
        port?: number;
        username: string;
        apps?: string[];
      }>;
      const insert = sqlite.prepare(
        "INSERT OR IGNORE INTO servers (name, host, port, username, apps) VALUES (?, ?, ?, ?, ?)",
      );
      const seedMany = sqlite.transaction(
        (list: typeof servers) => {
          for (const s of list) {
            insert.run(s.name, s.host, s.port ?? 22, s.username, JSON.stringify(s.apps ?? []));
          }
        },
      );
      seedMany(servers);
      log.info(`Seeded ${servers.length} servers from env`);
    } catch {
      log.warn("Failed to parse SERVERS env for seeding");
    }
  }
}

sqlite.exec(`
  CREATE TABLE IF NOT EXISTS deploy_scripts (
    server_name TEXT NOT NULL,
    app_name TEXT NOT NULL,
    script TEXT NOT NULL,
    PRIMARY KEY (server_name, app_name)
  )
`);

sqlite.exec(`
  CREATE TABLE IF NOT EXISTS env_permissions (
    user_id INTEGER NOT NULL,
    server_name TEXT NOT NULL,
    app_name TEXT NOT NULL,
    PRIMARY KEY (user_id, server_name, app_name)
  )
`);

// --- Prepared statements ---
const envPermStmts = {
  grant: sqlite.prepare(
    "INSERT OR IGNORE INTO env_permissions (user_id, server_name, app_name) VALUES (?, ?, ?)",
  ),
  revoke: sqlite.prepare(
    "DELETE FROM env_permissions WHERE user_id = ? AND server_name = ? AND app_name = ?",
  ),
  has: sqlite.prepare(
    "SELECT 1 FROM env_permissions WHERE user_id = ? AND server_name = ? AND app_name = ?",
  ),
  getAll: sqlite.prepare("SELECT user_id, server_name, app_name FROM env_permissions"),
  getByServer: sqlite.prepare(
    "SELECT user_id, server_name, app_name FROM env_permissions WHERE server_name = ?",
  ),
};

const deployScriptStmts = {
  set: sqlite.prepare(
    "INSERT OR REPLACE INTO deploy_scripts (server_name, app_name, script) VALUES (?, ?, ?)",
  ),
  get: sqlite.prepare(
    "SELECT script FROM deploy_scripts WHERE server_name = ? AND app_name = ?",
  ),
  del: sqlite.prepare(
    "DELETE FROM deploy_scripts WHERE server_name = ? AND app_name = ?",
  ),
};

const devStmts = {
  add: sqlite.prepare("INSERT OR IGNORE INTO developers (user_id) VALUES (?)"),
  remove: sqlite.prepare("DELETE FROM developers WHERE user_id = ?"),
  getAll: sqlite.prepare("SELECT user_id FROM developers"),
  isDev: sqlite.prepare("SELECT 1 FROM developers WHERE user_id = ?"),
};

const serverStmts = {
  add: sqlite.prepare(
    "INSERT OR REPLACE INTO servers (name, host, port, username, apps) VALUES (?, ?, ?, ?, ?)",
  ),
  remove: sqlite.prepare("DELETE FROM servers WHERE name = ?"),
  getAll: sqlite.prepare("SELECT * FROM servers"),
  get: sqlite.prepare("SELECT * FROM servers WHERE name = ?"),
};

type ServerRow = { name: string; host: string; port: number; username: string; apps: string };

function rowToConfig(row: ServerRow): ServerConfig {
  return {
    name: row.name,
    host: row.host,
    port: row.port,
    username: row.username,
    apps: JSON.parse(row.apps) as string[],
  };
}

export const db = {
  // Developers
  addDev(id: number) {
    devStmts.add.run(id);
  },
  removeDev(id: number) {
    devStmts.remove.run(id);
  },
  getAllDevs(): number[] {
    return (devStmts.getAll.all() as { user_id: number }[]).map((r) => r.user_id);
  },
  isDev(id: number): boolean {
    return devStmts.isDev.get(id) !== undefined;
  },

  // Servers
  addServer(name: string, host: string, port: number, username: string, apps: string[]) {
    serverStmts.add.run(name, host, port, username, JSON.stringify(apps));
  },
  removeServer(name: string): boolean {
    return serverStmts.remove.run(name).changes > 0;
  },
  getAllServers(): ServerConfig[] {
    return (serverStmts.getAll.all() as ServerRow[]).map(rowToConfig);
  },
  getServer(name: string): ServerConfig | undefined {
    const row = serverStmts.get.get(name) as ServerRow | undefined;
    return row ? rowToConfig(row) : undefined;
  },

  // Env Permissions
  grantEnvAccess(userId: number, serverName: string, appName: string) {
    envPermStmts.grant.run(userId, serverName, appName);
  },
  revokeEnvAccess(userId: number, serverName: string, appName: string): boolean {
    return envPermStmts.revoke.run(userId, serverName, appName).changes > 0;
  },
  hasEnvAccess(userId: number, serverName: string, appName: string): boolean {
    return envPermStmts.has.get(userId, serverName, appName) !== undefined;
  },
  getEnvPermissions(serverName?: string): Array<{ user_id: number; server_name: string; app_name: string }> {
    type Row = { user_id: number; server_name: string; app_name: string };
    if (serverName) return envPermStmts.getByServer.all(serverName) as Row[];
    return envPermStmts.getAll.all() as Row[];
  },

  // Deploy Scripts
  setDeployScript(serverName: string, appName: string, script: string) {
    deployScriptStmts.set.run(serverName, appName, script);
  },
  getDeployScript(serverName: string, appName: string): string | undefined {
    const row = deployScriptStmts.get.get(serverName, appName) as { script: string } | undefined;
    return row?.script;
  },
  deleteDeployScript(serverName: string, appName: string): boolean {
    return deployScriptStmts.del.run(serverName, appName).changes > 0;
  },

  // SSH Keys
  getBotPrivateKey(): string {
    return botPrivateKey;
  },
  getBotPublicKey(): string {
    return botPublicKey;
  },
};
