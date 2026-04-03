import Database from "better-sqlite3";
import { createPrivateKey, createPublicKey, generateKeyPairSync, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import type { ServerConfig } from "./config.js";
import { log } from "./utils/logger.js";

mkdirSync("data", { recursive: true });

// --- SSH Keypair ---
const KEY_PATH = "data/bot_key";
const PUB_PATH = "data/bot_key.pub";

const encU32 = (n: number) => { const b = Buffer.alloc(4); b.writeUInt32BE(n); return b; };
const encBuf = (buf: Buffer) => Buffer.concat([encU32(buf.length), buf]);

function pemToOpenSSHPub(pem: string): string {
  const der = createPublicKey(pem).export({ type: "spki", format: "der" });
  const rawKey = der.subarray(-32);
  const keyType = Buffer.from("ssh-ed25519");
  return `ssh-ed25519 ${Buffer.concat([encBuf(keyType), encBuf(rawKey)]).toString("base64")}`;
}

function pkcs8ToOpenSSHPrivate(pem: string): string {
  const jwk = createPrivateKey(pem).export({ format: "jwk" }) as { d: string; x: string };
  const priv = Buffer.from(jwk.d!, "base64url");
  const pub = Buffer.from(jwk.x!, "base64url");
  const keyType = Buffer.from("ssh-ed25519");

  const pubBlob = Buffer.concat([encBuf(keyType), encBuf(pub)]);
  const check = randomBytes(4);
  let privSection = Buffer.concat([
    check, check,
    encBuf(keyType),
    encBuf(pub),
    encBuf(Buffer.concat([priv, pub])), // ed25519 private = 32 priv + 32 pub
    encBuf(Buffer.alloc(0)), // no comment
  ]);
  const pad = 8 - (privSection.length % 8);
  if (pad < 8) {
    const padding = Buffer.alloc(pad);
    for (let i = 0; i < pad; i++) padding[i] = i + 1;
    privSection = Buffer.concat([privSection, padding]);
  }

  const none = Buffer.from("none");
  const blob = Buffer.concat([
    Buffer.from("openssh-key-v1\0"),
    encBuf(none), encBuf(none), encU32(0), // cipher, kdf, kdf opts
    encU32(1),           // 1 key
    encBuf(pubBlob),
    encBuf(privSection),
  ]);

  const b64 = blob.toString("base64").match(/.{1,70}/g)!.join("\n");
  return `-----BEGIN OPENSSH PRIVATE KEY-----\n${b64}\n-----END OPENSSH PRIVATE KEY-----\n`;
}

if (!existsSync(KEY_PATH)) {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519", {
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  writeFileSync(KEY_PATH, pkcs8ToOpenSSHPrivate(privateKey), { mode: 0o600 });
  writeFileSync(PUB_PATH, pemToOpenSSHPub(publicKey));
  log.info("Generated new ed25519 SSH keypair");
}

// Migrate existing PKCS8 PEM private key to OpenSSH format
const privContent = readFileSync(KEY_PATH, "utf-8");
if (privContent.startsWith("-----BEGIN PRIVATE")) {
  writeFileSync(KEY_PATH, pkcs8ToOpenSSHPrivate(privContent), { mode: 0o600 });
  log.info("Migrated private key to OpenSSH format");
}

// Migrate existing PEM public key to OpenSSH format
const pubContent = readFileSync(PUB_PATH, "utf-8");
if (pubContent.startsWith("-----BEGIN")) {
  writeFileSync(PUB_PATH, pemToOpenSSHPub(pubContent));
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
  CREATE TABLE IF NOT EXISTS command_permissions (
    user_id INTEGER NOT NULL,
    command TEXT NOT NULL,
    PRIMARY KEY (user_id, command)
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

sqlite.exec(`
  CREATE TABLE IF NOT EXISTS env_paths (
    server_name TEXT NOT NULL,
    app_name TEXT NOT NULL,
    path TEXT NOT NULL,
    PRIMARY KEY (server_name, app_name)
  )
`);

sqlite.exec(`
  CREATE TABLE IF NOT EXISTS deploy_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    server_name TEXT NOT NULL,
    app_name TEXT NOT NULL,
    user_id INTEGER NOT NULL,
    username TEXT,
    status TEXT NOT NULL DEFAULT 'running',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )
`);

// --- Prepared statements ---
const cmdPermStmts = {
  grant: sqlite.prepare("INSERT OR IGNORE INTO command_permissions (user_id, command) VALUES (?, ?)"),
  revoke: sqlite.prepare("DELETE FROM command_permissions WHERE user_id = ? AND command = ?"),
  has: sqlite.prepare("SELECT 1 FROM command_permissions WHERE user_id = ? AND command = ?"),
  getByUser: sqlite.prepare("SELECT command FROM command_permissions WHERE user_id = ?"),
  getAll: sqlite.prepare("SELECT user_id, command FROM command_permissions"),
};

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

const envPathStmts = {
  set: sqlite.prepare(
    "INSERT OR REPLACE INTO env_paths (server_name, app_name, path) VALUES (?, ?, ?)",
  ),
  get: sqlite.prepare(
    "SELECT path FROM env_paths WHERE server_name = ? AND app_name = ?",
  ),
  del: sqlite.prepare(
    "DELETE FROM env_paths WHERE server_name = ? AND app_name = ?",
  ),
  getAll: sqlite.prepare("SELECT server_name, app_name, path FROM env_paths"),
};

const deployHistoryStmts = {
  insert: sqlite.prepare(
    "INSERT INTO deploy_history (server_name, app_name, user_id, username) VALUES (?, ?, ?, ?)",
  ),
  updateStatus: sqlite.prepare(
    "UPDATE deploy_history SET status = ? WHERE id = ?",
  ),
  getLast: sqlite.prepare(
    "SELECT * FROM deploy_history WHERE server_name = ? AND app_name = ? ORDER BY id DESC LIMIT 1",
  ),
  getCount: sqlite.prepare(
    "SELECT COUNT(*) as count FROM deploy_history WHERE server_name = ? AND app_name = ?",
  ),
  getStats: sqlite.prepare(
    `SELECT server_name, app_name,
       COUNT(*) as total,
       MAX(created_at) as last_deploy,
       (SELECT username FROM deploy_history d2 WHERE d2.server_name = d1.server_name AND d2.app_name = d1.app_name ORDER BY id DESC LIMIT 1) as last_user
     FROM deploy_history d1
     GROUP BY server_name, app_name`,
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

  // Command Permissions
  grantCommand(userId: number, command: string) {
    cmdPermStmts.grant.run(userId, command);
  },
  revokeCommand(userId: number, command: string): boolean {
    return cmdPermStmts.revoke.run(userId, command).changes > 0;
  },
  hasCommand(userId: number, command: string): boolean {
    return cmdPermStmts.has.get(userId, command) !== undefined;
  },
  getUserCommands(userId: number): string[] {
    return (cmdPermStmts.getByUser.all(userId) as { command: string }[]).map((r) => r.command);
  },
  getAllCommandPerms(): Array<{ user_id: number; command: string }> {
    return cmdPermStmts.getAll.all() as Array<{ user_id: number; command: string }>;
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

  // Env Paths
  setEnvPath(serverName: string, appName: string, path: string) {
    envPathStmts.set.run(serverName, appName, path);
  },
  getEnvPath(serverName: string, appName: string): string {
    const row = envPathStmts.get.get(serverName, appName) as { path: string } | undefined;
    return row?.path ?? `~/${appName}/backend.env`;
  },
  deleteEnvPath(serverName: string, appName: string): boolean {
    return envPathStmts.del.run(serverName, appName).changes > 0;
  },
  getAllEnvPaths(): Array<{ server_name: string; app_name: string; path: string }> {
    return envPathStmts.getAll.all() as Array<{ server_name: string; app_name: string; path: string }>;
  },

  // Deploy History
  startDeploy(serverName: string, appName: string, userId: number, username: string): number {
    const result = deployHistoryStmts.insert.run(serverName, appName, userId, username);
    return Number(result.lastInsertRowid);
  },
  finishDeploy(id: number, status: "success" | "failed") {
    deployHistoryStmts.updateStatus.run(status, id);
  },
  getDeployStats(): Array<{ server_name: string; app_name: string; total: number; last_deploy: string; last_user: string }> {
    return deployHistoryStmts.getStats.all() as any;
  },
  getLastDeploy(serverName: string, appName: string) {
    return deployHistoryStmts.getLast.get(serverName, appName) as { server_name: string; app_name: string; user_id: number; username: string; status: string; created_at: string } | undefined;
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
