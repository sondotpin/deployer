import Database from "better-sqlite3";
import { generateKeyPairSync } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import type { ServerConfig } from "./config.js";
import { log } from "./utils/logger.js";

mkdirSync("data", { recursive: true });

// --- SSH Keypair ---
const KEY_PATH = "data/bot_key";
const PUB_PATH = "data/bot_key.pub";

if (!existsSync(KEY_PATH)) {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519", {
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  writeFileSync(KEY_PATH, privateKey, { mode: 0o600 });
  writeFileSync(PUB_PATH, publicKey);
  log.info("Generated new ed25519 SSH keypair");
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

// --- Prepared statements ---
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

  // SSH Keys
  getBotPrivateKey(): string {
    return botPrivateKey;
  },
  getBotPublicKey(): string {
    return botPublicKey;
  },
};
